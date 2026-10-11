/** Offres affichées sur la page publique. Les valeurs viennent de Supabase quand elles sont lisibles ; sinon ces valeurs par défaut. */
export interface PublicOffer {
  code: "basique" | "standard" | "premium" | string;
  name: string;
  price: number;
  commission: number;
  parentLogin: boolean;
  studentLogin: boolean;
  parentPays: boolean;
  studentPays: boolean;
  modules: { cantine: boolean; infirmerie: boolean; bibliotheque: boolean };
}

export const DEFAULT_PUBLIC_OFFERS: PublicOffer[] = [
  { code: "basique", name: "Basique", price: 20000, commission: 0, parentLogin: false, studentLogin: false, parentPays: false, studentPays: false, modules: { cantine: false, infirmerie: false, bibliotheque: false } },
  { code: "standard", name: "Standard", price: 35000, commission: 5000, parentLogin: true, studentLogin: false, parentPays: true, studentPays: false, modules: { cantine: true, infirmerie: true, bibliotheque: true } },
  { code: "premium", name: "Premium", price: 50000, commission: 15000, parentLogin: true, studentLogin: true, parentPays: true, studentPays: true, modules: { cantine: true, infirmerie: true, bibliotheque: true } },
];

const ORDER = ["basique", "standard", "premium"];

/** Convertit les lignes `subscription_offers` ; renvoie les valeurs par défaut si les données sont absentes ou invalides. */
export function toPublicOffers(rows: any[] | null | undefined): PublicOffer[] {
  const list = (rows ?? [])
    .filter((r) => r && typeof r.code === "string" && Number.isFinite(Number(r.annual_price_per_student)))
    .map((r): PublicOffer => ({
      code: r.code,
      name: String(r.name ?? r.code),
      price: Number(r.annual_price_per_student),
      commission: Number(r.school_commission_per_student) || 0,
      parentLogin: !!r.parent_login_allowed,
      studentLogin: !!r.student_login_allowed,
      parentPays: Array.isArray(r.payer_roles) && r.payer_roles.includes("parent"),
      studentPays: Array.isArray(r.payer_roles) && r.payer_roles.includes("eleve"),
      modules: { cantine: r.features?.cantine !== false, infirmerie: r.features?.infirmerie !== false, bibliotheque: r.features?.bibliotheque !== false },
    }))
    .sort((a, b) => (ORDER.indexOf(a.code) + 1 || 99) - (ORDER.indexOf(b.code) + 1 || 99) || a.price - b.price);
  return list.length ? list : DEFAULT_PUBLIC_OFFERS;
}

export const formatPublicGNF = (n: number) => `${Math.round(n).toLocaleString("fr-FR").replace(/[  ]/g, " ")} GNF`;

/** Lignes « inclus / non inclus » affichées sous chaque offre. */
export function offerFeatures(o: PublicOffer): Array<{ label: string; included: boolean }> {
  return [
    { label: "Cantine, Infirmerie et Bibliothèque", included: o.modules.cantine && o.modules.infirmerie && o.modules.bibliotheque },
    { label: "Connexion des parents", included: o.parentLogin },
    { label: "Paiement de la cotisation par les parents", included: o.parentPays },
    { label: "Connexion des élèves", included: o.studentLogin },
    { label: "Paiement de la cotisation par les élèves", included: o.studentPays },
  ];
}
