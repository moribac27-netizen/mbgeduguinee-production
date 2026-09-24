import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Printer, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSchool } from "@/hooks/useSchool";
import { maxScoreForLevel } from "@/lib/grading";
import { fmtMoney } from "@/lib/reports";
import { DocumentFooter, DocumentHeader, DocumentStat, StudentIdentity } from "@/components/documents/DocumentPrimitives";
import { Button } from "@/components/ui/button";

function average(rows: any[]) {
  if (!rows.length) return null;
  let total = 0;
  let weight = 0;
  for (const r of rows) {
    const score = Number(r.score);
    const max = Number(r.max_score || 20);
    const coefficient = Number(r.subjects?.coefficient || 1);
    if (!Number.isFinite(score) || !Number.isFinite(max) || max <= 0) continue;
    total += (score / max) * coefficient;
    weight += coefficient;
  }
  return weight ? (total / weight) * 20 : null;
}

function progression(rows: any[]) {
  const order = ["T1", "T2", "T3", "S1", "S2", "P1", "P2", "P3"];
  const labels = [...new Set(rows.map((r) => String(r.period ?? "")).filter(Boolean))].sort((a, b) => {
    const ai = order.indexOf(a), bi = order.indexOf(b);
    return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
  });
  return labels.map((period) => ({ period, value: average(rows.filter((r) => r.period === period)) })).filter((x) => x.value != null);
}

function LineChart({ points }: { points: { period: string; value: number | null }[] }) {
  if (points.length < 2) return null;
  const w = 640, h = 180, pad = 30;
  const coords = points.map((p, i) => ({
    x: pad + (i * (w - pad * 2)) / (points.length - 1),
    y: h - pad - ((Number(p.value) / 20) * (h - pad * 2)),
  }));
  const path = coords.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
  return (
    <div className="rounded-xl border p-3 print-avoid-break">
      <div className="mb-2 flex items-center justify-between"><span className="text-xs font-bold uppercase tracking-wide text-primary">Progression des moyennes</span><span className="text-[10px] text-muted-foreground">sur 20</span></div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-auto" role="img" aria-label="Courbe de progression des moyennes">
        <line x1={pad} x2={w-pad} y1={h-pad} y2={h-pad} stroke="#d9dfda" />
        <line x1={pad} x2={w-pad} y1={pad} y2={pad} stroke="#eef1ef" />
        <path d={path} fill="none" stroke="#1f6f5c" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        {coords.map((p, i) => <g key={points[i].period}><circle cx={p.x} cy={p.y} r="4" fill="#c99a3d" /><text x={p.x} y={h-8} textAnchor="middle" fontSize="10" fill="#68716b">{points[i].period}</text><text x={p.x} y={p.y-9} textAnchor="middle" fontSize="10" fontWeight="700" fill="#18211d">{Number(points[i].value).toFixed(2)}</text></g>)}
      </svg>
    </div>
  );
}

