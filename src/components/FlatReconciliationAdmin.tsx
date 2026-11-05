import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatPublicGNF } from "@/lib/public-offers";
import { parseScheduleInput, parseStatement, reconciliationErrorMessage, type StatementRow } from "@/lib/statement-import";

const db = supabase as any;
const KEY = "billing.flat_progressive";

/** Calendrier de paiement mensuel progressif : mois cumulés exigés à chaque échéance. La base refuse toute valeur invalide. */
export function ProgressiveScheduleAdmin() {
  const qc = useQueryClient();
  const cfg = useQuery({ queryKey: ["flat-admin", "progressive"], queryFn: async () => {
    const { data, error } = await db.from("platform_settings").select("value").eq("key", KEY).maybeSingle();
    if (error) throw error;
    return (data?.value ?? null) as any;
  } });
  const [schedule, setSchedule] = useState<string | null>(null);
  const [fullBy, setFullBy] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (cfg.isLoading) return <Loader2 className="size-5 animate-spin" />;
  if (cfg.isError || !cfg.data) return <p className="text-sm text-destructive">Le calendrier progressif n'est pas disponible.</p>;
  const v = cfg.data;
  const scheduleText = schedule ?? (Array.isArray(v.schedule) ? v.schedule.join(", ") : "");
  const fullByText = fullBy ?? String(v.full_by ?? "");
  const total = Number(v.total_months ?? 12);
  const parsed = parseScheduleInput(scheduleText, total);

  async function save() {
    if (!parsed) { toast.error(reconciliationErrorMessage("PROGRESSIVE_SETTING_INVALID")); return; }
    if (fullByText && !/^\d{4}-\d{2}-\d{2}$/.test(fullByText)) { toast.error("La date limite doit être au format AAAA-MM-JJ."); return; }
    if (!window.confirm("Ce calendrier s'applique à toutes les écoles au forfait mensuel, y compris celles déjà inscrites. Confirmer ?")) return;
    setSaving(true);
    const next = { ...v, schedule: parsed, ...(fullByText ? { full_by: fullByText } : {}) };
    const { error } = await db.from("platform_settings").upsert({ key: KEY, value: next }, { onConflict: "key" });
    setSaving(false);
    if (error) { toast.error(reconciliationErrorMessage(error.message)); return; }
    toast.success("Calendrier enregistré.");
    setSchedule(null); setFullBy(null);
    void qc.invalidateQueries({ queryKey: ["flat-admin"] });
    void qc.invalidateQueries({ queryKey: ["my-flat-offer"] });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Calendrier de paiement mensuel progressif</CardTitle>
        <CardDescription>
          Chaque nombre est le total de mois qui doit être payé à l'échéance correspondante (1ʳᵉ échéance, 2ᵉ, 3ᵉ…). Il doit être croissant et finir par {total}.
          La date limite est celle avant laquelle les {total} mois doivent être entièrement réglés. Toute modification est historisée.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5"><Label>Mois cumulés par échéance</Label><Input value={scheduleText} onChange={(e) => setSchedule(e.target.value)} placeholder="1, 3, 5, 7, 9, 11, 12" /></div>
          <div className="space-y-1.5"><Label>Date limite des {total} mois (AAAA-MM-JJ)</Label><Input value={fullByText} onChange={(e) => setFullBy(e.target.value)} placeholder="2027-06-30" /></div>
        </div>
        {parsed ? (
          <p className="text-xs text-muted-foreground">
            Aperçu : {parsed.map((n, i) => `échéance ${i + 1} → ${n} mois cumulés${i === 0 ? "" : ` (+${n - parsed[i - 1]})`}`).join(" · ")}.
          </p>
        ) : <p className="text-xs text-destructive">Saisie invalide : nombres croissants entre 1 et {total}, le dernier doit être {total}.</p>}
        <Button size="sm" onClick={save} disabled={saving || !parsed}>{saving && <Loader2 className="mr-2 size-4 animate-spin" />}Enregistrer le calendrier</Button>
      </CardContent>
    </Card>
  );
}

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  VALIDATED: { label: "Validé automatiquement", cls: "bg-emerald-100 text-emerald-900" },
  RECEIVED: { label: "En attente d'une déclaration", cls: "bg-slate-200 text-slate-800" },
  AMOUNT_MISMATCH: { label: "Montant différent", cls: "bg-amber-100 text-amber-900" },
};

