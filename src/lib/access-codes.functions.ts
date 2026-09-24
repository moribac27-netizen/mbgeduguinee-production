import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function genCode(): string {
  const values = new Uint32Array(10);
  globalThis.crypto.getRandomValues(values);
  let out = "";
  for (let i = 0; i < values.length; i++) {
    out += CODE_ALPHABET[values[i] % CODE_ALPHABET.length];
  }
  return out.slice(0, 5) + "-" + out.slice(5);
}

async function assertStaffAndSchool(context: any): Promise<string> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: superAdmin, error: superAdminErr } = await supabaseAdmin
    .from("super_admins")
    .select("user_id")
    .eq("user_id", context.userId)
    .maybeSingle();
  if (superAdminErr) throw new Error(`Vérification super administrateur impossible : ${superAdminErr.message}`);
  
  if (superAdmin) {
    const { data: profile } = await context.supabase.from("profiles").select("school_id").eq("id", context.userId).maybeSingle();
    if (profile?.school_id) return profile.school_id as string;
    const { data: schools } = await context.supabase.from("schools").select("id").limit(1);
    if (!schools || schools.length === 0) throw new Error("Aucun établissement trouvé.");
    return schools[0].id as string;
  }

  const { data: roles } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId);
  const staffRoles = [
    "admin", "directeur", "directeur_etudes", "proviseur", "enseignant",
    "secretariat", "comptable", "surveillant", "bibliothecaire", "infirmerie",
    "educatrice_maternelle", "responsable_transport", "responsable_cantine", "rh",
  ];
  if (!(roles ?? []).some((r: any) => staffRoles.includes(r.role))) throw new Error("Accès réservé au personnel de l’établissement.");
  
  const { data: profile } = await context.supabase.from("profiles").select("school_id").eq("id", context.userId).maybeSingle();
  if (!profile?.school_id) throw new Error("École introuvable pour cet utilisateur.");
  return profile.school_id as string;
}

export const generateStudentAccessCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ studentId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const schoolId = await assertStaffAndSchool(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: student } = await supabaseAdmin.from("students").select("id, school_id, full_name").eq("id", data.studentId).maybeSingle();
    if (!student || student.school_id !== schoolId) throw new Error("Cet élève n’appartient pas à votre établissement.");
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = genCode();
      const { data: row, error } = await supabaseAdmin.from("student_access_codes").insert({ school_id: schoolId, student_id: data.studentId, code, created_by: context.userId }).select("id, code, created_at").single();
      if (!error) return { code: row.code, createdAt: row.created_at, studentName: student.full_name };
      if (!/duplicate|unique/i.test(error.message)) throw new Error(error.message);
    }
    throw new Error("Impossible de générer un code d’accès unique. Réessayez.");
  });

