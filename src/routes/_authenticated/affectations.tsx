import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { useSchool } from "@/hooks/useSchool";
import { getAcademicYearOptions, getCurrentAcademicYear } from "@/lib/academic-year";

export const Route = createFileRoute("/_authenticated/affectations")({
  head: () => ({ meta: [{ title: "Affectations — MBGEduGuinée" }] }),
  component: AssignmentsPage,
});


type Row = {
  id: string;
  teacher_id: string;
  class_id: string;
  subject_id: string | null;
  academic_year: string;
  created_at: string;
};

function AssignmentsPage() {
  const qc = useQueryClient();
  const { school } = useSchool();
  const CURRENT_YEAR = getCurrentAcademicYear();
  const YEARS = getAcademicYearOptions(CURRENT_YEAR);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [yearFilter, setYearFilter] = useState<string>(CURRENT_YEAR);
  const [teacherFilter, setTeacherFilter] = useState<string>("all");
  const [classFilter, setClassFilter] = useState<string>("all");

  const { data: teachers = [] } = useQuery({
    queryKey: ["teachers"],
    queryFn: async () => (await supabase.from("teachers").select("id, full_name, matricule").order("full_name")).data ?? [],
  });
  const { data: classes = [] } = useQuery({
    queryKey: ["classes"],
    queryFn: async () => (await supabase.from("classes").select("id, name, level").order("name")).data ?? [],
  });
  const { data: subjects = [] } = useQuery({
    queryKey: ["subjects"],
    queryFn: async () => (await supabase.from("subjects").select("id, name").order("name")).data ?? [],
  });
  const { data: rows = [] } = useQuery({
    queryKey: ["tca"],
    queryFn: async () =>
      ((await supabase
        .from("teacher_class_assignments")
        .select("*")
        .order("academic_year", { ascending: false })
        .order("created_at", { ascending: false })).data as Row[]) ?? [],
  });

  const teacherMap = useMemo(() => Object.fromEntries(teachers.map((t: any) => [t.id, t])), [teachers]);
  const classMap = useMemo(() => Object.fromEntries(classes.map((c: any) => [c.id, c])), [classes]);
  const subjectMap = useMemo(() => Object.fromEntries(subjects.map((s: any) => [s.id, s])), [subjects]);

  const filtered = rows.filter(
    (r) =>
      (yearFilter === "all" || r.academic_year === yearFilter) &&
      (teacherFilter === "all" || r.teacher_id === teacherFilter) &&
      (classFilter === "all" || r.class_id === classFilter),
  );

  function openNew() {
    setEditing(null);
    setOpen(true);
  }
  function openEdit(r: Row) {
    setEditing(r);
    setOpen(true);
  }

  async function remove(id: string) {
    if (!confirm("Supprimer cette affectation ?")) return;
    const { error } = await supabase.from("teacher_class_assignments").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Affectation supprimée");
    qc.invalidateQueries({ queryKey: ["tca"] });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold">Affectations des enseignants</h1>
          <p className="text-muted-foreground mt-1">
            {filtered.length} affectation(s) · année {yearFilter === "all" ? "toutes" : yearFilter}
          </p>
        </div>
        <Button className="gap-2" onClick={openNew}>
          <Plus className="size-4" /> Nouvelle affectation
        </Button>
      </div>

      <Card>
        <CardContent className="p-4 flex flex-wrap gap-3">
          <div className="min-w-40">
            <Label className="text-xs">Année scolaire</Label>
            <Select value={yearFilter} onValueChange={setYearFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes les années</SelectItem>
                {YEARS.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-52">
            <Label className="text-xs">Enseignant</Label>
            <Select value={teacherFilter} onValueChange={setTeacherFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous</SelectItem>
                {teachers.map((t: any) => <SelectItem key={t.id} value={t.id}>{t.full_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-44">
            <Label className="text-xs">Classe</Label>
            <Select value={classFilter} onValueChange={setClassFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes</SelectItem>
                {classes.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Année</TableHead>
                <TableHead>Enseignant</TableHead>
                <TableHead>Classe</TableHead>
                <TableHead>Matière</TableHead>
                <TableHead>Créée le</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Aucune affectation</TableCell></TableRow>
              )}
              {filtered.map((r) => (
                <TableRow key={r.id}>
                  <TableCell><Badge variant="secondary">{r.academic_year}</Badge></TableCell>
                  <TableCell className="font-medium">{teacherMap[r.teacher_id]?.full_name ?? "—"}</TableCell>
                  <TableCell>{classMap[r.class_id]?.name ?? "—"}</TableCell>
                  <TableCell>{r.subject_id ? subjectMap[r.subject_id]?.name ?? "—" : <span className="text-muted-foreground">Toutes</span>}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{new Date(r.created_at).toLocaleDateString("fr-FR")}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(r)}><Pencil className="size-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => remove(r.id)}><Trash2 className="size-4 text-destructive" /></Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <AssignmentDialog
        open={open}
        onOpenChange={setOpen}
        editing={editing}
        teachers={teachers as any[]}
        classes={classes as any[]}
        subjects={subjects as any[]}
        existing={rows}
        currentYear={CURRENT_YEAR}
        onSaved={() => qc.invalidateQueries({ queryKey: ["tca"] })}
      />
    </div>
  );
}

function AssignmentDialog({
  open, onOpenChange, editing, teachers, classes, subjects, existing, currentYear, onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: Row | null;
  teachers: any[]; classes: any[]; subjects: any[];
  existing: Row[];
  currentYear: string;
  onSaved: () => void;
}) {
  const [teacherId, setTeacherId] = useState<string>("");
  const [classIds, setClassIds] = useState<string[]>([]);
  const [subjectIds, setSubjectIds] = useState<string[]>([]);
  const [year, setYear] = useState<string>(currentYear);
  const [saving, setSaving] = useState(false);
  const YEARS = getAcademicYearOptions(currentYear);

  // Reset when opening
  useMemo(() => {
    if (open) {
      if (editing) {
        setTeacherId(editing.teacher_id);
        setClassIds([editing.class_id]);
        setSubjectIds(editing.subject_id ? [editing.subject_id] : []);
        setYear(editing.academic_year);
      } else {
        setTeacherId("");
        setClassIds([]);
        setSubjectIds([]);
        setYear(currentYear);
      }
    }
  }, [open, editing]);

  function toggle(arr: string[], v: string) {
    return arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!teacherId || classIds.length === 0) {
      toast.error("Enseignant et au moins une classe requis");
      return;
    }
    setSaving(true);
    const subjectList = subjectIds.length ? subjectIds : [null];
    const rows = classIds.flatMap((class_id) =>
      subjectList.map((subject_id) => ({
        teacher_id: teacherId,
        class_id,
        subject_id,
        academic_year: year,
      })),
    );

    // Client-side duplicate guard
    const dup = rows.find((r) =>
      existing.some((e) =>
        e.id !== editing?.id &&
        e.teacher_id === r.teacher_id &&
        e.class_id === r.class_id &&
        (e.subject_id ?? null) === (r.subject_id ?? null) &&
        e.academic_year === r.academic_year,
      ),
    );
    if (dup) {
      setSaving(false);
      toast.error("Cette affectation existe déjà");
      return;
    }

    if (editing) {
      const r = rows[0];
      const { error } = await supabase
        .from("teacher_class_assignments")
        .update(r)
        .eq("id", editing.id);
      if (error) { setSaving(false); return toast.error(error.message); }
    } else {
      const { error } = await supabase.from("teacher_class_assignments").insert(rows);
      if (error) { setSaving(false); return toast.error(error.message); }
    }
    setSaving(false);
    toast.success(editing ? "Affectation modifiée" : `${rows.length} affectation(s) créée(s)`);
    onOpenChange(false);
    onSaved();
  }

  const assignedClassIds = new Set(
    existing
      .filter((r) => r.teacher_id === teacherId && r.academic_year === year && r.id !== editing?.id)
      .map((r) => r.class_id),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editing ? "Modifier l'affectation" : "Nouvelle affectation"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Enseignant</Label>
              <Select value={teacherId} onValueChange={setTeacherId}>
                <SelectTrigger><SelectValue placeholder="Sélectionner" /></SelectTrigger>
                <SelectContent>
                  {teachers.map((t) => <SelectItem key={t.id} value={t.id}>{t.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Année scolaire</Label>
              <Select value={year} onValueChange={setYear} disabled={!!editing}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {YEARS.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>Classes {editing && <span className="text-xs text-muted-foreground">(1 seule en édition)</span>}</Label>
            <div className="grid grid-cols-3 gap-2 mt-2 max-h-48 overflow-y-auto p-2 border rounded">
              {classes.map((c) => {
                const already = assignedClassIds.has(c.id);
                const checked = classIds.includes(c.id);
                return (
                  <label key={c.id} className={`flex items-center gap-2 text-sm ${already && !checked ? "opacity-50" : ""}`}>
                    <Input
                      type="checkbox"
                      className="size-4"
                      checked={checked}
                      disabled={!!editing && !checked && classIds.length >= 1}
                      onChange={() => setClassIds(editing ? [c.id] : toggle(classIds, c.id))}
                    />
                    <span>{c.name}</span>
                    {already && <Badge variant="outline" className="text-[10px] px-1">déjà</Badge>}
                  </label>
                );
              })}
            </div>
          </div>

          <div>
            <Label>Matières <span className="text-xs text-muted-foreground">(vide = toutes)</span></Label>
            <div className="grid grid-cols-3 gap-2 mt-2 max-h-48 overflow-y-auto p-2 border rounded">
              {subjects.map((s) => (
                <label key={s.id} className="flex items-center gap-2 text-sm">
                  <Input
                    type="checkbox"
                    className="size-4"
                    checked={subjectIds.includes(s.id)}
                    disabled={!!editing && !subjectIds.includes(s.id) && subjectIds.length >= 1}
                    onChange={() => setSubjectIds(editing ? [s.id] : toggle(subjectIds, s.id))}
                  />
                  <span>{s.name}</span>
                </label>
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button type="submit" disabled={saving}>{editing ? "Enregistrer" : "Créer"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
