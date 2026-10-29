import type { PublicOffer } from "@/lib/public-offers";

/** Clé de stockage du choix d'offre pendant la création d'un établissement (session du navigateur uniquement). */
export const SIGNUP_OFFER_KEY = "mbg.signup.offer";

/** Chemin de la page de choix d'offre : seule porte d'entrée vers la création d'un établissement. */
export const CREATE_SCHOOL_PATH = "/creer-etablissement";

/** Retrouve l'offre correspondant au code mémorisé ; renvoie null si le code est vide ou n'existe plus (offre retirée par le Super Admin). */
export function resolveSignupOffer(code: string | null | undefined, offers: PublicOffer[]): PublicOffer | null {
  const c = (code ?? "").trim().toLowerCase();
  if (!c) return null;
  return offers.find((o) => o.code.toLowerCase() === c) ?? null;
}

export function readSignupOfferCode(): string | null {
  try {
    if (typeof window === "undefined") return null;
    return window.sessionStorage.getItem(SIGNUP_OFFER_KEY);
  } catch {
    return null;
  }
}

/** Copie de l'offre choisie : sert d'affichage de secours si la liste des offres est lente ou indisponible sur la page suivante. */
export const SIGNUP_OFFER_SNAPSHOT_KEY = "mbg.signup.offer.snapshot";

export function readSignupOfferSnapshot(code: string | null): PublicOffer | null {
  try {
    if (!code || typeof window === "undefined") return null;
    const raw = window.sessionStorage.getItem(SIGNUP_OFFER_SNAPSHOT_KEY);
    const o = raw ? (JSON.parse(raw) as PublicOffer) : null;
    return o && typeof o.code === "string" && o.code.toLowerCase() === code.trim().toLowerCase() ? o : null;
  } catch {
    return null;
  }
}

export function saveSignupOfferCode(code: string, offer?: PublicOffer): void {
  try {
    window.sessionStorage.setItem(SIGNUP_OFFER_KEY, code);
    if (offer) window.sessionStorage.setItem(SIGNUP_OFFER_SNAPSHOT_KEY, JSON.stringify(offer));
  } catch {
    /* stockage indisponible : le choix reste valable dans la page courante */
  }
}

export function clearSignupOfferCode(): void {
  try {
    window.sessionStorage.removeItem(SIGNUP_OFFER_KEY);
    window.sessionStorage.removeItem(SIGNUP_OFFER_SNAPSHOT_KEY);
  } catch {
    /* rien à faire */
  }
}

/** Texte de durée affiché dans le récapitulatif : la cotisation est annuelle, par élève. */
export const OFFER_DURATION_TEXT = "Cotisation annuelle, par élève et par année scolaire";

/** Conditions particulières déduites de l'offre réelle (aucune règle inventée). */
export function offerConditions(o: PublicOffer): string[] {
  const out: string[] = [];
  if (o.flat) {
    out.push(`Forfait de l'établissement, sans cotisation par élève, valable pour l'année académique ${o.flat.yearLabel}.`);
    out.push(o.flat.maxStudents === null
      ? "Nombre d'élèves illimité (sous réserve des limites techniques générales de la plateforme)."
      : `Capacité maximale : ${o.flat.maxStudents} élèves. Au-delà, les nouvelles inscriptions sont refusées : passez à une formule supérieure.`);
    out.push("Choisir une offre n'est pas un paiement : les paiements (mensuels ou annuel) sont déclarés puis validés par l'administration de la plateforme.");
    return out;
  }
  out.push(
    o.commission > 0
      ? "Une part est reversée à l'établissement pour chaque cotisation validée."
      : "Aucune part n'est reversée à l'établissement avec cette offre.",
  );
  if (!o.parentLogin && !o.studentLogin) out.push("Les parents et les élèves ne se connectent pas à l'application avec cette offre.");
  else if (o.parentLogin && !o.studentLogin) out.push("Les parents peuvent se connecter ; les élèves ne se connectent pas.");
  out.push("Choisir une offre n'est pas un paiement : les cotisations sont déclarées puis validées par l'administration de la plateforme.");
  return out;
}
