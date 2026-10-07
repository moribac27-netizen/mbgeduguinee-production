import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/lib/audit";
import { getCurrentAcademicYear } from "@/lib/academic-year";

export type ImportKind = "classes" | "subjects" | "students" | "teachers" | "assignments" | "grades";
export type ImportMode = "add" | "update" | "add_update";
export type RowAction = "create" | "update" | "skip" | "error";

export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_ROWS = 5000;
const LEVELS = ["Primaire", "Collège", "Lycée", "Formation"];
const BATCH = 200;

export interface PreviewRow {
  line: number; // numéro de ligne dans le fichier (en-tête = 1)
  action: RowAction;
  message?: string;
  label: string;
  values: Record<string, any>;
  existingId?: string;
}
export interface Preview { rows: PreviewRow[]; counts: Record<RowAction, number>; headerErrors: string[] }

interface ColDef { header: string; key: string; required?: boolean }
export const COLUMNS: Record<ImportKind, ColDef[]> = {
  classes: [{ header: "Nom", key: "name", required: true }, { header: "Niveau", key: "level", required: true }, { header: "Frais annuels", key: "annual_fee" }],
  subjects: [{ header: "Matière", key: "name", required: true }, { header: "Coefficient", key: "coefficient" }],
  students: [
    { header: "Matricule", key: "matricule" }, { header: "Nom complet", key: "full_name", required: true }, { header: "Sexe", key: "gender" },
    { header: "Date de naissance", key: "birth_date" }, { header: "Lieu de naissance", key: "birth_place" }, { header: "Adresse", key: "address" },
    { header: "Parent", key: "parent_name" }, { header: "Téléphone parent", key: "parent_phone" }, { header: "Date d'inscription", key: "enrollment_date" },
    { header: "Statut", key: "status" }, { header: "Classe", key: "class_name" },
  ],
  teachers: [
    { header: "Matricule", key: "matricule" }, { header: "Nom complet", key: "full_name", required: true }, { header: "Téléphone", key: "phone" },
    { header: "Email", key: "email" }, { header: "Matières", key: "subjects" }, { header: "Date d'embauche", key: "hire_date" },
  ],
  grades: [
    { header: "Matricule", key: "matricule", required: true }, { header: "Matière", key: "subject_name", required: true },
    { header: "Période", key: "period", required: true }, { header: "Évaluation", key: "evaluation_type" }, { header: "Note", key: "score", required: true },
  ],
  assignments: [
    { header: "Matricule enseignant", key: "teacher_matricule", required: true }, { header: "Classe", key: "class_name", required: true }, { header: "Matière", key: "subject_name" },
  ],
};
export const IMPORT_LABELS: Record<ImportKind, string> = { classes: "Classes", subjects: "Matières", students: "Élèves", teachers: "Enseignants", assignments: "Affectations", grades: "Notes (année courante)" };

const norm = (s: unknown) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase().replace(/\s+/g, " ");

/** Lecteur CSV minimal (guillemets, séparateur ; ou ,) : le CSV ne passe jamais par la bibliothèque xlsx. */
function parseCsv(text: string): string[][] {
  const first = text.split(/\r?\n/, 1)[0] ?? "";
  const sep = (first.match(/;/g)?.length ?? 0) >= (first.match(/,/g)?.length ?? 0) ? ";" : ",";
  const out: string[][] = [];
  let row: string[] = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c;
    } else if (c === '"') q = true;
    else if (c === sep) { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(cell); out.push(row); row = []; cell = ""; if (out.length > MAX_ROWS + 1) break; }
    else cell += c;
  }
  if (cell !== "" || row.length) { row.push(cell); out.push(row); }
  return out.map((r) => r.map((c) => c.trim()));
}

/**
 * Lit un fichier .xlsx ou .csv. Garde-fous : taille, nombre de lignes, signature ZIP pour .xlsx,
 * lecture en valeurs seulement (formules, styles et macros ignorés), première feuille uniquement.
 */
