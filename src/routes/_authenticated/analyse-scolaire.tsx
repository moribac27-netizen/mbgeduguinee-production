import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Printer, FileDown, FileSpreadsheet, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { useSchool } from "@/hooks/useSchool";
import { usePerStudentPlan } from "@/hooks/usePerStudentPlan";
import { maxScoreForLevel } from "@/lib/grading";
import { BULLETIN_PERIODS, periodLabel, appreciation } from "@/lib/rankings";
import {
  groupStats,
  levelStats,
  studentSynthesis,
  availableEvaluationTypes,
  attendanceRate,
  gradeKey,
  passThreshold,
  type AnalysisFilters,
  type Trend,
} from "@/lib/analytics";
import { exportPDF, exportExcel, type ExportColumn } from "@/lib/reports";
import { logActivity } from "@/lib/audit";

export const Route = createFileRoute("/_authenticated/analyse-scolaire")({
  head: () => ({
    meta: [
      { title: "Analyse scolaire — MBGEduGuinée" },
      { name: "description", content: "Synthèse et analyse des performances : fiche élève, rapport de classe, rapport de niveau." },
    ],
  }),
  component: AnalyseScolairePage,
});

type Mode = "eleve" | "classe" | "niveau";

/* ---------- chargement des données (par paquets, sans limite de 1000 lignes) ---------- */

async function fetchAll(make: () => any): Promise<any[]> {
  const out: any[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await make().range(from, from + 999);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

async function fetchForStudents(table: string, ids: string[], apply: (q: any) => any): Promise<any[]> {
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += 100) chunks.push(ids.slice(i, i + 100));
  const parts = await Promise.all(
    chunks.map((c) => fetchAll(() => apply((supabase as any).from(table).select("*").in("student_id", c)))),
  );
  return parts.flat();
}

/* ---------- petits composants visuels ---------- */

const fmt = (n: number | null | undefined) =>
  n == null ? "—" : n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (n: number | null | undefined) => (n == null ? "—" : `${n.toLocaleString("fr-FR")} %`);

function StatCard({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 p-3 bg-slate-50">
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="text-xl font-bold mt-1">{value}</div>
      {sub && <div className="text-[11px] text-slate-500 mt-0.5">{sub}</div>}
    </div>
  );
}

function TrendBadge({ trend, delta }: { trend: Trend; delta: number | null }) {
  if (!trend) return <span className="text-slate-400">—</span>;
  const Icon = trend === "hausse" ? TrendingUp : trend === "baisse" ? TrendingDown : Minus;
  const label = trend === "hausse" ? "Progression" : trend === "baisse" ? "Baisse" : "Stabilité";
  return (
    <span className="inline-flex items-center gap-1 font-semibold">
      <Icon className="size-4" />
      {label}
      {delta != null && ` (${delta > 0 ? "+" : ""}${fmt(delta)})`}
    </span>
  );
}

function LineChart({ points, max }: { points: Array<{ label: string; value: number | null }>; max: number }) {
  const W = 440, H = 170, P = 30;
  if (!points.some((p) => p.value != null)) {
    return <p className="text-sm text-slate-500">Aucune donnée disponible pour tracer la courbe.</p>;
  }
  const x = (i: number) => (points.length === 1 ? W / 2 : P + (i * (W - 2 * P)) / (points.length - 1));
  const y = (v: number) => H - P - (v / max) * (H - 2 * P);
  const line = points.map((p, i) => (p.value == null ? null : `${x(i)},${y(p.value)}`)).filter(Boolean).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-xl">
      <line x1={P} x2={W - P} y1={y(max / 2)} y2={y(max / 2)} stroke="#94a3b8" strokeDasharray="4 4" />
      <text x={W - P} y={y(max / 2) - 4} fontSize="9" textAnchor="end" fill="#64748b">moyenne {max / 2}</text>
      <line x1={P} x2={W - P} y1={H - P} y2={H - P} stroke="#cbd5e1" />
      <polyline points={line} fill="none" stroke="#065f46" strokeWidth="2.5" />
      {points.map((p, i) => (
        <g key={p.label}>
          {p.value != null && <circle cx={x(i)} cy={y(p.value)} r="4.5" fill="#065f46" />}
          {p.value != null && (
            <text x={x(i)} y={y(p.value) - 9} fontSize="11" fontWeight="700" textAnchor="middle">{fmt(p.value)}</text>
          )}
          <text x={x(i)} y={H - 10} fontSize="11" textAnchor="middle" fill="#475569">{p.label}</text>
        </g>
      ))}
    </svg>
  );
}

