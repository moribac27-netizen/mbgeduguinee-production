import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Printer, FileSpreadsheet, Loader2, Lock } from "lucide-react";
import { toast } from "sonner";
import { maxScoreForLevel } from "@/lib/grading";
import { exportExcel, exportPDF } from "@/lib/reports";
import { usePdfMeta } from "@/hooks/usePdfMeta";
import { usePerStudentPlan, usePaidStudentIds } from "@/hooks/usePerStudentPlan";


export const Route = createFileRoute("/_authenticated/rapports")({
  component: RapportsPage,
  head: () => ({ meta: [{ title: "Rapports & Exports — MBGEduGuinée" }] }),
});

type Row = Record<string, any>;

const fmtGNF = (n: number) =>
  new Intl.NumberFormat("fr-FR").format(Math.round(n || 0)) + " GNF";

function toCSV(rows: Row[], headers: { key: string; label: string }[]) {
  const esc = (v: any) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = headers.map((h) => esc(h.label)).join(";");
  const body = rows.map((r) => headers.map((h) => esc(r[h.key])).join(";")).join("\n");
  return "\uFEFF" + head + "\n" + body;
}

function downloadCSV(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function RapportsPage() {
  const [tab, setTab] = useState("eleves");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between print:hidden">
        <div>
          <h1 className="text-3xl font-display font-bold">Rapports & Exports</h1>
          <p className="text-muted-foreground">
            Générez et téléchargez des rapports professionnels (CSV / PDF).
          </p>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex flex-wrap h-auto print:hidden">
          <TabsTrigger value="eleves">Élèves</TabsTrigger>
          <TabsTrigger value="enseignants">Enseignants</TabsTrigger>
          <TabsTrigger value="classes">Classes</TabsTrigger>
          <TabsTrigger value="notes">Notes</TabsTrigger>
          <TabsTrigger value="bulletins">Bulletins</TabsTrigger>
          <TabsTrigger value="paiements">Paiements</TabsTrigger>
          <TabsTrigger value="presences">Présences</TabsTrigger>
          <TabsTrigger value="finance">Comptabilité</TabsTrigger>
          <TabsTrigger value="salaires">Salaires</TabsTrigger>
        </TabsList>
        <TabsContent value="eleves"><ElevesReport /></TabsContent>
        <TabsContent value="enseignants"><EnseignantsReport /></TabsContent>
        <TabsContent value="classes"><ClassesReport /></TabsContent>
        <TabsContent value="notes"><NotesReport /></TabsContent>
        <TabsContent value="bulletins"><BulletinsReport /></TabsContent>
        <TabsContent value="paiements"><PaiementsReport /></TabsContent>
        <TabsContent value="presences"><PresencesReport /></TabsContent>
        <TabsContent value="finance"><FinanceReport /></TabsContent>
        <TabsContent value="salaires"><SalairesReport /></TabsContent>

      </Tabs>
    </div>
  );
}