export const listStudentAccessCodes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ studentId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const schoolId = await assertStaffAndSchool(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: student, error: studentError } = await supabaseAdmin
      .from("students")
      .select("id, school_id")
      .eq("id", data.studentId)
      .maybeSingle();
    if (studentError) throw new Error(studentError.message);
    if (!student || student.school_id !== schoolId) throw new Error("Cet élève n’appartient pas à votre établissement.");
    const { data: rows, error } = await supabaseAdmin.from("student_access_codes").select("id, code, created_at, used_at, used_as_role").eq("student_id", data.studentId).eq("school_id", schoolId).order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const redeemAccessCodeAndSignUp = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ code: z.string().min(6), email: z.string().email(), password: z.string().min(12), fullName: z.string().min(1), phone: z.string().optional().nullable(), asRole: z.enum(["parent", "eleve"]) }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const normalizedCode = data.code.trim().toUpperCase();
    if (!/^[A-Z0-9]{5}-[A-Z0-9]{5}$/.test(normalizedCode)) {
      return { ok: false as const, error: "Format du code invalide. Utilisez XXXXX-XXXXX." };
    }
    const { data: claimed, error: claimErr } = await supabaseAdmin.from("student_access_codes").update({ used_at: new Date().toISOString(), used_as_role: data.asRole }).eq("code", normalizedCode).is("used_at", null).select("id, student_id, school_id").maybeSingle();
    if (claimErr) return { ok: false as const, error: claimErr.message };
    if (!claimed) return { ok: false as const, error: "Code invalide, expiré ou déjà utilisé." };
    const { data: userRes, error: userErr } = await supabaseAdmin.auth.admin.createUser({ email: data.email, password: data.password, email_confirm: true, user_metadata: { full_name: data.fullName, phone: data.phone ?? null }, app_metadata: { school_id: claimed.school_id, role: data.asRole } });
    if (userErr || !userRes.user) {
      await supabaseAdmin.from("student_access_codes").update({ used_at: null, used_as_role: null }).eq("id", claimed.id);
      return { ok: false as const, error: "Impossible de créer le compte. Vérifiez l’adresse e-mail puis réessayez." };
    }
    const newUserId = userRes.user.id;

    // Attache explicitement profil + role : le trigger handle_new_user se
    // déclenche avant que app_metadata soit definitivement écrit par
    // createUser() ci-dessus, donc on force les bonnes valeurs ici.
    const { error: profileErr } = await supabaseAdmin.from("profiles").update({
      full_name: data.fullName,
      phone: data.phone ?? null,
      school_id: claimed.school_id,
    }).eq("id", newUserId);
    if (profileErr) {
      await supabaseAdmin.auth.admin.deleteUser(newUserId);
      await supabaseAdmin.from("student_access_codes").update({ used_at: null, used_as_role: null, used_by: null }).eq("id", claimed.id);
      throw new Error(`Impossible de finaliser le profil : ${profileErr.message}`);
    }
    const { error: roleErr } = await supabaseAdmin
      .from("user_roles")
      .upsert({ user_id: newUserId, role: data.asRole }, { onConflict: "user_id,role" });
    if (roleErr) {
      await supabaseAdmin.auth.admin.deleteUser(newUserId);
      await supabaseAdmin.from("student_access_codes").update({ used_at: null, used_as_role: null, used_by: null }).eq("id", claimed.id);
      throw new Error(`Impossible d’attribuer le rôle : ${roleErr.message}`);
    }

    const { error: usedErr } = await supabaseAdmin
      .from("student_access_codes")
      .update({ used_by: newUserId })
      .eq("id", claimed.id);
    if (usedErr) {
      await supabaseAdmin.auth.admin.deleteUser(newUserId);
      await supabaseAdmin.from("student_access_codes").update({ used_at: null, used_as_role: null, used_by: null }).eq("id", claimed.id);
      throw new Error(`Impossible de finaliser le code d’accès : ${usedErr.message}`);
    }

    if (data.asRole === "eleve") {
      const { error: studentErr } = await supabaseAdmin.from("students").update({ student_user_id: newUserId }).eq("id", claimed.student_id);
      if (studentErr) {
        await supabaseAdmin.auth.admin.deleteUser(newUserId);
        await supabaseAdmin.from("student_access_codes").update({ used_at: null, used_as_role: null, used_by: null }).eq("id", claimed.id);
        throw new Error(`Impossible de rattacher le compte élève : ${studentErr.message}`);
      }
    } else {
      const { error: parentLinkErr } = await supabaseAdmin.from("student_parents").insert({ school_id: claimed.school_id, student_id: claimed.student_id, parent_user_id: newUserId, is_primary: true });
      if (parentLinkErr) {
        await supabaseAdmin.auth.admin.deleteUser(newUserId);
        await supabaseAdmin.from("student_access_codes").update({ used_at: null, used_as_role: null, used_by: null }).eq("id", claimed.id);
        throw new Error(`Impossible de rattacher le compte parent : ${parentLinkErr.message}`);
      }
      const { error: legacyParentErr } = await supabaseAdmin.from("students").update({ parent_user_id: newUserId }).eq("id", claimed.student_id).is("parent_user_id", null);
      if (legacyParentErr) {
        await supabaseAdmin.auth.admin.deleteUser(newUserId);
        await supabaseAdmin.from("student_access_codes").update({ used_at: null, used_as_role: null, used_by: null }).eq("id", claimed.id);
        throw new Error(`Impossible de finaliser le rattachement parent : ${legacyParentErr.message}`);
      }
    }
    await supabaseAdmin.from("activity_logs").insert({ school_id: claimed.school_id, user_id: newUserId, actor_name: data.fullName, actor_role: data.asRole, action: "create", entity_type: "family_account", entity_id: claimed.student_id, entity_label: data.fullName, metadata: { via: "student_access_code", code: normalizedCode } });
    return { ok: true as const };
  });

