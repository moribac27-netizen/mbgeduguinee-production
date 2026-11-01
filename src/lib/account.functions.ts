import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Appelée après un changement de mot de passe réussi : lève l'obligation de changer le mot de passe temporaire. */
export const clearMustChangePassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(context.userId, { app_metadata: { must_change_password: false } } as any);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
