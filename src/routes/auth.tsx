import { createFileRoute, Link, redirect, useNavigate, useSearch } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { registerSchool } from "@/lib/school-signup.functions";
import { redeemAccessCodeAndSignUp } from "@/lib/access-codes.functions";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { School, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { logLogin } from "@/lib/audit";
import { resolveUserHome } from "@/lib/auth-redirect";


const emptySignUp = { email: "", password: "", fullName: "", phone: "", schoolName: "", schoolAddress: "", schoolPhone: "" };
const emptyFamilySignUp = { code: "", email: "", password: "", fullName: "", phone: "", asRole: "parent" as "parent" | "eleve" };

export const Route = createFileRoute("/auth")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>): { plan?: string; cycle?: "monthly" | "yearly" } => ({
    ...(s.plan ? { plan: String(s.plan) } : {}),
    ...(s.cycle === "yearly" || s.cycle === "monthly" ? { cycle: s.cycle } : {}),
  }),
  beforeLoad: async ({ search }) => {
    const { data } = await supabase.auth.getUser();
    if (data.user) {
      if (search.plan) throw redirect({ to: "/souscription", search: { plan: search.plan, ...(search.cycle ? { cycle: search.cycle } : {}) } });
      throw redirect({ to: await resolveUserHome() });
    }
  },
  head: () => ({ meta: [{ title: "Connexion — MBGEduGuinée" }] }),
  component: AuthPage,
});

