import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Loader2, Search, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/lib/audit";
import { getCurrentAcademicYear } from "@/lib/academic-year";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StudentPhotoUpload } from "@/components/StudentPhotoUpload";
import {
  buildSummary,
  emptyForm,
  findDuplicates,
  generateMatricule,
  hasBlocking,
  isUniqueViolation,
  nextForm,
  searchStudents,
  stepErrors,
  suggestParents,
  toStudentRow,
  validateForm,
  type DuplicateMatch,
  type EnrollmentForm,
  type FieldErrors,
  type KnownStudent,
} from "@/lib/enrollment";

type Step = 1 | 2 | 3 | 4;
const STEP_LABELS: Record<Step, string> = { 1: "Élève", 2: "Scolarité", 3: "Compléments", 4: "Vérification" };

interface Created {
  id: string;
  full_name: string;
  matricule: string;
  className: string;
  academicYear: string;
  classCount: number | null; // effectif de la classe relu après création
}

/**
 * Inscription d'un nouvel élève en 4 étapes. Enregistre dans la table
 * `students` existante (mêmes champs que l'ancien formulaire) : l'élève est
 * donc immédiatement visible dans Notes, Présences, Bulletins, etc.
 */
export function EnrollmentWizard({
  classes,
  students,
  onClose,
  onView,
}: {
  classes: any[];
  students: any[];
  onClose: () => void;
  onView: (matricule: string) => void;
}) {
  const qc = useQueryClient();
  const academicYear = getCurrentAcademicYear();
  const [form, setForm] = useState<EnrollmentForm>(() => emptyForm(generateMatricule()));
  const [photo, setPhoto] = useState<string | null>(null);
  const [step, setStep] = useState<Step>(1);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);
  const [netError, setNetError] = useState<string | null>(null);
  const [created, setCreated] = useState<Created | null>(null);
  const [dupes, setDupes] = useState<DuplicateMatch[]>([]);
  const [confirmedDupes, setConfirmedDupes] = useState(false);
  const [schoolId, setSchoolId] = useState<string | null>(null);
  const [lookup, setLookup] = useState("");
  const lock = useRef(false);
  const manualMatricule = useRef(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) return;
      supabase.from("profiles").select("school_id").eq("id", data.user.id).maybeSingle().then(({ data: p }) => setSchoolId(p?.school_id ?? null));
    });
  }, []);

  const known = students as KnownStudent[];
  const cls = classes.find((c) => c.id === form.class_id);
  const set = (patch: Partial<EnrollmentForm>) => {
    setForm((f) => ({ ...f, ...patch }));
    setErrors((e) => {
      const n = { ...e };
      for (const k of Object.keys(patch)) delete (n as any)[k];
      return n;
    });
    setConfirmedDupes(false);
    setDupes([]);
  };

  // Doublons recalculés en direct dès que l'on a de quoi comparer.
  const liveDupes = useMemo(() => (form.full_name.trim().length >= 3 || form.matricule ? findDuplicates(form, known) : []), [form, known]);
  const quickResults = useMemo(() => searchStudents(known, lookup), [known, lookup]);
  const parentSuggestions = useMemo(() => suggestParents(known, form.parent_name || form.parent_phone), [known, form.parent_name, form.parent_phone]);
  const classNameOf = (id?: string | null) => classes.find((c) => c.id === id)?.name ?? "—";

  function next() {
    if (step === 4) return;
    const errs = stepErrors(step as 1 | 2 | 3, form);
    if (Object.keys(errs).length) return setErrors(errs);
    setErrors({});
    setStep((s) => (s + 1) as Step);
  }

  async function save() {
    if (lock.current) return; // double clic / Entrée répétée
    const all = validateForm(form);
    if (Object.keys(all).length) {
      setErrors(all);
      setStep(all.full_name || all.gender || all.birth_date ? 1 : all.class_id || all.matricule ? 2 : 3);
      return;
    }
    lock.current = true;
    setSaving(true);
    setNetError(null);
    try {
      // Données fraîches : un collègue a pu inscrire le même élève entre-temps.
      const fresh = (await qc.fetchQuery({
        queryKey: ["students"],
        staleTime: 0,
        queryFn: async () => {
          const { data, error } = await supabase.from("students").select("*, classes(name, level)").order("created_at", { ascending: false });
          if (error) throw error;
          return data;
        },
      })) as KnownStudent[];
      const matches = findDuplicates(form, fresh);
      setDupes(matches);
      if (hasBlocking(matches) && manualMatricule.current) {
        setErrors({ matricule: "Ce matricule est déjà attribué." });
        setStep(2);
        return;
      }
      if (matches.some((m) => !m.blocking) && !confirmedDupes) return; // l'écran de vérification affiche l'alerte

      let row = { ...toStudentRow(form), photo_url: photo };
      let { data, error } = await supabase.from("students").insert(row as any).select("id, matricule").single();
      if (error && isUniqueViolation(error) && !manualMatricule.current) {
        // matricule généré déjà pris : on en tire un autre (une seule fois)
        const m = generateMatricule();
        row = { ...row, matricule: m };
        ({ data, error } = await supabase.from("students").insert(row as any).select("id, matricule").single());
        if (!error) setForm((f) => ({ ...f, matricule: m }));
      }
      if (error || !data) {
        if (error && isUniqueViolation(error)) {
          setErrors({ matricule: "Ce matricule est déjà attribué." });
          setStep(2);
        } else {
          setNetError(error?.message ?? "Enregistrement impossible. Vos informations sont conservées : réessayez.");
        }
        return;
      }

      // Vérification : l'élève est bien relu avec sa classe, et compté dans l'effectif.
      const { count } = await supabase.from("students").select("id", { count: "exact", head: true }).eq("class_id", form.class_id);
      void logActivity({
        action: "create",
        entity_type: "student",
        entity_id: data.id,
        entity_label: `${row.full_name} (${data.matricule})`,
        metadata: { classId: form.class_id, academicYear, via: "inscription_rapide" },
      });
      await qc.invalidateQueries({ queryKey: ["students"] });
      setCreated({ id: data.id, full_name: row.full_name, matricule: data.matricule, className: classNameOf(form.class_id), academicYear, classCount: count ?? null });
    } catch (e: any) {
      setNetError(e?.message ? `${e.message}. Vos informations sont conservées : réessayez.` : "Connexion interrompue. Vos informations sont conservées : réessayez.");
    } finally {
      lock.current = false;
      setSaving(false);
    }
  }

  function another() {
    manualMatricule.current = false;
    setForm((f) => nextForm(f, generateMatricule()));
    setPhoto(null);
    setCreated(null);
    setDupes([]);
    setConfirmedDupes(false);
    setErrors({});
    setNetError(null);
    setLookup("");
    setStep(1);
  }

  /* ----------------------------- Succès ----------------------------- */
  if (created) {
    return (
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><CheckCircle2 className="size-5 text-emerald-600" />Élève inscrit avec succès</DialogTitle></DialogHeader>
        <div className="rounded-lg border p-4 space-y-1 text-sm">
          <Row k="Élève" v={created.full_name} />
          <Row k="Matricule" v={created.matricule} mono />
          <Row k="Classe" v={created.className} />
          <Row k="Année scolaire" v={created.academicYear} />
        </div>
        <ul className="text-sm space-y-1">
          <li>✅ Élève créé.</li>
          <li>✅ Affectation à la classe effectuée.</li>
          <li>✅ Disponible dans les listes de la classe{created.classCount != null ? ` (${created.classCount} élève${created.classCount > 1 ? "s" : ""} dans ${created.className})` : ""}.</li>
        </ul>
        <DialogFooter className="flex-wrap gap-2">
          <Button variant="outline" onClick={() => onView(created.matricule)}>Voir l'élève</Button>
          <Button variant="outline" onClick={onClose}>Retour à la liste</Button>
          <Button onClick={another} autoFocus className="gap-2"><UserPlus className="size-4" />Inscrire l'élève suivant</Button>
        </DialogFooter>
        <p className="text-xs text-muted-foreground">Classe conservée : <b>{created.className}</b>. Le responsable n'est pas repris, pour éviter toute erreur de famille.</p>
      </DialogContent>
    );
  }

  const summary = buildSummary(form, { academicYear, className: cls?.name ?? "—", level: cls?.level });
  const pendingDupes = dupes.filter((d) => !d.blocking).length ? dupes.filter((d) => !d.blocking) : liveDupes.filter((d) => !d.blocking);

  return (
    <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" onKeyDown={(e) => { if (e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT") e.preventDefault(); }}>
      <DialogHeader><DialogTitle>Inscription d'un nouvel élève</DialogTitle></DialogHeader>

      <ol className="flex items-center gap-2 text-xs" aria-label="Étapes">
        {([1, 2, 3, 4] as Step[]).map((n) => (
          <li key={n} className={`flex items-center gap-1 rounded-full px-2.5 py-1 border ${n === step ? "bg-primary text-primary-foreground border-primary" : n < step ? "bg-muted" : "text-muted-foreground"}`}>
            <span className="font-semibold">{n}</span>{STEP_LABELS[n]}
          </li>
        ))}
      </ol>

      {step === 1 && (
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Rechercher un élève déjà inscrit…" value={lookup} onChange={(e) => setLookup(e.target.value)} />
          </div>
          {quickResults.length > 0 && (
            <ul className="rounded-md border divide-y text-sm">
              {quickResults.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-2 px-3 py-2">
                  <span><b>{s.full_name}</b> · <span className="font-mono text-xs">{s.matricule}</span> · {classNameOf(s.class_id)}</span>
                  <Button size="sm" variant="outline" onClick={() => onView(s.matricule ?? "")}>Ouvrir</Button>
                </li>
              ))}
            </ul>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Nom complet (prénom et nom)" error={errors.full_name} className="sm:col-span-2">
              <Input autoFocus value={form.full_name} onChange={(e) => set({ full_name: e.target.value })} />
            </Field>
            <Field label="Sexe" error={errors.gender}>
              <Select value={form.gender} onValueChange={(v) => set({ gender: v as "M" | "F" })}>
                <SelectTrigger><SelectValue placeholder="Choisir" /></SelectTrigger>
                <SelectContent><SelectItem value="M">Masculin</SelectItem><SelectItem value="F">Féminin</SelectItem></SelectContent>
              </Select>
            </Field>
            <Field label="Date de naissance" error={errors.birth_date}>
              <Input type="date" value={form.birth_date} onChange={(e) => set({ birth_date: e.target.value })} />
            </Field>
            <Field label="Lieu de naissance" className="sm:col-span-2">
              <Input value={form.birth_place} onChange={(e) => set({ birth_place: e.target.value })} />
            </Field>
          </div>
          <DuplicateAlert matches={liveDupes} classNameOf={classNameOf} onOpen={(m) => onView(m ?? "")} />
        </div>
      )}

      {step === 2 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Année scolaire"><Input value={academicYear} readOnly disabled /></Field>
          <Field label="Classe" error={errors.class_id}>
            <Select value={form.class_id} onValueChange={(v) => set({ class_id: v })}>
              <SelectTrigger><SelectValue placeholder="Choisir la classe" /></SelectTrigger>
              <SelectContent>{classes.map((c) => <SelectItem key={c.id} value={c.id}>{c.name} — {c.level}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Niveau"><Input value={cls?.level ?? "—"} readOnly disabled /></Field>
          <Field label="Matricule (généré automatiquement, modifiable)" error={errors.matricule}>
            <Input value={form.matricule} onChange={(e) => { manualMatricule.current = true; set({ matricule: e.target.value }); }} />
          </Field>
          <DuplicateAlert matches={liveDupes.filter((d) => d.blocking)} classNameOf={classNameOf} onOpen={(m) => onView(m ?? "")} />
        </div>
      )}

      {step === 3 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Nom du responsable">
            <Input value={form.parent_name} onChange={(e) => set({ parent_name: e.target.value })} />
          </Field>
          <Field label="Téléphone du responsable" error={errors.parent_phone}>
            <Input inputMode="tel" value={form.parent_phone} onChange={(e) => set({ parent_phone: e.target.value })} />
          </Field>
          {parentSuggestions.length > 0 && (
            <div className="sm:col-span-2 rounded-md border p-2 text-sm space-y-1">
              <div className="text-xs text-muted-foreground">Responsables déjà enregistrés — sélectionner plutôt que ressaisir :</div>
              {parentSuggestions.map((p, i) => (
                <button key={i} type="button" className="w-full text-left rounded px-2 py-1.5 hover:bg-muted flex justify-between gap-2" onClick={() => set({ parent_name: p.parent_name, parent_phone: p.parent_phone })}>
                  <span><b>{p.parent_name || "—"}</b> · {p.parent_phone || "—"}</span>
                  <span className="text-xs text-muted-foreground">{p.children} élève{p.children > 1 ? "s" : ""}</span>
                </button>
              ))}
            </div>
          )}
          <Field label="Adresse" className="sm:col-span-2">
            <Input value={form.address} onChange={(e) => set({ address: e.target.value })} />
          </Field>
          <div className="sm:col-span-2">
            <Label className="mb-2 block">Photo (facultative)</Label>
            <StudentPhotoUpload value={photo} onChange={setPhoto} schoolId={schoolId} name={form.full_name} />
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="space-y-3">
          <h3 className="font-semibold">{summary.title}</h3>
          <div className="rounded-lg border p-4 space-y-1 text-sm">
            {summary.lines.map((l) => <Row key={l.label} k={l.label} v={l.value} mono={l.label === "Matricule"} />)}
          </div>
          {pendingDupes.length > 0 && (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 space-y-2">
              <div className="flex items-center gap-2 font-medium"><AlertTriangle className="size-4" />Un élève correspondant existe déjà.</div>
              <MatchList matches={pendingDupes} classNameOf={classNameOf} onOpen={(m) => onView(m ?? "")} />
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={confirmedDupes} onChange={(e) => setConfirmedDupes(e.target.checked)} />
                J'ai vérifié : il s'agit bien d'un autre élève.
              </label>
            </div>
          )}
          {netError && <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{netError}</p>}
        </div>
      )}

      <DialogFooter className="flex-wrap gap-2 sm:justify-between">
        <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Annuler</Button>
        <div className="flex gap-2">
          {step > 1 && <Button type="button" variant="outline" disabled={saving} onClick={() => setStep((s) => (s - 1) as Step)}>{step === 4 ? "Modifier" : "Précédent"}</Button>}
          {step < 4 ? (
            <Button type="button" onClick={next}>Suivant</Button>
          ) : (
            <Button type="button" onClick={save} disabled={saving || (pendingDupes.length > 0 && !confirmedDupes)} className="gap-2">
              {saving && <Loader2 className="size-4 animate-spin" />}{saving ? "Enregistrement…" : "Confirmer l'inscription"}
            </Button>
          )}
        </div>
      </DialogFooter>
    </DialogContent>
  );
}

