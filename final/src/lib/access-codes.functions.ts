import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sans 0/O/1/I, ambigus à l'oral/écrit

function genCode(): string {
  let out = "";
  for (let i = 0; i < 10; i++) out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  return `${out.slice(0, 5)}-${out.slice(5)}`; // ex. EDG7X-9KQP2, plus lisible/imprimable
}

async function assertStaffAndSchool(context: any): Promise<string> {
  const { data: roles } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId);
  const staffRoles = ["admin", "directeur", "directeur_etudes", "proviseur", "secretariat", "surveillant"];
  if (!(roles ?? []).some((r: any) => staffRoles.includes(r.role))) {
    throw new Error("Accès réservé au personnel de l'établissement.");
  }
  const { data: profile } = await context.supabase.from("profiles").select("school_id").eq("id", context.userId).maybeSingle();
  if (!profile?.school_id) throw new Error("École introuvable pour cet utilisateur.");
  return profile.school_id as string;
}

// --- Génère un nouveau code pour un élève (n'invalide pas les codes déjà émis : plusieurs
// personnes — les deux parents, ou un parent + l'élève — peuvent avoir chacune leur propre code). ---
export const generateStudentAccessCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ studentId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const schoolId = await assertStaffAndSchool(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: student } = await supabaseAdmin
      .from("students").select("id, school_id, full_name").eq("id", data.studentId).maybeSingle();
    if (!student || student.school_id !== schoolId) {
      throw new Error("Cet élève n'appartient pas à votre établissement.");
    }

    // Quelques tentatives en cas de collision (extrêmement rare vu l'entropie du code).
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = genCode();
      const { data: row, error } = await supabaseAdmin
        .from("student_access_codes")
        .insert({ school_id: schoolId, student_id: data.studentId, code, created_by: context.userId })
        .select("id, code, created_at")
        .single();
      if (!error) return { code: row.code, createdAt: row.created_at, studentName: student.full_name };
      if (!/duplicate|unique/i.test(error.message)) throw new Error(error.message);
    }
    throw new Error("Impossible de générer un code unique, réessayez.");
  });

// --- Liste les codes déjà émis pour un élève (pour affichage/réimpression). ---
export const listStudentAccessCodes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ studentId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertStaffAndSchool(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("student_access_codes")
      .select("id, code, created_at, used_at, used_as_role")
      .eq("student_id", data.studentId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

// --- Inscription publique : crée le compte ET le rattache à l'élève, en un seul geste atomique. ---
// Aucune authentification requise en entrée : c'est justement le code qui en tient lieu.
export const redeemAccessCodeAndSignUp = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({
      code: z.string().min(6),
      email: z.string().email(),
      password: z.string().min(6),
      fullName: z.string().min(1),
      phone: z.string().optional().nullable(),
      asRole: z.enum(["parent", "eleve"]),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const normalizedCode = data.code.trim().toUpperCase();

    // Marque le code utilisé AVANT de créer le compte, de façon atomique (une seule ligne
    // affectée si et seulement si le code existait encore et n'avait jamais servi) : ça évite
    // qu'un même code serve deux fois en cas de double-clic/requêtes concurrentes.
    const { data: claimed, error: claimErr } = await supabaseAdmin
      .from("student_access_codes")
      .update({ used_at: new Date().toISOString(), used_as_role: data.asRole })
      .eq("code", normalizedCode)
      .is("used_at", null)
      .select("id, student_id, school_id")
      .maybeSingle();
    if (claimErr) return { ok: false as const, error: claimErr.message };
    if (!claimed) return { ok: false as const, error: "Code invalide ou déjà utilisé." };

    const { data: userRes, error: userErr } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: data.fullName, phone: data.phone ?? null },
      app_metadata: { school_id: claimed.school_id, role: data.asRole },
    });
    if (userErr || !userRes.user) {
      // Le compte n'a pas pu être créé : on rend le code réutilisable plutôt que de le perdre.
      await supabaseAdmin.from("student_access_codes")
        .update({ used_at: null, used_as_role: null }).eq("id", claimed.id);
      const msg = userErr?.message ?? "";
      if (/already registered|already been registered|exists/i.test(msg)) {
        return { ok: false as const, error: "Cette adresse e-mail est déjà utilisée. Connectez-vous, ou utilisez une autre adresse puis redemandez un code à l'école." };
      }
      return { ok: false as const, error: `Compte impossible à créer : ${msg || "erreur inconnue"}` };
    }

    const newUserId = userRes.user.id;
    await supabaseAdmin.from("student_access_codes").update({ used_by: newUserId }).eq("id", claimed.id);

    if (data.asRole === "eleve") {
      await supabaseAdmin.from("students").update({ student_user_id: newUserId }).eq("id", claimed.student_id);
    } else {
      await supabaseAdmin.from("student_parents").insert({
        school_id: claimed.school_id, student_id: claimed.student_id, parent_user_id: newUserId, is_primary: true,
      });
      // Conserve la compatibilité avec le champ historique students.parent_user_id
      // (utilisé ailleurs pour l'affichage) uniquement s'il n'est pas déjà pris par un autre parent.
      await supabaseAdmin.from("students")
        .update({ parent_user_id: newUserId })
        .eq("id", claimed.student_id)
        .is("parent_user_id", null);
    }

    await supabaseAdmin.from("activity_logs").insert({
      school_id: claimed.school_id,
      user_id: newUserId,
      actor_name: data.fullName,
      actor_role: data.asRole,
      action: "create",
      entity_type: "family_account",
      entity_id: claimed.student_id,
      entity_label: data.fullName,
      metadata: { via: "student_access_code", code: normalizedCode },
    });

    return { ok: true as const };
  });

// --- Rattache un enfant supplémentaire au compte parent déjà connecté. ---
export const linkAdditionalChild = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ code: z.string().min(6) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", context.userId);
    if (!(roles ?? []).some((r: any) => r.role === "parent")) {
      throw new Error("Réservé aux comptes parent.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const normalizedCode = data.code.trim().toUpperCase();

    const { data: claimed, error: claimErr } = await supabaseAdmin
      .from("student_access_codes")
      .update({ used_at: new Date().toISOString(), used_as_role: "parent", used_by: context.userId })
      .eq("code", normalizedCode)
      .is("used_at", null)
      .select("id, student_id, school_id")
      .maybeSingle();
    if (claimErr) throw new Error(claimErr.message);
    if (!claimed) throw new Error("Code invalide ou déjà utilisé.");

    const { error: linkErr } = await supabaseAdmin.from("student_parents").insert({
      school_id: claimed.school_id, student_id: claimed.student_id, parent_user_id: context.userId, is_primary: false,
    });
    if (linkErr) throw new Error(linkErr.message);
    await supabaseAdmin.from("students")
      .update({ parent_user_id: context.userId })
      .eq("id", claimed.student_id)
      .is("parent_user_id", null);

    return { ok: true };
  });
