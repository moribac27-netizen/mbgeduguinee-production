import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { founderErrorMessage } from "@/lib/founder";

const db = supabase as any;
type FounderRow = { user_id: string; full_name: string | null; disabled: boolean; schools: Array<{ school_id: string; school_name: string | null; linked_at: string; revoked_at: string | null }> };

/** Super Admin : rattacher / retirer un fondateur à un établissement (le rôle n'est attribuable que d'ici). */
export function FounderAccountsAdmin({ schools }: { schools: Array<{ id: string; name: string }> }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [userId, setUserId] = useState("");
  const [schoolId, setSchoolId] = useState("");
  const [busy, setBusy] = useState(false);

  const list = useQuery({ queryKey: ["founder", "admin-list"], retry: false, queryFn: async () => {
    const { data, error } = await db.rpc("founder_list");
    if (error) throw error;
    return (data ?? []) as FounderRow[];
  } });
  const found = useQuery({
    queryKey: ["founder", "user-search", search], enabled: search.trim().length >= 2, retry: false,
    queryFn: async () => (await db.from("profiles").select("id, full_name").ilike("full_name", `%${search.trim()}%`).limit(8)).data as Array<{ id: string; full_name: string | null }> ?? [],
  });

  async function act(fn: "founder_grant" | "founder_revoke", u: string, s: string, ok: string) {
    setBusy(true);
    const { data, error } = await db.rpc(fn, { _user_id: u, _school_id: s });
    setBusy(false);
    if (error) { toast.error(founderErrorMessage(error)); return; }
    toast.success(ok + (data?.ban_required ? " — plus aucun établissement lié." : ""));
    setUserId(""); setSearch("");
    void qc.invalidateQueries({ queryKey: ["founder"] });
  }

  return (
    <Card>
      <CardHeader><CardTitle>Fondateurs</CardTitle><CardDescription>Accès en consultation seule à un ou plusieurs établissements. Le compte doit déjà exister ; seul le Super Admin peut attribuer ce rôle.</CardDescription></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2 md:grid-cols-[1fr_1fr_auto]">
          <div className="space-y-1">
            <Input placeholder="Rechercher un utilisateur par nom…" value={search} onChange={(e) => { setSearch(e.target.value); setUserId(""); }} />
            {!userId && (found.data ?? []).map((p) => <button key={p.id} type="button" className="block w-full text-left text-sm rounded px-2 py-1 hover:bg-muted" onClick={() => { setUserId(p.id); setSearch(p.full_name ?? p.id); }}>{p.full_name ?? p.id}</button>)}
          </div>
          <select className="h-9 rounded-md border bg-background px-2 text-sm" value={schoolId} onChange={(e) => setSchoolId(e.target.value)} aria-label="Établissement">
            <option value="">Établissement…</option>
            {schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <Button disabled={busy || !userId || !schoolId} onClick={() => void act("founder_grant", userId, schoolId, "Fondateur rattaché")}>Rattacher</Button>
        </div>
        {list.error && <p className="text-sm text-red-700">Liste indisponible.</p>}
        <div className="space-y-2">
          {(list.data ?? []).length === 0 && !list.isLoading && <p className="text-sm text-muted-foreground">Aucun fondateur pour le moment.</p>}
          {(list.data ?? []).map((f) => (
            <div key={f.user_id} className="rounded-lg border p-3 text-sm">
              <div className="font-medium">{f.full_name ?? f.user_id} {f.disabled && <Badge variant="outline">Compte désactivé</Badge>}</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {f.schools.map((s) => s.revoked_at
                  ? <Badge key={s.school_id} variant="outline" className="line-through">{s.school_name}</Badge>
                  : <span key={s.school_id} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5">{s.school_name}
                      <button type="button" disabled={busy} className="text-red-700 font-bold" aria-label={`Retirer ${s.school_name}`} onClick={() => { if (window.confirm(`Retirer l'accès de ${f.full_name ?? "ce fondateur"} à ${s.school_name} ?`)) void act("founder_revoke", f.user_id, s.school_id, "Accès retiré"); }}>×</button></span>)}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
