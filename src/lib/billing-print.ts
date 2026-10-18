import type { PdfMeta } from "@/lib/reports";
import { BILLING_CYCLE_LABELS, formatBillingGNF, type BillingCycle } from "@/lib/billing";

const esc = (v: any) => String(v ?? "").replace(/[&<>"]/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[m] as string);

export interface BillingReceiptData {
  receiptNumber: string;
  planName: string;
  cycle: BillingCycle;
  studentsCount: number;
  monthlyPrice: number;
  grossAmount: number;
  discountAmount: number;
  amount: number;
  reference?: string | null;
  validatedAt?: string | null;
  periodStart?: string | null;
  periodEnd?: string | null;
}

const day = (d?: string | null) => (d ? new Date(d).toLocaleDateString("fr-FR") : "—");

/** Reçu de paiement du forfait de l'établissement. Les montants imprimés sont ceux figés à la déclaration (jamais recalculés). */
export function printBillingReceipt(meta: PdfMeta, d: BillingReceiptData) {
  const accent = meta.accent || "#1f6f5c";
  const w = window.open("", "_blank", "width=900,height=800");
  if (!w) return false;
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8" />
<title>Reçu ${esc(d.receiptNumber)}</title>
<style>
@page { size: A5 landscape; margin: 9mm; }
* { box-sizing:border-box; }
body { font-family: Inter, "Segoe UI", Arial, sans-serif; color:#18211d; margin:0; }
header { display:grid; grid-template-columns:auto 1fr auto; align-items:center; gap:12px; border-bottom:2px solid ${esc(accent)}; padding-bottom:9px; margin-bottom:12px; }
header img { width:48px; height:48px; object-fit:contain; }
.school { font-size:13px; font-weight:800; text-transform:uppercase; }
.addr { font-size:8.5px; color:#68716b; line-height:1.35; }
h1 { font-size:14px; margin:0; color:${esc(accent)}; text-transform:uppercase; }
table { width:100%; border-collapse:collapse; border:1px solid #d9dfda; font-size:10px; margin-top:6px; }
td { padding:5px 7px; border-bottom:1px solid #e7ebe8; }
td.k { color:#68716b; width:42%; font-size:8px; text-transform:uppercase; letter-spacing:.04em; }
td.n { text-align:right; }
.total { margin-top:10px; font-size:15px; font-weight:800; color:${esc(accent)}; }
footer { margin-top:10px; font-size:8px; color:#68716b; display:flex; justify-content:space-between; }
@media print { * { -webkit-print-color-adjust:exact; print-color-adjust:exact; } }
</style></head><body>
<header>
  ${meta.logoUrl ? `<img src="${esc(meta.logoUrl)}" alt="" />` : `<div></div>`}
  <div><div class="school">${esc(meta.schoolName || "Établissement")}</div>${meta.schoolAddress ? `<div class="addr">${esc(meta.schoolAddress)}</div>` : ""}</div>
  <div style="text-align:right"><h1>Reçu de forfait</h1><div class="addr">N° ${esc(d.receiptNumber)}</div></div>
</header>
<table>
  <tr><td class="k">Forfait</td><td><b>${esc(d.planName)}</b> · ${esc(BILLING_CYCLE_LABELS[d.cycle])} · ${esc(d.studentsCount.toLocaleString("fr-FR"))} élèves</td></tr>
  <tr><td class="k">Période couverte</td><td>${esc(day(d.periodStart))} au ${esc(day(d.periodEnd))}</td></tr>
  <tr><td class="k">Prix mensuel de référence</td><td class="n">${esc(formatBillingGNF(d.monthlyPrice))}</td></tr>
  ${d.cycle === "yearly" ? `<tr><td class="k">Montant annuel brut</td><td class="n">${esc(formatBillingGNF(d.grossAmount))}</td></tr>
  <tr><td class="k">Réduction accordée</td><td class="n">− ${esc(formatBillingGNF(d.discountAmount))}</td></tr>` : ""}
  ${d.reference ? `<tr><td class="k">Référence de transaction</td><td>${esc(d.reference)}</td></tr>` : ""}
  <tr><td class="k">Validé le</td><td>${esc(day(d.validatedAt))}</td></tr>
</table>
<div class="total">Montant réglé : ${esc(formatBillingGNF(d.amount))}</div>
<footer><span>${esc(meta.schoolName || "")}</span><span>Signature / cachet</span></footer>
<script>window.onload = () => { window.print(); }<\/script>
</body></html>`;
  w.document.write(html);
  w.document.close();
  return true;
}
