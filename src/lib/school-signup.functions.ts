import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(12),
  fullName: z.string().min(1),
  phone: z.string().optional().nullable(),
  schoolName: z.string().min(1),
  schoolAddress: z.string().optional().nullable(),
  schoolPhone: z.string().optional().nullable(),
});

type Result =
  | { ok: true; schoolId: string; userId: string; emailConfirmed: true }
  | { ok: false; error: string };

export const registerSchool = createServerFn({ method: "POST" })
  .inputValidator((d) => schema.parse(d))
  .handler(async ({ data }): Promise<Result> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // 1. Create school first
    const { data: school, error: schoolErr } = await supabaseAdmin
      .from("schools")
      .insert({
        name: data.schoolName,
        address: data.schoolAddress ?? null,
        phone: data.schoolPhone ?? null,
        email: data.email,
      })
      .select("id")
      .single();
    if (schoolErr || !school) {
      return { ok: false, error: `Impossible de créer l'établissement: ${schoolErr?.message ?? "erreur inconnue"}` };
    }

    // 2. Create admin user
    const { data: userRes, error: userErr } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: {
        full_name: data.fullName,
        phone: data.phone ?? null,
      },
      app_metadata: {
        school_id: school.id,
        role: "admin",
      },
    });
    if (userErr || !userRes.user) {
      await supabaseAdmin.from("schools").delete().eq("id", school.id);
      const msg = userErr?.message ?? "";
      if (/already registered|already been registered|exists/i.test(msg)) {
        return { ok: false, error: "Cette adresse e-mail est déjà utilisée. Connectez-vous ou utilisez une autre adresse." };
      }
      return { ok: false, error: `Impossible de créer le compte administrateur: ${msg || "erreur inconnue"}` };
    }

    // 3. Explicitly attach profile + role. The DB trigger (handle_new_user)
    // fires on INSERT into auth.users, but at that point app_metadata is not
    // yet the final value written by createUser() above — it reliably falls
    // back to the sandbox school and no role. So we set the real values here
    // ourselves, right after the user is confirmed created.
    const { error: profileErr } = await supabaseAdmin
      .from("profiles")
      .update({
        full_name: data.fullName,
        phone: data.phone ?? null,
        school_id: school.id,
      })
      .eq("id", userRes.user.id);
    if (profileErr) {
      await supabaseAdmin.auth.admin.deleteUser(userRes.user.id);
      await supabaseAdmin.from("schools").delete().eq("id", school.id);
      return { ok: false, error: `Impossible de finaliser le profil: ${profileErr.message}` };
    }

    const { error: roleErr } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: userRes.user.id, role: "admin" });
    if (roleErr) {
      await supabaseAdmin.auth.admin.deleteUser(userRes.user.id);
      await supabaseAdmin.from("schools").delete().eq("id", school.id);
      return { ok: false, error: `Impossible d'attribuer le rôle: ${roleErr.message}` };
    }

    return { ok: true, schoolId: school.id, userId: userRes.user.id, emailConfirmed: true };
  });