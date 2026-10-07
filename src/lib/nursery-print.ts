import type { PdfMeta } from "@/lib/reports";

const esc = (v: any) =>
  String(v ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[m] as string);

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
  .fields { display:grid; grid-template-columns:1fr 1fr; gap:6px 14px; font-size:10.5px; }
  .fields .f { border-bottom:1px dotted #b9c3bd; padding:3px 0; min-height:22px; }
  .fields .f.wide { grid-column:1 / -1; }
  .fields b { display:block; font-size:8px; color:#68716b; text-transform:uppercase; letter-spacing:.04em; font-weight:700; }
  .alert { color:#c0392b; font-weight:700; }
  .photo { float:right; width:72px; height:88px; object-fit:cover; border:1px solid #d9dfda; border-radius:6px; margin:0 0 6px 10px; }
  .legend { margin-top:12px; font-size:9px; color:#68716b; }
  .sign { margin-top:28px; display:flex; justify-content:space-between; gap:24px; font-size:10px; break-inside:avoid; }
  .sign div { width:45%; border-top:1px solid #b9c3bd; padding-top:6px; }
  footer { margin-top:16px; padding-top:7px; border-top:1px solid #d9dfda; font-size:8.5px; color:#68716b; display:flex; justify-content:space-between; }
  @media print { thead{display:table-header-group} tr{break-inside:avoid} *{-webkit-print-color-adjust:exact;print-color-adjust:exact} }
</style>`;
}

/**
 * Ouvre la fenêtre d'impression. À appeler DIRECTEMENT dans le clic (avant tout
 * `await`) : les navigateurs bloquent les pop-up ouverts après une requête.
 * On passe ensuite cette fenêtre aux fonctions d'impression ; en cas d'erreur
 * de chargement, l'appelant la ferme avec `closePrintWindow`.
 */
export function openPrintWindow(): Window | null {
  const w = window.open("", "_blank", "width=1000,height=900");
  if (w) w.document.write("<p style=\"font-family:sans-serif;padding:24px\">Préparation du document…</p>");
  return w;
}

export function closePrintWindow(w: Window | null | undefined) {
  try { w?.close(); } catch { /* déjà fermée */ }
}

function open(html: string, win?: Window | null) {
  const w = win ?? window.open("", "_blank", "width=1000,height=900");
  if (!w) return false;
  w.document.open();
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
  win?: Window | null;
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
  return open(html, opts.win);
}

/** Fiche de suivi quotidien à remettre / envoyer aux parents. */
export function printDailyLog(opts: {
  meta: PdfMeta;
  childName: string;
  sectionName?: string | null;
  date: string;
  items: { label: string; value: string }[];
  parentComment?: string | null;
  win?: Window | null;
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
  return open(html, opts.win);
}

export function dailyLogMessage(childName: string, date: string, items: { label: string; value: string }[], parentComment?: string | null) {
  const lines = items.map((i) => `• ${i.label} : ${i.value || "—"}`).join("\n");
  return `Suivi du ${date} — ${childName}\n${lines}${parentComment ? `\n\nMessage : ${parentComment}` : ""}`;
}

/* ------------------------------------------------------------------ */
/* Fiche de renseignements (inscription) et liste de section           */
/* ------------------------------------------------------------------ */

export interface ChildRecord {
  fullName: string;
  matricule?: string | null;
  gender?: string | null; // "M" | "F"
  birthDate?: string | null; // déjà formaté pour l'affichage
  birthPlace?: string | null;
  address?: string | null;
  className?: string | null;
  sectionName?: string | null;
  parentName?: string | null;
  parentPhone?: string | null;
  pickupPerson?: string | null;
  pickupPhone?: string | null;
  allergies?: string | null;
  medicalNotes?: string | null;
  napNeeded?: boolean | null;
  toiletTrained?: boolean | null;
  specialNotes?: string | null;
  photoUrl?: string | null; // URL http(s) (signée) de la photo
}

const field = (label: string, value: any, wide = false, cls = "") =>
  `<div class="f${wide ? " wide" : ""}"><b>${esc(label)}</b><span class="${cls}">${esc(value || "") || "&nbsp;"}</span></div>`;
const yesNo = (v: boolean | null | undefined) => (v == null ? "" : v ? "Oui" : "Non");
const refCode = (prefix: string) =>
  `${prefix}-${new Date().getFullYear()}-${(globalThis.crypto?.randomUUID?.() ?? "00000000-0000-4000-8000-000000000000").replace(/-/g, "").slice(0, 6).toUpperCase()}`;

/** HTML de la fiche de renseignements d'un enfant (pur : testable sans navigateur). */
export function childRecordHtml(opts: { meta: PdfMeta; child: ChildRecord; autoPrint?: boolean; title?: string }): string {
  const { meta, child: c } = opts;
  const title = opts.title || "Fiche de renseignements";
  const photo = c.photoUrl && /^https?:\/\//i.test(c.photoUrl) ? `<img class="photo" src="${esc(c.photoUrl)}" alt="" />` : "";
  const today = new Date().toLocaleDateString("fr-FR");
  const sex = c.gender === "M" ? "Masculin" : c.gender === "F" ? "Féminin" : "";
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8" />
<title>${esc(title)}${c.fullName ? ` — ${esc(c.fullName)}` : ""}</title>${styles(meta)}</head><body>
${header(meta, title, `Maternelle · Établie le ${today}`, refCode("FIC"))}
<div class="idbox">
  <div><b>Enfant</b>${esc(c.fullName)}</div>
  <div><b>Matricule</b>${esc(c.matricule || "—")}</div>
  <div><b>Section</b>${esc(c.sectionName || "—")}</div>
</div>
<h2>Identité de l'enfant</h2>
${photo}<div class="fields">
  ${field("Nom et prénom(s)", c.fullName, true)}
  ${field("Sexe", sex)}${field("Date de naissance", c.birthDate)}
  ${field("Lieu de naissance", c.birthPlace)}${field("Adresse", c.address)}
</div>
<h2>Scolarité</h2>
<div class="fields">
  ${field("Année scolaire", meta.academicYear)}${field("Classe", c.className)}
  ${field("Section", c.sectionName)}${field("Matricule", c.matricule)}
</div>
<h2>Responsable légal</h2>
<div class="fields">${field("Nom du responsable", c.parentName)}${field("Téléphone", c.parentPhone)}</div>
<h2>Personne autorisée à récupérer l'enfant</h2>
<div class="fields">${field("Nom", c.pickupPerson)}${field("Téléphone", c.pickupPhone)}</div>
<h2>Santé et habitudes</h2>
<div class="fields">
  ${field("Allergies", c.allergies, true, c.allergies ? "alert" : "")}
  ${field("Informations médicales", c.medicalNotes, true)}
  ${field("Fait la sieste", yesNo(c.napNeeded))}${field("Propreté acquise", yesNo(c.toiletTrained))}
  ${field("Remarques particulières", c.specialNotes, true)}
</div>
<div class="sign"><div>Signature du responsable légal</div><div>Cachet et signature de la direction</div></div>
<footer><span>Document généré par MBGEduGuinée</span><span>${esc(meta.schoolName || "")}</span></footer>
${opts.autoPrint === false ? "" : `<script>window.onload=function(){setTimeout(function(){window.print();},350);};<\/script>`}
</body></html>`;
}

export function printChildRecord(opts: { meta: PdfMeta; child: ChildRecord; win?: Window | null }) {
  return open(childRecordHtml(opts), opts.win);
}

export interface SectionListRow {
  fullName: string;
  matricule?: string | null;
  gender?: string | null;
  birthDate?: string | null;
  parentPhone?: string | null;
  pickupPerson?: string | null;
  allergies?: string | null;
}

/** HTML de la liste des enfants d'une section (avec allergies en évidence). */
export function sectionListHtml(opts: {
  meta: PdfMeta;
  sectionName: string;
  teacherName?: string | null;
  ageRange?: string | null;
  capacity?: number | null;
  rows: SectionListRow[];
  autoPrint?: boolean;
}): string {
  const { meta, rows } = opts;
  const today = new Date().toLocaleDateString("fr-FR");
  const body = rows
    .map(
      (r, i) => `<tr><td>${i + 1}</td><td><b>${esc(r.fullName)}</b></td><td>${esc(r.matricule || "")}</td>
<td>${esc(r.gender || "")}</td><td>${esc(r.birthDate || "")}</td><td>${esc(r.parentPhone || "")}</td>
<td>${esc(r.pickupPerson || "")}</td><td class="${r.allergies ? "alert" : ""}">${esc(r.allergies || "")}</td></tr>`,
    )
    .join("");
  const cap = opts.capacity ? ` / ${opts.capacity}` : "";
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8" />
<title>Liste — ${esc(opts.sectionName)}</title>${styles(meta)}</head><body>
${header(meta, "Liste de la section", `${esc(opts.sectionName)} · ${today}`, refCode("LST"))}
<div class="idbox">
  <div><b>Section</b>${esc(opts.sectionName)}</div>
  <div><b>Monitrice référente</b>${esc(opts.teacherName || "—")}</div>
  <div><b>Effectif</b>${rows.length}${cap}${opts.ageRange ? ` · ${esc(opts.ageRange)}` : ""}</div>
</div>
<table><thead><tr><th>N°</th><th>Enfant</th><th>Matricule</th><th>Sexe</th><th>Naissance</th><th>Tél. parent</th><th>Récupéré par</th><th>Allergies</th></tr></thead>
<tbody>${body || `<tr><td colspan="8">Aucun enfant dans cette section.</td></tr>`}</tbody></table>
<footer><span>Document généré par MBGEduGuinée</span><span>${esc(meta.schoolName || "")}</span></footer>
${opts.autoPrint === false ? "" : `<script>window.onload=function(){setTimeout(function(){window.print();},350);};<\/script>`}
</body></html>`;
}

export function printSectionList(opts: Parameters<typeof sectionListHtml>[0] & { win?: Window | null }) {
  return open(sectionListHtml(opts), opts.win);
}
