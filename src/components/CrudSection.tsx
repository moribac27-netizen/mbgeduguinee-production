import { useMemo, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getSchoolId } from "@/lib/school";
import { logActivity } from "@/lib/audit";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Pencil, Trash2, Search, Inbox, FileSpreadsheet, Printer } from "lucide-react";
import { toast } from "sonner";
import { exportExcel, exportPDF, type ExportColumn } from "@/lib/reports";
import { usePdfMeta } from "@/hooks/usePdfMeta";

export type FieldType =
  | "text" | "number" | "date" | "time" | "datetime" | "textarea" | "select" | "checkbox";

export interface CrudField {
  name: string;
  label: string;
  type?: FieldType;
  options?: { value: string; label: string }[];
  required?: boolean;
  placeholder?: string;
  step?: string;
  min?: number;
  full?: boolean;
  default?: any;
  help?: string;
  /** Transforme la valeur du formulaire avant enregistrement. */
  parse?: (v: any) => any;
  /** Transforme la valeur de la base avant affichage dans le formulaire. */
  serialize?: (v: any) => any;
}

export interface CrudColumn {
  key: string;
  label: string;
  render?: (row: any) => ReactNode;
  exportFormat?: (row: any) => string | number;
  className?: string;
}

interface Props {
  table: string;
  title: string;
  singular: string;
  queryKey: string[];
  select?: string;
  orderBy?: { column: string; ascending?: boolean };
  fields: CrudField[];
  columns: CrudColumn[];
  searchKeys?: string[];
  extraInsert?: Record<string, any>;
  /** Complète/transforme la ligne avant l'enregistrement (ex. créer la classe liée). Lever une erreur annule l'enregistrement. */
  beforeSave?: (payload: Record<string, any>, editing: any) => Promise<Record<string, any>>;
  canWrite?: boolean;
  emptyHint?: string;
  filters?: ReactNode;
  where?: (q: any) => any;
  rowClassName?: (row: any) => string;
}

function emptyForm(fields: CrudField[]) {
  const f: Record<string, any> = {};
  fields.forEach((x) => {
    f[x.name] = x.default ?? (x.type === "checkbox" ? false : "");
  });
  return f;
}

function toDbValue(field: CrudField, v: any) {
  if (field.parse) return field.parse(v);
  if (field.type === "checkbox") return !!v;
  if (v === "" || v === undefined) return null;
  if (field.type === "number") return Number(v);
  return v;
}

function fromDbValue(field: CrudField, v: any) {
  if (field.serialize) return field.serialize(v);
  if (field.type === "checkbox") return !!v;
  if (v === null || v === undefined) return "";
  if (field.type === "datetime") return String(v).slice(0, 16);
  if (field.type === "date") return String(v).slice(0, 10);
  if (field.type === "time") return String(v).slice(0, 5);
  return v;
}