function ReportShell({
  title,
  filters,
  onExportCSV,
  rows,
  columns,
  loading,
  extra,
}: {
  title: string;
  filters?: React.ReactNode;
  onExportCSV: () => void;
  rows: Row[];
  columns: { key: string; label: string; render?: (v: any, r: Row) => React.ReactNode }[];
  loading?: boolean;
  extra?: React.ReactNode;
}) {
  const pdfMeta = usePdfMeta();
  return (
    <Card>
      <CardHeader className="print:hidden">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <CardTitle>{title}</CardTitle>
          <div className="flex gap-2 flex-wrap">
            <Button
              variant="outline"
              disabled={!rows.length}
              onClick={() => exportPDF(title, rows, columns.map((c) => ({ key: c.key, label: c.label })), pdfMeta)}
            >
              <Printer className="size-4 mr-2" /> PDF
            </Button>
            <Button
              variant="outline"
              disabled={!rows.length}
              onClick={() => exportExcel(title, rows, columns.map((c) => ({ key: c.key, label: c.label })), title)}
            >
              <FileSpreadsheet className="size-4 mr-2" /> Excel
            </Button>
            <Button variant="outline" onClick={onExportCSV} disabled={!rows.length}>
              <FileSpreadsheet className="size-4 mr-2" /> CSV
            </Button>
          </div>

        </div>
        {filters && <div className="grid gap-3 md:grid-cols-4 mt-4">{filters}</div>}
      </CardHeader>
      <CardContent>
        <div className="print:block hidden mb-4">
          <h2 className="text-xl font-bold">{title}</h2>
          <p className="text-sm text-muted-foreground">
            Généré le {new Date().toLocaleString("fr-FR")}
          </p>
        </div>
        {extra}
        {loading ? (
          <div className="py-12 flex justify-center"><Loader2 className="animate-spin" /></div>
        ) : rows.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground text-sm">Aucune donnée.</div>
        ) : (
          <div className="overflow-x-auto border rounded-lg">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  {columns.map((c) => (
                    <th key={c.key} className="text-left px-3 py-2 font-medium">{c.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-t">
                    {columns.map((c) => (
                      <td key={c.key} className="px-3 py-2">
                        {c.render ? c.render(r[c.key], r) : r[c.key] ?? "—"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="mt-3 text-xs text-muted-foreground">{rows.length} ligne(s)</div>
      </CardContent>
    </Card>
  );
}

/* ---------------- Élèves ---------------- */
function ElevesReport() {
  const [rows, setRows] = useState<Row[]>([]);
  const [classes, setClasses] = useState<Row[]>([]);
  const [classId, setClassId] = useState<string>("all");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.from("classes").select("id,name").order("name").then(({ data }) => setClasses(data || []));
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      let q = supabase
        .from("students")
        .select("full_name,gender,birth_date,birth_place,matricule,status,parent_name,parent_phone,classes(name)")
        .order("full_name");
      if (classId !== "all") q = q.eq("class_id", classId);
      const { data } = await q;
      setRows(
        (data || []).map((s: any) => ({
          matricule: s.matricule,
          nom: s.full_name,
          genre: s.gender,
          naissance: s.birth_date,
          lieu: s.birth_place,
          classe: s.classes?.name,
          parent: s.parent_name,
          telephone: s.parent_phone,
          statut: s.status,
        })),
      );
      setLoading(false);
    })();
  }, [classId]);

  const columns = [
    { key: "matricule", label: "Matricule" },
    { key: "nom", label: "Nom et prénoms" },
    { key: "genre", label: "Genre" },
    { key: "naissance", label: "Naissance" },
    { key: "lieu", label: "Lieu" },
    { key: "classe", label: "Classe" },
    { key: "parent", label: "Parent" },
    { key: "telephone", label: "Téléphone" },
    { key: "statut", label: "Statut" },
  ];


  return (
    <ReportShell
      title="Liste des élèves"
      loading={loading}
      rows={rows}
      columns={columns}
      onExportCSV={() => downloadCSV("eleves.csv", toCSV(rows, columns))}
      filters={
        <div>
          <Label>Classe</Label>
          <Select value={classId} onValueChange={setClassId}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes les classes</SelectItem>
              {classes.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      }
    />
  );
}

/* ---------------- Notes ---------------- */
function NotesReport() {
  const [rows, setRows] = useState<Row[]>([]);
  const [classes, setClasses] = useState<Row[]>([]);
  const [classId, setClassId] = useState<string>("all");
  const [term, setTerm] = useState<string>("all");
  const [loading, setLoading] = useState(false);
  const [excludedCount, setExcludedCount] = useState(0);

  const { info: planInfo } = usePerStudentPlan();
  const { paidIds } = usePaidStudentIds(planInfo.schoolId, planInfo.academicYear, planInfo.isPerStudent);

  useEffect(() => {
    supabase.from("classes").select("id,name,level").order("name").then(({ data }) => setClasses(data || []));
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      let q = supabase
        .from("grades")
        .select("score,max_score,period,evaluation_type,student_id,students(full_name,class_id,classes(name,level)),subjects(name)")
        .order("created_at", { ascending: false });
      if (term !== "all") q = q.eq("period", term);
      const { data } = await q;
      let mapped = (data || []).map((g: any) => {
        const level = g.students?.classes?.level;
        const base = maxScoreForLevel(level);
        return {
          studentId: g.student_id,
          eleve: g.students?.full_name ?? "",
          classe: g.students?.classes?.name,
          niveau: level ?? "",
          classId: g.students?.class_id,
          matiere: g.subjects?.name,
          type: g.evaluation_type,
          periode: g.period,
          note: g.score,
          base: `/${base}`,
          max: g.max_score ?? base,
        };
      });
      if (classId !== "all") mapped = mapped.filter((r) => r.classId === classId);

      // Exclusion des élèves n'ayant pas réglé leur cotisation (plan par élève)
      let excluded = 0;
      if (planInfo.isPerStudent) {
        const before = mapped.length;
        mapped = mapped.filter((r) => paidIds.has(r.studentId));
        excluded = before - mapped.length;
      }
      setExcludedCount(excluded);
      setRows(mapped);
      setLoading(false);
    })();
  }, [classId, term, planInfo.isPerStudent, paidIds]);

  const columns = [
    { key: "eleve", label: "Élève" },
    { key: "classe", label: "Classe" },
    { key: "niveau", label: "Niveau" },
    { key: "matiere", label: "Matière" },
    { key: "type", label: "Type" },
    { key: "periode", label: "Période" },
    { key: "note", label: "Note" },
    { key: "base", label: "Base" },
    { key: "max", label: "Max" },
  ];

  return (
    <ReportShell
      title="Rapport des notes"
      loading={loading}
      rows={rows}
      columns={columns}
      onExportCSV={() => downloadCSV("notes.csv", toCSV(rows, columns))}
      filters={
        <>
          <div>
            <Label>Classe</Label>
            <Select value={classId} onValueChange={setClassId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes</SelectItem>
                {classes.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Période</Label>
            <Select value={term} onValueChange={setTerm}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes</SelectItem>
                <SelectItem value="T1">Trimestre 1</SelectItem>
                <SelectItem value="T2">Trimestre 2</SelectItem>
                <SelectItem value="T3">Trimestre 3</SelectItem>
                <SelectItem value="S1">Semestre 1</SelectItem>
                <SelectItem value="S2">Semestre 2</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </>
      }
      extra={
        excludedCount > 0 ? (
          <p className="mb-3 text-xs text-muted-foreground flex items-center gap-1">
            <Lock className="size-3.5" /> {excludedCount} ligne(s) masquée(s) — cotisation non réglée.
          </p>
        ) : undefined
      }
    />
  );
}

/* ---------------- Paiements ---------------- */
function PaiementsReport() {
  const [rows, setRows] = useState<Row[]>([]);
  const [from, setFrom] = useState(new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10));
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("payments")
        .select("amount,paid_at,payment_method,status,receipt_number,payment_type,students(full_name,classes(name))")
        .gte("paid_at", from)
        .lte("paid_at", to + "T23:59:59")
        .order("paid_at", { ascending: false });
      setRows(
        (data || []).map((p: any) => ({
          date: p.paid_at?.slice(0, 10),
          reference: p.receipt_number,
          eleve: p.students?.full_name ?? "",
          classe: p.students?.classes?.name,
          type: p.payment_type,
          methode: p.payment_method,
          statut: p.status,
          montant: p.amount,
        })),
      );
      setLoading(false);
    })();
  }, [from, to]);

  const total = rows.reduce((s, r) => s + Number(r.montant || 0), 0);

  const columns = [
    { key: "date", label: "Date" },
    { key: "reference", label: "Référence" },
    { key: "eleve", label: "Élève" },
    { key: "classe", label: "Classe" },
    { key: "type", label: "Type" },
    { key: "methode", label: "Méthode" },
    { key: "statut", label: "Statut" },
    { key: "montant", label: "Montant", render: (v: number) => fmtGNF(v) },
  ];

  return (
    <ReportShell
      title="Rapport des paiements"
      loading={loading}
      rows={rows}
      columns={columns}
      onExportCSV={() => downloadCSV("paiements.csv", toCSV(rows, columns))}
      filters={
        <>
          <div><Label>Du</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
          <div><Label>Au</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
        </>
      }
      extra={
        <div className="mb-3 p-3 rounded-lg bg-muted/50 text-sm">
          <strong>Total encaissé :</strong> {fmtGNF(total)}
        </div>
      }
    />
  );
}

/* ---------------- Présences ---------------- */
function PresencesReport() {
  const [rows, setRows] = useState<Row[]>([]);
  const [classes, setClasses] = useState<Row[]>([]);
  const [classId, setClassId] = useState<string>("all");
  const [from, setFrom] = useState(new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10));
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.from("classes").select("id,name").order("name").then(({ data }) => setClasses(data || []));
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      let q = supabase
        .from("student_attendance")
        .select("date,status,students(full_name,class_id,classes(name))")
        .gte("date", from)
        .lte("date", to)
        .order("date", { ascending: false });
      const { data } = await q;
      let mapped = (data || []).map((a: any) => ({
        date: a.date,
        eleve: a.students?.full_name ?? "",
        classId: a.students?.class_id,
        classe: a.students?.classes?.name,
        statut: a.status,
      }));
      if (classId !== "all") mapped = mapped.filter((r) => r.classId === classId);
      setRows(mapped);
      setLoading(false);
    })();
  }, [classId, from, to]);

  const stats = useMemo(() => {
    const total = rows.length || 1;
    const present = rows.filter((r) => r.statut === "present").length;
    const absent = rows.filter((r) => r.statut === "absent").length;
    const retard = rows.filter((r) => r.statut === "late").length;
    return { present, absent, retard, taux: ((present / total) * 100).toFixed(1) };
  }, [rows]);

  const columns = [
    { key: "date", label: "Date" },
    { key: "eleve", label: "Élève" },
    { key: "classe", label: "Classe" },
    { key: "statut", label: "Statut" },
  ];

  return (
    <ReportShell
      title="Rapport des présences"
      loading={loading}
      rows={rows}
      columns={columns}
      onExportCSV={() => downloadCSV("presences.csv", toCSV(rows, columns))}
      filters={
        <>
          <div>
            <Label>Classe</Label>
            <Select value={classId} onValueChange={setClassId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes</SelectItem>
                {classes.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div><Label>Du</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
          <div><Label>Au</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
        </>
      }
      extra={
        <div className="mb-3 grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950 text-sm">Présents : <strong>{stats.present}</strong></div>
          <div className="p-3