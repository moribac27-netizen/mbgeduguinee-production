import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { IdCard, Plus, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { NON_TEACHING_POSITIONS, type StaffRow } from "@/lib/staff-picker";
import { TEACHER_TYPE_LABELS, isTitularType, type TeacherType } from "@/lib/teacher-types";

export const Route = createFileRoute("/_authenticated/personnel")({
  head: () => ({ meta: [{ title: "Personnel — MBGEduGuinée" }] }),
  component: PersonnelPage,
});

const db = supabase as any;
const fmt = (n: number) => new Intl.NumberFormat("fr-FR").format(n);

function PersonnelPage() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<"all" | "enseignant" | "non_enseignant" | "sans_compte">("all");
  const [search, setSearch] = useState("");
  const staff = useQuery({
    queryKey: ["staff-directory"],
    queryFn: async () => {
      const { data, error } = await db.rpc("staff_directory");
      if (error) throw error;
      return (data ?? []) as StaffRow[];
    },
  });
  const rows = (staff.data ?? []).filter((r) => {
    if (filter === "enseignant" && r.kind !== "enseignant") return false;
    if (filter === "non_enseignant" && r.kind !== "non_enseignant") return false;
    if (filter === "sans_compte" && r.user_id) return false;
    return !search || r.full_name.toLowerCase().includes(search.toLowerCase());
  });
  const noAccount = (staff.data ?? []).filter((r) => !r.user_id).length;
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["staff-directory"] });
    void qc.invalidateQueries({ queryKey: ["collab-staff-options"] });
    void qc.invalidateQueries({ queryKey: ["teachers"] });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary"><IdCard className="size-5" /></div>
          <div>
            <h1 className="font-display text-3xl font-bold">Personnel</h1>
            <p className="mt-1 text-muted-foreground">{(staff.data ?? []).length} personne(s) · {noAccount} sans compte de connexion</p>
          </div>
        </div>
        <AddStaffDialog onDone={refresh} />
      </div>

      <Card>
        <CardContent className="flex flex-wrap gap-3 p-4">
          <div className="min-w-48"><Label className="text-xs">Afficher</Label>
            <Select value={filter} onValueChange={(v) => setFilter(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tout le personnel</SelectItem>
                <SelectItem value="enseignant">Enseignants</SelectItem>
                <SelectItem value="non_enseignant">Non enseignants</SelectItem>
                <SelectItem value="sans_compte">Sans compte de connexion</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-56 flex-1"><Label className="text-xs">Rechercher</Label><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nom…" /></div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="overflow-x-auto p-4">
          <Table>
            <TableHeader><TableRow><TableHead>Nom</TableHead><TableHead>Catégorie</TableHead><TableHead>Poste</TableHead><TableHead>Téléphone</TableHead><TableHead>E-mail</TableHead><TableHead>Compte</TableHead></TableRow></TableHeader>
            <TableBody>
              {staff.isError && <TableRow><TableCell colSpan={6} className="py-8 text-center text-destructive">Annuaire indisponible (migration SQL « personnel » non appliquée ?).</TableCell></TableRow>}
              {!staff.isError && !staff.isLoading && rows.length === 0 && <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">Aucune personne. Cliquez sur « Ajouter une personne ».</TableCell></TableRow>}
              {rows.map((r) => {
                const key = r.teacher_id ? "t:" + r.teacher_id : "c:" + r.contract_id;
                return (
                  <TableRow key={key}>
                    <TableCell className="font-medium">{r.full_name}</TableCell>
                    <TableCell><Badge variant="outline">{r.kind === "enseignant" ? "Enseignant" : "Non enseignant"}</Badge></TableCell>
                    <TableCell className="text-sm">{r.job_title ?? "—"}</TableCell>
                    <TableCell className="text-sm">{r.phone ?? "—"}</TableCell>
                    <TableCell className="text-sm">{r.email ?? "—"}</TableCell>
                    <TableCell>
                      {r.user_id ? <Badge>Compte créé</Badge> : (
                        <Button asChild size="sm" variant="outline" className="gap-1"><Link to="/collaborateurs" search={{ staff: key }}><UserPlus className="size-3.5" />Créer le compte</Link></Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

/** Une seule fiche pour tout le personnel : enseignant (page Enseignants) ou non enseignant (contrat RH). */
function AddStaffDialog({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<"enseignant" | "non_enseignant">("non_enseignant");
  const blank = { full_name: "", phone: "", email: "", position: "Secrétaire", customPosition: "", salary: "0", teacher_type: "specialise" as TeacherType, start_date: new Date().toISOString().slice(0, 10) };
  const [f, setF] = useState(blank);
  const [busy, setBusy] = useState(false);

  async function save() {
    if (busy) return;
    const name = f.full_name.trim();
    if (name.length < 2) return void toast.error("Le nom complet est obligatoire.");
    const salary = Number(f.salary) || 0;
    if (salary < 0) return void toast.error("Salaire invalide.");
    setBusy(true);
    let error: any = null;
    if (category === "enseignant") {
      const res = await db.from("teachers").insert({
        matricule: "ENS-" + globalThis.crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase(),
        full_name: name, phone: f.phone.trim() || null, email: f.email.trim() || null, subjects: [], monthly_salary: salary, teacher_type: f.teacher_type,
      });
      error = res.error;
    } else {
      const position = (f.position === "__autre" ? f.customPosition.trim() : f.position) || null;
      const res = await db.from("employee_contracts").insert({
        full_name: name, position, phone: f.phone.trim() || null, email: f.email.trim() || null, base_salary: salary, start_date: f.start_date, status: "actif",
      });
      error = res.error;
    }
    setBusy(false);
    if (error) return void toast.error(error.message);
    toast.success("Personne enregistrée. Vous pouvez maintenant lui créer un compte.");
    setOpen(false); setF(blank); onDone();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button className="gap-2"><Plus className="size-4" />Ajouter une personne</Button></DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Ajouter une personne au personnel</DialogTitle>
          <DialogDescription>Enregistrez la personne une seule fois. Elle sera ensuite proposée dans « Collaborateurs » pour créer son compte, sans ressaisie.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <RadioGroup value={category} onValueChange={(v) => setCategory(v as any)} className="grid grid-cols-2 gap-2">
            <label className="flex cursor-pointer items-center gap-2 rounded-lg border p-3 text-sm"><RadioGroupItem value="enseignant" />Enseignant / éducatrice</label>
            <label className="flex cursor-pointer items-center gap-2 rounded-lg border p-3 text-sm"><RadioGroupItem value="non_enseignant" />Non enseignant</label>
          </RadioGroup>
          <div><Label>Nom complet</Label><Input value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Téléphone</Label><Input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></div>
            <div><Label>E-mail</Label><Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
          </div>
          {category === "enseignant" ? (
            <div><Label>Type d'enseignant</Label>
              <Select value={f.teacher_type} onValueChange={(v) => setF({ ...f, teacher_type: v as TeacherType })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{(Object.keys(TEACHER_TYPE_LABELS) as TeacherType[]).map((k) => <SelectItem key={k} value={k}>{TEACHER_TYPE_LABELS[k]}</SelectItem>)}</SelectContent>
              </Select>
              {!isTitularType(f.teacher_type) && <p className="mt-1 text-xs text-muted-foreground">Les matières s'attribuent ensuite dans Affectations.</p>}
            </div>
          ) : (
            <div className="space-y-2">
              <div><Label>Poste</Label>
                <Select value={f.position} onValueChange={(v) => setF({ ...f, position: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{NON_TEACHING_POSITIONS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}<SelectItem value="__autre">Autre…</SelectItem></SelectContent>
                </Select>
              </div>
              {f.position === "__autre" && <Input placeholder="Intitulé du poste" value={f.customPosition} onChange={(e) => setF({ ...f, customPosition: e.target.value })} />}
              <div><Label>Date de début</Label><Input type="date" value={f.start_date} onChange={(e) => setF({ ...f, start_date: e.target.value })} /></div>
            </div>
          )}
          <div><Label>Salaire mensuel (GNF)</Label><Input type="number" min={0} value={f.salary} onChange={(e) => setF({ ...f, salary: e.target.value })} />
            <p className="mt-1 text-xs text-muted-foreground">{fmt(Number(f.salary) || 0)} GNF par mois.</p></div>
        </div>
        <DialogFooter><Button onClick={save} disabled={busy}>Enregistrer</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
