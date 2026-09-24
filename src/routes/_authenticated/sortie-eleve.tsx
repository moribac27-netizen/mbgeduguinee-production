import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Search } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StudentExitSheet } from "@/components/StudentExitSheet";

export const Route = createFileRoute("/_authenticated/sortie-eleve")({
  head: () => ({ meta: [{ title: "Fiche de sortie — MBGEduGuinée" }] }),
  component: StudentExitPage,
});

function StudentExitPage() {
  const [search, setSearch] = useState("");
  const [studentId, setStudentId] = useState<string | null>(null);
  const { data: students = [], isLoading } = useQuery({
    queryKey: ["student-exit-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("students").select("id,full_name,matricule,class_id,classes(name)").order("full_name");
      if (error) throw error;
      return data ?? [];
    },
  });
  const filtered = students.filter((s: any) => `${s.full_name} ${s.matricule}`.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-6">
      <div><h1 className="font-display text-3xl font-bold">Fiches de sortie</h1><p className="mt-1 text-muted-foreground">Document administratif complet, imprimable en A4.</p></div>
      <div className="grid gap-6 xl:grid-cols-[320px_1fr]">
        <Card className="no-print h-fit"><CardHeader><CardTitle className="text-base">Sélectionner un élève</CardTitle></CardHeader><CardContent>
          <div className="relative mb-3"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" placeholder="Nom ou matricule" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
          <div className="max-h-[60vh] space-y-1 overflow-y-auto">{isLoading ? <p className="p-3 text-sm text-muted-foreground">Chargement…</p> : filtered.map((s: any) => <button key={s.id} type="button" onClick={() => setStudentId(s.id)} className={`w-full rounded-lg border p-3 text-left text-sm transition ${studentId === s.id ? "border-primary bg-primary/5" : "hover:bg-muted"}`}><div className="font-medium">{s.full_name}</div><div className="text-xs text-muted-foreground">{s.matricule} · {s.classes?.name ?? "Sans classe"}</div></button>)}</div>
        </CardContent></Card>
        <div>{studentId ? <StudentExitSheet studentId={studentId} /> : <Card><CardContent className="flex min-h-[420px] items-center justify-center text-center text-muted-foreground">Sélectionnez un élève pour préparer sa fiche de sortie.</CardContent></Card>}</div>
      </div>
    </div>
  );
}
