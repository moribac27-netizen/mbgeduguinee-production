import type { PdfMeta } from "@/lib/reports";

const esc = (v: any) =>
  String(v ?? "").replace(/[&<>]/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[m] as string);

const LEVEL_STYLE: Record<string, { label: string; icon: string; color: string }> = {
  acquis: { label: "Acquis", icon: "★★★", color: "#1f8a5b" },
  en_cours: { label: "En cours d'acquisition", icon: "★★☆", color: "#d08700" },
  a_travailler: { label: "À travailler", icon: "★☆☆", color: "#c0392b" },
};

function header(meta: PdfMeta, title: string, subtitle?: string, reference?: string) {
  const accent = meta.accent || "#1f6f5c";
  return `<header>
  ${meta.logoUrl ? `<img src="${esc(meta.logoUrl)}" alt="" />` : ""}
  <div style="flex:1">
    <div class="school">${esc(meta.schoolName || "MBGEduGuinée")}</div>
    ${meta.schoolAddress ? `<div class="addr">${esc(meta.schoolAddress)}</div>` : ""}
    ${meta.schoolContact ? `<div class="addr">${esc(meta.schoolContact)}</div>` : ""}
    ${meta.academicYear ? `<div class="addr">Année scolaire : ${esc(meta.academicYear)}</div>` : ""}
  </div>
  <div style="text-align:right">
    <h1 style="color:${accent}">${esc(title)}</h1>
    <div class="sub">${esc(subtitle || "")}</div>
  </div>
</header>`;
}

function styles(meta: PdfMeta) {
  const accent = meta.accent || "#1f6f5c";
  return `<style>
  @page { size: A4 portrait; margin: 12mm; }
  * { box-sizing:border-box; }
  body { font-family: Inter, "Segoe UI", Arial, sans-serif; color:#18211d; margin:0; background:#fff; }
  header { display:grid; grid-template-columns:auto 1fr auto; align-items:center; gap:14px; border-bottom:2px solid ${accent}; padding-bottom:10px; margin-bottom:15px; position:relative; }
  header:after { content:""; position:absolute; left:0; bottom:-2px; width:65px; height:3px; background:#c99a3d; }
  header img { width:56px; height:56px; object-fit:contain; }
  .school { font-size:15px; font-weight:800; text-transform:uppercase; }
  .addr { font-size:9px; color:#68716b; line-height:1.35; }
  .country { font-size:8px; color:#18211d; font-weight:800; }
  h1 { font-size:16px; margin:3px 0 0; text-transform:uppercase; }
  .sub, .ref { font-size:9px; color:#68716b; margin-top:2px; }
  .idbox { display:grid; grid-template-columns:2fr 1fr 1fr; gap:8px; background:#f7f9f8; border:1px solid #d9dfda; border-radius:10px; padding:10px 12px; font-size:10.5px; margin-bottom:14px; }
  .idbox b { display:block; font-size:8px; color:#68716b; text-transform:uppercase; letter-spacing:.04em; font-weight:700; margin-bottom:2px; }
  h2 { font-size:11px; margin:15px 0 6px; color:${accent}; text-transform:uppercase; letter-spacing:.04em; }
  table { width:100%; border-collapse:separate; border-spacing:0; border:1px solid #d9dfda; border-radius:8px; overflow:hidden; font-size:9.5px; }
  th { background:${accent}; color:#fff; text-align:left; padding:7px 8px; }
  td { padding:6px 8px; border-top:1px solid #e7ebe8; vertical-align:top; }
  tbody tr:nth-child(even) td { background:#f8faf9; }
  .lvl { font-weight:800; white-space:nowrap; }
  .legend { margin-top:12px; font-size:9px; color:#68716b; }
  .sign { margin-top:28px; display:flex; justify-content:space-between; gap:24px; font-size:10px; break-inside:avoid; }
  .sign div { width:45%; border-top:1px solid #b9c3bd; padding-top:6px; }
  footer { margin-top:16px; padding-top:7px; border-top:1px solid #d9dfda; font-size:8.5px; color:#68716b; display:flex; justify-content:space-between; }
  @media print { thead{display:table-header-group} tr{break-inside:avoid} *{-webkit-print-color-adjust:exact;print-color-adjust:exact} }
</style>`;
}

function open(html: string) {
  const w = window.open("", "_blank", "width=1000,height=900");
  if (!w) return false;
  w.document.write(html);
  w.document.close();
  return true;
}

const domainLabels: Record<string, string> = {
  langage: "Langage",
  motricite: "Motricité",
  socialisation: "Socialisation",
  autonomie: "Autonomie",
  eveil: "Éveil / créativité",
};

export interface NurseryEvaluationRow {
  level: string;
  comment?: string | null;
  nursery_competencies?: { label?: string | null; domain?: string | null } | null;
}

