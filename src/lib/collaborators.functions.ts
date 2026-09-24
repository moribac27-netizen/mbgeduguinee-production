import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { ASSIGNABLE_STAFF_ROLE_VALUES } from "@/lib/staff-roles";
import type { AppRole } from "@/hooks/useAuth";

const roleSchema = z.enum(ASSIGNABLE_STAFF_ROLE_VALUES as [AppRole, ...AppRole[]]);

/** Vérifie que l'appelant est admin/directeur/directeur_etudes/proviseur, et renvoie son school_id. */
async function assertDirectionAndSchool(context: any): Promise<string> {
  const { data: roles } = await context.supabase
    .from("user_roles").select("role").eq("user_id", context.userId);
  const isDirection = (roles ?? []).some((r: any) =>
    ["admin", "directeur", "directeur_etudes", "proviseur"].includes(r.role),
  );
  if (!isDirection) throw new Error("Accès réservé à la direction de l'établissement.");

  const { data: profile } = await context.supabase
    .from("profiles").select("school_id").eq("id", context.userId).maybeSingle();
  if (!profile?.school_id) throw new Error("École introuvable pour cet utilisateur.");
  return profile.school_id as string;
}

/**
 * Vérifie que la cible appartient à la même école ET n'est pas un compte
 * admin/directeur — ces comptes ne se gèrent pas depuis cet écran. Sans ce
 * garde-fou côté serveur, un directeur_etudes/proviseur (qui a aussi accès à
 * cet écran) pourrait appeler updateCollaboratorRole/setCollaboratorActive
 * directement (hors UI, où le bouton est simplement masqué) pour rétrograder
 * ou désactiver le compte Admin/Directeur de l'école.
 */
async function assertTargetIsManageableStaff(supabaseAdmin: any, userId: string, schoolId: string) {
  const { data: target } = await supabaseAdmin
    .from("profiles").select("id, school_id").eq("id", userId).maybeSingle();
  if (!target || target.school_id !== schoolId) {
    throw new Error("Ce collaborateur n'appartient pas à votre établissement.");
  }
  const { data: targetRoles } = await supabaseAdmin
    .from("user_roles").select("role").eq("user_id", userId);
  if ((targetRoles ?? []).some((r: any) => ["admin", "directeur"].includes(r.role))) {
    throw new Error("Le compte Admin/Directeur ne peut pas être modifié depuis cet écran.");
  }
}

function genTempPassword() {
  // Lisible, mais suffisamment robuste pour un mot de passe temporaire à changer à la première connexion.
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const values = new Uint32Array(12);
  globalThis.crypto.getRandomValues(values);
  let out = "";
  for (let i = 0; i < values.length; i++) out += chars[values[i] % chars.length];
  return out;
}

// --- Liste des collaborateurs de l'école courante ---
export const listCollaborators = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const schoolId = await assertDirectionAndSchool(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: profiles, error: profErr } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, phone, disabled_at, created_at")
      .eq("school_id", schoolId)
      .order("created_at", { ascending: false });
    if (profErr) throw new Error(profErr.message);

    const ids = (profiles ?? []).map((p: any) => p.id);
    if (ids.length === 0) return [];

    const { data: roleRows } = await supabaseAdmin
      .from("user_roles").select("user_id, role").in("user_id", ids);
    const rolesByUser = new Map<string, string[]>();
    (roleRows ?? []).forEach((r: any) => {
      const arr = rolesByUser.get(r.user_id) ?? [];
      arr.push(r.role);
      rolesByUser.set(r.user_id, arr);
    });

    // Exclut parents/élèves : cet écran ne liste que le personnel.
    const staffOnly = (profiles ?? []).filter((p: any) => {
      const rs = rolesByUser.get(p.id) ?? [];
      return rs.some((r) => !["parent", "eleve"].includes(r));
    });

    // Emails : non exposés par la table profiles, il faut passer par l'API admin.
    const { data: usersRes } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
    const emailById = new Map((usersRes?.users ?? []).map((u) => [u.id, u.email ?? null]));

    return staffOnly.map((p: any) => ({
      id: p.id,
      fullName: p.full_name,
      phone: p.phone,
      email: emailById.get(p.id) ?? null,
      roles: rolesByUser.get(p.id) ?? [],
      disabledAt: p.disabled_at,
      createdAt: p.created_at,
    }));
  });