function Field({ label, error, className, children }: { label: string; error?: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={className}>
      <Label className="mb-1 block">{label}</Label>
      {children}
      {error && <p className="mt-1 text-xs text-destructive" role="alert">{error}</p>}
    </div>
  );
}

function Row({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return <div className="flex justify-between gap-4"><span className="text-muted-foreground">{k}</span><span className={`font-medium text-right ${mono ? "font-mono" : ""}`}>{v}</span></div>;
}

function MatchList({ matches, classNameOf, onOpen }: { matches: DuplicateMatch[]; classNameOf: (id?: string | null) => string; onOpen: (matricule?: string | null) => void }) {
  return (
    <ul className="space-y-1">
      {matches.map((m) => (
        <li key={m.student.id} className="flex items-center justify-between gap-2">
          <span><b>{m.student.full_name}</b> · <span className="font-mono text-xs">{m.student.matricule}</span> · {classNameOf(m.student.class_id)}{m.student.birth_date ? ` · né(e) le ${m.student.birth_date}` : ""}<span className="block text-xs opacity-80">{m.reason}</span></span>
          <Button size="sm" variant="outline" onClick={() => onOpen(m.student.matricule)}>Ouvrir l'élève existant</Button>
        </li>
      ))}
    </ul>
  );
}

function DuplicateAlert({ matches, classNameOf, onOpen }: { matches: DuplicateMatch[]; classNameOf: (id?: string | null) => string; onOpen: (matricule?: string | null) => void }) {
  if (!matches.length) return null;
  const blocking = matches.some((m) => m.blocking);
  return (
    <div className={`sm:col-span-2 rounded-md border p-3 text-sm space-y-2 ${blocking ? "border-destructive/40 bg-destructive/10" : "border-amber-300 bg-amber-50 text-amber-900"}`}>
      <div className="flex items-center gap-2 font-medium"><AlertTriangle className="size-4" />{blocking ? "Ce matricule existe déjà." : "Un élève correspondant existe déjà."}</div>
      <MatchList matches={matches} classNameOf={classNameOf} onOpen={onOpen} />
    </div>
  );
}
