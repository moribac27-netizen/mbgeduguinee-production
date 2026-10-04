import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/lib/audit";

export type ExportKind = "classes" | "subjects" | "students" | "teachers" | "grades";
export type ExportFormat = "xlsx" | "csv";
export type Cell = string | number | null;
export interface Table { headers: string[]; rows: Cell[][] }

/** Neutralise l'injection de formules (=, +, -, @) à l'ouverture dans Excel. */
function safe(v: unknown): Cell {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return v;
  const s = String(v);
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
}

function csvEscape(c: Cell): string {
  if (c === null) return "";
  const s = String(c);
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Récupère toutes les lignes (pages de 1000) pour dépasser la limite par défaut. */
async function fetchAll<T = any>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: any }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build(from, from + 999);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

export const EXPORT_LABELS: Record<ExportKind, string> = {
  classes: "Classes", subjects: "Matières", students: "Élèves", teachers: "Enseignants", grades: "Notes",
};

export interface ExportOptions {
  academicYear?: string;
  period?: string; // "" = toutes
  /** Élèves dont les notes ne doivent pas être exportées (cotisation non validée). */
  isLocked?: (studentId: string) => boolean;
}

export async function buildTable(kind: ExportKind, opts: ExportOptions = {}): Promise<{ table: Table; skipped: number }> {
  let skipped = 0;
  if (kind === "classes") {
    const d = await fetchAll((f, t) => supabase.from("classes").select("name, level, annual_fee").order("name").range(f, t));
    return { skipped, table: { headers: ["Nom", "Niveau", "Frais annuels"], rows: d.map((r: any) => [safe(r.name), safe(r.level), r.annual_fee ?? null]) } };
  }
  if (kind === "subjects") {
    const d = await fetchAll((f, t) => supabase.from("subjects").select("name, coefficient").order("name").range(f, t));
    return { skipped, table: { headers: ["Matière", "Coefficient"], rows: d.map((r: any) => [safe(r.name), r.coefficient ?? null]) } };
  }
  if (kind === "teachers") {
    const d = await fetchAll((f, t) => supabase.from("teachers").select("matricule, full_name, phone, email, subjects, hire_date").order("full_name").range(f, t));
    return { skipped, table: { headers: ["Matricule", "Nom complet", "Téléphone", "Email", "Matières", "Date d'embauche"],
      rows: d.map((r: any) => [safe(r.matricule), safe(r.full_name), safe(r.phone), safe(r.email), safe((r.subjects ?? []).join(", ")), safe(r.hire_date)]) } };
  }
  if (kind === "students") {
    const d = await fetchAll((f, t) => supabase.from("students")
      .select("matricule, full_name, gender, birth_date, birth_place, address, parent_name, parent_phone, enrollment_date, status, classes(name)")
      .order("full_name").range(f, t));
    return { skipped, table: { headers: ["Matricule", "Nom complet", "Sexe", "Date de naissance", "Lieu de naissance", "Adresse", "Parent", "Téléphone parent", "Date d'inscription", "Statut", "Classe"],
      rows: d.map((r: any) => [safe(r.matricule), safe(r.full_name), safe(r.gender), safe(r.birth_date), safe(r.birth_place), safe(r.address), safe(r.parent_name), safe(r.parent_phone), safe(r.enrollment_date), safe(r.status), safe(r.classes?.name)]) } };
  }
  const d = await fetchAll((f, t) => {
    let q: any = supabase.from("grades")
      .select("student_id, score, max_score, period, evaluation_type, academic_year, students(matricule, full_name, classes(name)), subjects(name, coefficient)");
    if (opts.academicYear) q = q.eq("academic_year", opts.academicYear);
    if (opts.period) q = q.eq("period", opts.period);
    return q.order("created_at").range(f, t);
  });
  const rows: Cell[][] = [];
  for (const r of d as any[]) {
    if (opts.isLocked?.(r.student_id)) { skipped++; continue; }
    rows.push([safe(r.students?.matricule), safe(r.students?.full_name), safe(r.students?.classes?.name), safe(r.subjects?.name),
      r.subjects?.coefficient ?? null, safe(r.period), safe(r.evaluation_type), r.score ?? null, r.max_score ?? null, safe(r.academic_year)]);
  }
  return { skipped, table: { headers: ["Matricule", "Élève", "Classe", "Matière", "Coefficient", "Période", "Évaluation", "Note", "Barème", "Année scolaire"], rows } };
}

export function downloadTable(table: Table, filename: string, format: ExportFormat, sheet = "Données") {
  if (format === "csv") {
    const text = [table.headers, ...table.rows].map((r) => r.map(csvEscape).join(";")).join("\r\n");
    const blob = new Blob(["﻿" + text], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${filename}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    return;
  }
  const ws = XLSX.utils.aoa_to_sheet([table.headers, ...table.rows]);
  ws["!cols"] = table.headers.map((h) => ({ wch: Math.max(12, h.length + 2) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheet.slice(0, 30));
  XLSX.writeFile(wb, `${filename}.xlsx`);
}

export async function exportData(kind: ExportKind, format: ExportFormat, opts: ExportOptions = {}) {
  const { table, skipped } = await buildTable(kind, opts);
  const stamp = new Date().toISOString().slice(0, 10);
  downloadTable(table, `${kind}-${stamp}`, format, EXPORT_LABELS[kind]);
  void logActivity({ action: "export", entity_type: `export_${kind}`, entity_label: EXPORT_LABELS[kind],
    metadata: { format, rows: table.rows.length, skipped_unpaid: skipped, academic_year: opts.academicYear ?? null, period: opts.period || null } });
  return { count: table.rows.length, skipped };
}

/** Modèles Excel officiels : en-têtes identiques à l'export + une ligne d'exemple. */
const TEMPLATES: Record<ExportKind, Table> = {
  classes: { headers: ["Nom", "Niveau", "Frais annuels"], rows: [["6ème A", "Collège", 500000]] },
  subjects: { headers: ["Matière", "Coefficient"], rows: [["Mathématiques", 4]] },
  teachers: { headers: ["Matricule", "Nom complet", "Téléphone", "Email", "Matières", "Date d'embauche"], rows: [["ENS-001", "Mamadou Diallo", "622000000", "m.diallo@exemple.com", "Mathématiques, Physique", "2024-09-15"]] },
  students: { headers: ["Matricule", "Nom complet", "Sexe", "Date de naissance", "Lieu de naissance", "Adresse", "Parent", "Téléphone parent", "Date d'inscription", "Statut", "Classe"], rows: [["ELV-0001", "Aissatou Camara", "F", "2012-03-21", "Conakry", "Kaloum", "Fatoumata Camara", "622111111", "2026-09-15", "actif", "6ème A"]] },
  grades: { headers: ["Matricule", "Élève", "Classe", "Matière", "Coefficient", "Période", "Évaluation", "Note", "Barème", "Année scolaire"], rows: [["ELV-0001", "Aissatou Camara", "6ème A", "Mathématiques", 4, "T1", "composition", 14.5, 20, "2026-2027"]] },
};

export function downloadTemplate(kind: ExportKind) {
  downloadTable(TEMPLATES[kind], `modele-${kind}`, "xlsx", EXPORT_LABELS[kind]);
}
