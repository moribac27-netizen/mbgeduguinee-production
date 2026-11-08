import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

async function assertSuperAdmin(context: any) {
  const { data, error } = await context.supabase
    .from("super_admins").select("user_id").eq("user_id", context.userId).maybeSingle();
  if (error || !data) throw new Error("Forbidden: super admin only");
}

// --- Reset admin password (generate recovery link) ---
export const resetSchoolAdminPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ schoolId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: admins } = await supabaseAdmin
      .from("profiles").select("id").eq("school_id", data.schoolId);
    if (!admins?.length) throw new Error("Aucun utilisateur pour cette école");

    const ids = admins.map((a: any) => a.id);
    const { data: roles } = await supabaseAdmin
      .from("user_roles").select("user_id").eq("role", "admin").in("user_id", ids);
    const adminId = roles?.[0]?.user_id;
    if (!adminId) throw new Error("Aucun administrateur trouvé pour cette école");

    const { data: userRes } = await supabaseAdmin.auth.admin.getUserById(adminId);
    const email = userRes?.user?.email;
    if (!email) throw new Error("E-mail admin introuvable");

    const { data: linkRes, error } = await supabaseAdmin.auth.admin.generateLink({
      type: "recovery", email,
    });
    if (error) throw new Error(error.message);
    return { email, actionLink: linkRes.properties?.action_link ?? null };
  });

// --- Impersonation (magic link) ---
export const impersonateSchoolAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ schoolId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: admins } = await supabaseAdmin
      .from("profiles").select("id").eq("school_id", data.schoolId);
    const ids = (admins ?? []).map((a: any) => a.id);
    const { data: roles } = await supabaseAdmin
      .from("user_roles").select("user_id").eq("role", "admin").in("user_id", ids);
    const adminId = roles?.[0]?.user_id;
    if (!adminId) throw new Error("Aucun administrateur trouvé");

    const { data: userRes } = await supabaseAdmin.auth.admin.getUserById(adminId);
    const email = userRes?.user?.email;
    if (!email) throw new Error("E-mail admin introuvable");

    const { data: linkRes, error } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink", email,
    });
    if (error) throw new Error(error.message);
    return { email, actionLink: linkRes.properties?.action_link ?? null };
  });

// --- Update school (name, city, phone, email, director, status) ---
export const updateSchoolAsSuperAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    schoolId: z.string().uuid(),
    patch: z.object({
      name: z.string().min(1).optional(),
      code: z.string().nullable().optional(),
      city: z.string().nullable().optional(),
      address: z.string().nullable().optional(),
      phone: z.string().nullable().optional(),
      email: z.string().email().nullable().optional(),
      director_name: z.string().nullable().optional(),
      status: z.enum(["active","suspended","pending"]).optional(),
    }),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context);
    const { error } = await context.supabase
      .from("schools").update(data.patch).eq("id", data.schoolId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// --- Delete school ---
export const deleteSchoolAsSuperAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ schoolId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    // Les erreurs levées ici arrivent vides côté navigateur : on renvoie toujours un résultat lisible.
    try {
      await assertSuperAdmin(context);
      const { error } = await (context.supabase as any).rpc("super_delete_school", { _school_id: data.schoolId });
      if (error) {
        const m = String(error.message ?? "");
        const known: Record<string, string> = {
          SCHOOL_HAS_STUDENTS: "Cette école a des élèves : suppression refusée.",
          SCHOOL_HAS_PAYMENTS: "Cette école a des paiements d'abonnement validés : suppression refusée.",
          SCHOOL_HAS_SUPER_ADMIN: "Un Super Admin est rattaché à cette école : suppression refusée.",
          SCHOOL_HAS_FOUNDER: "Un fondateur est rattaché à cette école : retirez-le d'abord.",
          SCHOOL_HAS_DATA: "Cette école contient encore des données (classes, notes, comptabilité…) : suppression refusée.",
          SCHOOL_NOT_FOUND: "École introuvable.", FORBIDDEN: "Action réservée au Super Admin.",
        };
        const k = Object.keys(known).find((c) => m.includes(c));
        return { ok: false as const, error: k ? known[k] : `Suppression impossible : ${m || "erreur inconnue"}` };
      }
      return { ok: true as const };
    } catch (e: any) {
      return { ok: false as const, error: String(e?.message || e || "Erreur serveur inconnue") };
    }
  });