function BarRow({ label, value, max, right }: { label: string; value: number | null; max: number; right?: string }) {
  const w = value == null ? 0 : Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className="flex items-center gap-2 text-xs">
      <div className="w-28 shrink-0 truncate">{label}</div>
      <div className="flex-1 h-3 rounded bg-slate-100 border border-slate-200 overflow-hidden">
        <div className="h-full bg-emerald-700" style={{ width: `${w}%` }} />
      </div>
      <div className="w-24 shrink-0 text-right font-semibold">{right ?? fmt(value)}</div>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="border border-white/20 p-2 text-left">{children}</th>;
}
function Td({ children, bold }: { children: React.ReactNode; bold?: boolean }) {
  return <td className={`border border-slate-200 p-2 ${bold ? "font-semibold" : ""}`}>{children}</td>;
}
function DataTable({ head, children }: { head: React.ReactNode[]; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border border-slate-200 border-collapse">
        <thead className="bg-emerald-800 text-white">
          <tr>{head.map((h, i) => <Th key={i}>{h}</Th>)}</tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6 break-inside-avoid">
      <h3 className="font-bold text-sm uppercase text-emerald-900 border-b border-emerald-800 pb-1 mb-3">{title}</h3>
      {children}
    </section>
  );
}

/* ---------- page ---------- */