/** Bulletin maternelle : niveaux illustrés par couleurs et pictogrammes, sans notes chiffrées. */
export function printNurseryBulletin(opts: {
  meta: PdfMeta;
  childName: string;
  sectionName?: string | null;
  period: string;
  rows: NurseryEvaluationRow[];
  teacherComment?: string | null;
}) {
  const { meta, childName, sectionName, period, rows } = opts;
  const reference = `MAT-${new Date().getFullYear()}-${((globalThis.crypto?.randomUUID?.() ?? "00000000-0000-4000-8000-000000000000").replace(/-/g, "").slice(0, 6)).toUpperCase()}`;
  const byDomain = new Map<string, NurseryEvaluationRow[]>();
  rows.forEach((r) => {
    const d = r.nursery_competencies?.domain ?? "autres";
    byDomain.set(d, [...(byDomain.get(d) ?? []), r]);
  });

  const body = [...byDomain.entries()]
    .map(
      ([domain, list]) => `<h2>${esc(domainLabels[domain] ?? domain)}</h2>
<table><thead><tr><th style="width:55%">Compétence</th><th style="width:20%">Niveau</th><th>Observation</th></tr></thead>
<tbody>${list
        .map((r) => {
          const s = LEVEL_STYLE[r.level] ?? { label: r.level, icon: "", color: "#6b6560" };
          return `<tr><td>${esc(r.nursery_competencies?.label ?? "—")}</td>
<td class="lvl" style="color:${s.color}">${s.icon} ${esc(s.label)}</td>
<td>${esc(r.comment || "")}</td></tr>`;
        })
        .join("")}</tbody></table>`,
    )
    .join("");

  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8" />
<title>Bulletin maternelle — ${esc(childName)}</title>${styles(meta)}</head><body>
${header(meta, "Bulletin maternelle", `${esc(period)} · Généré le ${new Date().toLocaleDateString("fr-FR")}`, reference)}
<div class="idbox">
  <div><b>Enfant</b>${esc(childName)}</div>
  <div><b>Section</b>${esc(sectionName || "—")}</div>
  <div><b>Période</b>${esc(period)}</div>
</div>
${body || "<p>Aucune évaluation enregistrée pour cette période.</p>"}
${opts.teacherComment ? `<h2>Appréciation de la monitrice</h2><p style="font-size:11.5px">${esc(opts.teacherComment)}</p>` : ""}
<div class="legend">Légende : ★★★ Acquis · ★★☆ En cours d'acquisition · ★☆☆ À travailler</div>
<div class="sign"><div>Signature de la monitrice</div><div>Signature des parents</div></div>
<footer>Document généré par MBGEduGuinée</footer>
<script>window.onload=function(){setTimeout(function(){window.print();},350);};<\/script>
</body></html>`;
  return open(html);
}

/** Fiche de suivi quotidien à remettre / envoyer aux parents. */
export function printDailyLog(opts: {
  meta: PdfMeta;
  childName: string;
  sectionName?: string | null;
  date: string;
  items: { label: string; value: string }[];
  parentComment?: string | null;
}) {
  const { meta, childName, sectionName, date, items } = opts;
  const reference = `SUI-${new Date().getFullYear()}-${((globalThis.crypto?.randomUUID?.() ?? "00000000-0000-4000-8000-000000000000").replace(/-/g, "").slice(0, 6)).toUpperCase()}`;
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8" />
<title>Suivi quotidien — ${esc(childName)}</title>${styles(meta)}</head><body>
${header(meta, "Suivi quotidien", `Journée du ${esc(date)}`, reference)}
<div class="idbox">
  <div><b>Enfant</b>${esc(childName)}</div>
  <div><b>Section</b>${esc(sectionName || "—")}</div>
  <div><b>Date</b>${esc(date)}</div>
</div>
<table><tbody>${items
    .map((i) => `<tr><td style="width:35%;font-weight:600">${esc(i.label)}</td><td>${esc(i.value || "—")}</td></tr>`)
    .join("")}</tbody></table>
${opts.parentComment ? `<h2>Message aux parents</h2><p style="font-size:12px">${esc(opts.parentComment)}</p>` : ""}
<div class="sign"><div>Signature de la monitrice</div><div>Signature des parents</div></div>
<footer>Document généré par MBGEduGuinée</footer>
<script>window.onload=function(){setTimeout(function(){window.print();},350);};<\/script>
</body></html>`;
  return open(html);
}

export function dailyLogMessage(childName: string, date: string, items: { label: string; value: string }[], parentComment?: string | null) {
  const lines = items.map((i) => `• ${i.label} : ${i.value || "—"}`).join("\n");
  return `Suivi du ${date} — ${childName}\n${lines}${parentComment ? `\n\nMessage : ${parentComment}` : ""}`;
}
