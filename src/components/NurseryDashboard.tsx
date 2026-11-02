import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Baby, ClipboardList, CheckCircle2, Sparkles, UserPlus } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

const todayISO = () => new Date().toISOString().slice(0, 10);

/** Tableau de bord de l'éducatrice : ses sections, ses enfants, le suivi du jour et ce qui reste à saisir. */
export function NurseryDashboard() {
  const { user } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ["nursery-dashboard", todayISO()],
    queryFn: async () => {
      const [sections, children, logs, acquired] = await Promise.all([
        supabase.from("nursery_sections" as any).select("id, name"),
        supabase.from("nursery_children" as any).select("id, student_id, section_id"),
        supabase.from("nursery_daily_logs" as any).select("student_id").eq("date", todayISO()),
        supabase.from("nursery_evaluations" as any).select("id", { count: "exact", head: true }).eq("level", "acquis"),
      ]);
      const kids = ((children.data ?? []) as any[]);
      const logged = new Set(((logs.data ?? []) as any[]).map((l) => l.student_id));
      const todoIds = kids.map((k) => k.student_id).filter((id) => !logged.has(id));
      let names: Record<string, string> = {};
      if (todoIds.length) {
        const { data: st } = await supabase.from("students").select("id, full_name").in("id", todoIds.slice(0, 200));
        names = Object.fromEntries((st ?? []).map((s: any) => [s.id, s.full_name]));
      }
      return {
        sections: (sections.data ?? []) as any[],
        children: kids.length,
        logged: kids.length - todoIds.length,
        todo: todoIds.map((id) => ({ id, name: names[id] ?? "Enfant" })),
        acquired: acquired.count ?? 0,
      };
    },
    staleTime: 30_000,
  });

  const firstName = (user?.user_metadata?.full_name as string | undefined)?.split(" ")[0];
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="size-11 rounded-xl bg-chart-2/10 text-chart-2 flex items-center justify-center"><Baby className="size-5" /></div>
          <div>
            <h1 className="font-display text-3xl font-bold">Tableau de bord{firstName ? ` — ${firstName}` : ""}</h1>
            <p className="text-muted-foreground mt-1">Votre journée en maternelle : enfants, suivi quotidien et compétences.</p>
          </div>
        </div>
        <Button asChild><Link to="/maternelle"><UserPlus className="size-4 mr-2" />Ouvrir la Maternelle</Link></Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Mes sections</div><div className="text-2xl font-bold mt-1">{isLoading ? "—" : data?.sections.length ?? 0}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Enfants</div><div className="text-2xl font-bold mt-1">{isLoading ? "—" : data?.children ?? 0}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Suivis saisis aujourd'hui</div><div className="text-2xl font-bold mt-1">{isLoading ? "—" : `${data?.logged ?? 0} / ${data?.children ?? 0}`}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Compétences acquises</div><div className="text-2xl font-bold mt-1">{isLoading ? "—" : data?.acquired ?? 0}</div></CardContent></Card>
      </div>

      {!isLoading && (data?.sections.length ?? 0) === 0 && (
        <Card><CardContent className="p-6 text-sm text-muted-foreground">
          Aucune section ne vous est affectée pour le moment. Demandez à la direction de vous affecter à une classe de Maternelle.
        </CardContent></Card>
      )}

      {!isLoading && (data?.children ?? 0) > 0 && (
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><ClipboardList className="size-5" />Suivi quotidien à saisir</CardTitle></CardHeader>
          <CardContent>
            {(data?.todo.length ?? 0) === 0 ? (
              <p className="flex items-center gap-2 text-sm text-success"><CheckCircle2 className="size-4" />Tous les enfants ont leur suivi du jour.</p>
            ) : (
              <>
                <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {data!.todo.slice(0, 18).map((c) => <li key={c.id} className="rounded-lg border px-3 py-2 text-sm">{c.name}</li>)}
                </ul>
                {data!.todo.length > 18 && <p className="mt-2 text-xs text-muted-foreground">… et {data!.todo.length - 18} autre(s).</p>}
                <Button asChild variant="outline" size="sm" className="mt-3"><Link to="/maternelle"><Sparkles className="size-4 mr-2" />Saisir le suivi</Link></Button>
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
