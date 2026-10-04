import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileSpreadsheet, Download, FileDown, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { DataImportPanel } from "@/components/DataImportPanel";
import { ParentAccountsPanel } from "@/components/ParentAccountsPanel";
import { usePerStudentPlan, usePaidStudentIds } from "@/hooks/usePerStudentPlan";
import { getCurrentAcademicYear } from "@/lib/academic-year";
import { EXPORT_LABELS, downloadTemplate, exportData, type ExportFormat, type ExportKind } from "@/lib/data-export";

export const Route = createFileRoute("/_authenticated/import-export")({
  head: () => ({ meta: [{ title: "Import / Export — MBGEduGuinée" }] }),
  component: ImportExportPage,
});

const KINDS: Array<{ kind: ExportKind; desc: string }> = [
  { kind: "classes", desc: "Nom, niveau et frais annuels de chaque classe." },
  { kind: "subjects", desc: "Matières et coefficients." },
  { kind: "students", desc: "Fiche de chaque élève et sa classe actuelle." },
  { kind: "teachers", desc: "Enseignants, contacts et matières enseignées." },
  { kind: "grades", desc: "Notes avec leur barème (sur 10 en primaire, sur 20 au collège et au lycée)." },
];

function ImportExportPage() {
  const { info: plan } = usePerStudentPlan();
  const { isUnlocked } = usePaidStudentIds(plan.schoolId, plan.academicYear, plan.isPerStudent);
  const [format, setFormat] = useState<ExportFormat>("xlsx");
  const [period, setPeriod] = useState("all");
  const [year, setYear] = useState(getCurrentAcademicYear());
  const [busy, setBusy] = useState<ExportKind | null>(null);

  const years = (() => {
    const y = Number(getCurrentAcademicYear().slice(0, 4));
    return [0, 1, 2, 3].map((i) => `${y - i}-${y - i + 1}`);
  })();

  async function run(kind: ExportKind) {
    setBusy(kind);
    try {
      const { count, skipped } = await exportData(kind, format, {
        academicYear: year,
        period: period === "all" ? "" : period,
        isLocked: (id) => plan.isPerStudent && !isUnlocked(id),
      });
      toast.success(`${EXPORT_LABELS[kind]} exportées : ${count} ligne(s).`);
      if (skipped > 0) toast.warning(`${skipped} note(s) non exportée(s) : cotisation de l'élève non validée.`);
    } catch (e: any) {
      toast.error(e?.message ?? "Échec de l'export.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold flex items-center gap-2"><FileSpreadsheet className="size-7" />Import / Export</h1>
        <p className="text-muted-foreground mt-1">Exportez les données de l'établissement et téléchargez les modèles Excel officiels.</p>
      </div>

      <Card>
        <CardContent className="p-4 flex flex-wrap gap-3 items-end">
          <div className="w-40">
            <Label>Format</Label>
            <Select value={format} onValueChange={(v) => setFormat(v as ExportFormat)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="xlsx">Excel (.xlsx)</SelectItem>
                <SelectItem value="csv">CSV (.csv)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="w-44">
            <Label>Année scolaire (notes)</Label>
            <Select value={year} onValueChange={setYear}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{years.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="w-44">
            <Label>Période (notes)</Label>
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes</SelectItem>
                {["T1", "T2", "T3"].map((p) => <SelectItem key={p} value={p}>Trimestre {p[1]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {KINDS.map(({ kind, desc }) => (
          <Card key={kind}>
            <CardHeader>
              <CardTitle>{EXPORT_LABELS[kind]}</CardTitle>
              <CardDescription>{desc}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Button onClick={() => run(kind)} disabled={busy !== null} className="gap-2">
                {busy === kind ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}Exporter
              </Button>
              <Button variant="outline" onClick={() => downloadTemplate(kind)} className="gap-2">
                <FileDown className="size-4" />Modèle Excel
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <DataImportPanel schoolId={plan.schoolId} />
      {plan.schoolId && <ParentAccountsPanel />}

      <p className="text-xs text-muted-foreground">
        Les exports reprennent uniquement les données que votre rôle peut consulter. Les notes des élèves dont la cotisation n'est pas validée ne sont pas exportées. Chaque export est enregistré dans le journal d'activité.
      </p>
    </div>
  );
}
