import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const MAX_PER_CALL = 50;

/** Direction de l'établissement uniquement ; le school_id vient toujours du profil, jamais du fichier. */
async function assertDirectionAndSchool(context: any): Promise<string> {
  const { data: roles } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId);
  if (!(roles ?? []).some((r: any) => ["admin", "directeur", "directeur_etudes", "proviseur"].includes(r.role))) {
    throw new Error("Accès réservé à la direction de l'établissement.");
  }
  const { data: profile } = await context.supabase.from("profiles").select("school_id").eq("id", context.userId).maybeSingle();
  if (!profile?.school_id) throw new Error("École introuvable pour cet utilisateur.");
  return profile.school_id as string;
}

function genTempPassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const values = new Uint32Array(12);
  globalThis.crypto.getRandomValues(values);
  let out = "";
  for (let i = 0; i < values.length; i++) out += chars[values[i] % chars.length];
  return out;
}

const rowSchema = z.object({
  line: z.number().int(),
  studentMatricule: z.string().min(1).max(60),
  fullName: z.string().min(1).max(150),
  email: z.string().email().max(200),
  phone: z.string().max(40).optional().nullable(),
  relation: z.string().max(40).optional().nullable(),
});

export interface ParentAccountResult {
  line: number;
  ok: boolean;
  error?: string;
  email?: string;
  tempPassword?: string;
}

/**
 * Crée des comptes parents et les rattache à leur élève (student_parents + parent_user_id historique).
 * mode "invite" : e-mail d'invitation (lien vers /definir-mot-de-passe) ; "direct" : mot de passe temporaire aléatoire.
 * Les messages d'erreur ne révèlent jamais l'existence d'un compte ou d'un élève dans une autre école.
 */
export const importParentAccounts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ mode: z.enum(["invite", "direct"]), rows: z.array(rowSchema).min(1).max(MAX_PER_CALL) }).parse(d))
  .handler(async ({ data, context }): Promise<ParentAccountResult[]> => {
    const schoolId = await assertDirectionAndSchool(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const results: ParentAccountResult[] = [];

    for (const row of data.rows) {
      const fail = (error: string) => results.push({ line: row.line, ok: false, error });
      try {
        const { data: student } = await supabaseAdmin.from("students").select("id")
          .eq("school_id", schoolId).eq("matricule", row.studentMatricule).maybeSingle();
        if (!student) { fail("Élève introuvable dans votre établissement (vérifiez le matricule)."); continue; }

        let userId: string | undefined;
        let tempPassword: string | undefined;
        const meta = { full_name: row.fullName, phone: row.phone ?? null };
        if (data.mode === "invite") {
          const { data: res, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(row.email, {
            data: meta,
            redirectTo: `${process.env.APP_URL ?? process.env.VITE_APP_URL ?? "http://localhost:3000"}/definir-mot-de-passe`,
          });
          if (error || !res.user) { fail("Adresse e-mail indisponible ou invitation impossible."); continue; }
          userId = res.user.id;
          const { error: metaErr } = await supabaseAdmin.auth.admin.updateUserById(userId, { app_metadata: { school_id: schoolId, role: "parent" } } as any);
          if (metaErr) { await supabaseAdmin.auth.admin.deleteUser(userId); fail("Compte non finalisé."); continue; }
        } else {
          tempPassword = genTempPassword();
          const { data: res, error } = await supabaseAdmin.auth.admin.createUser({
            email: row.email, password: tempPassword, email_confirm: true,
            user_metadata: meta, app_metadata: { school_id: schoolId, role: "parent" },
          });
          if (error || !res.user) { fail("Adresse e-mail indisponible ou création impossible."); continue; }
          userId = res.user.id;
        }

        const rollback = async (msg: string) => { await supabaseAdmin.auth.admin.deleteUser(userId!); fail(msg); };
        const { data: prof, error: profErr } = await supabaseAdmin.from("profiles")
          .update({ full_name: row.fullName, phone: row.phone ?? null, school_id: schoolId }).eq("id", userId).select("id").maybeSingle();
        if (profErr || !prof) { await rollback("Profil non rattaché."); continue; }
        const { error: roleErr } = await supabaseAdmin.from("user_roles").upsert({ user_id: userId, role: "parent" }, { onConflict: "user_id,role" });
        if (roleErr) { await rollback("Rôle non attribué."); continue; }
        const { error: linkErr } = await supabaseAdmin.from("student_parents")
          .insert({ school_id: schoolId, student_id: student.id, parent_user_id: userId, relation: row.relation || "parent", is_primary: true });
        if (linkErr) { await rollback("Rattachement à l'élève impossible."); continue; }
        await supabaseAdmin.from("students").update({ parent_user_id: userId }).eq("id", student.id).is("parent_user_id", null);

        await supabaseAdmin.from("activity_logs").insert({
          school_id: schoolId, user_id: context.userId, action: "create", entity_type: "import_parent_account",
          entity_id: student.id, entity_label: row.fullName, metadata: { mode: data.mode, via: "import" },
        } as any);
        results.push({ line: row.line, ok: true, email: row.email, tempPassword });
      } catch {
        fail("Erreur inattendue sur cette ligne.");
      }
    }
    return results;
  });