export const linkAdditionalChild = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ code: z.string().min(6) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", context.userId);
    if (!(roles ?? []).some((r: any) => r.role === "parent")) throw new Error("Accès réservé aux parents.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const normalizedCode = data.code.trim().toUpperCase();
    if (!/^[A-Z0-9]{5}-[A-Z0-9]{5}$/.test(normalizedCode)) {
      throw new Error("Format du code invalide. Utilisez XXXXX-XXXXX.");
    }

    const { data: parentProfile, error: parentProfileErr } = await supabase
      .from("profiles")
      .select("school_id")
      .eq("id", context.userId)
      .maybeSingle();
    if (parentProfileErr) throw new Error(parentProfileErr.message);
    if (!parentProfile?.school_id) throw new Error("Établissement du parent introuvable.");

    const { data: codeRow, error: codeErr } = await supabaseAdmin
      .from("student_access_codes")
      .select("id, student_id, school_id")
      .eq("code", normalizedCode)
      .eq("school_id", parentProfile.school_id)
      .is("used_at", null)
      .maybeSingle();
    if (codeErr) throw new Error(codeErr.message);
    if (!codeRow) throw new Error("Code invalide, expiré ou déjà utilisé.");

    const { data: existingLink, error: existingErr } = await supabaseAdmin
      .from("student_parents")
      .select("id")
      .eq("parent_user_id", context.userId)
      .eq("student_id", codeRow.student_id)
      .maybeSingle();
    if (existingErr) throw new Error(existingErr.message);
    if (existingLink) throw new Error("Cet enfant est déjà rattaché à votre compte.");

    const { data: claimed, error: claimErr } = await supabaseAdmin
      .from("student_access_codes")
      .update({ used_at: new Date().toISOString(), used_as_role: "parent" })
      .eq("id", codeRow.id)
      .is("used_at", null)
      .select("id, student_id, school_id")
      .maybeSingle();
    if (claimErr) throw new Error(claimErr.message);
    if (!claimed) throw new Error("Code invalide, expiré ou déjà utilisé.");

    const { error: linkErr } = await supabaseAdmin
      .from("student_parents")
      .insert({ school_id: claimed.school_id, student_id: claimed.student_id, parent_user_id: context.userId, is_primary: false });
    if (linkErr) {
      await supabaseAdmin
        .from("student_access_codes")
        .update({ used_at: null, used_as_role: null, used_by: null })
        .eq("id", claimed.id)
        .is("used_by", null);
      if (/duplicate|unique/i.test(linkErr.message)) {
        throw new Error("Cet enfant est déjà rattaché à votre compte.");
      }
      throw new Error(`Impossible de rattacher l’enfant : ${linkErr.message}`);
    }

    const { error: usedErr } = await supabaseAdmin
      .from("student_access_codes")
      .update({ used_by: context.userId })
      .eq("id", claimed.id);
    if (usedErr) throw new Error(`Enfant rattaché, mais impossible de finaliser le code : ${usedErr.message}`);

    await supabaseAdmin
      .from("students")
      .update({ parent_user_id: context.userId })
      .eq("id", claimed.student_id)
      .is("parent_user_id", null);
    return { ok: true };
  });