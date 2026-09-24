import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSignedUrl } from "@/hooks/useSignedUrl";
import { useAuth } from "@/hooks/useAuth";
import { getCurrentAcademicYear } from "@/lib/academic-year";

export interface SchoolInfo {
  id: string;
  name: string | null;
  address: string | null;
  city: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  logo_url: string | null;
  director_name: string | null;
  academic_year: string | null;
  theme_primary: string | null;
  theme_secondary: string | null;
  receipt_legal_notice?: string | null;
  [k: string]: any;
}

/** Infos de l'établissement de l'utilisateur courant (multi-tenant). */
export function useSchool() {
  const { user, loading: authLoading } = useAuth();
  const { data, isLoading, error } = useQuery({
    queryKey: ["current-school-info", user?.id ?? null],
    enabled: !authLoading && !!user,
    staleTime: 60_000,
    queryFn: async (): Promise<SchoolInfo | null> => {
      const { data: sid, error: sidError } = await supabase.rpc("current_school_id");
      if (sidError) throw sidError;
      let schoolId = sid as string | null;

      // Les profils staff portent directement school_id. Les comptes parent
      // et élève sont rattachés à leur établissement via les élèves liés.
      if (!schoolId) {
        const uid = user?.id;
        if (!uid) return null;

        const { data: parentLink, error: parentLinkError } = await supabase
          .from("student_parents")
          .select("school_id")
          .eq("parent_user_id", uid)
          .not("school_id", "is", null)
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();
        if (parentLinkError) throw parentLinkError;

        if (parentLink?.school_id) {
          schoolId = parentLink.school_id as string;
        } else {
          const { data: studentLink, error: studentLinkError } = await supabase
            .from("students")
            .select("school_id")
            .or(`student_user_id.eq.${uid},parent_user_id.eq.${uid}`)
            .not("school_id", "is", null)
            .limit(1)
            .maybeSingle();
          if (studentLinkError) throw studentLinkError;
          if (studentLink?.school_id) schoolId = studentLink.school_id as string;
        }
      }

      if (!schoolId) return null;
      const { data: row, error: schoolError } = await supabase
        .from("schools")
        .select("*")
        .eq("id", schoolId)
        .maybeSingle();
      if (schoolError) throw schoolError;
      if (!row) return null;
      return {
        ...(row as unknown as SchoolInfo),
        // L'année active est déterminée par la date en Guinée.
        // La valeur historique stockée en base reste inchangée.
        academic_year: getCurrentAcademicYear(),
      };
    },
  });
  const logoUrl = useSignedUrl(data?.logo_url ?? null);
  return { school: data ?? null, logoUrl, loading: authLoading || isLoading, error: error as Error | null };
}