export async function readFile(file: File): Promise<string[][]> {
  if (file.size > MAX_FILE_BYTES) throw new Error("Fichier trop volumineux (5 Mo maximum).");
  if (!/\.(xlsx|csv)$/i.test(file.name)) throw new Error("Format non pris en charge : utilisez .xlsx ou .csv.");
  const buf = await file.arrayBuffer();
  let grid: string[][];
  if (/\.csv$/i.test(file.name)) {
    grid = parseCsv(new TextDecoder("utf-8").decode(buf).replace(/^\ufeff/, ""));
  } else {
    const sig = new Uint8Array(buf.slice(0, 4));
    if (!(sig[0] === 0x50 && sig[1] === 0x4b)) throw new Error("Ce fichier n'est pas un classeur Excel .xlsx valide.");
    const wb = XLSX.read(buf, { type: "array", cellDates: true, cellFormula: false, cellHTML: false, cellStyles: false, bookVBA: false, sheetRows: MAX_ROWS + 2 });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    if (!sheet) throw new Error("Le fichier ne contient aucune feuille.");
    const raw = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, raw: true, defval: "" });
    grid = raw.map((r) => r.map((c) => {
      if (c instanceof Date) return new Date(c.getTime() - c.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
      return String(c ?? "").trim();
    }));
  }
  if (grid.length - 1 > MAX_ROWS) throw new Error(`Trop de lignes (${MAX_ROWS} maximum par import).`);
  return grid;
}

function toDate(v: string): string | null | "invalid" {
  if (!v) return null;
  let iso: string | null = null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) iso = v;
  else { const m = v.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/); if (m) iso = `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`; }
  if (!iso) return "invalid";
  const d = new Date(iso + "T00:00:00Z");
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== iso ? "invalid" : iso;
}
const toNum = (v: string) => (v === "" ? null : Number(v.replace(/\s/g, "").replace(",", ".")));

