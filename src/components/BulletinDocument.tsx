import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { maxScoreForLevel } from "@/lib/grading";
import { StudentPhoto } from "@/components/StudentPhoto";
import { BulletinAnalytics } from "@/components/BulletinAnalytics";
import { SchoolLetterhead, SchoolPrintFooter } from "@/components/print/SchoolLetterhead";
import { useSchool } from "@/hooks/useSchool";
import { newDocumentReference } from "@/lib/reports";

export const BULLETIN_PERIODS = [
  { v: "T1", l: "1er Trimestre" },
  { v: "T2", l: "2ème Trimestre" },
  { v: "T3", l: "3ème Trimestre" },
  { v: "S1", l: "1er Semestre" },
  { v: "S2", l: "2ème Semestre" },
  { v: "ANNUAL", l: "Année complète" },
];

export const SCHOOL_YEAR = "—";

export function periodLabel(period: string) {
  return BULLETIN_PERIODS.find((p) => p.v === period)?.l ?? period;
}

export function appreciation(note: number | null, max: 10 | 20 = 20): string {
  if (note == null) return "—";
  const n = max === 10 ? note * 2 : note;
  if (n >= 18) return "Excellent";
  if (n >= 16) return "Très Bien";
  if (n >= 14) return "Bien";
  if (n >= 12) return "Assez Bien";
  if (n >= 10) return "Passable";
  if (n >= 8) return "Insuffisant";
  if (n >= 5) return "Médiocre";
  return "Très faible";
}

export function decision(avg: number | null, level: string, max: 10 | 20 = 20): string {
  if (avg == null) return "—";
  const n = max === 10 ? avg * 2 : avg;
  const isExam = /terminale|3ème|3eme|cm2/i.test(level);
  if (n >= 10) return "Admis(e) en classe supérieure";
  if (n >= 8.5) return isExam ? "Autorisé(e) à composer" : "Passage conditionnel";
  if (n >= 6) return "Redoublement";
  return "Exclusion / Réorientation";
}

export function periodsFor(period: string): string[] {
  if (period === "S1") return ["T1", "T2"];
  if (period === "S2") return ["T3"];
  if (period === "ANNUAL") return ["T1", "T2", "T3"];
  return [period];
}

interface Props {
  studentId: string;
  classId: string;
  period: string;
  /** Enveloppe A4 exacte (aperçu) ou flux normal (page bulletins) */
  paged?: boolean;
}

/**
 * Rendu unique du bulletin : identique à l'écran, à l'aperçu et au PDF A4.
 */