function AuthPage() {
  const { plan, cycle } = useSearch({ from: "/auth" });
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [signIn, setSignIn] = useState({ email: "", password: "" });
  const [signUp, setSignUp] = useState(emptySignUp);
  const [familySignUp, setFamilySignUp] = useState(emptyFamilySignUp);
  const redeemFn = useServerFn(redeemAccessCodeAndSignUp);

  const afterAuth = async () => {
    if (plan) return navigate({ to: "/souscription", search: { plan, ...(cycle ? { cycle } : {}) } });
    return navigate({ to: await resolveUserHome(), replace: true });
  };

  const [unconfirmedEmail, setUnconfirmedEmail] = useState<string | null>(null);
  const [resending, setResending] = useState(false);

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword(signIn);
    setLoading(false);
    if (error) {
      const msg = error.message.toLowerCase();
      if (msg.includes("confirm")) setUnconfirmedEmail(signIn.email.trim());
      return toast.error(error.message);
    }
    setUnconfirmedEmail(null);
    toast.success("Connexion réussie");
    void logLogin(signIn.email.trim());
    afterAuth();

  }

  async function handleResend() {
    const email = unconfirmedEmail ?? signIn.email.trim();
    if (!email || resending) return;
    setResending(true);
    const { error } = await supabase.auth.resend({
      type: "signup",
      email,
      options: { emailRedirectTo: window.location.origin + "/auth" },
    });
    setResending(false);
    if (error) return toast.error(error.message);
    toast.success("E-mail de confirmation renvoyé. Vérifiez votre boîte de réception.");
  }

  const [rechecking, setRechecking] = useState(false);
  async function handleRecheck() {
    if (rechecking) return;
    if (!signIn.password) return toast.error("Saisissez votre mot de passe pour vérifier.");
    setRechecking(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: unconfirmedEmail ?? signIn.email.trim(),
      password: signIn.password,
    });
    setRechecking(false);
    if (error) {
      const msg = error.message.toLowerCase();
      if (msg.includes("confirm")) return toast.info("E-mail toujours non confirmé. Réessayez dans un instant.");
      return toast.error(error.message);
    }
    setUnconfirmedEmail(null);
    toast.success("E-mail confirmé. Redirection...");
    afterAuth();
  }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    try {
      const res = await registerSchool({
        data: {
          email: signUp.email.trim(),
          password: signUp.password,
          fullName: signUp.fullName.trim(),
          phone: signUp.phone.trim() || null,
          schoolName: signUp.schoolName.trim(),
          schoolAddress: signUp.schoolAddress.trim() || null,
          schoolPhone: signUp.schoolPhone.trim() || null,
        },
      });
      if (!res.ok) {
        setLoading(false);
        toast.error(res.error);
        return;
      }
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: signUp.email.trim(),
        password: signUp.password,
      });
      if (signInErr) {
        toast.success("Compte créé. Connectez-vous avec votre e-mail et mot de passe.");
        setSignUp(emptySignUp);
        setLoading(false);
        return;
      }
      toast.success("Établissement créé avec succès. Bienvenue !");
      setSignUp(emptySignUp);
      setLoading(false);
      afterAuth();
    } catch (err: any) {
      setLoading(false);
      toast.error(err?.message ?? "Échec de l'inscription");
    }
  }

  const [familyLoading, setFamilyLoading] = useState(false);
  async function handleFamilySignUp(e: React.FormEvent) {
    e.preventDefault();
    if (familyLoading) return;
    setFamilyLoading(true);
    try {
      const res = await redeemFn({
        data: {
          code: familySignUp.code.trim(),
          email: familySignUp.email.trim(),
          password: familySignUp.password,
          fullName: familySignUp.fullName.trim(),
          phone: familySignUp.phone.trim() || null,
          asRole: familySignUp.asRole,
        },
      });
      if (!res.ok) {
        setFamilyLoading(false);
        toast.error(res.error);
        return;
      }
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: familySignUp.email.trim(),
        password: familySignUp.password,
      });
      setFamilyLoading(false);
      if (signInErr) {
        toast.success("Compte créé. Connectez-vous avec votre e-mail et mot de passe.");
        setFamilySignUp(emptyFamilySignUp);
        return;
      }
      toast.success("Compte créé avec succès. Bienvenue !");
      setFamilySignUp(emptyFamilySignUp);
      afterAuth();
    } catch (err: any) {
      setFamilyLoading(false);
      toast.error(err?.message ?? "Échec de l'inscription");
    }
  }

  async function handleGoogle() {
    const dest = plan
      ? `/auth?plan=${encodeURIComponent(plan)}${cycle ? `&cycle=${cycle}` : ""}`
      : "/auth";
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin + dest,
    });
    if (result.error) return toast.error("Connexion Google indisponible");
    if (result.redirected) return;
    afterAuth();
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/10 via-background to-accent/10 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <Link to="/" className="flex items-center gap-3 mb-8 justify-center">
          <div className="size-12 rounded-xl bg-primary text-primary-foreground flex items-center justify-center">
            <School className="size-6" />
          </div>
          <div>
            <div className="font-display font-bold text-2xl leading-none">MBGEduGuinée</div>
            <div className="text-xs text-muted-foreground mt-1">Gestion scolaire numérique</div>
          </div>
        </Link>

                {plan && (
          <div className="mb-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-accent/20 text-sm font-medium">
            <Sparkles className="size-4 text-accent" />
            Aucun abonnement mensuel — plan <span className="uppercase">{plan}</span>
          </div>
        )}
        <Card>
          <CardHeader>
            <CardTitle>Bienvenue</CardTitle>
            <CardDescription>Connectez-vous ou créez votre compte établissement</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="signin">
              <TabsList className="grid grid-cols-3 mb-4">
                <TabsTrigger value="signin">Connexion</TabsTrigger>
                <TabsTrigger value="signup">Établissement</TabsTrigger>
                <TabsTrigger value="family">Parent/Élève</TabsTrigger>
              </TabsList>
              <TabsContent value="signin">
                <form onSubmit={handleSignIn} className="space-y-3">
                  <div><Label>Email</Label><Input type="email" required value={signIn.email} onChange={(e) => setSignIn({ ...signIn, email: e.target.value })} /></div>
                  <div><Label>Mot de passe</Label><Input type="password" required value={signIn.password} onChange={(e) => setSignIn({ ...signIn, password: e.target.value })} /></div>
                  <Button type="submit" className="w-full" disabled={loading}>Se connecter</Button>
                  {unconfirmedEmail && (
                    <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/30 p-3 text-sm">
                      <p className="mb-2">Votre e-mail <span className="font-medium">{unconfirmedEmail}</span> n'est pas encore confirmé.</p>
                      <div className="flex flex-wrap gap-2">
                        <Button type="button" variant="outline" size="sm" onClick={handleResend} disabled={resending}>
                          {resending ? "Envoi..." : "Renvoyer l'e-mail de confirmation"}
                        </Button>
                        <Button type="button" size="sm" onClick={handleRecheck} disabled={rechecking}>
                          {rechecking ? "Vérification..." : "Vérifier à nouveau"}
                        </Button>
                      </div>
                    </div>
                  )}
                </form>
              </TabsContent>
              <TabsContent value="signup">
                <form onSubmit={handleSignUp} className="space-y-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Établissement</div>
                  <div><Label>Nom de l'établissement *</Label><Input required value={signUp.schoolName} onChange={(e) => setSignUp({ ...signUp, schoolName: e.target.value })} placeholder="Ex : École Les Palmiers" /></div>
                  <div><Label>Adresse</Label><Input value={signUp.schoolAddress} onChange={(e) => setSignUp({ ...signUp, schoolAddress: e.target.value })} placeholder="Ville, quartier" /></div>
                  <div><Label>Téléphone de l'établissement</Label><Input value={signUp.schoolPhone} onChange={(e) => setSignUp({ ...signUp, schoolPhone: e.target.value })} placeholder="+224..." /></div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground pt-2">Administrateur</div>
                  <div><Label>Nom complet *</Label><Input required value={signUp.fullName} onChange={(e) => setSignUp({ ...signUp, fullName: e.target.value })} /></div>
                  <div><Label>Téléphone</Label><Input value={signUp.phone} onChange={(e) => setSignUp({ ...signUp, phone: e.target.value })} placeholder="+224..." /></div>
                  <div><Label>Email *</Label><Input type="email" required value={signUp.email} onChange={(e) => setSignUp({ ...signUp, email: e.target.value })} /></div>
                  <div><Label>Mot de passe * (6 caractères min.)</Label><Input type="password" required minLength={6} value={signUp.password} onChange={(e) => setSignUp({ ...signUp, password: e.target.value })} /></div>
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? "Création en cours..." : "Créer mon établissement"}
                  </Button>
                </form>
              </TabsContent>
              <TabsContent value="family">
                <form onSubmit={handleFamilySignUp} className="space-y-3">
                  <div>
                    <Label>Code d'accès *</Label>
                    <Input
                      required
                      className="font-mono tracking-wider"
                      placeholder="EX. EDG7X-9KQP2"
                      value={familySignUp.code}
                      onChange={(e) => setFamilySignUp({ ...familySignUp, code: e.target.value })}
                    />
                    <p className="text-xs text-muted-foreground mt-1">Fourni par l'école — un code par personne.</p>
                  </div>
                  <div>
                    <Label>Vous êtes *</Label>
                    <RadioGroup
                      className="flex gap-4 mt-1"
                      value={familySignUp.asRole}
                      onValueChange={(v) => setFamilySignUp({ ...familySignUp, asRole: v as "parent" | "eleve" })}
                    >
                      <div className="flex items-center gap-2">
                        <RadioGroupItem value="parent" id="role-parent" />
                        <Label htmlFor="role-parent" className="font-normal">Parent</Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <RadioGroupItem value="eleve" id="role-eleve" />
                        <Label htmlFor="role-eleve" className="font-normal">Élève</Label>
                      </div>
                    </RadioGroup>
                  </div>
                  <div><Label>Nom complet *</Label><Input required value={familySignUp.fullName} onChange={(e) => setFamilySignUp({ ...familySignUp, fullName: e.target.value })} /></div>
                  <div><Label>Téléphone</Label><Input value={familySignUp.phone} onChange={(e) => setFamilySignUp({ ...familySignUp, phone: e.target.value })} placeholder="+224..." /></div>
                  <div><Label>Email *</Label><Input type="email" required value={familySignUp.email} onChange={(e) => setFamilySignUp({ ...familySignUp, email: e.target.value })} /></div>
                  <div><Label>Mot de passe * (6 caractères min.)</Label><Input type="password" required minLength={6} value={familySignUp.password} onChange={(e) => setFamilySignUp({ ...familySignUp, password: e.target.value })} /></div>
                  <Button type="submit" className="w-full" disabled={familyLoading}>
                    {familyLoading ? "Création en cours..." : "Créer mon compte"}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
            <div className="my-4 flex items-center gap-3">
              <div className="h-px bg-border flex-1" />
              <span className="text-xs text-muted-foreground">ou</span>
              <div className="h-px bg-border flex-1" />
            </div>
            <Button variant="outline" className="w-full" onClick={handleGoogle} disabled={loading}>Continuer avec Google</Button>
          </CardContent>
        </Card>
                <p className="text-center text-xs text-muted-foreground mt-4">
          En créant un compte, vous devenez <span className="font-medium">administrateur</span> de votre établissement.
        </p>
      </div>
    </div>
  );
}
