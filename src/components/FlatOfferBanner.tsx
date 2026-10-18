import { Link } from "@tanstack/react-router";
import { AlertTriangle } from "lucide-react";
import { useMyFlatOffer } from "@/hooks/useMyFlatOffer";
import { useRoles } from "@/hooks/useAuth";

const fmt = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

/** Messages affichés à la direction d'un établissement sous forfait : retard, dépassement de tranche, fin de validité. */
export function FlatOfferBanner() {
  const { flat } = useMyFlatOffer();
  const { roles } = useRoles();
  if (!flat || !roles.some((r) => r === "admin" || r === "directeur" || r === "comptable")) return null;
  const msgs: string[] = [];
  if (!flat.in_good_standing) msgs.push("Un paiement de votre forfait est en retard : l'accès aux notes, bulletins et examens est restreint jusqu'à validation du paiement par l'administration.");
  if (flat.over_tranche) msgs.push(`Votre effectif (${flat.students_count} élèves) dépasse la tranche de votre offre (${flat.min_students}–${flat.max_students}). Passez à l'offre supérieure en contactant l'administration de la plateforme.`);
  if (flat.days_left >= 0 && flat.days_left <= 60) msgs.push(`Votre offre établissement se termine le ${fmt(flat.valid_until)}. Dès l'année prochaine, choisissez l'une des trois offres par élève (contactez l'administration de la plateforme avant cette date).`);
  if (flat.days_left < 0) msgs.push("La période de votre offre établissement est terminée : choisissez l'une des trois offres par élève pour conserver l'accès complet.");
  if (!msgs.length) return null;
  return (
    <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
      {msgs.map((m) => <p key={m} className="flex gap-2"><AlertTriangle className="mt-0.5 size-4 shrink-0" /><span>{m}</span></p>)}
      <Link to="/mon-forfait" className="mt-1 inline-block text-xs font-medium underline">Voir mon forfait</Link>
    </div>
  );
}
