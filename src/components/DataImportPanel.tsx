import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Upload, Play, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  IMPORT_LABELS, buildPreview, readFile, rollbackImport, runImport,
  type ImportKind, type ImportMode, type ImportResult, type Preview, type RowAction,
} from "@/lib/data-import";
import { downloadTable } from "@/lib/data-export";
import { COLUMNS } from "@/lib/data-import";

const ACTION_LABEL: Record<RowAction, string> = { create: "À créer", update: "À mettre à jour", skip: "Ignorée", error: "Erreur" };
const ACTION_VARIANT: Record<RowAction, "default" | "secondary" | "destructive" | "outline"> = { create: "default", update: "secondary", skip: "outline", error: "destructive" };
const ROLLBACK_DAYS = 7;

export function DataImportPanel({ schoolId }: { schoolId: string | null }) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<ImportKind>("classes");
  const [mode, setMode] = useState<ImportMode>("add");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState<"analyse" | "import" | null>(null);
  const [progress, setProgress] = useState<[number, number]>([0, 0]);
  const [result, setResult] = useState<ImportResult | null>(null);

  const { data: history = [] } = useQuery({
    queryKey: ["data-imports", schoolId],
    enabled: !!schoolId,
    queryFn: async () => ((await (supabase as any).from("data_imports").select("*").order("created_at", { ascending: false }).limit(10)).data ?? []) as any[],
  });

  function reset() { setPreview(null); setResult(null); }

  async function analyse() {
    if (!file) return toast.error("Choisissez d'abord un fichier.");
    setBusy("analyse"); setResult(null);
    try {
      const grid = await readFile(file);
      const p = await buildPreview(kind, mode, grid);
      setPreview(p);
      if (p.headerErrors.length) toast.error(p.headerErrors[0]);
    } catch (e: any) {
      setPreview(null); toast.error(e?.message ?? "Fichier illisible.");
    } finally { setBusy(null); }
  }

  async function launch() {
    if (!file || !preview) return;
    setBusy("import"); setProgress([0, preview.counts.create + preview.counts.update]);
    try {
      const r = await runImport(kind, mode, file.name, preview, (d, t) => setProgress([d, t]));
      setResult(r); setPreview(null); setFile(null);
      if (fileRef.current) fileRef.current.value = "";
      qc.invalidateQueries();
      toast.success(`Import terminé : ${r.created} créé(s), ${r.updated} mis à jour.`);
    } catch (e: any) {
      toast.error(e?.message ?? "Échec de l'import.");
    } finally { setBusy(null); }
  }

  async function undo(h: any) {
    if (!confirm(`Annuler l'import « ${h.filename} » ? Les lignes qu'il a créées seront supprimées (celles déjà utilisées ailleurs sont conservées).`)) return;
    try {
      const r = await rollbackImport(h.id, h.kind);
      toast.success(`Import annulé : ${r.deleted} supprimé(s)${r.kept ? `, ${r.kept} conservé(s) car déjà utilisés` : ""}.`);
      qc.invalidateQueries();
    } catch (e: any) { toast.error(e?.message ?? "Annulation impossible."); }
  }

  function downloadErrors(errs: Array<{ line: number; message: string }>) {
    downloadTable({ headers: ["Ligne", "Problème"], rows: errs.map((e) => [e.line, e.message]) }, `rapport-erreurs-${kind}`, "xlsx", "Erreurs");
  }

  if (!schoolId) {
    return (
      <Card><CardHeader><CardTitle>Importer</CardTitle>
        <CardDescription>L'import nécessite d'être rattaché à un établissement. Connectez-vous avec un compte de l'établissement concerné.</CardDescription></CardHeader></Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Importer des données</CardTitle>
          <CardDescription>Ordre conseillé : classes, matières, enseignants, élèves, puis affectations. Téléchargez le modèle, remplissez-le, puis analysez-le : rien n'est enregistré avant votre confirmation.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="w-44">
              <Label>Données</Label>
              <Select value={kind} onValueChange={(v) => { setKind(v as ImportKind); reset(); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{(Object.keys(IMPORT_LABELS) as ImportKind[]).map((k) => <SelectItem key={k} value={k}>{IMPORT_LABELS[k]}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="w-64">
              <Label>Mode</Label>
              <Select value={mode} onValueChange={(v) => { setMode(v as ImportMode); reset(); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="add">Ajouter seulement les nouveaux</SelectItem>
                  <SelectItem value="update">Mettre à jour seulement l'existant</SelectItem>
                  <SelectItem value="add_update">Ajouter et mettre à jour</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 min-w-56">
              <Label>Fichier (.xlsx ou .csv, 5 Mo max)</Label>
              <input ref={fileRef} type="file" accept=".xlsx,.csv" className="block w-full text-sm file:mr-3 file:rounded-md file:border file:bg-background file:px-3 file:py-1.5"
                onChange={(e) => { setFile(e.target.files?.[0] ?? null); reset(); }} />
            </div>
            <Button variant="outline" onClick={() => downloadTable({ headers: COLUMNS[kind].map((c) => c.header), rows: [] }, `modele-import-${kind}`, "xlsx", IMPORT_LABELS[kind])}>Modèle vide</Button>
            <Button onClick={analyse} disabled={!file || busy !== null} className="gap-2">
              {busy === "analyse" ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}Analyser
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Les cellules vides ne modifient jamais une donnée existante. Le matricule d'un élève ou d'un enseignant n'est jamais changé par une mise à jour ; s'il est vide à la création, il est généré automatiquement.
          </p>
        </CardContent>
      </Card>

      {preview && !preview.headerErrors.length && (
        <Card>
          <CardHeader>
            <CardTitle>Aperçu avant import</CardTitle>
            <CardDescription>
              {preview.counts.create} à créer · {preview.counts.update} à mettre à jour · {preview.counts.skip} ignorée(s) · {preview.counts.error} en erreur. Les lignes en erreur ne seront pas importées ; les autres le seront.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="overflow-x-auto max-h-96 overflow-y-auto">
              <Table>
                <TableHeader><TableRow><TableHead>Ligne</TableHead><TableHead>Élément</TableHead><TableHead>État</TableHead><TableHead>Détail</TableHead></TableRow></TableHeader>
                <TableBody>
                  {[...preview.rows].sort((a, b) => (a.action === "error" ? -1 : 0) - (b.action === "error" ? -1 : 0)).slice(0, 200).map((r) => (
                    <TableRow key={r.line}>
                      <TableCell>{r.line}</TableCell>
                      <TableCell>{r.label || "—"}</TableCell>
                      <TableCell><Badge variant={ACTION_VARIANT[r.action]}>{ACTION_LABEL[r.action]}</Badge></TableCell>
                      <TableCell className="text-sm text-muted-foreground">{r.message ?? ""}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {preview.rows.length > 200 && <p className="text-xs text-muted-foreground">Seules les 200 premières lignes sont affichées (erreurs en tête).</p>}
            <div className="flex gap-2">
              <Button onClick={launch} disabled={busy !== null || preview.counts.create + preview.counts.update === 0} className="gap-2">
                {busy === "import" ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
                {busy === "import" ? `Import en cours… ${progress[0]}/${progress[1]}` : "Lancer l'import"}
              </Button>
              <Button variant="outline" onClick={reset} disabled={busy !== null}>Annuler</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {result && (
        <Card>
          <CardHeader>
            <CardTitle>Rapport d'import</CardTitle>
            <CardDescription>{result.created} créé(s) · {result.updated} mis à jour · {result.skipped} ignoré(s) · {result.errors.length} erreur(s).</CardDescription>
          </CardHeader>
          {result.errors.length > 0 && (
            <CardContent className="space-y-2">
              <ul className="text-sm space-y-1 max-h-60 overflow-y-auto">{result.errors.slice(0, 100).map((e, i) => <li key={i}>Ligne {e.line} : {e.message}</li>)}</ul>
              <Button variant="outline" size="sm" onClick={() => downloadErrors(result.errors)}>Télécharger le rapport d'erreurs</Button>
            </CardContent>
          )}
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>Historique des imports</CardTitle><CardDescription>Annulation possible pendant {ROLLBACK_DAYS} jours.</CardDescription></CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Données</TableHead><TableHead>Fichier</TableHead><TableHead>Résultat</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>
              {history.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">Aucun import pour le moment</TableCell></TableRow>}
              {history.map((h: any) => {
                const recent = Date.now() - new Date(h.created_at).getTime() < ROLLBACK_DAYS * 86400000;
                return (
                  <TableRow key={h.id}>
                    <TableCell className="whitespace-nowrap">{new Date(h.created_at).toLocaleString("fr-FR")}</TableCell>
                    <TableCell>{IMPORT_LABELS[h.kind as ImportKind] ?? h.kind}</TableCell>
                    <TableCell className="max-w-48 truncate">{h.filename}</TableCell>
                    <TableCell className="text-sm">
                      {h.status === "rolled_back" ? <Badge variant="outline">Annulé</Badge> : `${h.created_count} créé(s), ${h.updated_count} mis à jour, ${h.error_count} erreur(s)`}
                    </TableCell>
                    <TableCell>
                      {h.status === "completed" && recent && h.created_count > 0 && (
                        <Button variant="ghost" size="sm" className="gap-1" onClick={() => undo(h)}><Undo2 className="size-4" />Annuler</Button>
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