export function CrudSection({
  table, title, singular, queryKey, select = "*", orderBy,
  fields, columns, searchKeys = [], extraInsert, beforeSave, canWrite = true,
  emptyHint, filters, where, rowClassName,
}: Props) {
  const qc = useQueryClient();
  const pdfMeta = usePdfMeta();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [search, setSearch] = useState("");


  const { data: rows = [], isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      let q: any = supabase.from(table as any).select(select);
      if (where) q = where(q);
      if (orderBy) q = q.order(orderBy.column, { ascending: orderBy.ascending ?? true });
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const filtered = useMemo(() => {
    if (!search.trim() || searchKeys.length === 0) return rows;
    const s = search.toLowerCase();
    return rows.filter((r: any) =>
      searchKeys.some((k) => {
        const v = k.split(".").reduce((a: any, p) => a?.[p], r);
        return String(v ?? "").toLowerCase().includes(s);
      }),
    );
  }, [rows, search, searchKeys]);

  const exportColumns: ExportColumn[] = columns.map((c) => ({
    key: c.key,
    label: c.label,
    format: c.exportFormat ? (_v, row) => c.exportFormat!(row) : undefined,
  }));

  async function remove(row: any) {
    if (!confirm(`Supprimer définitivement cet élément ?`)) return;
    const { error } = await supabase.from(table as any).delete().eq("id", row.id);
    if (error) return toast.error(error.message);
    void logActivity({ action: "delete", entity_type: table, entity_id: row.id });
    toast.success("Élément supprimé");
    qc.invalidateQueries({ queryKey });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div className="flex flex-wrap items-center gap-2">
          {searchKeys.length > 0 && (
            <div className="relative">
              <Search className="size-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher…"
                className="pl-8 w-full sm:w-64"
              />
            </div>
          )}
          {filters}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" className="gap-2" onClick={() => exportExcel(title, filtered, exportColumns, title)}>
            <FileSpreadsheet className="size-4" /> Excel
          </Button>
          <Button variant="outline" size="sm" className="gap-2" onClick={() => exportPDF(title, filtered, exportColumns, pdfMeta)}>
            <Printer className="size-4" /> PDF
          </Button>
          {canWrite && (
            <Button size="sm" className="gap-2" onClick={() => { setEditing(null); setOpen(true); }}>
              <Plus className="size-4" /> {singular}
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardContent className="p-0 sm:p-2">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {columns.map((c) => <TableHead key={c.key} className={c.className}>{c.label}</TableHead>)}
                  {canWrite && <TableHead className="w-24 text-right">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && (
                  <TableRow><TableCell colSpan={columns.length + 1} className="text-center py-10 text-muted-foreground">Chargement…</TableCell></TableRow>
                )}
                {!isLoading && filtered.length === 0 && (
                  <TableRow><TableCell colSpan={columns.length + 1} className="text-center py-12 text-muted-foreground">
                    <Inbox className="size-8 mx-auto mb-2 opacity-40" />
                    {emptyHint ?? "Aucune donnée pour le moment."}
                  </TableCell></TableRow>
                )}
                {filtered.map((r: any) => (
                  <TableRow key={r.id} className={rowClassName?.(r)}>
                    {columns.map((c) => (
                      <TableCell key={c.key} className={c.className}>
                        {c.render ? c.render(r) : (r[c.key] ?? "—")}
                      </TableCell>
                    ))}
                    {canWrite && (
                      <TableCell className="text-right whitespace-nowrap">
                        <Button variant="ghost" size="icon" aria-label="Modifier" onClick={() => { setEditing(r); setOpen(true); }}>
                          <Pencil className="size-4" />
                        </Button>
                        <Button variant="ghost" size="icon" aria-label="Supprimer" onClick={() => remove(r)}>
                          <Trash2 className="size-4 text-destructive" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
      <div className="text-xs text-muted-foreground">{filtered.length} enregistrement(s)</div>

      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setEditing(null); }}>
        {open && (
          <CrudDialog
            table={table}
            singular={singular}
            fields={fields}
            editing={editing}
            extraInsert={extraInsert}
            beforeSave={beforeSave}
            onDone={() => { setOpen(false); setEditing(null); qc.invalidateQueries({ queryKey }); }}
            onCancel={() => { setOpen(false); setEditing(null); }}
          />
        )}
      </Dialog>
    </div>
  );
}

function CrudDialog({
  table, singular, fields, editing, extraInsert, beforeSave, onDone, onCancel,
}: {
  table: string;
  singular: string;
  fields: CrudField[];
  editing: any;
  extraInsert?: Record<string, any>;
  beforeSave?: (payload: Record<string, any>, editing: any) => Promise<Record<string, any>>;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<Record<string, any>>(() => {
    if (!editing) return emptyForm(fields);
    const f: Record<string, any> = {};
    fields.forEach((x) => (f[x.name] = fromDbValue(x, editing[x.name])));
    return f;
  });
  const [saving, setSaving] = useState(false);

  const set = (k: string, v: any) => setForm((p) => ({ ...p, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    for (const f of fields) {
      if (f.required && (form[f.name] === "" || form[f.name] === null || form[f.name] === undefined)) {
        return toast.error(`Le champ « ${f.label} » est obligatoire.`);
      }
      if (f.type === "number" && form[f.name] !== "" && form[f.name] !== null) {
        const n = Number(form[f.name]);
        if (!Number.isFinite(n)) return toast.error(`« ${f.label} » doit être un nombre.`);
        if (f.min !== undefined && n < f.min) return toast.error(`« ${f.label} » doit être ≥ ${f.min}.`);
      }
    }

    const payload: Record<string, any> = {};
    fields.forEach((f) => (payload[f.name] = toDbValue(f, form[f.name])));

    setSaving(true);
    let finalPayload = payload;
    if (beforeSave) {
      try {
        finalPayload = await beforeSave(payload, editing);
      } catch (err: any) {
        setSaving(false);
        return toast.error(err?.message ?? "Enregistrement impossible.");
      }
    }
    let error: any;
    if (editing) {
      ({ error } = await supabase.from(table as any).update(finalPayload).eq("id", editing.id));
    } else {
      const schoolId = await getSchoolId();
      if (!schoolId) { setSaving(false); return toast.error("Établissement non identifié."); }
      ({ error } = await supabase.from(table as any).insert({ ...finalPayload, ...extraInsert, school_id: schoolId }));
    }
    setSaving(false);
    if (error) {
      return toast.error(
        error.code === "23505"
          ? `Cet enregistrement existe déjà (${singular}). Modifiez l'existant plutôt que d'en créer un second.`
          : error.message,
      );
    }
    void logActivity({
      action: editing ? "update" : "create",
      entity_type: table,
      entity_id: editing?.id ?? null,
    });
    toast.success(editing ? "Modifications enregistrées" : `${singular} ajouté(e)`);
    onDone();
  }

  return (
    <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{editing ? `Modifier — ${singular}` : singular}</DialogTitle>
      </DialogHeader>
      <form onSubmit={submit} className="grid sm:grid-cols-2 gap-4">
        {fields.map((f) => (
          <div key={f.name} className={f.full || f.type === "textarea" ? "sm:col-span-2" : ""}>
            {f.type === "checkbox" ? (
              <label className="flex items-center gap-2 pt-6 cursor-pointer">
                <Checkbox checked={!!form[f.name]} onCheckedChange={(v) => set(f.name, !!v)} />
                <span className="text-sm">{f.label}</span>
              </label>
            ) : (
              <>
                <Label className="mb-1.5 block">
                  {f.label}{f.required && <span className="text-destructive"> *</span>}
                </Label>
                {f.type === "textarea" ? (
                  <Textarea rows={3} value={form[f.name] ?? ""} placeholder={f.placeholder}
                    onChange={(e) => set(f.name, e.target.value)} />
                ) : f.type === "select" ? (
                  <Select value={form[f.name] ? String(form[f.name]) : ""} onValueChange={(v) => set(f.name, v)}>
                    <SelectTrigger><SelectValue placeholder="Sélectionner…" /></SelectTrigger>
                    <SelectContent>
                      {(f.options ?? []).map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    type={f.type === "datetime" ? "datetime-local" : (f.type ?? "text")}
                    step={f.step}
                    value={form[f.name] ?? ""}
                    placeholder={f.placeholder}
                    onChange={(e) => set(f.name, e.target.value)}
                  />
                )}
                {f.help && <p className="text-xs text-muted-foreground mt-1">{f.help}</p>}
              </>
            )}
          </div>
        ))}
        <DialogFooter className="sm:col-span-2">
          <Button type="button" variant="outline" onClick={onCancel}>Annuler</Button>
          <Button type="submit" disabled={saving}>{saving ? "Enregistrement…" : editing ? "Enregistrer" : "Ajouter"}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
