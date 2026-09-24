import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { KeyRound } from "lucide-react";
import { resolveUserHome } from "@/lib/auth-redirect";

export const Route = createFileRoute("/definir-mot-de-passe")({
  ssr: false,
  head: () => ({ meta: [{ title: "Définir mon mot de passe — MBGEduGuinée" }] }),
  component: SetPasswordPage,
});

function SetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let mounted = true;

    const checkSession = async () => {
      const { data, error } = await supabase.auth.getSession();
      if (!mounted) return;
      if (error) {
        setLoading(false);
        toast.error("Impossible de vérifier le lien. Demandez un nouveau lien.");
        return;
      }
      setReady(!!data.session);
      setLoading(false);
    };

    const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      if (event === "SIGNED_IN" || event === "PASSWORD_RECOVERY" || event === "TOKEN_REFRESHED") {
        setReady(!!session);
        setLoading(false);
      }
    });

    void checkSession();
    return () => {
      mounted = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    if (!ready) return toast.error("Ce lien est invalide ou expiré. Demandez un nouveau lien.");
    if (password.length < 6) return toast.error("Le mot de passe doit contenir au moins 6 caractères.");
    if (password !== confirmation) return toast.error("Les deux mots de passe ne correspondent pas.");

    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (error) return toast.error(`Impossible de définir le mot de passe : ${error.message}`);

    toast.success("Mot de passe défini avec succès.");
    try {
      await navigate({ to: await resolveUserHome(), replace: true });
    } catch {
      await navigate({ to: "/auth", replace: true });
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-8">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="mb-2 flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <KeyRound className="size-5" />
          </div>
          <CardTitle>Définir mon mot de passe</CardTitle>
          <CardDescription>
            {ready
              ? "Choisissez un mot de passe pour activer votre compte."
              : "Vérification du lien d’accès en cours…"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Vérification du lien…</p>
          ) : !ready ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Ce lien n’est plus valide ou n’a pas été correctement ouvert. Demandez à l’administrateur de renvoyer l’invitation ou le lien de récupération.
              </p>
              <Button className="w-full" onClick={() => navigate({ to: "/auth" })}>
                Retour à la connexion
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="password">Nouveau mot de passe *</Label>
                <Input
                  id="password"
                  type="password"
                  minLength={12}
                  required
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="confirmation">Confirmer le mot de passe *</Label>
                <Input
                  id="confirmation"
                  type="password"
                  minLength={12}
                  required
                  autoComplete="new-password"
                  value={confirmation}
                  onChange={(e) => setConfirmation(e.target.value)}
                />
              </div>
              <Button type="submit" className="w-full" disabled={saving}>
                {saving ? "Enregistrement…" : "Définir mon mot de passe"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
