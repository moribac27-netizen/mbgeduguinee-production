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

export const numberFr = (n: number) => Math.round(n).toLocaleString("fr-FR").replace(/[\u202f\u00a0]/g, " ");

/** Offre « Premium » (ou la plus chère si elle n'existe plus) : sert au détail de la page publique. */
export function premiumOf(offers: PublicOffer[]): PublicOffer {
  return offers.find((o) => o.code === "premium") ?? [...offers].sort((a, b) => b.price - a.price)[0] ?? DEFAULT_PUBLIC_OFFERS[2];
}

/** Plus petit et plus grand tarif annuel des offres affichées. */
export function priceRange(offers: PublicOffer[]): { min: number; max: number } {
  const prices = offers.map((o) => o.price).filter((n) => Number.isFinite(n));
  return prices.length ? { min: Math.min(...prices), max: Math.max(...prices) } : { min: 0, max: 0 };
}

/**
 * Remplace les repères {prix_min} {prix_max} {prix_basique} {prix_standard} {prix_premium} {part_premium} {prix_liste}
 * par les valeurs réelles des offres : aucun montant n'est écrit en dur dans les textes de la page publique.
 */
export function fillOfferText(text: string, offers: PublicOffer[]): string {
  const by = (code: string) => offers.find((o) => o.code === code) ?? DEFAULT_PUBLIC_OFFERS.find((o) => o.code === code)!;
  const { min, max } = priceRange(offers);
  const list = offers.map((o) => numberFr(o.price));
  const map: Record<string, string> = {
    prix_min: formatPublicGNF(min),
    prix_max: formatPublicGNF(max),
    prix_basique: formatPublicGNF(by("basique").price),
    prix_standard: formatPublicGNF(by("standard").price),
    prix_premium: formatPublicGNF(by("premium").price),
    part_premium: formatPublicGNF(by("premium").commission),
    prix_liste: list.length > 1 ? `${list.slice(0, -1).join(", ")} ou ${list[list.length - 1]} GNF` : `${list[0] ?? ""} GNF`,
  };
  return text.replace(/\{(\w+)\}/g, (m, k) => (k in map ? map[k] : m));
}

/** Montant à payer affiché à l'inscription d'un parent / élève : il dépend de l'offre de l'école, donc on montre la fourchette réelle. */
export function familyFeeText(offers: PublicOffer[]): string {
  const prices = offers.filter((o) => o.parentLogin || o.studentLogin).map((o) => o.price);
  if (!prices.length) return "selon l'offre de l'école";
  const min = Math.min(...prices), max = Math.max(...prices);
  return min === max ? formatPublicGNF(min) : `${numberFr(min)} à ${formatPublicGNF(max)} selon l'offre de l'école`;
}
