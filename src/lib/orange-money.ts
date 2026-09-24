/** Coordonnées officielles utilisées pour la déclaration des cotisations annuelles. */
export const ORANGE_MONEY = {
  number: "00224628499812",
  local: "628 49 98 12",
  holder: "MBGEduGuinée",
  ussd: "#144#",
  label: "Orange Money Guinée",
} as const;

export function orangeMoneyUssdLink() {
  return `tel:${encodeURIComponent(ORANGE_MONEY.ussd)}`;
}

export function formatGNF(v: number) {
  return new Intl.NumberFormat("fr-FR").format(Math.round(v)) + " GNF";
}
