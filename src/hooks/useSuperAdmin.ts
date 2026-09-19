import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export function useSuperAdmin() {
  const { user, loading: authLoading } = useAuth();
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (authLoading) { setLoading(true); return; }
    if (!user) { setIsSuperAdmin(false); setLoading(false); setError(null); return; }
    setLoading(true);
    supabase.from("super_admins").select("user_id").eq("user_id", user.id).maybeSingle().then(({ data, error: err }) => {
      if (err) {
        setError(err.message);
        setLoading(false);
        return;
      }
      setError(null);
      setIsSuperAdmin(!!data);
      setLoading(false);
    });
  }, [user?.id, authLoading]);
  return { isSuperAdmin, loading, error };
}