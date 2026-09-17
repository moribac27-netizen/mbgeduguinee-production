import { useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole =
  | "admin"
  | "directeur"
  | "directeur_etudes"
  | "proviseur"
  | "comptable"
  | "enseignant"
  | "surveillant"
  | "secretariat"
  | "bibliothecaire"
  | "infirmerie"
  | "educatrice_maternelle"
  | "responsable_transport"
  | "responsable_cantine"
  | "rh"
  | "parent"
  | "eleve";

export const ROLE_LABELS: Record<AppRole, string> = {
  admin: "Administrateur",
  directeur: "Directeur",
  directeur_etudes: "Directeur des études",
  proviseur: "Proviseur",
  comptable: "Comptable",
  enseignant: "Enseignant",
  surveillant: "Surveillant",
  secretariat: "Secrétariat",
  bibliothecaire: "Bibliothécaire",
  infirmerie: "Infirmerie",
  educatrice_maternelle: "Éducatrice Maternelle",
  responsable_transport: "Responsable Transport",
  responsable_cantine: "Responsable Cantine",
  rh: "Ressources Humaines",
  parent: "Parent",
  eleve: "Élève",
};

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setUser(s?.user ?? null);
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setUser(data.session?.user ?? null);
      setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  return { session, user, loading };
}

export function useRoles() {
  const { user, loading: authLoading } = useAuth();
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (authLoading) { setLoading(true); return; }
    if (!user) { setRoles([]); setLoading(false); return; }
    setLoading(true);
    supabase.from("user_roles").select("role").eq("user_id", user.id).then(({ data }) => {
      setRoles((data ?? []).map((r: any) => r.role));
      setLoading(false);
    });
  }, [user?.id, authLoading]);
  return { roles, loading };
}

const STAFF_ROLES: AppRole[] = ["admin", "directeur", "directeur_etudes", "proviseur", "comptable", "enseignant", "surveillant"];

export function primaryRole(roles: AppRole[]): AppRole | null {
  if (roles.length === 0) return null;
  for (const r of ["admin", "directeur", "proviseur", "directeur_etudes", "comptable", "enseignant", "surveillant", "parent", "eleve"] as AppRole[]) {
    if (roles.includes(r)) return r;
  }
  return roles[0];
}

export function homeForRole(role: AppRole | null): string {
  if (role === "parent") return "/parent";
  if (role === "eleve") return "/eleve";
  return "/dashboard";
}

export function isStaff(roles: AppRole[]): boolean {
  return roles.some((r) => STAFF_ROLES.includes(r));
}
