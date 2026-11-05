import { Link } from "@tanstack/react-router";
import { AlertTriangle } from "lucide-react";
import { useMyFlatOffer } from "@/hooks/useMyFlatOffer";
import { useRoles } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSchool } from "@/hooks/useSchool";

const fmt = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

/** Messages affichés à la direction d'un établissement sous forfait : retard, capacité, fin de validité. */
export function FlatOfferBanner() {
  const { flat } = useMyFlatOffer();
  const { roles } = useRoles();
  const { school } = useSchool();
  const schoolId = (school as any)?.id as string | undefined;
  // Niveau d'alerte calculé par la base : ok / warning (>= 90 %) / full / unlimited.
  const usage = useQuery({
    queryKey: ["school-student-usage", schoolId],
    enabled: !!flat && !!schoolId,
    staleTime: 60_000,
    retry: false,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("school_student_usage", { _school_id: schoolId });
      if (error) return null;
      return (Array.isArray(data) ? data[0] : data) as { students_count: number; max_students: number | null; remaining: number | null; alert_level: string } | null;
    },
  });
  if (!flat || !roles.some((r) => r === "admin" || r === "directeur" || r === "comptable")) return null;
  const msgs: string[] = [];
  if (flat.expired) {
    msgs.push("L'offre exceptionnelle par établissement est terminée. Pour poursuivre l'utilisation de MBGEduGuinée, choisissez l'un des trois plans par élève en contactant l'administration de la plateforme. Toutes vos données sont conservées.");
  } else {
    if (flat.phase === "trial") msgs.push(`Période d'essai : il vous reste ${Math.max(flat.trial_days_left ?? 0, 0)} jour(s) et ${flat.trial_max_students ?? 10} élèves maximum. Les notes, bulletins et examens sont activés dès que votre premier paiement est validé par l'administration.`);
    else if (flat.phase === "unpaid") msgs.push("Votre période d'essai est terminée : réglez votre forfait pour inscrire des élèves et accéder aux notes, bulletins et examens.");
    else if (!flat.in_good_standing) msgs.push("Un paiement de votre forfait est en retard : les nouvelles inscriptions et l'accès aux notes, bulletins et examens sont suspendus jusqu'à validation du paiement par l'administration.");
    const u = usage.data;
    if (u?.alert_level === "full") msgs.push(`La capacité de votre plan est atteinte (${u.max_students} élèves) : les nouvelles inscriptions sont refusées. Passez à une formule supérieure pour inscrire d'autres élèves.`);
    else if (u?.alert_level === "warning") msgs.push(`Vous approchez de la capacité de votre plan : ${u.students_count} élèves sur ${u.max_students} (${u.remaining} place(s) restante(s)). Pensez à passer à une formule supérieure.`);
    if (flat.days_left >= 0 && flat.days_left <= 60) msgs.push(`Votre offre exceptionnelle se termine le ${fmt(flat.valid_until)}. À partir de l'année scolaire suivante, vous devrez choisir l'un des trois plans par élève (contactez l'administration de la plateforme avant cette date). Vos données seront conservées.`);
  }
  if (!msgs.length) return null;
  return (
    <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
      {msgs.map((m) => <p key={m} className="flex gap-2"><AlertTriangle className="mt-0.5 size-4 shrink-0" /><span>{m}</span></p>)}
      <Link to="/mon-forfait" className="mt-1 inline-block text-xs font-medium underline">Voir mon forfait</Link>
    </div>
  );
}