function AnalyseScolairePage() {
  const { school, logoUrl } = useSchool();
  const { info: planInfo } = usePerStudentPlan();
  const academicYear = planInfo.academicYear;

  const [mode, setMode] = useState<Mode>("classe");
  const [period, setPeriod] = useState("ANNUAL");
  const [classId, setClassId] = useState("");
  const [studentId, setStudentId] = useState("");
  const [levelKey, setLevelKey] = useState("");
  const [evalType, setEvalType] = useState("all");
  const [subjectId, setSubjectId] = useState("all");

  const { data: classes = [] } = useQuery({
    queryKey: ["as-classes"],
    queryFn: async () => (await supabase.from("classes").select("*").order("name")).data ?? [],
  });
  const { data: subjects = [] } = useQuery({
    queryKey: ["as-subjects"],
    queryFn: async () => (await supabase.from("subjects").select("*").order("name")).data ?? [],
    staleTime: 5 * 60_000,
  });

  const classById = useMemo(() => new Map(classes.map((c: any) => [c.id, c])), [classes]);

  const groups = useMemo(() => {
    const m = new Map<string, any[]>();
    classes.forEach((c: any) => {
      const k = gradeKey(c.name);
      const arr = m.get(k) ?? [];
      arr.push(c);
      m.set(k, arr);
    });
    return [...m.entries()].map(([key, cls]) => ({
      key,
      classes: cls,
      label: cls.length > 1 ? `${key} — ${cls.length} classes` : cls[0].name,
    }));
  }, [classes]);
  const group = groups.find((g) => g.key === levelKey);

  const targetClasses: any[] = mode === "niveau" ? group?.classes ?? [] : classById.get(classId) ? [classById.get(classId)] : [];
  const targetIds = targetClasses.map((c) => c.id);
  const baseClass = targetClasses[0];
  const maxScore: 10 | 20 = maxScoreForLevel(baseClass?.level);

  const { data: students = [] } = useQuery({
    queryKey: ["as-students", targetIds.join(",")],
    enabled: targetIds.length > 0,
    queryFn: async () => (await supabase.from("students").select("*").in("class_id", targetIds).order("full_name")).data ?? [],
  });
  const ids = students.map((s: any) => s.id);

  const { data: grades = [] } = useQuery({
    queryKey: ["as-grades", ids.join(","), academicYear],
    enabled: ids.length > 0 && !!academicYear,
    queryFn: () => fetchForStudents("grades", ids, (q) => q.eq("academic_year", academicYear)),
  });
  const { data: attendance = [] } = useQuery({
    queryKey: ["as-attendance", ids.join(",")],
    enabled: ids.length > 0,
    queryFn: () => fetchForStudents("student_attendance", ids, (q) => q),
  });

  const filters: AnalysisFilters = useMemo(
    () => ({
      academicYear,
      period,
      evaluationType: evalType === "all" ? null : evalType,
      subjectId: subjectId === "all" ? null : subjectId,
    }),
    [academicYear, period, evalType, subjectId],
  );
  const evalTypes = useMemo(() => availableEvaluationTypes(grades, { academicYear }), [grades, academicYear]);

  const classRes = useMemo(
    () => (mode === "classe" && students.length ? groupStats(students, grades, subjects, maxScore, filters) : null),
    [mode, students, grades, subjects, maxScore, filters],
  );
  const levelRes = useMemo(
    () => (mode === "niveau" && group && students.length ? levelStats(group.classes, students, grades, subjects, maxScore, filters) : null),
    [mode, group, students, grades, subjects, maxScore, filters],
  );
  const studentRes = useMemo(
    () => (mode === "eleve" && studentId ? studentSynthesis(studentId, students, grades, subjects, maxScore, filters) : null),
    [mode, studentId, students, grades, subjects, maxScore, filters],
  );

  const th = passThreshold(maxScore);
  const ready = mode === "niveau" ? !!group : !!baseClass && (mode === "classe" || !!studentId);

  const title =
    mode === "classe"
      ? `Rapport de synthèse de classe — ${baseClass?.name ?? ""}`
      : mode === "niveau"
        ? `Rapport de synthèse du niveau — ${group?.key ?? ""}`
        : `Fiche individuelle de synthèse — ${studentRes?.student.full_name ?? ""}`;

  /* ----- données d'export (le tableau principal de chaque rapport) ----- */
  const exportData = useMemo(() => {
    const cols: ExportColumn[] = [];
    const rows: any[] = [];
    if (classRes) {
      const subs = classRes.subjects.filter((s) => s.graded > 0);
      cols.push({ key: "rank", label: "Rang" }, { key: "name", label: "Élève" });
      subs.forEach((s) => cols.push({ key: `s_${s.subject.id}`, label: s.subject.name }));
      cols.push({ key: "avg", label: `Moyenne / ${maxScore}` });
      classRes.ranked.forEach((r) => {
        const row: any = { rank: r.rank ?? "—", name: r.student.full_name, avg: r.avg != null ? r.avg.toFixed(2) : "—" };
        subs.forEach((s) => {
          const v = r.perSubject.find((p) => p.subject.id === s.subject.id)?.avg;
          row[`s_${s.subject.id}`] = v != null ? v.toFixed(2) : "—";
        });
        rows.push(row);
      });
    } else if (levelRes) {
      cols.push(
        { key: "name", label: "Classe" },
        { key: "effectif", label: "Effectif" },
        { key: "avg", label: `Moyenne / ${maxScore}` },
        { key: "rate", label: "Taux de réussite" },
      );
      levelRes.classes.forEach((c) =>
        rows.push({ name: c.name, effectif: c.effectif, avg: c.average != null ? c.average.toFixed(2) : "—", rate: pct(c.passRate) }),
      );
    } else if (studentRes) {
      cols.push({ key: "name", label: "Matière" }, { key: "avg", label: `Moyenne / ${maxScore}` }, { key: "app", label: "Appréciation" });
      studentRes.subjects
        .filter((s) => s.current != null)
        .forEach((s) => rows.push({ name: s.subject.name, avg: (s.current as number).toFixed(2), app: appreciation(s.current, maxScore) }));
    }
    return { cols, rows };
  }, [classRes, levelRes, studentRes, maxScore]);

  const logOpts = {
    entity_type: "analyse_scolaire",
    entity_id: mode === "classe" ? classId : mode === "niveau" ? levelKey : studentId,
    entity_label: title,
    metadata: { mode, periode: periodLabel(period), academicYear },
  };
  function handlePrint() {
    void logActivity({ action: "print", ...logOpts });
    window.print();
  }
  function handleExportPDF() {
    void logActivity({ action: "export_pdf", ...logOpts });
    exportPDF(title, exportData.rows, exportData.cols, {
      schoolName: school?.name,
      schoolAddress: school?.address,
      schoolContact: [school?.phone, school?.email].filter(Boolean).join(" · "),
      academicYear,
      logoUrl: logoUrl ?? undefined,
      subtitle: periodLabel(period),
      accent: school?.receipt_accent_color ?? undefined,
    });
  }
  function handleExportExcel() {
    exportExcel(title, exportData.rows, exportData.cols, title.slice(0, 30));
  }

  const attRate = attendanceRate(
    mode === "eleve" ? attendance.filter((a: any) => a.student_id === studentId) : attendance,
  );

  return (
    <div className="space-y-6">
      <div className="no-print">
        <h1 className="font-display text-3xl font-bold">Analyse scolaire</h1>
        <p className="text-muted-foreground mt-1">
          Synthèse des performances par élève, par classe et par niveau — année scolaire {academicYear || "—"}. Ces documents complètent les bulletins, ils ne les remplacent pas.
        </p>
      </div>

      <Card className="no-print">
        <CardContent className="p-4 space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button variant={mode === "eleve" ? "default" : "outline"} onClick={() => setMode("eleve")}>Fiche élève</Button>
            <Button variant={mode === "classe" ? "default" : "outline"} onClick={() => setMode("classe")}>Rapport de classe</Button>
            <Button variant={mode === "niveau" ? "default" : "outline"} onClick={() => setMode("niveau")}>Rapport de niveau</Button>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            {mode === "niveau" ? (
              <div>
                <Label>Niveau scolaire</Label>
                <Select value={levelKey} onValueChange={setLevelKey}>
                  <SelectTrigger><SelectValue placeholder="Choisir un niveau" /></SelectTrigger>
                  <SelectContent>
                    {groups.map((g) => <SelectItem key={g.key} value={g.key}>{g.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div>
                <Label>Classe</Label>
                <Select value={classId} onValueChange={(v) => { setClassId(v); setStudentId(""); }}>
                  <SelectTrigger><SelectValue placeholder="Choisir une classe" /></SelectTrigger>
                  <SelectContent>
                    {classes.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name} — {c.level}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}

            {mode === "eleve" && (
              <div>
                <Label>Élève</Label>
                <Select value={studentId} onValueChange={setStudentId}>
                  <SelectTrigger><SelectValue placeholder="Choisir un élève" /></SelectTrigger>
                  <SelectContent>
                    {students.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.full_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div>
              <Label>Période</Label>
              <Select value={period} onValueChange={setPeriod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {BULLETIN_PERIODS.map((p) => <SelectItem key={p.v} value={p.v}>{p.l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Type d'évaluation</Label>
              <Select value={evalType} onValueChange={setEvalType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous les types</SelectItem>
                  {evalTypes.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Matière</Label>
              <Select value={subjectId} onValueChange={setSubjectId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toutes les matières</SelectItem>
                  {subjects.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {ready && (
            <div className="flex flex-wrap gap-2">
              <Button onClick={handlePrint} className="gap-2"><Printer className="size-4" />Imprimer</Button>
              <Button onClick={handleExportPDF} variant="outline" className="gap-2"><FileDown className="size-4" />Export PDF</Button>
              <Button onClick={handleExportExcel} variant="outline" className="gap-2"><FileSpreadsheet className="size-4" />Export Excel</Button>
            </div>
          )}
        </CardContent>
      </Card>

      {ready && (
        <div className="analysis-print bg-white rounded-2xl border border-slate-200 shadow-sm p-8 max-w-5xl mx-auto">
          <div className="text-center mb-4">
            {logoUrl && <img src={logoUrl} alt="Logo" className="h-16 w-16 object-contain mx-auto mb-2" />}
            <div className="font-bold text-lg uppercase">{school?.name ?? "MBGEduGuinée"}</div>
            <div className="text-xs text-slate-500">Année scolaire {academicYear || "—"}</div>
            <h2 className="font-bold text-xl uppercase mt-3">{title}</h2>
            <div className="text-sm text-slate-600">
              {periodLabel(period)}
              {evalType !== "all" && ` · ${evalType}`}
              {subjectId !== "all" && ` · ${subjects.find((s: any) => s.id === subjectId)?.name ?? ""}`}
              {` · Barème / ${maxScore}`}
            </div>
          </div>

          {/* ---------------- CLASSE ---------------- */}
          {mode === "classe" && classRes && (
            <>
              <Section title="Informations générales">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                  <StatCard label="Classe" value={baseClass?.name} sub={baseClass?.level} />
                  <StatCard label="Effectif" value={classRes.effectif} sub={`${classRes.graded} élève(s) avec notes`} />
                  <StatCard label="Moyenne de la classe" value={fmt(classRes.average)} />
                  <StatCard label="Évolution" value={<TrendBadge trend={classRes.trend} delta={classRes.deltaVsPrevious} />} />
                </div>
              </Section>
              <Section title="Statistiques de la classe">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <StatCard label="Meilleure moyenne" value={fmt(classRes.best)} />
                  <StatCard label="Moyenne la plus faible" value={fmt(classRes.lowest)} />
                  <StatCard label="Médiane" value={fmt(classRes.median)} />
                  <StatCard label="Taux de réussite" value={pct(classRes.passRate)} />
                  <StatCard label={`Moyenne atteinte (≥ ${th})`} value={classRes.passCount} />
                  <StatCard label={`Sous la moyenne (< ${th})`} value={classRes.failCount} />
                  <StatCard label="Taux de présence" value={attRate == null ? "—" : pct(attRate)} sub="toutes dates enregistrées" />
                </div>
              </Section>
              <Section title="Progression de la classe">
                <LineChart points={classRes.progression.map((p) => ({ label: p.period, value: p.average }))} max={maxScore} />
                {classRes.progression.length < 2 && (
                  <p className="text-xs text-slate-500 mt-1">Une seule période contient des notes : la progression apparaîtra dès qu'une deuxième sera saisie.</p>
                )}
              </Section>
              <Section title="Analyse par matière">
                <DataTable head={["Matière", "Moyenne de la classe", "Meilleure note", "Plus faible note", "Taux de réussite"]}>
                  {classRes.subjects.filter((s) => s.graded > 0).map((s) => (
                    <tr key={s.subject.id}>
                      <Td bold>{s.subject.name}</Td><Td>{fmt(s.average)}</Td><Td>{fmt(s.best)}</Td><Td>{fmt(s.lowest)}</Td><Td>{pct(s.passRate)}</Td>
                    </tr>
                  ))}
                </DataTable>
              </Section>
              <Section title="Tableau de synthèse">
                <DataTable head={["Rang", "Élève", ...classRes.subjects.filter((s) => s.graded > 0).map((s) => s.subject.name), "Moyenne générale"]}>
                  {classRes.ranked.map((r) => (
                    <tr key={r.student.id}>
                      <Td bold>{r.rank ?? "—"}</Td>
                      <Td>{r.student.full_name}</Td>
                      {classRes.subjects.filter((s) => s.graded > 0).map((s) => (
                        <Td key={s.subject.id}>{fmt(r.perSubject.find((p) => p.subject.id === s.subject.id)?.avg)}</Td>
                      ))}
                      <Td bold>{fmt(r.avg)}</Td>
                    </tr>
                  ))}
                </DataTable>
              </Section>
            </>
          )}

          {/* ---------------- NIVEAU ---------------- */}
          {mode === "niveau" && levelRes && (
            <>
              <Section title="Vue d'ensemble du niveau">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <StatCard label="Effectif total" value={levelRes.effectifTotal} sub={`${levelRes.classes.length} classe(s)`} />
                  <StatCard label="Moyenne du niveau" value={fmt(levelRes.overall.average)} />
                  <StatCard label="Taux de réussite global" value={pct(levelRes.overall.passRate)} />
                  <StatCard label="Évolution" value={<TrendBadge trend={levelRes.overall.trend} delta={levelRes.overall.deltaVsPrevious} />} />
                  <StatCard label="Meilleure classe" value={levelRes.bestClass?.name ?? "—"} sub={levelRes.bestClass ? fmt(levelRes.bestClass.average) : undefined} />
                  <StatCard
                    label="Accompagnement conseillé"
                    value={levelRes.needsSupportClass?.name ?? "—"}
                    sub={levelRes.needsSupportClass ? fmt(levelRes.needsSupportClass.average) : "Au moins 2 classes requises"}
                  />
                </div>
              </Section>
              <Section title="Comparaison des classes">
                <DataTable head={["Classe", "Effectif", "Moyenne", "Taux de réussite"]}>
                  {levelRes.classes.map((c) => (
                    <tr key={c.classId}><Td bold>{c.name}</Td><Td>{c.effectif}</Td><Td>{fmt(c.average)}</Td><Td>{pct(c.passRate)}</Td></tr>
                  ))}
                </DataTable>
                <div className="mt-3 space-y-1.5">
                  {levelRes.classes.map((c) => <BarRow key={c.classId} label={c.name} value={c.average} max={maxScore} />)}
                </div>
              </Section>
              <Section title="Progression du niveau">
                <LineChart points={levelRes.overall.progression.map((p) => ({ label: p.period, value: p.average }))} max={maxScore} />
              </Section>
              <Section title="Moyenne par matière">
                <DataTable head={["Matière", "Moyenne du niveau", "Meilleure", "Plus faible", "Taux de réussite"]}>
                  {levelRes.overall.subjects.filter((s) => s.graded > 0).map((s) => (
                    <tr key={s.subject.id}><Td bold>{s.subject.name}</Td><Td>{fmt(s.average)}</Td><Td>{fmt(s.best)}</Td><Td>{fmt(s.lowest)}</Td><Td>{pct(s.passRate)}</Td></tr>
                  ))}
                </DataTable>
              </Section>
              <p className="text-[10px] text-slate-500 mt-4">
                Comparaison pédagogique et statistique : aucun nom d'élève n'est présenté dans ce rapport.
              </p>
            </>
          )}

          {/* ---------------- ÉLÈVE ---------------- */}
          {mode === "eleve" && studentRes && (
            <>
              <Section title="Identité">
                <div className="flex items-center gap-4 text-sm">
                  {studentRes.student.photo_url && (
                    <img src={studentRes.student.photo_url} alt="" className="h-20 w-20 rounded-lg object-cover border" />
                  )}
                  <div className="grid grid-cols-2 gap-x-8 gap-y-1">
                    <div><span className="text-slate-500">Nom : </span><b>{studentRes.student.full_name}</b></div>
                    <div><span className="text-slate-500">Matricule : </span>{studentRes.student.matricule ?? "—"}</div>
                    <div><span className="text-slate-500">Classe : </span>{baseClass?.name}</div>
                    <div><span className="text-slate-500">Niveau : </span>{baseClass?.level}</div>
                    <div><span className="text-slate-500">Année : </span>{academicYear}</div>
                    <div><span className="text-slate-500">Assiduité : </span>{attRate == null ? "non renseignée" : pct(attRate)}</div>
                  </div>
                </div>
              </Section>
              <Section title="Synthèse">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <StatCard label="Moyenne actuelle" value={fmt(studentRes.currentAverage)} sub={appreciation(studentRes.currentAverage, maxScore)} />
                  <StatCard label="Rang dans la classe" value={studentRes.currentRank ?? "—"} sub={`sur ${students.length}`} />
                  <StatCard label="Meilleure moyenne" value={fmt(studentRes.bestAverage)} />
                  <StatCard label="Évolution" value={<TrendBadge trend={studentRes.trend} delta={studentRes.delta} />} />
                </div>
              </Section>
              <Section title="Progression de la moyenne générale">
                <LineChart points={studentRes.periods.map((p) => ({ label: p.period, value: p.average }))} max={maxScore} />
                {studentRes.periods.length < 2 && (
                  <p className="text-xs text-slate-500 mt-1">Une seule période contient des notes : la courbe se complétera avec les prochaines périodes.</p>
                )}
              </Section>
              <Section title="Moyennes par matière">
                <DataTable head={["Matière", ...studentRes.periods.map((p) => p.period), "Appréciation"]}>
                  {studentRes.subjects.filter((s) => s.current != null).map((s) => (
                    <tr key={s.subject.id}>
                      <Td bold>{s.subject.name}</Td>
                      {s.evolution.map((e) => <Td key={e.period}>{fmt(e.avg)}</Td>)}
                      <Td>{appreciation(s.current, maxScore)}</Td>
                    </tr>
                  ))}
                </DataTable>
              </Section>
              <div className="grid md:grid-cols-2 gap-4">
                <Section title="Points forts">
                  {studentRes.strengths.length ? (
                    <ul className="text-sm list-disc pl-5">{studentRes.strengths.map((s: any) => <li key={s.subject.id}>{s.subject.name} — {fmt(s.current)}</li>)}</ul>
                  ) : <p className="text-sm text-slate-500">Aucune matière au-dessus de la moyenne.</p>}
                </Section>
                <Section title="Matières nécessitant une attention">
                  {studentRes.attention.length ? (
                    <ul className="text-sm list-disc pl-5">{studentRes.attention.map((s: any) => <li key={s.subject.id}>{s.subject.name} — {fmt(s.current)}</li>)}</ul>
                  ) : <p className="text-sm text-slate-500">Aucune matière sous la moyenne.</p>}
                </Section>
              </div>
            </>
          )}

          {((mode === "classe" && !classRes) || (mode === "niveau" && !levelRes) || (mode === "eleve" && !studentRes)) && (
            <p className="text-center text-slate-400 p-6">Aucun élève ou aucune note trouvée pour cette sélection.</p>
          )}

          <div className="text-[9px] text-center mt-8 text-slate-500">
            Édité le {new Date().toLocaleDateString("fr-FR")} · Document d'analyse complémentaire au bulletin — généré par MBGEduGuinée
          </div>
        </div>
      )}

      <style>{`
        @media print {
          body * { visibility: hidden; }
          .analysis-print, .analysis-print * { visibility: visible; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .analysis-print { position: absolute; left: 0; top: 0; width: 100%; box-shadow: none; border: none; padding: 0; }
          .no-print { display: none !important; }
          @page { size: A4; margin: 1cm; }
        }
      `}</style>
    </div>
  );
}
