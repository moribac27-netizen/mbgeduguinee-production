import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { KeyRound } from "lucide-react";
import { toast } from "sonner";
import { clearMustChangePassword } from "@/lib/account.functions";
import { validateNewPassword } from "@/lib/password";

export const Route = createFileRoute("/_authenticated/mon-compte")({
  head: () => ({ meta: [{ title: "Mon compte — MBGEduGuinée" }] }),
  component: MyAccountPage,
});

function MyAccountPage() {
  const clearFn = useServerFn(clearMustChangePassword);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const err = validateNewPassword(current, next, confirmation);
    if (err) return void toast.error(err);
    setBusy(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      const email = u.user?.email;
      if (!email) throw new Error("Session expirée, reconnectez-vous.");
      // Vérifie l'ancien mot de passe avant de le remplacer
      const check = await supabase.auth.signInWithPassword({ email, password: current });
      if (check.error) throw new Error("Le mot de passe actuel est incorrect.");
      const { error } = await supabase.auth.updateUser({ password: next });
      if (error) throw new Error(error.message);
      try { await clearFn(); await supabase.auth.refreshSession(); } catch { /* sans gravité : la bannière disparaîtra à la prochaine connexion */ }
      toast.success("Mot de passe modifié.");
      setCurrent(""); setNext(""); setConfirmation("");
    } catch (e: any) {
      toast.error(e?.message ?? "Impossible de modifier le mot de passe.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold">Mon compte</h1>
        <p className="mt-1 text-muted-foreground">Changez votre mot de passe à tout moment.</p>
      </div>
      <Card>
        <CardHeader>
          <div className="mb-2 flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary"><KeyRound className="size-5" /></div>
          <CardTitle>Changer mon mot de passe</CardTitle>
          <CardDescription>Au moins 8 caractères, avec des lettres et des chiffres.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-3">
            <div><Label>Mot de passe actuel (ou temporaire)</Label><Input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} /></div>
            <div><Label>Nouveau mot de passe</Label><Input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} /></div>
            <div><Label>Confirmer le nouveau mot de passe</Label><Input type="password" autoComplete="new-password" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} /></div>
            <Button type="submit" className="w-full" disabled={busy}>{busy ? "Enregistrement…" : "Enregistrer le nouveau mot de passe"}</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