async function fetchAllRows(table: string, select: string) {
  const out: any[] = [];
  for (let f = 0; ; f += 1000) {
    const { data, error } = await (supabase as any).from(table).select(select).range(f, f + 999);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

/** Valide le fichier sans rien écrire et prépare l'aperçu. */
export async function buildPreview(kind: ImportKind, mode: ImportMode, grid: string[][]): Promise<Preview> {
  const cols = COLUMNS[kind];
  const headerErrors: string[] = [];
  const header = (grid[0] ?? []).map(norm);
  const idx: Record<string, number> = {};
  for (const c of cols) {
    const i = header.indexOf(norm(c.header));
    if (i >= 0) idx[c.key] = i;
    else if (c.required) headerErrors.push(`Colonne obligatoire absente : « ${c.header} ».`);
  }
  const counts: Record<RowAction, number> = { create: 0, update: 0, skip: 0, error: 0 };
  if (headerErrors.length) return { rows: [], counts, headerErrors };

  if (kind === "grades") return buildGradesPreview(grid, idx, mode, counts);
  if (kind === "assignments") return buildAssignmentsPreview(grid, idx, mode, counts);

  const keyField = kind === "students" || kind === "teachers" ? "matricule" : "name";
  const existing = await fetchAllRows(kind, kind === "students" ? "id, matricule" : kind === "teachers" ? "id, matricule" : "id, name");
  const existingByKey = new Map<string, string>();
  for (const e of existing) { const k = norm(e[keyField]); if (k) existingByKey.set(k, e.id); }
  let classByName = new Map<string, string | null>();
  if (kind === "students") {
    const cl = await fetchAllRows("classes", "id, name");
    for (const c of cl) { const k = norm(c.name); classByName.set(k, classByName.has(k) ? null : c.id); } // null = ambigu
  }

  const seen = new Set<string>();
  const rows: PreviewRow[] = [];
  for (let r = 1; r < grid.length; r++) {
    const line = grid[r];
    if (line.every((c) => c === "")) continue;
    const get = (k: string) => (idx[k] !== undefined ? (line[idx[k]] ?? "") : "");
    const errs: string[] = [];
    const v: Record<string, any> = {};
    for (const c of cols) if (idx[c.key] !== undefined) v[c.key] = get(c.key);
    for (const c of cols) if (c.required && !get(c.key)) errs.push(`« ${c.header} » est obligatoire.`);

    if (kind === "classes") {
      const lvl = LEVELS.find((l) => norm(l) === norm(v.level));
      if (v.level && !lvl) errs.push(`Niveau inconnu (« ${v.level} ») : ${LEVELS.join(", ")}.`); else v.level = lvl ?? v.level;
      if ("annual_fee" in v) { const n = toNum(v.annual_fee); if (n !== null && (Number.isNaN(n) || n < 0)) errs.push("Frais annuels invalides."); else v.annual_fee = n; }
    }
    if (kind === "subjects" && "coefficient" in v) {
      const n = toNum(v.coefficient);
      if (n !== null && (Number.isNaN(n) || n <= 0 || n > 20)) errs.push("Coefficient invalide (nombre > 0 et ≤ 20)."); else v.coefficient = n;
    }
    if (kind === "students") {
      if ("gender" in v && v.gender) { const g = norm(v.gender)[0]; if (g === "m" || g === "g") v.gender = "M"; else if (g === "f") v.gender = "F"; else errs.push("Sexe invalide (M ou F)."); }
      for (const k of ["birth_date", "enrollment_date"]) if (k in v) { const d = toDate(v[k]); if (d === "invalid") errs.push(`Date invalide (« ${v[k]} ») : utilisez AAAA-MM-JJ.`); else v[k] = d; }
      if ("class_name" in v && v.class_name) {
        const cid = classByName.get(norm(v.class_name));
        if (cid === undefined) errs.push(`Classe introuvable : « ${v.class_name} ». Importez d'abord les classes.`);
        else if (cid === null) errs.push(`Plusieurs classes portent le nom « ${v.class_name} ».`);
        else v.class_id = cid;
      }
    }
    if (kind === "teachers") {
      if (v.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email)) errs.push("Email invalide.");
      if ("hire_date" in v) { const d = toDate(v.hire_date); if (d === "invalid") errs.push("Date d'embauche invalide (AAAA-MM-JJ)."); else v.hire_date = d; }
      if ("subjects" in v) v.subjects = String(v.subjects).split(/[,;]/).map((s) => s.trim()).filter(Boolean);
    }

    const key = norm(v[keyField]);
    let action: RowAction = "create";
    let existingId: string | undefined;
    if (!errs.length && key) {
      if (seen.has(key)) errs.push("Doublon dans le fichier.");
      seen.add(key);
      existingId = existingByKey.get(key);
    }
    const label = String(v.full_name ?? v.name ?? "");
    if (errs.length) { action = "error"; }
    else if (existingId) action = mode === "add" ? "skip" : "update";
    else action = mode === "update" ? "skip" : "create";
    const message = errs.length ? errs.join(" ") : action === "skip" ? (existingId ? "Existe déjà (ignoré en mode ajout)." : "Introuvable (ignoré en mode mise à jour).") : undefined;
    counts[action]++;
    rows.push({ line: r + 1, action, message, label, values: v, existingId });
  }
  return { rows, counts, headerErrors };
}

async function buildGradesPreview(grid: string[][], idx: Record<string, number>, mode: ImportMode, counts: Record<RowAction, number>): Promise<Preview> {
  const [students, subjects] = await Promise.all([fetchAllRows("students", "id, matricule"), fetchAllRows("subjects", "id, name")]);
  const stMap = new Map<string, string>(students.map((x: any) => [norm(x.matricule), x.id]));
  const sbMap = new Map<string, string | null>();
  for (const x of subjects) { const k = norm(x.name); sbMap.set(k, sbMap.has(k) ? null : x.id); }
  const seen = new Set<string>();
  const rows: PreviewRow[] = [];
  for (let r = 1; r < grid.length; r++) {
    const line = grid[r];
    if (line.every((c) => c === "")) continue;
    const get = (k: string) => (idx[k] !== undefined ? (line[idx[k]] ?? "") : "");
    const errs: string[] = [];
    const mat = get("matricule"), sn = get("subject_name"), per = get("period").toUpperCase().replace(/^TRIMESTRE\s*/, "T"), type = norm(get("evaluation_type")) || "composition", rawScore = get("score");
    const sid = mat ? stMap.get(norm(mat)) : undefined, sub = sn ? sbMap.get(norm(sn)) : undefined;
    if (!mat) errs.push("« Matricule » est obligatoire."); else if (!sid) errs.push(`Élève introuvable : « ${mat} ».`);
    if (!sn) errs.push("« Matière » est obligatoire."); else if (sub === undefined) errs.push(`Matière introuvable : « ${sn} ».`); else if (sub === null) errs.push(`Plusieurs matières portent le nom « ${sn} ».`);
    if (!["T1", "T2", "T3"].includes(per)) errs.push("Période invalide (T1, T2 ou T3).");
    const score = rawScore === "" ? null : Number(rawScore.replace(/\s/g, "").replace(",", "."));
    if (score === null) errs.push("Note absente : une cellule vide n'est jamais importée comme 0."); else if (Number.isNaN(score) || score < 0) errs.push("Note invalide.");
    const key = `${sid}|${sub}|${per}|${type}`;
    if (!errs.length) { if (seen.has(key)) errs.push("Doublon dans le fichier (même élève, matière, période et évaluation)."); seen.add(key); }
    const action: RowAction = errs.length ? "error" : "create";
    counts[action]++;
    rows.push({ line: r + 1, action, message: errs.length ? errs.join(" ") : undefined, label: `${mat} · ${sn} · ${per}`, values: { line: r + 1, student_id: sid, subject_id: sub, period: per, evaluation_type: type, score } });
  }
  return { rows, counts, headerErrors: [] };
}

async function buildAssignmentsPreview(grid: string[][], idx: Record<string, number>, mode: ImportMode, counts: Record<RowAction, number>): Promise<Preview> {
  const year = getCurrentAcademicYear();
  const [teachers, classes, subjects, existing] = await Promise.all([
    fetchAllRows("teachers", "id, matricule"), fetchAllRows("classes", "id, name"), fetchAllRows("subjects", "id, name"),
    (async () => { const out: any[] = []; for (let f = 0; ; f += 1000) { const { data, error } = await (supabase as any).from("teacher_class_assignments").select("teacher_id, class_id, subject_id").eq("academic_year", year).range(f, f + 999); if (error) throw error; out.push(...(data ?? [])); if (!data || data.length < 1000) break; } return out; })(),
  ]);
  const uniq = (rows: any[], f: string) => { const m = new Map<string, string | null>(); for (const r of rows) { const k = norm(r[f]); m.set(k, m.has(k) ? null : r.id); } return m; };
  const tMap = uniq(teachers, "matricule"), cMap = uniq(classes, "name"), sMap = uniq(subjects, "name");
  const have = new Set(existing.map((e: any) => `${e.teacher_id}|${e.class_id}|${e.subject_id ?? ""}`));
  const seen = new Set<string>();
  const rows: PreviewRow[] = [];
  for (let r = 1; r < grid.length; r++) {
    const line = grid[r];
    if (line.every((c) => c === "")) continue;
    const get = (k: string) => (idx[k] !== undefined ? (line[idx[k]] ?? "") : "");
    const errs: string[] = [];
    const tm = get("teacher_matricule"), cn = get("class_name"), sn = get("subject_name");
    if (!tm) errs.push("« Matricule enseignant » est obligatoire."); if (!cn) errs.push("« Classe » est obligatoire.");
    const tid = tm ? tMap.get(norm(tm)) : undefined, cid = cn ? cMap.get(norm(cn)) : undefined, sid = sn ? sMap.get(norm(sn)) : null;
    if (tm && tid === undefined) errs.push(`Enseignant introuvable : « ${tm} ». Importez d'abord les enseignants.`);
    if (cn && cid === undefined) errs.push(`Classe introuvable : « ${cn} ».`); else if (cid === null) errs.push(`Plusieurs classes portent le nom « ${cn} ».`);
    if (sn && sid === undefined) errs.push(`Matière introuvable : « ${sn} ».`); else if (sid === null && sn) errs.push(`Plusieurs matières portent le nom « ${sn} ».`);
    const key = `${tid}|${cid}|${sid ?? ""}`;
    if (!errs.length) { if (seen.has(key)) errs.push("Doublon dans le fichier."); seen.add(key); }
    let action: RowAction = errs.length ? "error" : have.has(key) ? "skip" : "create";
    const message = errs.length ? errs.join(" ") : action === "skip" ? "Affectation déjà existante pour cette année (ignorée)." : undefined;
    counts[action]++;
    rows.push({ line: r + 1, action, message, label: `${tm} → ${cn}${sn ? " / " + sn : ""}`, values: { teacher_id: tid, class_id: cid, subject_id: sid ?? null } });
  }
  return { rows, counts, headerErrors: [] };
}

function genMatricule(prefix: string) { return `${prefix}-` + globalThis.crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase(); }

function toPayload(kind: ImportKind, v: Record<string, any>, isCreate: boolean) {
  const p: Record<string, any> = {};
  if (kind === "assignments") return { teacher_id: v.teacher_id, class_id: v.class_id, subject_id: v.subject_id };
  const set = (k: string, val: any) => { if (val !== undefined && val !== null && val !== "" && !(Array.isArray(val) && !val.length)) p[k] = val; };
  if (kind === "classes") { set("name", v.name); set("level", v.level); set("annual_fee", v.annual_fee); if (isCreate && p.annual_fee === undefined) p.annual_fee = 0; }
  if (kind === "subjects") { set("name", v.name); set("coefficient", v.coefficient); if (isCreate && p.coefficient === undefined) p.coefficient = 1; }
  if (kind === "students") {
    for (const k of ["full_name", "gender", "birth_date", "birth_place", "address", "parent_name", "parent_phone", "enrollment_date", "class_id"]) set(k, v[k]);
    set("status", v.status || (isCreate ? "actif" : undefined));
    if (isCreate) p.matricule = v.matricule || genMatricule("EDG"); // le matricule n'est jamais modifié par une mise à jour
  }
  if (kind === "teachers") {
    for (const k of ["full_name", "phone", "email", "subjects", "hire_date"]) set(k, v[k]);
    if (isCreate) p.matricule = v.matricule || genMatricule("ENS");
  }
  return p;
}

function friendly(err: any): string {
  const m = String(err?.message ?? err ?? "");
  if (/duplicate key|unique/i.test(m)) return "Valeur déjà utilisée (matricule ou nom en doublon).";
  if (/row-level security|permission/i.test(m)) return "Droits insuffisants ou établissement en accès limité.";
  return "Ligne refusée par la base de données.";
}

export interface ImportResult { importId: string; created: number; updated: number; skipped: number; errors: Array<{ line: number; message: string }> }

/** Exécute l'import par lots. Aucune ligne en erreur ne bloque les autres. */
export async function runImport(kind: ImportKind, mode: ImportMode, filename: string, preview: Preview, onProgress?: (done: number, total: number) => void): Promise<ImportResult> {
  const sb: any = supabase;
  const table = kind === "assignments" ? "teacher_class_assignments" : kind;
  const { data: imp, error: impErr } = await sb.from("data_imports").insert({ kind, mode, filename, total_rows: preview.rows.length }).select("id").single();
  if (impErr) throw new Error("Impossible de démarrer l'import (droits ou établissement non défini).");
  const importId: string = imp.id;
  const errors: ImportResult["errors"] = preview.rows.filter((r) => r.action === "error").map((r) => ({ line: r.line, message: r.message ?? "Erreur" }));
  const skipped = preview.counts.skip;
  let created = 0, updated = 0, done = 0;
  if (kind === "grades") {
    const valid = preview.rows.filter((r) => r.action === "create");
    let g_created = 0, g_updated = 0, g_skipped = skipped;
    for (let i = 0; i < valid.length; i += 500) {
      const chunk = valid.slice(i, i + 500);
      const { data, error } = await sb.rpc("import_grades_batch", { _import_id: importId, _mode: mode, _rows: chunk.map((r) => r.values) });
      if (error) { chunk.forEach((r) => errors.push({ line: r.line, message: "Lot refusé : " + (/Accès réservé/.test(error.message) ? "accès réservé à la direction." : "erreur de la base de données (le lot entier a été annulé).") })); }
      else { g_created += data.created; g_updated += data.updated; g_skipped += data.skipped; for (const e of data.errors ?? []) errors.push({ line: e.line, message: e.message }); }
      onProgress?.(Math.min(i + 500, valid.length), valid.length);
    }
    errors.sort((a, b) => a.line - b.line);
    await sb.from("data_imports").update({ created_count: g_created, updated_count: g_updated, skipped_count: g_skipped, error_count: errors.length, errors: errors.slice(0, 500) }).eq("id", importId);
    void logActivity({ action: "create", entity_type: "import_grades", entity_id: importId, entity_label: filename, metadata: { mode, created: g_created, updated: g_updated, skipped: g_skipped, errors: errors.length } });
    return { importId, created: g_created, updated: g_updated, skipped: g_skipped, errors };
  }
  const toCreate = preview.rows.filter((r) => r.action === "create");
  const toUpdate = preview.rows.filter((r) => r.action === "update");
  const total = toCreate.length + toUpdate.length;

  for (let i = 0; i < toCreate.length; i += BATCH) {
    const chunk = toCreate.slice(i, i + BATCH);
    const payloads = chunk.map((r) => ({ ...toPayload(kind, r.values, true), import_id: importId }));
    const { error } = await sb.from(table).insert(payloads);
    if (!error) created += chunk.length;
    else for (let j = 0; j < chunk.length; j++) { // repli ligne à ligne pour isoler les erreurs
      const { error: e1 } = await sb.from(table).insert(payloads[j]);
      if (e1) errors.push({ line: chunk[j].line, message: friendly(e1) }); else created++;
    }
    done += chunk.length; onProgress?.(done, total);
  }
  for (let i = 0; i < toUpdate.length; i += 20) {
    const chunk = toUpdate.slice(i, i + 20);
    await Promise.all(chunk.map(async (r) => {
      const { error } = await sb.from(kind).update(toPayload(kind, r.values, false)).eq("id", r.existingId);
      if (error) errors.push({ line: r.line, message: friendly(error) }); else updated++;
    }));
    done += chunk.length; onProgress?.(done, total);
  }
  errors.sort((a, b) => a.line - b.line);
  await sb.from("data_imports").update({ created_count: created, updated_count: updated, skipped_count: skipped, error_count: errors.length, errors: errors.slice(0, 500) }).eq("id", importId);
  void logActivity({ action: "create", entity_type: `import_${kind}`, entity_id: importId, entity_label: filename, metadata: { mode, created, updated, skipped, errors: errors.length } });
  return { importId, created, updated, skipped, errors };
}

/** Annule un import : supprime uniquement les lignes créées par lui (jamais les mises à jour). */
export async function rollbackImport(importId: string, kind: ImportKind): Promise<{ deleted: number; kept: number }> {
  const sb: any = supabase;
  const table = kind === "assignments" ? "teacher_class_assignments" : kind;
  const { data: rows, error } = await sb.from(table).select("id").eq("import_id", importId);
  if (error) throw error;
  let deleted = 0, kept = 0;
  for (const r of rows ?? []) {
    const { error: e } = await sb.from(table).delete().eq("id", r.id);
    if (e) kept++; else deleted++; // conservé s'il est déjà utilisé ailleurs (notes, paiements…)
  }
  await sb.from("data_imports").update({ status: "rolled_back", rolled_back_at: new Date().toISOString() }).eq("id", importId);
  void logActivity({ action: "delete", entity_type: `import_${kind}`, entity_id: importId, entity_label: "Annulation d'import", metadata: { deleted, kept } });
  return { deleted, kept };
}
