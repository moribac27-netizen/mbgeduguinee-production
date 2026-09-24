import type { PdfMeta } from "@/lib/reports";
import QRCode from "qrcode";

const esc = (v: any) =>
  String(v ?? "").replace(/[&<>]/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[m] as string);

const fmt = (n: number) => new Intl.NumberFormat("fr-FR").format(Math.round(n)) + " GNF";

export interface CotisationReceiptData {
  receiptNumber: string;
  studentName: string;
  matricule?: string | null;
  className?: string | null;
  academicYear: string;
  amount: number;
  schoolShare: number;
  paidAt: string;
  method?: string | null;
  reference?: string | null;
  mode: string;
  status?: string | null;
}

/** Reçu de cotisation annuelle (plan par élève), en-tête école identique aux autres documents. */
export function printCotisationReceipt(meta: PdfMeta, d: CotisationReceiptData) {
  const accent = meta.accent || "#1f6f5c";
  const verificationUrl = `${window.location.origin}/verifier-recu/${encodeURIComponent(d.receiptNumber)}`;
  const w = window.open("", "_blank", "width=1000,height=800");
  if (!w) return false;
  const qr = QRCode.toDataURL(verificationUrl, { width: 120, margin: 1, errorCorrectionLevel: "M" });
  const html = (qrDataUrl: string) => `<!doctype html><html lang="fr"><head><meta charset="utf-8" />
<title>Reçu ${esc(d.receiptNumber)}</title>
<style>
@page { size: A5 landscape; margin: 9mm; }
* { box-sizing:border-box; }
body { font-family: Inter, "Segoe UI", Arial, sans-serif; color:#18211d; margin:0; }
header { display:grid; grid-template-columns:auto 1fr auto; align-items:center; gap:12px; border-bottom:2px solid ${accent}; padding-bottom:9px; margin-bottom:12px; position:relative; }
header:after { content:""; position:absolute; left:0; bottom:-2px; width:60px; height:3px; background:#c99a3d; }
header img { width:48px; height:48px; object-fit:contain; }
.school { font-size:13px; font-weight:800; text-transform:uppercase; }
.addr { font-size:8.5px; color:#68716b; line-height:1.35; }
h1 { font-size:14px; margin:0; color:${accent}; text-transform:uppercase; }
table { width:100%; border-collapse:separate; border-spacing:0; border:1px solid #d9dfda; border-radius:8px; overflow:hidden; font-size:10px; margin-top:6px; }
td { padding:5px 7px; border-bottom:1px solid #e7ebe8; }
td.k { color:#68716b; width:38%; font-size:8px; text-transform:uppercase; letter-spacing:.04em; }
.total { margin-top:10px; font-size:15px; font-weight:800; color:${accent}; }
.status { display:inline-block; margin-top:5px; padding:3px 7px; border-radius:999px; border:1px solid #a9d5bf; background:#edf8f2; color:#17603f; font-size:8px; font-weight:800; text-transform:uppercase; }
.verify { display:flex; gap:9px; align-items:center; margin-top:9px; border-top:1px solid #d9dfda; padding-top:7px; }
.verify img { width:52px; height:52px; }
.verify div { font-size:8px; color:#68716b; line-height:1.35; }
footer { margin-top:8px; font-size:8px; color:#68716b; display:flex; justify-content:space-between; }
@media print { * { -webkit-print-color-adjust:exact; print-color-adjust:exact; } }
</style></head><body>
<header>
  ${meta.logoUrl ? `<img src="${esc(meta.logoUrl)}" alt="" />` : `<div></div>`}
  <div><div class="school">${esc(meta.schoolName || "MBGEduGuinée")}</div>${meta.schoolAddress ? `<div class="addr">${esc(meta.schoolAddress)}</div>` : ""}${meta.schoolContact ? `<div class="addr">${esc(meta.schoolContact)}</div>` : ""}</div>
  <div style="text-align:right"><h1>Reçu de cotisation annuelle</h1><div class="addr">N° ${esc(d.receiptNumber)}</div></div>
</header>
<table>
  <tr><td class="k">Élève</td><td><b>${esc(d.studentName)}</b>${d.matricule ? " · " + esc(d.matricule) : ""}</td></tr>
  ${d.className ? `<tr><td class="k">Classe</td><td>${esc(d.className)}</td></tr>` : ""}
  <tr><td class="k">Année scolaire</td><td>${esc(d.academicYear)}</td></tr>
  <tr><td class="k">Mode de paiement</td><td>${d.mode === "groupe_ecole" ? "Paiement groupé par l'école" : "Paiement individuel"}${d.method ? " · " + esc(d.method) : ""}</td></tr>
  ${d.reference ? `<tr><td class="k">Référence</td><td>${esc(d.reference)}</td></tr>` : ""}
  <tr><td class="k">Date</td><td>${esc(new Date(d.paidAt).toLocaleDateString("fr-FR"))}</td></tr>
  <tr><td class="k">Part reversée à l'école</td><td>${esc(fmt(d.schoolShare))}</td></tr>
</table>
<div class="total">Montant réglé : ${esc(fmt(d.amount))}</div>
<div class="status">${esc(d.status === "VALIDATED" ? "Paiement validé" : "Reçu enregistré")}</div>
<div class="verify"><img src="${qrDataUrl}" alt="QR de vérification" /><div><strong>Vérification du document</strong><br/>Scannez ce QR Code pour vérifier le reçu.<br/>Référence : ${esc(d.receiptNumber)}</div></div>
<footer><span>${esc(meta.schoolName || "MBGEduGuinée")}${meta.schoolContact ? ` · ${esc(meta.schoolContact)}` : ""}</span><span>Signature / cachet</span></footer>
<script>window.onload = () => { window.print(); }<\/script>
</body></html>`;
  qr.then((qrDataUrl) => { w.document.write(html(qrDataUrl)); w.document.close(); }).catch(() => { w.document.write(html("")); w.document.close(); });
  return true;
}

/** Numéro de reçu lisible : COT-<année>-<aléatoire>. */
export function newCotisationReceiptNumber(year: string) {
  const token = (globalThis.crypto?.randomUUID?.() ?? "00000000-0000-4000-8000-000000000000").replace(/-/g, "").slice(0, 8).toUpperCase();
  return `COT-${(year || "").replace(/[^0-9]/g, "").slice(0, 4) || new Date().getFullYear()}-${token}`;
}
