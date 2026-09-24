import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  LabelList,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
} from "recharts";
import { TrendingUp, TrendingDown, Minus, Award, Target, BarChart3 } from "lucide-react";

const PERIOD_ORDER = ["T1", "T2", "T3", "S1", "S2", "ANNUAL"];
const PERIOD_LABEL: Record<string, string> = {
  T1: "Trim. 1",
  T2: "Trim. 2",
  T3: "Trim. 3",
  S1: "Sem. 1",
  S2: "Sem. 2",
  ANNUAL: "Année",
};

interface Props {
  studentId: string;
  classId: string;
  maxScore?: 10 | 20;
  /** Affichage compact (espaces parent / élève / enseignant) */
  variant?: "print" | "screen";
}

export function BulletinAnalytics({ studentId, classId, maxScore = 20, variant = "print" }: Props) {
  const { data: subjects = [] } = useQuery({
    queryKey: ["ba-subjects"],
    queryFn: async () => (await supabase.from("subjects").select("id, name, coefficient").order("name")).data ?? [],
    staleTime: 5 * 60_000,
  });

  const { data: classStudents = [] } = useQuery({
    queryKey: ["ba-class-students", classId],
    enabled: !!classId,
    queryFn: async () => (await supabase.from("students").select("id").eq("class_id", classId)).data ?? [],
    staleTime: 60_000,
  });

  const ids = classStudents.map((s: any) => s.id);

  const { data: grades = [] } = useQuery({
    queryKey: ["ba-grades", classId, ids.length],
    enabled: ids.length > 0,
    queryFn: async () =>
      (await supabase.from("grades").select("student_id, subject_id, score, period").in("student_id", ids)).data ?? [],
    staleTime: 60_000,
  });

  const analysis = useMemo(() => {
    const coefOf = new Map<string, number>(subjects.map((s: any) => [s.id, Number(s.coefficient) || 1]));
    const nameOf = new Map<string, string>(subjects.map((s: any) => [s.id, s.name]));

    const periods = Array.from(new Set(grades.map((g: any) => g.period).filter(Boolean))).sort(
      (a: any, b: any) => {
        const ia = PERIOD_ORDER.indexOf(a);
        const ib = PERIOD_ORDER.indexOf(b);
        return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
      },
    ) as string[];

    // moyenne pondérée d'un élève pour une période
    const avgFor = (sid: string, period: string) => {
      const rows = grades.filter((g: any) => g.student_id === sid && g.period === period);
      if (!rows.length) return null;
      const bySubject = new Map<string, number[]>();
      for (const r of rows as any[]) {
        const arr = bySubject.get(r.subject_id) ?? [];
        arr.push(Number(r.score));
        bySubject.set(r.subject_id, arr);
      }
      let tw = 0;
      let tc = 0;
      bySubject.forEach((scores, subId) => {
        const c = coefOf.get(subId) ?? 1;
        tw += (scores.reduce((a, b) => a + b, 0) / scores.length) * c;
        tc += c;
      });
      return tc ? tw / tc : null;
    };

    const timeline = periods.map((p) => {
      const mine = avgFor(studentId, p);
      const all = ids
        .map((sid: string) => ({ sid, avg: avgFor(sid, p) }))
        .filter((x: any) => x.avg != null)
        .sort((a: any, b: any) => (b.avg as number) - (a.avg as number));
      const classAvg = all.length ? all.reduce((a: number, x: any) => a + x.avg, 0) / all.length : null;
      const rank = mine != null ? all.findIndex((x: any) => x.sid === studentId) + 1 : null;
      return {
        period: p,
        label: PERIOD_LABEL[p] ?? p,
        eleve: mine != null ? Number(mine.toFixed(2)) : null,
        classe: classAvg != null ? Number(classAvg.toFixed(2)) : null,
        rang: rank && rank > 0 ? rank : null,
        effectif: all.length,
      };
    });

    const filled = timeline.filter((t) => t.eleve != null);
    const last = filled[filled.length - 1];
    const prev = filled[filled.length - 2];

    // radar : moyennes par matière (dernière période disponible, sinon global)
    const scopePeriod = last?.period;
    const rowsScope = grades.filter(
      (g: any) => g.student_id === studentId && (!scopePeriod || g.period === scopePeriod),
    );
    const bySub = new Map<string, number[]>();
    for (const r of rowsScope as any[]) {
      const arr = bySub.get(r.subject_id) ?? [];
      arr.push(Number(r.score));
      bySub.set(r.subject_id, arr);
    }
    const radar: { matiere: string; note: number }[] = [];
    bySub.forEach((scores, subId) => {
      radar.push({
        matiere: (nameOf.get(subId) ?? "—").slice(0, 14),
        note: Number((scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2)),
      });
    });
    radar.sort((a, b) => b.note - a.note);

    const passMark = maxScore / 2;
    const validated = radar.filter((r) => r.note >= passMark).length;
    const best = radar[0] ?? null;
    const worst = radar[radar.length - 1] ?? null;
    const successRate = radar.length ? Math.round((validated / radar.length) * 100) : 0;
    const delta = last?.eleve != null && prev?.eleve != null ? Number((last.eleve - prev.eleve).toFixed(2)) : null;
    const rankDelta = last?.rang != null && prev?.rang != null ? prev.rang - last.rang : null;

    // Analyse pédagogique automatique
    const notes: string[] = [];
    if (delta != null) {
      if (delta > 0.25) notes.push(`L'élève est en progression : la moyenne générale a augmenté de ${delta.toFixed(2)} point(s) depuis la période précédente.`);
      else if (delta < -0.25) notes.push(`Baisse de régime : la moyenne générale a reculé de ${Math.abs(delta).toFixed(2)} point(s) depuis la période précédente.`);
      else notes.push("Les résultats restent stables par rapport à la période précédente.");
    } else if (last?.eleve != null) {
      notes.push("Première période évaluée : aucune comparaison antérieure disponible.");
    }
    if (rankDelta != null) {
      if (rankDelta > 0) notes.push(`Le rang s'améliore (${rankDelta} place(s) gagnée(s)), passant de la ${prev!.rang}e à la ${last!.rang}e position.`);
      else if (rankDelta < 0) notes.push(`Le rang régresse de ${Math.abs(rankDelta)} place(s) ; une remobilisation est nécessaire.`);
      else notes.push("Le classement dans la classe reste inchangé.");
    }
    if (last?.eleve != null && last?.classe != null) {
      const diff = last.eleve - last.classe;
      notes.push(
        diff >= 0
          ? `Le niveau est supérieur à la moyenne de la classe (+${diff.toFixed(2)} point).`
          : `Le niveau est inférieur à la moyenne de la classe (${diff.toFixed(2)} point).`,
      );
    }
    const strong = radar.filter((r) => r.note >= passMark + maxScore * 0.15).slice(0, 3).map((r) => r.matiere);
    const weak = radar.filter((r) => r.note < passMark).slice(-3).map((r) => r.matiere);
    if (strong.length) notes.push(`Points forts : ${strong.join(", ")}.`);
    if (weak.length) notes.push(`Matières à renforcer en priorité : ${weak.join(", ")}.`);
    if (last?.eleve != null) {
      const n20 = maxScore === 10 ? last.eleve * 2 : last.eleve;
      notes.push(
        n20 >= 14
          ? "Ensemble très satisfaisant : maintenir ce rythme de travail et viser l'excellence."
          : n20 >= 10
            ? "Ensemble satisfaisant : des efforts ciblés sur les matières faibles permettront de consolider les acquis."
            : "Travail insuffisant : un accompagnement renforcé et un suivi régulier à la maison sont recommandés.",
      );
    }

    return { timeline, filled, last, prev, radar, validated, best, worst, successRate, delta, rankDelta, notes };
  }, [grades, subjects, ids.join(","), studentId, maxScore]);

  if (!analysis.filled.length) return null;

  const { timeline, last, radar, validated, best, worst, successRate, delta, notes } = analysis;
  const axisProps = { stroke: "#555", fontSize: 10, tickLine: false } as any;
  const chartH = variant === "print" ? 170 : 220;

  return (
    <section className="bulletin-analytics mt-6 space-y-4">
      <h3 className="text-sm font-bold uppercase tracking-wide border-b border-black/60 pb-1">
        Analyse graphique des performances
      </h3>

      {/* Statistiques rapides */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2 text-center print-avoid-break">
        <QuickStat label="Moyenne actuelle" value={`${last?.eleve?.toFixed(2) ?? "—"}/${maxScore}`} icon={<BarChart3 className="size-3" />} />
        <QuickStat label="Moyenne précédente" value={analysis.prev?.eleve != null ? `${analysis.prev.eleve.toFixed(2)}/${maxScore}` : "—"} />
        <QuickStat label="Évolution" value={delta == null ? "—" : `${delta > 0 ? "+" : ""}${delta.toFixed(2)}`} icon={delta == null ? <Minus className="size-3" /> : delta > 0 ? <TrendingUp className="size-3" /> : delta < 0 ? <TrendingDown className="size-3" /> : <Minus className="size-3" />} />
        <QuickStat label="Rang" value={last?.rang ? `${last.rang}/${last.effectif}` : "—"} icon={<Award className="size-3" />} />
        <QuickStat label="Matières" value={`${radar.length}`} />
        <QuickStat label="Matières validées" value={`${validated}/${radar.length}`} icon={<Target className="size-3" />} />
        <QuickStat label="Meilleure note" value={best ? `${best.note.toFixed(2)}` : "—"} sub={best?.matiere} />
        <QuickStat label="Taux de réussite" value={`${successRate}%`} />
      </div>

      <div className="grid gap-4 md:grid-cols-2 break-inside-avoid">
        {analysis.filled.length >= 2 ? <ChartBox title="Évolution de la moyenne générale">
          <ResponsiveContainer width="100%" height={chartH}>
            <LineChart data={timeline} margin={{ top: 16, right: 12, left: -18, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#ddd" />
              <XAxis dataKey="label" {...axisProps} />
              <YAxis domain={[0, maxScore]} {...axisProps} />
              <Tooltip />
              <Line type="monotone" dataKey="eleve" name="Moyenne" stroke="#1f6f5c" strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} connectNulls>
                <LabelList dataKey="eleve" position="top" fontSize={10} />
              </Line>
            </LineChart>
          </ResponsiveContainer>
        </ChartBox> : null}

        <ChartBox title="Évolution du rang (1 = meilleur)">
          <ResponsiveContainer width="100%" height={chartH}>
            <LineChart data={timeline} margin={{ top: 16, right: 12, left: -18, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#ddd" />
              <XAxis dataKey="label" {...axisProps} />
              <YAxis reversed allowDecimals={false} domain={[1, "dataMax"]} {...axisProps} />
              <Tooltip />
              <Line type="monotone" dataKey="rang" name="Rang" stroke="#8a5a2b" strokeWidth={2} strokeDasharray="5 3" dot={{ r: 3 }} isAnimationActive={false} connectNulls>
                <LabelList dataKey="rang" position="top" fontSize={10} />
              </Line>
            </LineChart>
          </ResponsiveContainer>
        </ChartBox>

        <ChartBox title="Élève vs moyenne de la classe">
          <ResponsiveContainer width="100%" height={chartH}>
            <LineChart data={timeline} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#ddd" />
              <XAxis dataKey="label" {...axisProps} />
              <YAxis domain={[0, maxScore]} {...axisProps} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Line type="monotone" dataKey="eleve" name="Élève" stroke="#1f6f5c" strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} connectNulls />
              <Line type="monotone" dataKey="classe" name="Classe" stroke="#b3261e" strokeWidth={2} strokeDasharray="6 3" dot={{ r: 2 }} isAnimationActive={false} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </ChartBox>

        <ChartBox title="Performance par matière">
          <ResponsiveContainer width="100%" height={chartH}>
            <RadarChart data={radar} outerRadius="72%">
              <PolarGrid stroke="#ccc" />
              <PolarAngleAxis dataKey="matiere" tick={{ fontSize: 9, fill: "#333" }} />
              <PolarRadiusAxis domain={[0, maxScore]} tick={{ fontSize: 8, fill: "#777" }} />
              <Radar name="Notes" dataKey="note" stroke="#1f6f5c" fill="#1f6f5c" fillOpacity={0.25} isAnimationActive={false} />
              <Tooltip />
            </RadarChart>
          </ResponsiveContainer>
        </ChartBox>
      </div>

      <div className="border border-black/20 rounded-lg p-3 text-[11px] leading-relaxed break-inside-avoid bg-slate-50/60">
        <div className="font-bold uppercase mb-1">Analyse automatique</div>
        <ul className="list-disc pl-4 space-y-0.5">
          {notes.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function QuickStat({ label, value, sub, icon }: { label: string; value: string; sub?: string; icon?: React.ReactNode }) {
  return (
    <div className="border border-black/40 rounded-sm px-2 py-1.5">
      <div className="text-[9px] uppercase tracking-wide opacity-70 flex items-center justify-center gap-1">{icon}{label}</div>
      <div className="font-bold text-sm leading-tight">{value}</div>
      {sub ? <div className="text-[9px] opacity-70 truncate">{sub}</div> : null}
    </div>
  );
}

function ChartBox({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border border-black/40 rounded-sm p-2 break-inside-avoid">
      <div className="text-[11px] font-semibold mb-1">{title}</div>
      {children}
    </div>
  );
}
