import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { StudentPhoto } from "@/components/StudentPhoto";
import { StudentPhotoUpload } from "@/components/StudentPhotoUpload";
import { useSignedUrl } from "@/hooks/useSignedUrl";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Printer, Camera, IdCard, Search, Lock } from "lucide-react";
import { toast } from "sonner";
import { usePerStudentPlan, usePaidStudentIds } from "@/hooks/usePerStudentPlan";

export const Route = createFileRoute("/_authenticated/cartes")({
  head: () => ({ meta: [{ title: "Cartes scolaires — MBGEduGuinée" }] }),
  component: CartesPage,
});

function CartesPage() {
  const [classId, setClassId] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [photoOpen, setPhotoOpen] = useState<any>(null);
  const [printFormat, setPrintFormat] = useState<"a4" | "cr80">("a4");

  const { info: planInfo } = usePerStudentPlan();
  const { paidIds } = usePaidStudentIds(planInfo.schoolId, planInfo.academicYear, planInfo.isPerStudent);

  const { data: school } = useQuery({
    queryKey: ["my-school-card"],
    queryFn: async () => {
      const { data: sid } = await supabase.rpc("current_school_id");
      if (!sid) return null;
      return (await supabase.from("schools").select("*").eq("id", sid as any).maybeSingle()).data;
    },
  });
  const { data: classes = [] } = useQuery({
    queryKey: ["classes"],
    queryFn: async () => (await supabase.from("classes").select("id, name, level").order("name")).data ?? [],
  });
  const { data: students = [], refetch } = useQuery({
    queryKey: ["students-cards"],
    queryFn: async () => (await supabase.from("students").select("*, classes(name, level)").order("full_name")).data ?? [],
  });

  function isLocked(studentId: string) {
    return planInfo.isPerStudent && !paidIds.has(studentId);
  }

  const filtered = useMemo(() => {
    return students.filter((s: any) => {
      if (classId !== "all" && s.class_id !== classId) return false;
      if (search && !`${s.full_name} ${s.matricule}`.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [students, classId, search]);

  const filteredSelectable = filtered.filter((s: any) => !isLocked(s.id));
  const selectedStudents = filtered.filter((s: any) => selected[s.id] && !isLocked(s.id));
  const toPrint = selectedStudents.length > 0 ? selectedStudents : filteredSelectable;
  const lockedInView = filtered.length - filteredSelectable.length;

  function toggleAll(v: boolean) {
    const next: Record<string, boolean> = {};
    if (v) filteredSelectable.forEach((s: any) => (next[s.id] = true));
    setSelected(next);
  }

  const logoUrl = useSignedUrl(school?.logo_url);

  function handlePrint() {
    if (toPrint.length === 0) return toast.error("Aucun élève sélectionné (ou tous les élèves visibles ont une cotisation impayée)");
    window.print();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 no-print">
        <div>
          <h1 className="font-display text-3xl font-bold flex items-center gap-2"><IdCard className="size-7" /> Cartes scolaires</h1>
          <p className="text-muted-foreground mt-1">Générez et imprimez les cartes des élèves (format carte de crédit, 10 par page A4).</p>
        </div>
        <div className="flex items-end gap-3">
          <div className="min-w-[220px]">
            <Label>Format d'impression</Label>
            <Select value={printFormat} onValueChange={(v) => setPrintFormat(v as "a4" | "cr80")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="a4">A4 — 10 cartes par page (par défaut)</SelectItem>
                <SelectItem value="cr80">PVC CR80 — 85,6 × 54 mm (imprimante à cartes)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button onClick={handlePrint} className="gap-2"><Printer className="size-4" /> Imprimer ({toPrint.length})</Button>
        </div>
      </div>

      {lockedInView > 0 && (
        <p className="text-sm text-muted-foreground no-print flex items-center gap-1">
          <Lock className="size-3.5" /> {lockedInView} élève(s) affiché(s) ont une cotisation impayée et ne peuvent pas être sélectionnés pour l'impression.
        </p>
      )}

      <Card className="no-print">
        <CardContent className="p-4 space-y-4">
          <div className="grid md:grid-cols-3 gap-3">
            <div>
              <Label>Classe</Label>
              <Select value={classId} onValueChange={setClassId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toutes les classes</SelectItem>
                  {classes.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name} — {c.level}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-2">
              <Label>Rechercher</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <Input className="pl-9" placeholder="Nom ou matricule…" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
            </div>
          </div>

          <div className="border rounded-lg divide-y max-h-[420px] overflow-y-auto">
            <div className="flex items-center gap-3 px-4 py-2 bg-muted/40 text-sm font-medium">
              <Checkbox
                checked={filteredSelectable.length > 0 && filteredSelectable.every((s: any) => selected[s.id])}
                onCheckedChange={(v) => toggleAll(!!v)}
              />
              <span>Tout sélectionner ({filteredSelectable.length} éligible{filteredSelectable.length > 1 ? "s" : ""})</span>
            </div>
            {filtered.map((s: any) => {
              const locked = isLocked(s.id);
              return (
                <div key={s.id} className={"flex items-center gap-3 px-4 py-2" + (locked ? " opacity-60" : "")}>
                  <Checkbox disabled={locked} checked={!!selected[s.id] && !locked} onCheckedChange={(v) => setSelected({ ...selected, [s.id]: !!v })} />
                  <StudentPhoto path={s.photo_url} name={s.full_name} size="sm" />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate flex items-center gap-2">
                      {s.full_name}
                      {locked && <Badge variant="destructive" className="text-[10px] px-1.5 py-0 gap-1"><Lock className="size-3" />Non payé</Badge>}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">{s.matricule} · {s.classes?.name ?? "Sans classe"}</div>
                  </div>
                  <Button variant="outline" size="sm" className="gap-2" onClick={() => setPhotoOpen(s)} disabled={locked}>
                    <Camera className="size-4" /> Photo
                  </Button>
                </div>
              );
            })}
            {filtered.length === 0 && <div className="p-8 text-center text-muted-foreground text-sm">Aucun élève</div>}
          </div>
        </CardContent>
      </Card>

      {printFormat === "cr80" && (
        <p className="text-xs text-muted-foreground no-print">
          Format PVC CR80 : une carte par page, sans marge. Dans la boîte de dialogue d'impression, choisissez l'imprimante à cartes,
          désactivez « Ajuster à la page » (échelle 100 %) et les en-têtes/pieds de page du navigateur.
        </p>
      )}
      <div className={`cards-sheet ${printFormat === "cr80" ? "cards-sheet--cr80" : ""}`}>
        {toPrint.map((s: any) => (
          <SchoolCard key={s.id} student={s} school={school} logoUrl={logoUrl} />
        ))}
      </div>

      <Dialog open={!!photoOpen} onOpenChange={(o) => !o && setPhotoOpen(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Photo — {photoOpen?.full_name}</DialogTitle></DialogHeader>
          {photoOpen && (
            <StudentPhotoUpload
              value={photoOpen.photo_url}
              name={photoOpen.full_name}
              schoolId={photoOpen.school_id}
              onChange={async (path) => {
                const { error } = await supabase.from("students").update({ photo_url: path }).eq("id", photoOpen.id);
                if (error) return toast.error(error.message);
                setPhotoOpen({ ...photoOpen, photo_url: path });
                refetch();
              }}
            />
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPhotoOpen(null)}>Fermer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {printFormat === "cr80" && (
        <style>{`@media print { @page { size: 85.6mm 54mm; margin: 0; } }`}</style>
      )}

      <style>{`
        .cards-sheet {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 8mm;
        }
        @media screen {
          .cards-sheet { padding: 12px; background: #f5f5f5; border-radius: 12px; }
        }
        @media print {
          .cards-sheet { gap: 4mm; padding: 0; background: white; }
          .school-card { break-inside: avoid; page-break-inside: avoid; }
          @page { size: A4; margin: 8mm; }
        }
        .cards-sheet--cr80 { grid-template-columns: repeat(1, minmax(0, 1fr)); justify-items: center; }
        @media print {
          .cards-sheet--cr80 { display: block; gap: 0; padding: 0; }
          .cards-sheet--cr80 .school-card {
            width: 85.6mm; height: 54mm; margin: 0;
            border: none; border-radius: 0; box-shadow: none;
            break-after: page; page-break-after: always;
            -webkit-print-color-adjust: exact; print-color-adjust: exact;
          }
          .cards-sheet--cr80 .school-card:last-child { break-after: auto; page-break-after: auto; }
        }
      `}</style>
    </div>
  );
}

function SchoolCard({ student, school, logoUrl }: { student: any; school: any; logoUrl: string | null }) {
  const photoUrl = useSignedUrl(student.photo_url);
  const primary = school?.theme_primary || "#8B4513";
  const secondary = school?.theme_secondary || "#DAA520";
  const year = school?.academic_year || "—";
  return (
    <div
      className="school-card relative overflow-hidden rounded-xl border shadow-sm bg-white text-black"
      style={{ width: "85.6mm", height: "54mm", padding: "3mm", fontSize: "9px" }}
    >
      <div className="absolute inset-x-0 top-0 h-[12mm] flex items-center gap-2 px-3" style={{ background: `linear-gradient(90deg, ${primary}, ${secondary})`, color: "white" }}>
        {logoUrl ? <img src={logoUrl} alt="" style={{ height: "8mm", width: "8mm", objectFit: "contain", background: "white", borderRadius: 4, padding: 1 }} /> : <div style={{ height: "8mm", width: "8mm" }} />}
        <div className="min-w-0 flex-1">
          <div className="font-bold truncate" style={{ fontSize: "10px", lineHeight: 1.1 }}>{school?.name ?? "École"}</div>
          <div className="truncate opacity-90" style={{ fontSize: "7px" }}>{school?.address ?? ""}</div>
        </div>
        <div className="text-right font-semibold" style={{ fontSize: "8px" }}>CARTE<br />SCOLAIRE</div>
      </div>

      <div className="absolute" style={{ top: "14mm", left: "3mm", width: "22mm", height: "28mm" }}>
        <div className="w-full h-full rounded border overflow-hidden bg-muted flex items-center justify-center">
          {photoUrl ? (
            <img src={photoUrl} alt={student.full_name} className="w-full h-full object-cover" />
          ) : (
            <span className="text-[8px] text-gray-500">Sans photo</span>
          )}
        </div>
      </div>

      <div className="absolute" style={{ top: "14mm", left: "27mm", right: "3mm" }}>
        <div style={{ fontWeight: 700, fontSize: "10px", lineHeight: 1.2 }}>{student.full_name}</div>
        <Row label="Matricule" value={student.matricule} />
        <Row label="Classe" value={student.classes?.name ?? "—"} />
        <Row label="Né(e) le" value={fmt(student.birth_date)} />
        <Row label="À" value={student.birth_place || "—"} />
        <Row label="Sexe" value={student.gender === "F" ? "F" : "M"} />
      </div>

      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between px-3 py-1" style={{ borderTop: `1px dashed ${primary}`, fontSize: "7px", color: "#555" }}>
        <span>Année {year}</span>
        <span className="font-mono">{String(student.id).slice(0, 8).toUpperCase()}</span>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: any }) {
  return (
    <div style={{ display: "flex", gap: 4, marginTop: 1 }}>
      <span style={{ color: "#666", minWidth: "14mm", fontSize: "7px" }}>{label}</span>
      <span style={{ fontSize: "8px", fontWeight: 500 }}>{value}</span>
    </div>
  );
}

function fmt(d: string | null | undefined) {
  if (!d) return "—";
  try { return new Date(d).toLocaleDateString("fr-FR"); } catch { return d; }
}
