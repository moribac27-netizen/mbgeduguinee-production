import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const db = supabase as any;
const MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

async function saveKey(key: string, value: unknown): Promise<boolean> {
  const { error } = await db.from("platform_settings").upsert({ key, value }, { onConflict: "key" });
  if (error) {
    toast.error(String(error.message).includes("BILLING_SETTING_INVALID") ? "Valeur refusée : vérifiez les dates et les limites." : "Enregistrement impossible.");
    return false;
  }
  toast.success("Paramètre enregistré et historisé.");
  return true;
}

/** Calendrier scolaire (début/fin d'année), versement minimum et interrupteur de suspension automatique. Tout est historisé. */
export function FlatBillingConfigAdmin() {
  const qc = useQueryClient();
  const cfg = useQuery({ queryKey: ["flat-admin", "billing-config"], queryFn: async () => {
    const { data, error } = await db.from("platform_settings").select("key,value").in("key", ["billing.school_calendar", "billing.flat_installments", "billing.flat"]);
    if (error) throw error;
    return Object.fromEntries((data ?? []).map((r: any) => [r.key, r.value])) as Record<string, any>;
  } });
  const [cal, setCal] = useState<{ sd: string; sm: string; ed: string; em: string } | null>(null);
  const [minPay, setMinPay] = useState<string | null>(null);

  if (cfg.isLoading) return <Loader2 className="size-5 animate-spin" />;
  if (cfg.isError || !cfg.data) return <p className="text-sm text-destructive">Paramètres de facturation indisponibles.</p>;
  const c = cfg.data["billing.school_calendar"] ?? { start_day: 1, start_month: 10, end_day: 30, end_month: 6 };
  const inst = cfg.data["billing.flat_installments"] ?? {};
  const flat = cfg.data["billing.flat"] ?? {};
  const calv = cal ?? { sd: String(c.start_day), sm: String(c.start_month), ed: String(c.end_day), em: String(c.end_month) };
  const enforce = flat.enforce_suspension !== false;
  const done = () => { void qc.invalidateQueries({ queryKey: ["flat-admin"] }); void qc.invalidateQueries({ queryKey: ["school-suspension"] }); };

  async function saveCalendar() {
    const [sd, sm, ed, em] = [calv.sd, calv.sm, calv.ed, calv.em].map(Number);
    const ok = (d: number, m: number) => Number.isInteger(d) && Number.isInteger(m) && m >= 1 && m <= 12 && d >= 1 && d <= new Date(2001, m, 0).getDate();
    if (!ok(sd, sm) || !ok(ed, em)) return void toast.error("Dates invalides.");
    if (!window.confirm("Le nouveau calendrier s'applique aux inscriptions et échéanciers calculés à partir de maintenant. Confirmer ?")) return;
    if (await saveKey("billing.school_calendar", { start_day: sd, start_month: sm, end_day: ed, end_month: em })) { setCal(null); done(); }
  }
  async function saveMin() {
    const n = Number(minPay ?? inst.min_payment ?? 10000);
    if (!Number.isFinite(n) || n < 0 || n > 1_000_000) return void toast.error("Montant invalide (0 à 1 000 000).");
    if (await saveKey("billing.flat_installments", { ...inst, min_payment: n })) { setMinPay(null); done(); }
  }
  async function toggleSuspension() {
    const msg = enforce
      ? "Désactiver la suspension automatique ? Plus aucun établissement ne sera bloqué pour impayé."
      : "Activer la suspension automatique ? Les établissements en impayé seront bloqués immédiatement.";
    if (!window.confirm(msg)) return;
    if (await saveKey("billing.flat", { ...flat, enforce_suspension: !enforce })) done();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Calendrier scolaire, versements et suspension</CardTitle>
        <CardDescription>
          L'année scolaire commence et finit aux dates ci-dessous (par défaut 1ᵉʳ octobre – 30 juin). Les inscriptions pendant les vacances sont rattachées à l'année suivante.
          Les tarifs, les jours d'échéance et de tolérance se règlent plus haut.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2 rounded-xl border p-4">
          <div className="text-sm font-semibold">Année scolaire</div>
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="space-y-1.5"><Label>Jour de début</Label><Input type="number" value={calv.sd} onChange={(e) => setCal({ ...calv, sd: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Mois de début (1-12)</Label><Input type="number" value={calv.sm} onChange={(e) => setCal({ ...calv, sm: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Jour de fin</Label><Input type="number" value={calv.ed} onChange={(e) => setCal({ ...calv, ed: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Mois de fin (1-12)</Label><Input type="number" value={calv.em} onChange={(e) => setCal({ ...calv, em: e.target.value })} /></div>
          </div>
          <p className="text-xs text-muted-foreground">Aperçu : du {calv.sd} {MONTHS[Number(calv.sm) - 1] ?? "?"} au {calv.ed} {MONTHS[Number(calv.em) - 1] ?? "?"}.</p>
          <Button size="sm" onClick={saveCalendar}>Enregistrer le calendrier</Button>
        </div>
        <div className="space-y-2 rounded-xl border p-4">
          <div className="text-sm font-semibold">Versement minimum (après le premier paiement)</div>
          <div className="max-w-xs space-y-1.5"><Label>Montant minimum (GNF)</Label><Input type="number" value={minPay ?? String(inst.min_payment ?? 10000)} onChange={(e) => setMinPay(e.target.value)} /></div>
          <Button size="sm" onClick={saveMin}>Enregistrer</Button>
        </div>
        <div className="space-y-2 rounded-xl border p-4">
          <div className="text-sm font-semibold">Suspension automatique pour impayé</div>
          <p className="text-xs text-muted-foreground">Actuellement : <b>{enforce ? "active" : "désactivée"}</b>. Quand elle est active, un établissement en retard au-delà de la tolérance est bloqué pour tous ses utilisateurs (sauf l'écran de paiement) et réactivé dès qu'un paiement est validé.</p>
          <Button size="sm" variant={enforce ? "outline" : "default"} onClick={toggleSuspension}>{enforce ? "Désactiver" : "Activer"}</Button>
        </div>
      </CardContent>
    </Card>
  );
}

function summarize(v: any): string {
  if (v === null || v === undefined) return "—";
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return s.length > 140 ? s.slice(0, 137) + "…" : s;
}

/** Journal immuable des modifications de configuration (paramètres de facturation, paiement, tarifs) avec l'auteur. */
export function BillingConfigJournal() {
  const j = useQuery({ queryKey: ["flat-admin", "config-journal"], retry: false, queryFn: async () => {
    const { data, error } = await db.rpc("billing_config_journal", { _limit: 100 });
    if (error) throw error;
    return (data ?? []) as any[];
  } });
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Journal des modifications de configuration</CardTitle>
        <CardDescription>Qui a changé quoi, quand, avec l'ancienne et la nouvelle valeur. Ce journal ne peut être ni modifié ni effacé.</CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        {j.isError ? <p className="text-sm text-destructive">Journal indisponible (migration SQL non appliquée ?).</p> : (
          <Table>
            <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Type</TableHead><TableHead>Élément</TableHead><TableHead>Avant</TableHead><TableHead>Après</TableHead><TableHead>Auteur</TableHead></TableRow></TableHeader>
            <TableBody>
              {(j.data ?? []).map((r, i) => (
                <TableRow key={i}>
                  <TableCell className="whitespace-nowrap">{new Date(r.changed_at).toLocaleString("fr-FR")}</TableCell>
                  <TableCell>{r.kind === "tarif" ? "Tarif" : "Paramètre"}</TableCell>
                  <TableCell className="font-mono text-xs">{r.subject}</TableCell>
                  <TableCell className="max-w-[16rem] break-words text-xs">{summarize(r.old_value)}</TableCell>
                  <TableCell className="max-w-[16rem] break-words text-xs">{summarize(r.new_value)}</TableCell>
                  <TableCell className="text-xs">{r.actor_email ?? "—"}</TableCell>
                </TableRow>
              ))}
              {j.isLoading && <TableRow><TableCell colSpan={6}><Loader2 className="size-4 animate-spin" /></TableCell></TableRow>}
              {!j.isLoading && !(j.data ?? []).length && <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground">Aucune modification enregistrée.</TableCell></TableRow>}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
