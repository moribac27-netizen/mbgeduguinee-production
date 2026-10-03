import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, Trash2, Pencil, Eye, ShieldAlert, KeyRound, Copy, Printer } from "lucide-react";
import { toast } from "sonner";
import { StudentPhoto } from "@/components/StudentPhoto";
import { StudentPhotoUpload } from "@/components/StudentPhotoUpload";
import { BulletinPreviewDialog } from "@/components/BulletinPreviewDialog";
import { usePerStudentPlan, usePaidStudentIds } from "@/hooks/usePerStudentPlan";
import { fmtDate, fmtDateTime } from "@/lib/reports";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { generateStudentAccessCode, listStudentAccessCodes } from "@/lib/access-codes.functions";


export const Route = createFileRoute("/_authenticated/eleves")({
  head: () => ({ meta: [{ title: "Élèves — MBGEduGuinée" }] }),
  component: ElevesPage,
});

type Student = any;

function ElevesPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Student | null>(null);
  const [previewStudent, setPreviewStudent] = useState<any | null>(null);
  const [disciplineStudent, setDisciplineStudent] = useState<any | null>(null);
  const [codeStudent, setCodeStudent] = useState<any | null>(null);

  const { data: students = [] } = useQuery({
    queryKey: ["students"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("students")
        .select("*, classes(name, level)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
  const { info: planInfo } = usePerStudentPlan();
  const { paidIds, isUnlocked } = usePaidStudentIds(planInfo.schoolId, planInfo.academicYear, planInfo.isPerStudent);

  const { data: classes = [] } = useQuery({
    queryKey: ["classes"],
    queryFn: async () => (await supabase.from("classes").select("id, name, level").order("name")).data ?? [],
  });

  const filtered = students.filter((s: any) =>
    [s.full_name, s.matricule, s.parent_name].some((v) => v?.toLowerCase().includes(search.toLowerCase())),
  );

  async function handleDelete(id: string) {
    if (!confirm("Supprimer cet élève ?")) return;
    const { error } = await supabase.from("students").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Élève supprimé");
    qc.invalidateQueries({ queryKey: ["students"] });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold">Élèves</h1>
          <p className="text-muted-foreground mt-1">{students.length} élève(s) inscrits</p>
        </div>
        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setEditing(null); }}>
          <DialogTrigger asChild>
            <Button className="gap-2"><Plus className="size-4" /> Nouvel élève</Button>
          </DialogTrigger>
          <StudentDialog editing={editing} classes={classes} onClose={() => { setOpen(false); setEditing(null); qc.invalidateQueries({ queryKey: ["students"] }); }} />
        </Dialog>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input placeholder="Rechercher par nom, matricule, parent..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-14">Photo</TableHead>
                  <TableHead>Matricule</TableHead>
                  <TableHead>Nom complet</TableHead>
                  <TableHead>Classe</TableHead>
                  <TableHead>Parent</TableHead>
                  <TableHead>Statut</TableHead>
                  {planInfo.isPerStudent && <TableHead>Cotisation</TableHead>}
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 && (
                  <TableRow><TableCell colSpan={planInfo.isPerStudent ? 8 : 7} className="text-center py-8 text-muted-foreground">Aucun élève</TableCell></TableRow>
                )}
                {filtered.map((s: any) => (
                  <TableRow key={s.id}>
                    <TableCell><StudentPhoto path={s.photo_url} name={s.full_name} size="sm" /></TableCell>
                    <TableCell className="font-mono text-xs">{s.matricule}</TableCell>
                    <TableCell className="font-medium">{s.full_name}</TableCell>
                    <TableCell>{s.classes?.name ?? <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell><div className="text-sm">{s.parent_name}</div><div className="text-xs text-muted-foreground">{s.parent_phone}</div></TableCell>
                    <TableCell><Badge variant={s.status === "actif" ? "default" : "secondary"}>{s.status}</Badge></TableCell>
                    {planInfo.isPerStudent && (
                      <TableCell>
                        {paidIds.has(s.id)
                          ? <Badge>Payée</Badge>
                          : <Badge variant="destructive">Non payée</Badge>}
                      </TableCell>
                    )}
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" title="Aperçu du bulletin" disabled={!s.class_id || (planInfo.isPerStudent && !isUnlocked(s.id))} onClick={() => setPreviewStudent(s)}><Eye className="size-4" /></Button>
                      <Button variant="ghost" size="icon" title="Historique disciplinaire" onClick={() => setDisciplineStudent(s)}><ShieldAlert className="size-4" /></Button>
                      <Button variant="ghost" size="icon" title="Code d'accès famille" onClick={() => setCodeStudent(s)}><KeyRound className="size-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => { setEditing(s); setOpen(true); }}><Pencil className="size-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(s.id)}><Trash2 className="size-4 text-destructive" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
      {previewStudent && (
        <BulletinPreviewDialog
          open={!!previewStudent}
          onOpenChange={(v) => !v && setPreviewStudent(null)}
          studentId={previewStudent.id}
          studentName={previewStudent.full_name}
          classId={previewStudent.class_id}
        />
      )}
      {disciplineStudent && (
        <DisciplineHistoryDialog student={disciplineStudent} onClose={() => setDisciplineStudent(null)} />
      )}
      {codeStudent && (
        <AccessCodeDialog student={codeStudent} onClose={() => setCodeStudent(null)} />
      )}

    </div>
  );
}

function AccessCodeDialog({ student, onClose }: { student: any; onClose: () => void }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listStudentAccessCodes);
  const generateFn = useServerFn(generateStudentAccessCode);
  const [generating, setGenerating] = useState(false);

  const { data: codes = [], isLoading } = useQuery({
    queryKey: ["access-codes", student.id],
    queryFn: async () => (await listFn({ data: { studentId: student.id } })) as any[],
  });

  async function handleGenerate() {
    setGenerating(true);
    try {
      await generateFn({ data: { studentId: student.id } });
      qc.invalidateQueries({ queryKey: ["access-codes", student.id] });
    } catch (e: any) {
      toast.error(e?.message ?? "Erreur lors de la génération du code");
    } finally {
      setGenerating(false);
    }
  }

  const unused = codes.filter((c: any) => !c.used_at);
  const printableCode = unused[0]?.code as string | undefined;

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Code d'accès famille — {student.full_name}</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">
          Ce code, à usage unique, permet à un parent (ou à l'élève) de créer son compte
          et d'être automatiquement rattaché à cet élève. Générez-en un par personne
          qui doit se connecter (les deux parents, par exemple).
        </p>

        {isLoading && <p className="text-sm text-muted-foreground">Chargement...</p>}

        <div className="space-y-2">
          {codes.map((c: any) => (
            <div key={c.id} className="flex items-center justify-between rounded-lg border p-2 text-sm">
              <div>
                <span className="font-mono font-medium">{c.code}</span>
                <span className="text-muted-foreground ml-2">
                  {c.used_at ? `Utilisé le ${fmtDateTime(c.used_at)} (${c.used_as_role})` : `Émis le ${fmtDateTime(c.created_at)}`}
                </span>
              </div>
              <Badge variant={c.used_at ? "outline" : "default"}>{c.used_at ? "Utilisé" : "Actif"}</Badge>
            </div>
          ))}
          {!isLoading && codes.length === 0 && (
            <p className="text-sm text-muted-foreground">Aucun code émis pour l'instant.</p>
          )}
        </div>

        {printableCode && (
          <div id="access-code-print-area" className="rounded-lg border-2 border-dashed p-4 text-center">
            <p className="text-xs text-muted-foreground">Code d'accès — {student.full_name}</p>
            <p className="font-mono text-2xl font-bold tracking-wider mt-1">{printableCode}</p>
            <p className="text-xs text-muted-foreground mt-1">À saisir sur la page de connexion, onglet « Espace Parent/Élève »</p>
          </div>
        )}

        <style>{`
          @media print {
            body * { visibility: hidden; }
            #access-code-print-area, #access-code-print-area * { visibility: visible; }
            #access-code-print-area { position: fixed; inset: 0; margin: auto; height: fit-content; border: none !important; }
          }
        `}</style>

        <DialogFooter className="flex-wrap gap-2">
          <Button variant="outline" onClick={handleGenerate} disabled={generating}>
            <KeyRound className="size-4 mr-2" /> {generating ? "Génération..." : "Générer un nouveau code"}
          </Button>
          <Button variant="outline" disabled={!printableCode} onClick={() => window.print()}>
            <Printer className="size-4 mr-2" /> Imprimer le code d'accès
          </Button>
          <Button
            variant="outline"
            disabled={!printableCode}
            onClick={() => { if (printableCode) { navigator.clipboard.writeText(printableCode); toast.success("Copié"); } }}
          >
            <Copy className="size-4 mr-2" /> Copier
          </Button>
          <Button onClick={onClose}>Fermer</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DisciplineHistoryDialog({ student, onClose }: { student: any; onClose: () => void }) {
  const { data: incidents = [], isLoading } = useQuery({
    queryKey: ["discipline_incidents", "student", student.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("discipline_incidents")
        .select("*")
        .eq("student_id", student.id)
        .order("incident_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Historique disciplinaire — {student.full_name}</DialogTitle>
        </DialogHeader>
        {isLoading && <p className="text-sm text-muted-foreground">Chargement...</p>}
        {!isLoading && incidents.length === 0 && (
          <p className="text-sm text-muted-foreground">Aucun incident enregistré pour cet élève.</p>
        )}
        <div className="space-y-3">
          {incidents.map((i: any) => (
            <div key={i.id} className="rounded-lg border p-3 text-sm">
              <div className="flex justify-between font-medium">
                <span>{fmtDate(i.incident_date)}</span>
                <span className="text-muted-foreground">{i.sanction ?? "—"}</span>
              </div>
              <p className="mt-1">{i.description}</p>
              {i.follow_up && <p className="mt-1 text-muted-foreground text-xs">Suivi : {i.follow_up}</p>}
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button asChild variant="outline">
            <Link to="/discipline">Ouvrir le module Discipline</Link>
          </Button>
          <Button onClick={onClose}>Fermer</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StudentDialog({ editing, classes, onClose }: { editing: Student | null; classes: any[]; onClose: () => void }) {
  const [form, setForm] = useState<any>(editing ?? {
    matricule: "EDG-" + globalThis.crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase(),
    full_name: "", gender: "M", birth_date: "", birth_place: "", address: "",
    class_id: "", parent_name: "", parent_phone: "", status: "actif", photo_url: null,
  });
  const [loading, setLoading] = useState(false);
  const [schoolId, setSchoolId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) return;
      supabase.from("profiles").select("school_id").eq("id", data.user.id).maybeSingle().then(({ data: p }) => {
        setSchoolId(p?.school_id ?? null);
      });
    });
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const payload = { ...form, class_id: form.class_id || null, birth_date: form.birth_date || null };
    const { error } = editing
      ? await supabase.from("students").update(payload).eq("id", editing.id)
      : await supabase.from("students").insert(payload);
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success(editing ? "Élève modifié avec succès" : "Élève inscrit avec succès", {
      description: editing ? "Les modifications ont été enregistrées." : "L'élève apparaît dans la liste.",
    });
    onClose();
  }

  return (
    <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
      <DialogHeader><DialogTitle>{editing ? "Modifier l'élève" : "Inscription d'un nouvel élève"}</DialogTitle></DialogHeader>
      <div className="mb-4">
        <Label className="mb-2 block">Photo de l'élève</Label>
        <StudentPhotoUpload
          value={form.photo_url ?? null}
          onChange={(path) => setForm({ ...form, photo_url: path })}
          schoolId={schoolId}
          name={form.full_name}
        />
      </div>
      <form onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div><Label>Matricule</Label><Input required value={form.matricule} onChange={(e) => setForm({ ...form, matricule: e.target.value })} /></div>
        <div><Label>Nom complet</Label><Input required value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></div>
        <div>
          <Label>Sexe</Label>
          <Select value={form.gender} onValueChange={(v) => setForm({ ...form, gender: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="M">Masculin</SelectItem><SelectItem value="F">Féminin</SelectItem></SelectContent>
          </Select>
        </div>
        <div><Label>Date de naissance</Label><Input type="date" value={form.birth_date ?? ""} onChange={(e) => setForm({ ...form, birth_date: e.target.value })} /></div>
        <div><Label>Lieu de naissance</Label><Input value={form.birth_place ?? ""} onChange={(e) => setForm({ ...form, birth_place: e.target.value })} /></div>
        <div>
          <Label>Classe</Label>
          <Select value={form.class_id ?? ""} onValueChange={(v) => setForm({ ...form, class_id: v })}>
            <SelectTrigger><SelectValue placeholder="Choisir" /></SelectTrigger>
            <SelectContent>{classes.map((c) => <SelectItem key={c.id} value={c.id}>{c.name} — {c.level}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="sm:col-span-2"><Label>Adresse</Label><Input value={form.address ?? ""} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
        <div><Label>Nom du parent</Label><Input value={form.parent_name ?? ""} onChange={(e) => setForm({ ...form, parent_name: e.target.value })} /></div>
        <div><Label>Téléphone parent</Label><Input value={form.parent_phone ?? ""} onChange={(e) => setForm({ ...form, parent_phone: e.target.value })} /></div>
        <DialogFooter className="sm:col-span-2 mt-4">
          <Button type="button" variant="outline" onClick={onClose}>Annuler</Button>
          <Button type="submit" disabled={loading}>{editing ? "Enregistrer" : "Inscrire"}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
