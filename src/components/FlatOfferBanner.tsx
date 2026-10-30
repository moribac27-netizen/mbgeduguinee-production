import { Link } from "@tanstack/react-router";
import { AlertTriangle } from "lucide-react";
import { useMyFlatOffer } from "@/hooks/useMyFlatOffer";
import { useRoles } from "@/hooks/useAuth";
import { capacityState } from "@/lib/flat-offers";

const fmt = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

/** Messages affichés à la direction d'un établissement sous forfait : retard, capacité, fin de validité. */
export function FlatOfferBanner() {
  const { flat } = useMyFlatOffer();
  const { roles } = useRoles();
  if (!flat || !roles.some((r) => r === "admin" || r === "directeur" || r === "comptable")) return null;
  const msgs: string[] = [];
  if (flat.expired) {
    msgs.push("L'offre exceptionnelle par établissement est terminée. Pour poursuivre l'utilisation de MBGEduGuinée, choisissez l'un des trois plans par élève en contactant l'administration de la plateforme. Toutes vos données sont conservées.");
  } else {
    if (flat.phase === "trial") msgs.push(`Période d'essai : il vous reste ${Math.max(flat.trial_days_left ?? 0, 0)} jour(s) et ${flat.trial_max_students ?? 10} élèves maximum. Les notes, bulletins et examens sont activés dès que votre premier paiement est validé par l'administration.`);
    else if (flat.phase === "unpaid") msgs.push("Votre période d'essai est terminée : réglez votre forfait pour inscrire des élèves et accéder aux notes, bulletins et examens.");
    else if (!flat.in_good_standing) msgs.push("Un paiement de votre forfait est en retard : les nouvelles inscriptions et l'accès aux notes, bulletins et examens sont suspendus jusqu'à validation du paiement par l'administration.");
    const cap = capacityState(flat.students_count, flat.max_students);
    if (cap === "over") msgs.push(`Votre effectif (${flat.students_count} élèves) dépasse la capacité de votre plan (${flat.max_students}). Les nouvelles inscriptions sont refusées : passez à une formule supérieure.`);
    else if (cap === "full") msgs.push(`La capacité de votre plan est atteinte (${flat.max_students} élèves) : les nouvelles inscriptions sont refusées. Passez à une formule supérieure pour inscrire d'autres élèves.`);
    else if (cap === "near") msgs.push(`Vous approchez de la capacité de votre plan : ${flat.students_count} élèves sur ${flat.max_students}. Pensez à passer à une formule supérieure.`);
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