// --- Notify one or many schools (broadcast) ---
export const notifySchools = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    schoolIds: z.array(z.string().uuid()).min(1),
    subject: z.string().min(1),
    body: z.string().min(1),
    channel: z.string().default("in-app"),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context);
    const rows = data.schoolIds.map((school_id) => ({
      school_id, author_id: context.userId,
      subject: data.subject, body: data.body, channel: data.channel,
    }));
    const { error } = await context.supabase.from("message_broadcasts").insert(rows);
    if (error) throw new Error(error.message);
    return { sent: rows.length };
  });

// --- Storage usage per school ---
export const getStorageUsage = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperAdmin(context);
    const { data, error } = await (context.supabase as any).rpc("school_storage_usage");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

// --- Login stats (last sign-in per school) ---
export const getLoginStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: users } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
    const { data: profiles } = await supabaseAdmin
      .from("profiles").select("id,school_id");
    const bySchool: Record<string, { last: string | null; active30d: number; total: number }> = {};
    const pIndex = new Map<string, string>();
    (profiles ?? []).forEach((p: any) => { if (p.school_id) pIndex.set(p.id, p.school_id); });
    const cutoff = Date.now() - 30 * 86400000;
    (users?.users ?? []).forEach((u: any) => {
      const sid = pIndex.get(u.id);
      if (!sid) return;
      const rec = (bySchool[sid] ??= { last: null, active30d: 0, total: 0 });
      rec.total++;
      const last = u.last_sign_in_at ? new Date(u.last_sign_in_at).getTime() : 0;
      if (last > cutoff) rec.active30d++;
      if (u.last_sign_in_at && (!rec.last || new Date(rec.last).getTime() < last)) {
        rec.last = u.last_sign_in_at;
      }
    });
    return bySchool;
  });

// --- Fondateur : lien de (ré)initialisation du mot de passe, avec correction éventuelle de l'e-mail de connexion ---
export const founderAccessLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ userId: z.string().uuid(), newEmail: z.string().trim().toLowerCase().email().max(254).optional() }).parse(d))
  .handler(async ({ data, context }) => {
   try {
    await assertSuperAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Réservé aux comptes rattachés comme fondateur : cette fonction ne sert pas à toucher un autre compte.
    const { data: link } = await (supabaseAdmin as any)
      .from("founder_schools").select("school_id").eq("user_id", data.userId).is("revoked_at", null).limit(1).maybeSingle();
    if (!link) throw new Error("Ce compte n'est rattaché à aucun établissement comme fondateur.");

    const { data: userRes, error: getErr } = await supabaseAdmin.auth.admin.getUserById(data.userId);
    if (getErr || !userRes?.user) throw new Error("Utilisateur introuvable");
    let email = userRes.user.email ?? "";
    let emailChanged = false;

    if (data.newEmail && data.newEmail !== email) {
      const { error: upErr } = await supabaseAdmin.auth.admin.updateUserById(data.userId, { email: data.newEmail, email_confirm: true });
      if (upErr) throw new Error(upErr.message);
      email = data.newEmail;
      emailChanged = true;
    }
    if (!email) throw new Error("Aucun e-mail pour ce compte : saisissez-en un.");

    const { data: linkRes, error } = await supabaseAdmin.auth.admin.generateLink({ type: "recovery", email });
    if (error) throw new Error(error.message);

    await (supabaseAdmin as any).from("founder_audit").insert({
      user_id: data.userId, school_id: link.school_id, event: "FOUNDER_ACCESS_LINK", actor: context.userId,
      details: { email_changed: emailChanged },
    });
    return { ok: true as const, email, emailChanged, actionLink: linkRes.properties?.action_link ?? null };
   } catch (e: any) {
    // Toujours renvoyer un message lisible (une erreur levée peut arriver vide côté navigateur)
    return { ok: false as const, error: String(e?.message || e || "Erreur serveur inconnue") };
   }
  });