export function StudentExitSheet({ studentId }: { studentId: string }) {
  const { school, logoUrl } = useSchool();
  const { data, isLoading, error } = useQuery({
    queryKey: ["student-exit-sheet", studentId, school?.academic_year],
    enabled: !!studentId && !!school?.id,
    queryFn: async () => {
      const [{ data: student, error: studentError }, { data: grades, error: gradesError }, { data: payment, error: paymentError }] = await Promise.all([
        supabase.from("students").select("*, classes(name, level)").eq("id", studentId).maybeSingle(),
        supabase.from("grades").select("score,max_score,period,evaluation_type,created_at,subjects(name,coefficient)").eq("student_id", studentId).order("created_at"),
        (supabase as any).from("student_plan_payments").select("status,amount,school_share,reference,receipt_number,validated_at,academic_year").eq("student_id", studentId).eq("academic_year", school?.academic_year ?? "").eq("status", "VALIDATED").maybeSingle(),
      ]);
      if (studentError) throw studentError;
      if (gradesError) throw gradesError;
      if (paymentError) throw paymentError;
      return { student, grades: grades ?? [], payment };
    },
  });

  const ref = useMemo(() => data?.student ? `EXIT-${String(school?.academic_year ?? "").replace(/[^0-9]/g, "")}-${data.student.matricule}` : "", [data?.student, school?.academic_year]);
  const avg = useMemo(() => average(data?.grades ?? []), [data?.grades]);
  const points = useMemo(() => progression(data?.grades ?? []), [data?.grades]);
  const max = maxScoreForLevel(data?.student?.classes?.level);
  const result = avg == null ? "Résultats indisponibles" : avg >= 10 ? "Admis" : "À reprendre / décision du conseil";

  if (isLoading) return <div className="p-8 text-sm text-muted-foreground">Préparation du document…</div>;
  if (error || !data?.student) return <div className="p-8 text-sm text-destructive">Impossible de charger la fiche de sortie.</div>;
  if (!data.payment) return <div className="p-8"><div className="rounded-xl border border-amber-300 bg-amber-50 p-5 text-sm"><b>Document verrouillé.</b> La cotisation annuelle de cet élève n'est pas VALIDATED pour {school?.academic_year ?? "l'année en cours"}. La fiche complète sera disponible après validation.</div></div>;

  return (
    <div className="space-y-4">
      <div className="no-print flex flex-wrap justify-end gap-2"><Button onClick={() => window.print()} className="gap-2"><Printer className="size-4" /> Imprimer / PDF</Button></div>
      <article className="mbg-document-page shadow-sm print:shadow-none">
        <DocumentHeader school={school} logoUrl={logoUrl} title="Fiche de sortie scolaire" subtitle="Document administratif de fin de parcours / transfert" reference={ref} />
        <StudentIdentity student={data.student}>
          <div className="mt-3 flex items-center gap-2 text-xs text-slate-600"><ShieldCheck className="size-4 text-primary" /> Dossier financier VALIDATED · Réf. paiement {data.payment.reference ?? data.payment.receipt_number ?? "—"}</div>
        </StudentIdentity>

        <section className="mbg-document-section">
          <div className="mbg-document-section-title">Synthèse</div>
          <div className="mbg-stat-grid">
            <DocumentStat label="Moyenne générale" value={avg == null ? "—" : `${avg.toFixed(2)} / 20`} tone={avg != null && avg >= 10 ? "success" : "default"} />
            <DocumentStat label="Résultat" value={result} />
            <DocumentStat label="Cotisation annuelle" value={fmtMoney(Number(data.payment.amount || 50000))} tone="success" />
            <DocumentStat label="Année scolaire" value={school?.academic_year ?? "—"} />
          </div>
        </section>

        <section className="mbg-document-section">
          <div className="mbg-document-section-title">Situation administrative</div>
          <table className="mbg-document-table"><tbody>
            <tr><th className="w-1/4">Élève</th><td>{data.student.full_name}</td><th className="w-1/4">Matricule</th><td>{data.student.matricule}</td></tr>
            <tr><th>Classe</th><td>{data.student.classes?.name ?? "—"}</td><th>Niveau</th><td>{data.student.classes?.level ?? "—"}</td></tr>
            <tr><th>Parent / tuteur</th><td>{data.student.parent_name ?? "—"}</td><th>Téléphone</th><td>{data.student.parent_phone ?? "—"}</td></tr>
            <tr><th>Statut de sortie</th><td colSpan={3}>À compléter par l'établissement selon le motif administratif de sortie.</td></tr>
          </tbody></table>
        </section>

        <section className="mbg-document-section">
          <div className="mbg-document-section-title">Résultats scolaires</div>
          <table className="mbg-document-table"><thead><tr><th>Matière</th><th>Période</th><th>Évaluation</th><th>Note</th><th>Coefficient</th></tr></thead><tbody>
            {(data.grades ?? []).slice(0, 40).map((g: any) => <tr key={g.id ?? `${g.period}-${g.subjects?.name}-${g.created_at}`}><td>{g.subjects?.name ?? "—"}</td><td>{g.period ?? "—"}</td><td>{g.evaluation_type ?? "—"}</td><td>{Number(g.score).toFixed(2)} / {Number(g.max_score || max)}</td><td>{Number(g.subjects?.coefficient || 1)}</td></tr>)}
            {(data.grades ?? []).length === 0 && <tr><td colSpan={5} className="text-center">Aucune note enregistrée.</td></tr>}
          </tbody></table>
        </section>

        {points.length >= 2 && <section className="mbg-document-section"><LineChart points={points} /></section>}

        <section className="mbg-document-section">
          <div className="mbg-document-section-title">Observations et décision</div>
          <div className="min-h-20 rounded-xl border p-4 text-sm">Observations : ........................................................................................................................................<br /><br />Décision / motif de sortie : ............................................................................................................................</div>
        </section>

        <div className="mbg-signature-grid"><div><div className="mbg-signature-box">Le responsable administratif</div></div><div><div className="mbg-signature-box">Cachet de l'établissement</div></div><div><div className="mbg-signature-box">Le Directeur</div></div></div>
        <DocumentFooter reference={ref} />
      </article>
    </div>
  );
}