// --- Ajout d'un collaborateur (invitation email OU création directe) ---
export const addCollaborator = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      fullName: z.string().min(1),
      email: z.string().email(),
      phone: z.string().optional().nullable(),
      role: roleSchema,
      mode: z.enum(["invite", "direct"]),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const schoolId = await assertDirectionAndSchool(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (data.mode === "invite") {
      // inviteUserByEmail() ne permet pas de définir app_metadata directement (seulement
      // `data`, qui correspond à user_metadata et n'est donc pas fiable pour le rôle/l'école
      // — cf. la faille corrigée dans handle_new_user). On complète donc juste après coup,
      // via des écritures admin explicites qui, elles, contournent la RLS en toute confiance.
      const { data: res, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(data.email, {
        data: { full_name: data.fullName, phone: data.phone ?? null },
        options: { redirectTo: `${process.env.APP_URL ?? process.env.VITE_APP_URL ?? "http://localhost:3000"}/definir-mot-de-passe` },
      });
      if (error || !res.user) {
        const msg = error?.message ?? "erreur inconnue";
        if (/already registered|already been registered|exists/i.test(msg)) {
          return { ok: false as const, error: "Cette adresse e-mail est déjà utilisée." };
        }
        return { ok: false as const, error: `Invitation impossible : ${msg}` };
      }
      const { error: metaErr } = await supabaseAdmin.auth.admin.updateUserById(res.user.id, {
        app_metadata: { school_id: schoolId, role: data.role },
      } as any);
      if (metaErr) throw new Error(`Impossible de rattacher l'invitation : ${metaErr.message}`);

      const { data: updatedProfile, error: profileErr } = await supabaseAdmin
        .from("profiles")
        .update({ full_name: data.fullName, phone: data.phone ?? null, school_id: schoolId })
        .eq("id", res.user.id)
        .select("id")
        .maybeSingle();
      if (profileErr) throw new Error(`Impossible de rattacher le profil : ${profileErr.message}`);
      if (!updatedProfile) throw new Error("Invitation créée mais profil utilisateur introuvable.");

      const { error: roleErr } = await supabaseAdmin
        .from("user_roles")
        .upsert({ user_id: res.user.id, role: data.role }, { onConflict: "user_id,role" });
      if (roleErr) throw new Error(`Impossible d'attribuer le rôle : ${roleErr.message}`);

      return { ok: true as const, userId: res.user.id, mode: "invite" as const };
    }

    const tempPassword = genTempPassword();
    const { data: res, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { full_name: data.fullName, phone: data.phone ?? null },
      app_metadata: { school_id: schoolId, role: data.role },
    });
    if (error || !res.user) {
      const msg = error?.message ?? "erreur inconnue";
      if (/already registered|already been registered|exists/i.test(msg)) {
        return { ok: false as const, error: "Cette adresse e-mail est déjà utilisée." };
      }
      return { ok: false as const, error: `Création impossible : ${msg}` };
    }

    // Ne pas dépendre du trigger handle_new_user : on force les deux rattachements
    // après createUser(). upsert évite une collision si le trigger a déjà réussi.
    const { data: updatedProfile, error: profileErr } = await supabaseAdmin
      .from("profiles")
      .update({ full_name: data.fullName, phone: data.phone ?? null, school_id: schoolId })
      .eq("id", res.user.id)
      .select("id")
      .maybeSingle();
    if (profileErr) throw new Error(`Compte créé mais profil non rattaché : ${profileErr.message}`);
    if (!updatedProfile) throw new Error("Compte créé mais profil utilisateur introuvable.");

    const { error: roleErr } = await supabaseAdmin
      .from("user_roles")
      .upsert({ user_id: res.user.id, role: data.role }, { onConflict: "user_id,role" });
    if (roleErr) throw new Error(`Compte créé mais rôle non rattaché : ${roleErr.message}`);

    return { ok: true as const, userId: res.user.id, mode: "direct" as const, tempPassword };
  });

// --- Modifier le rôle d'un collaborateur existant ---
export const updateCollaboratorRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ userId: z.string().uuid(), role: roleSchema }).parse(d))
  .handler(async ({ data, context }) => {
    const schoolId = await assertDirectionAndSchool(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertTargetIsManageableStaff(supabaseAdmin, data.userId, schoolId);

    const { error: delErr } = await supabaseAdmin.from("user_roles").delete().eq("user_id", data.userId);
    if (delErr) throw new Error(delErr.message);
    const { error: insErr } = await supabaseAdmin.from("user_roles").insert({ user_id: data.userId, role: data.role });
    if (insErr) throw new Error(insErr.message);

    return { ok: true };
  });

// --- Activer / désactiver un collaborateur ---
export const setCollaboratorActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ userId: z.string().uuid(), active: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const schoolId = await assertDirectionAndSchool(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertTargetIsManageableStaff(supabaseAdmin, data.userId, schoolId);

    const { error: profErr } = await supabaseAdmin
      .from("profiles")
      .update({ disabled_at: data.active ? null : new Date().toISOString() } as any)
      .eq("id", data.userId);
    if (profErr) throw new Error(profErr.message);

    // Bloque effectivement la connexion (pas seulement l'affichage) — "none" lève le bannissement.
    await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      ban_duration: data.active ? "none" : "876000h",
    } as any);

    return { ok: true };
  });
