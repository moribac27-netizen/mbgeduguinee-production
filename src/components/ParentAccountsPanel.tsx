import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Upload, Play } from "lucide-react";
import { toast } from "sonner";
import { importParentAccounts, type ParentAccountResult } from "@/lib/parent-import.functions";
import { readFile } from "@/lib/data-import";
import { downloadTable } from "@/lib/data-export";
import { logActivity } from "@/lib/audit";

const HEADERS = ["Matricule élève", "Nom du parent", "Email", "Téléphone", "Relation"];
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
const BATCH = 50;

interface Row { line: number; studentMatricule: string; fullName: string; email: string; phone: string; relation: string; error?: string }

export function ParentAccountsPanel() {
  const run = useServerFn(importParentAccounts);
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<"invite" | "direct">("invite");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState<"analyse" | "run" | null>(null);
  const [progress, setProgress] = useState(0);
  const [report, setReport] = useState<{ ok: number; errors: Array<{ line: number; message: string }>; creds: ParentAccountResult[] } | null>(null);

  async function analyse() {
    if (!file) return toast.error("Choisissez d'abord un fichier.");
    setBusy("analyse"); setReport(null);
    try {
      const grid = await readFile(file);
      const head = (grid[0] ?? []).map(norm);
      const idx = HEADERS.map((h) => head.indexOf(norm(h)));
      const missing = HEADERS.filter((_, i) => i < 3 && idx[i] < 0);
      if (missing.length) { setRows(null); return toast.error(`Colonne(s) absente(s) : ${missing.join(", ")}.`); }
      const seen = new Set<string>();
      const out: Row[] = [];
      for (let r = 1; r < grid.length; r++) {
        const l = grid[r];
        if (l.every((c) => c === "")) continue;
        const g = (i: number) => (idx[i] >= 0 ? (l[idx[i]] ?? "") : "");
        const row: Row = { line: r + 1, studentMatricule: g(0), fullName: g(1), email: g(2), phone: g(3), relation: g(4) };
        if (!row.studentMatricule || !row.fullName || !row.email) row.error = "Matricule élève, nom du parent et e-mail sont obligatoires.";
        else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) row.error = "Adresse e-mail invalide.";
        else if (seen.has(norm(row.email))) row.error = "Même e-mail déjà présent plus haut dans le fichier (un compte par e-mail ; ajoutez les autres enfants depuis l'espace parent).";
        seen.add(norm(row.email));
        out.push(row);
      }
      setRows(out);
    } catch (e: any) { setRows(null); toast.error(e?.message ?? "Fichier illisible."); }
    finally { setBusy(null); }
  }

  async function launch() {
    if (!rows) return;
    const valid = rows.filter((r) => !r.error);
    if (!valid.length) return;
    if (!confirm(`Créer ${valid.length} compte(s) parent ?`)) return;
    setBusy("run"); setProgress(0);
    const errors = rows.filter((r) => r.error).map((r) => ({ line: r.line, message: r.error! }));
    const creds: ParentAccountResult[] = [];
    let ok = 0;
    try {
      for (let i = 0; i < valid.length; i += BATCH) {
        const chunk = valid.slice(i, i + BATCH);
        const res = await run({ data: { mode, rows: chunk.map((r) => ({ line: r.line, studentMatricule: r.studentMatricule, fullName: r.fullName, email: r.email, phone: r.phone || null, relation: r.relation || null })) } });
        for (const x of res) { if (x.ok) { ok++; if (x.tempPassword) creds.push(x); } else errors.push({ line: x.line, message: x.error ?? "Erreur" }); }
        setProgress(Math.min(i + BATCH, valid.length));
      }
      errors.sort((a, b) => a.line - b.line);
      setReport({ ok, errors, creds });
      setRows(null); setFile(null);
      if (fileRef.current) fileRef.current.value = "";
      void logActivity({ action: "create", entity_type: "import_parent_accounts", entity_label: file?.name ?? null, metadata: { mode, created: ok, errors: errors.length } });
      toast.success(`${ok} compte(s) parent créé(s).`);
    } catch (e: any) { toast.error(e?.message ?? "Échec de la création des comptes."); }
    finally { setBusy(null); }
  }

  const okCount = rows?.filter((r) => !r.error).length ?? 0;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Comptes parents</CardTitle>
        <CardDescription>
          Crée un compte parent par ligne et le rattache à l'élève. Colonnes : {HEADERS.join(", ")} (les trois premières sont obligatoires). Les élèves doivent déjà exister.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="w-72">
            <Label>Accès du parent</Label>
            <Select value={mode} onValueChange={(v) => { setMode(v as any); setRows(null); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="invite">Invitation par e-mail (recommandé)</SelectItem>
                <SelectItem value="direct">Mot de passe temporaire à remettre</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1 min-w-56">
            <Label>Fichier (.xlsx ou .csv)</Label>
            <input ref={fileRef} type="file" accept=".xlsx,.csv" className="block w-full text-sm file:mr-3 file:rounded-md file:border file:bg-background file:px-3 file:py-1.5"
              onChange={(e) => { setFile(e.target.files?.[0] ?? null); setRows(null); setReport(null); }} />
          </div>
          <Button variant="outline" onClick={() => downloadTable({ headers: HEADERS, rows: [["ELV-0001", "Fatoumata Camara", "f.camara@exemple.com", "622111111", "mère"]] }, "modele-comptes-parents", "xlsx", "Parents")}>Modèle Excel</Button>
          <Button onClick={analyse} disabled={!file || busy !== null} className="gap-2">
            {busy === "analyse" ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}Analyser
          </Button>
        </div>

        {rows && (
          <div className="space-y-2">
            <p className="text-sm">{okCount} ligne(s) prête(s) · {rows.length - okCount} en erreur (non créées).</p>
            {rows.filter((r) => r.error).slice(0, 50).map((r) => <p key={r.line} className="text-sm text-destructive">Ligne {r.line} : {r.error}</p>)}
            <Button onClick={launch} disabled={busy !== null || okCount === 0} className="gap-2">
              {busy === "run" ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
              {busy === "run" ? `Création… ${progress}/${okCount}` : "Créer les comptes"}
            </Button>
          </div>
        )}

        {report && (
          <div className="space-y-2 text-sm">
            <p>{report.ok} compte(s) créé(s) · {report.errors.length} erreur(s).</p>
            {report.errors.slice(0, 100).map((e, i) => <p key={i} className="text-destructive">Ligne {e.line} : {e.message}</p>)}
            {report.creds.length > 0 && (
              <div className="space-y-1">
                <p className="text-muted-foreground">Les mots de passe temporaires ne sont affichés qu'une fois : téléchargez la liste maintenant et remettez-la aux parents (changement obligatoire conseillé à la première connexion).</p>
                <Button variant="outline" size="sm" onClick={() => downloadTable({ headers: ["Email", "Mot de passe temporaire"], rows: report.creds.map((c) => [c.email ?? "", c.tempPassword ?? ""]) }, "identifiants-parents", "xlsx", "Identifiants")}>Télécharger les identifiants</Button>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