/** Import d'un relevé Orange Money (fichier CSV, texte copié ou SMS collés) : mêmes règles que le SMS (référence + montant exacts). */
export function StatementImportAdmin() {
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any>(null);
  const parsed = text.trim() ? parseStatement(text) : null;

  async function pickFile(f: File | null) {
    if (!f) return;
    if (f.size > 2_000_000) { toast.error("Fichier trop volumineux (2 Mo maximum)."); return; }
    setFileName(f.name);
    setText(await f.text());
    setResult(null);
  }

  async function run() {
    if (!parsed?.rows.length || busy) return;
    setBusy(true);
    const payload = parsed.rows.map((r: StatementRow) => ({ ref: r.ref, amount: r.amount, phone: r.phone ?? null, label: r.label }));
    const { data, error } = await db.rpc("import_payment_statement", { _filename: fileName || "texte collé", _rows: payload });
    setBusy(false);
    if (error) { toast.error(reconciliationErrorMessage(error.message)); return; }
    setResult(data);
    toast.success(`${data.validated} paiement(s) validé(s) automatiquement.`);
    void qc.invalidateQueries({ queryKey: ["flat-admin"] });
    void qc.invalidateQueries({ queryKey: ["reconciliation-history"] });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Rapprochement avec un relevé Orange Money</CardTitle>
        <CardDescription>
          Déposez le relevé (CSV ou texte) ou collez les SMS de réception. Chaque ligne n'est validée que si la référence ET le montant correspondent exactement à un paiement déclaré en attente ;
          sinon rien n'est validé. Les lignes de sortie d'argent sont ignorées, et une référence déjà traitée n'est jamais comptée deux fois.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <Input type="file" accept=".csv,.txt,text/csv,text/plain" className="max-w-xs" onChange={(e) => void pickFile(e.target.files?.[0] ?? null)} />
          {fileName && <span className="text-xs text-muted-foreground">{fileName}</span>}
        </div>
        <Textarea rows={5} value={text} onChange={(e) => { setText(e.target.value); setResult(null); }} placeholder="… ou collez ici le relevé ou les SMS Orange Money" />
        {parsed && (
          <div className="space-y-2">
            <p className="text-sm">{parsed.rows.length} réception(s) détectée(s), {parsed.ignored} ligne(s) ignorée(s).</p>
            {parsed.rows.length > 0 && (
              <div className="max-h-48 overflow-auto rounded-lg border">
                <Table>
                  <TableHeader><TableRow><TableHead>Référence</TableHead><TableHead>Montant</TableHead></TableRow></TableHeader>
                  <TableBody>{parsed.rows.slice(0, 50).map((r) => <TableRow key={r.ref}><TableCell className="font-mono text-xs">{r.ref}</TableCell><TableCell>{formatPublicGNF(r.amount)}</TableCell></TableRow>)}</TableBody>
                </Table>
              </div>
            )}
          </div>
        )}
        <Button size="sm" onClick={run} disabled={busy || !parsed?.rows.length}>{busy && <Loader2 className="mr-2 size-4 animate-spin" />}Importer et rapprocher</Button>
        {result && (
          <div className="rounded-lg bg-muted/40 p-3 text-sm">
            <strong>Résultat :</strong> {result.validated} validé(s) · {result.waiting} en attente d'une déclaration d'école · {result.mismatch} avec montant différent · {result.duplicate} déjà connu(s) · {result.ignored} ignoré(s).
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Historique des rapprochements (SMS et relevés). Le numéro de téléphone est masqué. */
export function ReconciliationHistoryAdmin() {
  const hist = useQuery({ queryKey: ["reconciliation-history"], retry: false, queryFn: async () => {
    const { data, error } = await db.rpc("payment_reconciliation_history", { _limit: 200 });
    if (error) throw error;
    return (data ?? []) as any[];
  } });
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Historique des rapprochements</CardTitle>
        <CardDescription>Les 200 derniers SMS et lignes de relevé reçus, et ce qu'ils ont donné.</CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        {hist.isError ? <p className="text-sm text-destructive">Historique indisponible (migration SQL non appliquée ?).</p> : (
          <Table>
            <TableHeader><TableRow><TableHead>Reçu le</TableHead><TableHead>Origine</TableHead><TableHead>Référence</TableHead><TableHead>Montant</TableHead><TableHead>Expéditeur</TableHead><TableHead>Résultat</TableHead><TableHead>École / paiement</TableHead></TableRow></TableHeader>
            <TableBody>
              {(hist.data ?? []).map((h) => {
                const st = STATUS_LABEL[h.status] ?? { label: h.status, cls: "" };
                return (
                  <TableRow key={h.id}>
                    <TableCell className="whitespace-nowrap">{new Date(h.received_at).toLocaleString("fr-FR")}</TableCell>
                    <TableCell>{h.source === "csv" ? `Relevé${h.filename ? ` (${h.filename})` : ""}` : "SMS"}</TableCell>
                    <TableCell className="font-mono text-xs">{h.ref_norm}</TableCell>
                    <TableCell>{formatPublicGNF(Number(h.amount))}</TableCell>
                    <TableCell>{h.sender_masked ?? "—"}</TableCell>
                    <TableCell><Badge className={st.cls}>{st.label}</Badge>{h.note ? <div className="mt-1 text-xs text-muted-foreground">{h.note}</div> : null}</TableCell>
                    <TableCell>{h.school_name ? `${h.school_name} — ${h.payment_reference}` : "—"}</TableCell>
                  </TableRow>
                );
              })}
              {hist.isLoading && <TableRow><TableCell colSpan={7}><Loader2 className="size-4 animate-spin" /></TableCell></TableRow>}
              {!hist.isLoading && !(hist.data ?? []).length && <TableRow><TableCell colSpan={7} className="text-center text-sm text-muted-foreground">Aucun rapprochement pour le moment.</TableCell></TableRow>}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
