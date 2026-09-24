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
    await assertSuperAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("schools").delete().eq("id", data.schoolId);
    if (error) throw new Error(error.message);
    return { ok: true };
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
