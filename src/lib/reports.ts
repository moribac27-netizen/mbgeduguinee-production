import * as XLSX from "xlsx";

export interface ExportColumn {
  key: string;
  label: string;
  format?: (value: any, row: any) => string | number;
}

function cell(row: any, c: ExportColumn) {
  const raw = row?.[c.key];
  if (c.format) return c.format(raw, row);
  if (raw === null || raw === undefined) return "";
  if (typeof raw === "boolean") return raw ? "Oui" : "Non";
  return raw as string | number;
}

/* ---------------- CSV ---------------- */
export function toCSV(rows: any[], columns: ExportColumn[]): string {
  const esc = (v: any) => {
    const s = String(v ?? "");
    return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = columns.map((c) => esc(c.label)).join(";");
  const body = rows.map((r) => columns.map((c) => esc(cell(r, c))).join(";"));
  return "\uFEFF" + [head, ...body].join("\n");
}

export function downloadCSV(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  triggerDownload(blob, filename.endsWith(".csv") ? filename : `${filename}.csv`);
}

/* ---------------- Excel ---------------- */
export function exportExcel(filename: string, rows: any[], columns: ExportColumn[], sheetName = "Rapport") {
  const data = rows.map((r) => {
    const o: Record<string, any> = {};
    columns.forEach((c) => (o[c.label] = cell(r, c)));
    return o;
  });
  const ws = XLSX.utils.json_to_sheet(data, { header: columns.map((c) => c.label) });
  ws["!cols"] = columns.map((c) => ({ wch: Math.max(12, Math.min(40, c.label.length + 6)) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 30));
  XLSX.writeFile(wb, filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`);
}

/* ---------------- PDF (via impression navigateur) ---------------- */
export interface PdfMeta {
  schoolName?: string | null;
  schoolAddress?: string | null;
  schoolContact?: string | null;
  academicYear?: string | null;
  logoUrl?: string | null;
  subtitle?: string | null;
  accent?: string | null;
}

export function newDocumentReference(prefix = "DOC") {
  const year = new Date().getFullYear();
  const token = (globalThis.crypto?.randomUUID?.() ?? "00000000-0000-4000-8000-000000000000")
    .replace(/-/g, "").slice(0, 8).toUpperCase();
  return `${prefix}-${year}-${token}`;
}

function printStyles(accent: string) {
  return `
  @page { size: A4 landscape; margin: 12mm; }
  * { box-sizing: border-box; }
  body { font-family: Inter, "Segoe UI", Arial, sans-serif; color:#18211d; margin:0; background:#fff; }
  .doc { max-width: 100%; }
  .letterhead { display:grid; grid-template-columns:auto 1fr auto; gap:14px; align-items:center; padding:0 0 12px; margin-bottom:16px; border-bottom:2px solid ${accent}; position:relative; }
  .letterhead:after { content:""; position:absolute; left:0; bottom:-2px; width:72px; height:3px; background:#c99a3d; }
  .logo { width:58px; height:58px; object-fit:contain; }
  .school { font-size:15px; font-weight:800; text-transform:uppercase; line-height:1.15; }
  .muted { color:#68716b; font-size:9.5px; line-height:1.35; }
  .docmeta { text-align:right; color:#68716b; font-size:9px; line-height:1.35; }
  .docmeta strong { color:#18211d; }
  h1 { font-size:16px; margin:4px 0 0; color:${accent}; text-transform:uppercase; letter-spacing:.02em; }
  .sub { font-size:10px; color:#68716b; margin-top:2px; }
  .section-title { display:flex; align-items:center; gap:8px; margin:16px 0 7px; color:${accent}; font-size:11px; font-weight:800; text-transform:uppercase; letter-spacing:.04em; }
  .section-title:after { content:""; height:1px; flex:1; background:#d9dfda; }
  .summary { display:grid; grid-template-columns:repeat(4,1fr); gap:8px; margin-bottom:14px; }
  .stat { border:1px solid #d9dfda; border-radius:9px; padding:8px 10px; background:#fbfcfb; }
  .stat-label { font-size:8px; color:#68716b; text-transform:uppercase; letter-spacing:.05em; }
  .stat-value { margin-top:2px; font-size:13px; font-weight:800; color:#18211d; }
  table { width:100%; border-collapse:separate; border-spacing:0; font-size:9.5px; overflow:hidden; border:1px solid #d9dfda; border-radius:8px; }
  th { background:${accent}; color:#fff; text-align:left; padding:7px 8px; font-weight:700; }
  td { padding:6px 8px; border-top:1px solid #e7ebe8; vertical-align:top; }
  tbody tr:nth-child(even) td { background:#f7f9f8; }
  .footer { display:flex; justify-content:space-between; gap:12px; border-top:1px solid #d9dfda; padding-top:7px; margin-top:14px; color:#68716b; font-size:8.5px; }
  .status { display:inline-block; padding:3px 7px; border-radius:999px; border:1px solid #c9d6cf; font-size:8px; font-weight:700; }
  .noprint { display:none; }
  @media print { thead { display:table-header-group; } tr { break-inside:avoid; page-break-inside:avoid; } * { -webkit-print-color-adjust:exact; print-color-adjust:exact; } }
  `;
}

export function exportPDF(title: string, rows: any[], columns: ExportColumn[], meta: PdfMeta = {}) {
  const accent = meta.accent || "#1f6f5c";
  const reference = newDocumentReference("RPT");
  const esc = (v: any) => String(v ?? "").replace(/[&<>\"]/g, (m) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;" } as any)[m]);
  const generated = new Date().toLocaleString("fr-FR");
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8" /><title>${esc(title)}</title><style>${printStyles(accent)}</style></head><body>
  <main class="doc">
    <header class="letterhead">
      ${meta.logoUrl ? `<img class="logo" src="${esc(meta.logoUrl)}" alt="Logo" />` : `<div class="logo"></div>`}
      <div><div class="school">${esc(meta.schoolName || "MBGEduGuinée")}</div>${meta.schoolAddress ? `<div class="muted">${esc(meta.schoolAddress)}</div>` : ""}${meta.schoolContact ? `<div class="muted">${esc(meta.schoolContact)}</div>` : ""}</div>
      <div class="docmeta"><strong>RÉPUBLIQUE DE GUINÉE</strong><br/>Travail — Justice — Solidarité${meta.academicYear ? `<br/>Année scolaire : ${esc(meta.academicYear)}` : ""}<h1>${esc(title)}</h1><div class="sub">${esc(meta.subtitle || "")}${meta.subtitle ? " · " : ""}${generated}</div></div>
    </header>
    <div class="summary"><div class="stat"><div class="stat-label">Document</div><div class="stat-value">${esc(reference)}</div></div><div class="stat"><div class="stat-label">Enregistrements</div><div class="stat-value">${rows.length}</div></div><div class="stat"><div class="stat-label">Établissement</div><div class="stat-value">${esc(meta.schoolName || "MBGEduGuinée")}</div></div><div class="stat"><div class="stat-label">Émis le</div><div class="stat-value">${esc(generated)}</div></div></div>
    <div class="section-title">Données du rapport</div>
    <table><thead><tr>${columns.map((c) => `<th>${esc(c.label)}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${columns.map((c) => `<td>${esc(cell(r,c))}</td>`).join("")}</tr>`).join("")}</tbody></table>
    <footer class="footer"><span>${esc(meta.schoolName || "MBGEduGuinée")}${meta.schoolContact ? ` · ${esc(meta.schoolContact)}` : ""}</span><span>Réf. ${esc(reference)} · Document généré par MBGEduGuinée</span></footer>
  </main><script>window.onload=function(){setTimeout(function(){window.print();},350)};<\/script></body></html>`;
  const w = window.open("", "_blank", "width=1200,height=800");
  if (!w) return false;
  w.document.write(html); w.document.close(); return true;
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export const fmtNum = (n: any) => new Intl.NumberFormat("fr-FR").format(Number(n ?? 0));
export const fmtMoney = (n: any) => fmtNum(n) + " GNF";
export const fmtDate = (d: any) => (d ? new Date(d).toLocaleDateString("fr-FR") : "");
export const fmtDateTime = (d: any) => (d ? new Date(d).toLocaleString("fr-FR") : "");