export function BulletinDocument({ studentId, classId, period, paged = false }: Props) {
  const { school, logoUrl } = useSchool();
  const documentRef = useMemo(() => newDocumentReference("BUL"), []);

  const { data: cls } = useQuery({
    queryKey: ["bd-class", classId],
    enabled: !!classId,
    queryFn: async () => (await supabase.from("classes").select("*").eq("id", classId).maybeSingle()).data,
  });

  const { data: subjects = [] } = useQuery({
    queryKey: ["bd-subjects"],
    queryFn: async () => (await supabase.from("subjects").select("*").order("name")).data ?? [],
    staleTime: 5 * 60_000,
  });

  const { data: students = [] } = useQuery({
    queryKey: ["bd-students", classId],
    enabled: !!classId,
    queryFn: async () =>
      (await supabase.from("students").select("*").eq("class_id", classId).order("full_name")).data ?? [],
  });

  const periods = useMemo(() => periodsFor(period), [period]);
  const ids = students.map((s: any) => s.id);

  const { data: allGrades = [] } = useQuery({
    queryKey: ["bd-grades", classId, periods.join(","), ids.length],
    enabled: ids.length > 0,
    queryFn: async () =>
      (await supabase.from("grades").select("*").in("student_id", ids).in("period", periods)).data ?? [],
  });

  const maxScore = maxScoreForLevel(cls?.level);

  const withRank = useMemo(() => {
    const computed = students
      .map((s: any) => {
        const sg = allGrades.filter((g: any) => g.student_id === s.id);
        let totalW = 0,
          totalC = 0;
        const perSubject = subjects.map((sub: any) => {
          const gs = sg.filter((x: any) => x.subject_id === sub.id);
          const avg = gs.length ? gs.reduce((a: number, g: any) => a + Number(g.score), 0) / gs.length : null;
          if (avg != null) {
            totalW += avg * Number(sub.coefficient);
            totalC += Number(sub.coefficient);
          }
          return { subject: sub, avg, appreciation: appreciation(avg, maxScore) };
        });
        const avg = totalC > 0 ? totalW / totalC : null;
        return { student: s, perSubject, avg, totalW, totalC };
      })
      .sort((a, b) => (b.avg ?? -1) - (a.avg ?? -1));
    return computed.map((r, i) => ({ ...r, rank: r.avg != null ? i + 1 : null }));
  }, [students, allGrades, subjects, maxScore]);

  const selected = withRank.find((r) => r.student.id === studentId);
  const rated = withRank.filter((r) => r.avg != null);
  const classAvg = rated.length ? rated.reduce((a, r) => a + (r.avg as number), 0) / rated.length : null;
  const topAvg = rated[0]?.avg ?? null;
  const lowAvg = rated.length ? (rated[rated.length - 1].avg as number) : null;

  if (!selected || !cls) {
    return <div className="p-8 text-center text-sm text-muted-foreground">Chargement du bulletin…</div>;
  }

  const inner = (
    <div className={`bulletin bg-white text-black ${paged ? "p-[12mm]" : "p-8 rounded-2xl border border-slate-200 shadow-sm max-w-5xl mx-auto"}`}>
      {/* En-tête officiel de l'école (dynamique, multi-tenant) */}
      <SchoolLetterhead
        school={school}
        logoUrl={logoUrl}
        title="Bulletin de notes"
        subtitle={periodLabel(period)}
      />

      <div className="mbg-document-heading print-avoid-break">
        <div>
          <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500 font-semibold">Document scolaire officiel</div>
          <h2 className="font-bold text-2xl uppercase text-slate-900 mt-1">Bulletin de notes</h2>
          <div className="text-xs text-slate-500 mt-1">{periodLabel(period)} · Réf. {documentRef}</div>
        </div>
        <div className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[10px] font-semibold text-emerald-800">Document généré</div>
      </div>

      {/* Student info */}
      <div className="flex gap-4 mb-4 rounded-xl border border-slate-200 bg-slate-50/70 p-4 print-avoid-break">
        <StudentPhoto
          path={selected.student.photo_url}
          name={selected.student.full_name}
          size="lg"
          className="rounded-xl ring-0 border border-slate-200 shadow-sm"
        />
        <div className="grid grid-cols-2 gap-2 text-sm flex-1">
          <div><span className="font-semibold">Nom & Prénom :</span> {selected.student.full_name}</div>
          <div><span className="font-semibold">Matricule :</span> {selected.student.matricule}</div>
          <div><span className="font-semibold">Classe :</span> {cls.name} ({cls.level})</div>
          <div><span className="font-semibold">Sexe :</span> {selected.student.gender ?? "—"}</div>
          <div><span className="font-semibold">Date de naissance :</span> {selected.student.birth_date ?? "—"}</div>
          <div><span className="font-semibold">Lieu :</span> {selected.student.birth_place ?? "—"}</div>
        </div>
      </div>

      {/* Grades table */}
      <table className="w-full text-xs border border-slate-200 border-collapse mb-4 overflow-hidden rounded-xl">
        <thead className="bg-emerald-800 text-white">
          <tr>
            <th className="border border-white/20 p-2 text-left">Matière</th>
            <th className="border border-white/20 p-2">Moy.</th>
            <th className="border border-white/20 p-2">Coef.</th>
            <th className="border border-white/20 p-2">Moy. × Coef.</th>
            <th className="border border-white/20 p-2 text-left">Appréciation</th>
          </tr>
        </thead>
        <tbody>
          {selected.perSubject.map((r: any) => (
            <tr key={r.subject.id}>
              <td className="border border-slate-200 p-2">{r.subject.name}</td>
              <td className="border border-slate-200 p-2 text-center">{r.avg != null ? r.avg.toFixed(2) : "—"}</td>
              <td className="border border-slate-200 p-2 text-center">{r.subject.coefficient}</td>
              <td className="border border-slate-200 p-2 text-center">{r.avg != null ? (r.avg * r.subject.coefficient).toFixed(2) : "—"}</td>
              <td className="border border-slate-200 p-2">{r.appreciation}</td>
            </tr>
          ))}
          <tr className="font-bold bg-slate-50">
            <td className="border border-slate-200 p-2">TOTAL</td>
            <td className="border border-slate-200 p-2"></td>
            <td className="border border-slate-200 p-2 text-center">{selected.totalC}</td>
            <td className="border border-slate-200 p-2 text-center">{selected.totalW.toFixed(2)}</td>
            <td className="border border-slate-200 p-2"></td>
          </tr>
        </tbody>
      </table>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-4 mb-4 text-sm">
        <div className="rounded-xl border border-slate-200 p-4 space-y-2 bg-white print-avoid-break">
          <div className="flex justify-between"><span className="font-semibold">Moyenne générale :</span> <span className="font-bold text-base">{selected.avg != null ? selected.avg.toFixed(2) : "—"} / {maxScore}</span></div>
          <div className="flex justify-between"><span className="font-semibold">Rang :</span> <span>{selected.rank ?? "—"} / {withRank.length}</span></div>
          <div className="flex justify-between"><span className="font-semibold">Appréciation :</span> <span>{appreciation(selected.avg, maxScore)}</span></div>
        </div>
        <div className="rounded-xl border border-slate-200 p-4 space-y-2 bg-white print-avoid-break">
          <div className="flex justify-between"><span className="font-semibold">Moyenne de classe :</span> <span>{classAvg != null ? classAvg.toFixed(2) : "—"}</span></div>
          <div className="flex justify-between"><span className="font-semibold">Plus forte moyenne :</span> <span>{topAvg?.toFixed(2) ?? "—"}</span></div>
          <div className="flex justify-between"><span className="font-semibold">Plus faible moyenne :</span> <span>{lowAvg?.toFixed(2) ?? "—"}</span></div>
        </div>
      </div>

      <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 text-sm mb-6 print-avoid-break">
        <span className="font-semibold">Décision du conseil de classe : </span>
        <span className="font-bold">{decision(selected.avg, cls.level, maxScore)}</span>
      </div>

      <BulletinAnalytics studentId={selected.student.id} classId={classId} maxScore={maxScore} />

      {/* Signatures */}
      <div className="grid grid-cols-3 gap-4 text-xs text-center mt-8">
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

      <SchoolPrintFooter school={school} />

      <div className="text-[9px] text-center mt-2 text-slate-500">
        Réf. {documentRef} · Bulletin généré par MBGEduGuinée — {new Date().toLocaleDateString("fr-FR")}
      </div>
    </div>
  );

  if (!paged) return inner;

  // Enveloppe A4 exacte (210mm de large) pour l'aperçu avant impression
  return <div className="a4-page bg-white shadow-lg">{inner}</div>;
}
