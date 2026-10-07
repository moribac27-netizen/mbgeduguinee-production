import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Création d'une classe de niveau « Maternelle » (même table `classes` que la page Classes).
 * Utilisable directement depuis la page Maternelle et depuis l'assistant d'inscription.
 */
export function NewNurseryClass({ onCreated, defaultOpen = false }: { onCreated?: (id: string) => void; defaultOpen?: boolean }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(defaultOpen);
  const [name, setName] = useState("");
  const [fee, setFee] = useState("0");
  const [busy, setBusy] = useState(false);

  async function create() {
    if (busy || !name.trim()) return;
    setBusy(true);
    try {
      const { data, error } = await supabase
        .from("classes")
        .insert({ name: name.trim(), level: "Maternelle", annual_fee: Math.max(0, Number(fee) || 0) } as any)
        .select("id")
        .single();
      if (error || !data) {
        return void toast.error(error?.message ?? "Création impossible : vérifiez vos droits.");
      }
      toast.success(`Classe « ${name.trim()} » créée (niveau Maternelle)`);
      await Promise.all(["opt-classes", "classes-full", "classes"].map((k) => qc.invalidateQueries({ queryKey: [k] })));
      onCreated?.(data.id);
      setOpen(false);
      setName("");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <Button type="button" variant="outline" className="gap-2" onClick={() => setOpen(true)}>
        <Plus className="size-4" />Créer une classe de Maternelle
      </Button>
    );
  }
  return (
    <div className="grid gap-3 rounded-md border p-3 sm:grid-cols-[1fr_170px_auto] sm:items-end">
      <div className="space-y-1.5">
        <Label>Nom de la classe</Label>
        <Input autoFocus placeholder="ex. Petite section" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void create(); } }} />
      </div>
      <div className="space-y-1.5">
        <Label>Frais annuels (GNF)</Label>
        <Input type="number" min={0} value={fee} onChange={(e) => setFee(e.target.value)} />
      </div>
      <div className="flex gap-2">
        <Button type="button" onClick={create} disabled={busy || !name.trim()}>{busy ? "Création…" : "Créer"}</Button>
        <Button type="button" variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
      </div>
    </div>
  );
}
