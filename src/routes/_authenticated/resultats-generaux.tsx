import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Printer, FileDown, FileSpreadsheet } from "lucide-react";
import { useSchool } from "@/hooks/useSchool";
import { usePerStudentPlan } from "@/hooks/usePerStudentPlan";
import { maxScoreForLevel } from "@/lib/grading";
import {
  BULLETIN_PERIODS,
  periodLabel,
  appreciation,
  decision,
  periodsFor,
  computeRanking,
} from "@/lib/rankings";
import { exportPDF, exportExcel, type ExportColumn } from "@/lib/reports";
import { logActivity } from "@/lib/audit";

export const Route = createFileRoute("/_authenticated/resultats-generaux")({
  head: () => ({
    meta: [
      { title: "Listes générales des résultats — MBGEduGuinée" },
      { name: "description", content: "Listes de classement imprimables par classe ou par niveau, conformes au barème 10/20 du système guinéen." },
    ],
  }),
  component: ResultatsGenerauxPage,
});

type Mode = "classe" | "niveau";
type NiveauFilter = "Primaire" | "Collège" | "Lycée" | "Collège+Lycée";

function ResultatsGenerauxPage() {
  const { school, logoUrl } = useSchool();
  const { info: planInfo } = usePerStudentPlan();
  const academicYear = planInfo.academicYear;

  const [mode, setMode] = useState<Mode>("classe");
  const [period, setPeriod] = useState("T1");
  const [classId, setClassId] = useState("");
  const [niveau, setNiveau] = useState<NiveauFilter>("Primaire");

  const { data: classes = [] } = useQuery({
    queryKey: ["rg-classes"],
    queryFn: async () => (await supabase.from("classes").select("*").order("name")).data ?? [],
  });

  const classById = useMemo(() => new Map(classes.map((c: any) => [c.id, c])), [classes]);

  const targetClassIds = useMemo(() => {
    if (mode === "classe") return classId ? [classId] : [];
    const levels = niveau === "Collège+Lycée" ? ["Collège", "Lycée"] : [niveau];
    return classes.filter((c: any) => levels.includes(c.level)).map((c: any) => c.id);
  }, [mode, classId, niveau, classes]);

  const { data: students = [] } = useQuery({
    queryKey: ["rg-students", targetClassIds.join(",")],
    enabled: targetClassIds.length > 0,
    queryFn: async () =>
      (await supabase.from("students").select("*").in("class_id", targetClassIds).order("full_name")).data ?? [],
  });

  const { data: subjects = [] } = useQuery({
    queryKey: ["rg-subjects"],
    queryFn: async () => (await supabase.from("subjects").select("*").order("name")).data ?? [],
    staleTime: 5 * 60_000,
  });

  const periods = useMemo(() => periodsFor(period), [period]);
  const ids = students.map((s: any) => s.id);

  const { data: grades = [] } = useQuery({
    queryKey: ["rg-grades", ids.join(","), periods.join(","), academicYear],
    enabled: ids.length > 0 && !!academicYear,
    queryFn: async () =>
      (
        await supabase
          .from("grades")
          .select("*")
          .in("student_id", ids)
          .in("period", periods)
          .eq("academic_year", academicYear)
      ).data ?? [],
  });

  // Primaire = /10 partout. Collège, Lycée, et Collège+Lycée fusionnés = /20
  // (même barème, donc aucune conversion nécessaire pour les fusionner).
  const maxScore: 10 | 20 =
    mode === "classe" ? maxScoreForLevel(classById.get(classId)?.level) : niveau === "Primaire" ? 10 : 20;

  const ranking = useMemo(
    () => computeRanking(students, grades, subjects, maxScore),
    [students, grades, subjects, maxScore],
  );

  const selectedClassLabel = classId ? classById.get(classId)?.name ?? "" : "";
  const title =
    mode === "classe"
      ? `Liste générale des résultats — ${selectedClassLabel}`
      : `Classement général — ${niveau === "Collège+Lycée" ? "Collège + Lycée (établissement)" : niveau}`;

  const columns: ExportColumn[] = useMemo(() => {
    const cols: ExportColumn[] = [
      { key: "rank", label: "Rang" },
      { key: "name", label: "Nom et prénom" },
      { key: "matricule", label: "Matricule" },
    ];
    if (mode === "niveau") cols.push({ key: "className", label: "Classe" });
    cols.push(
      { key: "avg", label: `Moyenne / ${maxScore}` },
      { key: "mention", label: "Mention" },
      { key: "statut", label: "Statut" },
    );
    return cols;
  }, [mode, maxScore]);

  const rows = useMemo(
    () =>
      ranking.map((r) => {
        const cls = classById.get(r.student.class_id);
        return {
          rank: r.rank ?? "—",
          name: r.student.full_name,
          matricule: r.student.matricule ?? "—",
          className: cls ? `${cls.name} (${cls.level})` : "—",
          avg: r.avg != null ? r.avg.toFixed(2) : "—",
          mention: appreciation(r.avg, maxScore),
          statut: decision(r.avg, cls?.level ?? niveau, maxScore),
        };
      }),
    [ranking, classById, maxScore, niveau],
  );

  function handlePrint() {
    void logActivity({
      action: "print",
      entity_type: "liste_generale_resultats",
      entity_id: mode === "classe" ? classId : niveau,
      entity_label: title,
      metadata: { periode: periodLabel(period), academicYear },
    });
    window.print();
  }

  function handleExportPDF() {
    void logActivity({
      action: "export_pdf",
      entity_type: "liste_generale_resultats",
      entity_id: mode === "classe" ? classId : niveau,
      entity_label: title,
      metadata: { periode: periodLabel(period), academicYear },
    });
    exportPDF(title, rows, columns, {
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
    exportExcel(title, rows, columns, title.slice(0, 30));
  }

  const ready = (mode === "classe" && !!classId) || mode === "niveau";

  return (
    <div className="space-y-6">
      <div className="no-print">
        <h1 className="font-display text-3xl font-bold">Listes générales des résultats</h1>
        <p className="text-muted-foreground mt-1">
          Listes et classements imprimables par classe ou par niveau — année scolaire {academicYear || "—"}.
        </p>
      </div>

      <Card className="no-print">
        <CardContent className="p-4 space-y-4">
          <div className="flex gap-2">
            <Button variant={mode === "classe" ? "default" : "outline"} onClick={() => setMode("classe")}>
              Par classe
            </Button>
            <Button variant={mode === "niveau" ? "default" : "outline"} onClick={() => setMode("niveau")}>
              Classement par niveau
            </Button>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <div>
              <Label>Période</Label>
              <Select value={period} onValueChange={setPeriod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {BULLETIN_PERIODS.map((p) => (
                    <SelectItem key={p.v} value={p.v}>{p.l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {mode === "classe" ? (
              <div>
                <Label>Classe</Label>
                <Select value={classId} onValueChange={setClassId}>
                  <SelectTrigger><SelectValue placeholder="Choisir une classe" /></SelectTrigger>
                  <SelectContent>
                    {classes.map((c: any) => (
                      <SelectItem key={c.id} value={c.id}>{c.name} — {c.level}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div>
                <Label>Niveau</Label>
                <Select value={niveau} onValueChange={(v) => setNiveau(v as NiveauFilter)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Primaire">Primaire (sur 10)</SelectItem>
                    <SelectItem value="Collège">Collège (sur 20)</SelectItem>
                    <SelectItem value="Lycée">Lycée (sur 20)</SelectItem>
                    <SelectItem value="Collège+Lycée">Collège + Lycée — établissement (sur 20)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
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
        <div className="results-print bg-white rounded-2xl border border-slate-200 shadow-sm p-8 max-w-5xl mx-auto">
          <div className="text-center mb-6">
            {logoUrl && <img src={logoUrl} alt="Logo" className="h-16 w-16 object-contain mx-auto mb-2" />}
            <div className="font-bold text-lg uppercase">{school?.name ?? "MBGEduGuinée"}</div>
            <div className="text-xs text-slate-500">Année scolaire {academicYear || "—"}</div>
            <h2 className="font-bold text-xl uppercase mt-3">Liste générale des résultats</h2>
            <div className="text-sm text-slate-600">{title} · {periodLabel(period)}</div>
          </div>

          <table className="w-full text-xs border border-slate-200 border-collapse overflow-hidden rounded-xl">
            <thead className="bg-emerald-800 text-white">
              <tr>
                {columns.map((c) => (
                  <th key={c.key} className="border border-white/20 p-2 text-left">{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r: any, i: number) => (
                <tr key={i}>
                  {columns.map((c) => (
                    <td key={c.key} className="border border-slate-200 p-2">{r[c.key]}</td>
                  ))}
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={columns.length} className="p-4 text-center text-slate-400">
                    Aucun élève trouvé pour cette sélection.
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          <div className="grid grid-cols-3 gap-4 text-xs text-center mt-10">
            <div>
              <div className="font-semibold mb-12">Le Titulaire</div>
              <div className="border-t border-black pt-1">Signature</div>
            </div>
            <div>
              <div className="font-semibold mb-2">Cachet de l'établissement</div>
              <div className="mx-auto size-24 rounded-full border-2 border-dashed border-gray-500 flex items-center justify-center text-[10px] text-gray-500">
                CACHET
              </div>
            </div>
            <div>
              <div className="font-semibold mb-12">Le Directeur</div>
              <div className="border-t border-black pt-1">Signature</div>
            </div>
          </div>

          <div className="text-[9px] text-center mt-6 text-slate-500">
            Édité le {new Date().toLocaleDateString("fr-FR")} · Document généré par MBGEduGuinée
          </div>
        </div>
      )}

      <style>{`
        @media print {
          body * { visibility: hidden; }
          .results-print, .results-print * { visibility: visible; }
          .results-print { position: absolute; left: 0; top: 0; width: 100%; box-shadow: none; border: none; }
          .no-print { display: none !important; }
          @page { size: A4; margin: 1cm; }
        }
      `}</style>
    </div>
  );
}
