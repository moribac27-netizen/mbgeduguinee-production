import { useEffect, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, Loader2, Share, SquarePlus, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { decideInstallGate, detectPlatform, isInAppBrowser } from "@/lib/install-gate";
import { clearDeferredPrompt, getDeferredPrompt, isStandalone, markInstalled, subscribePrompt, wasInstalled } from "@/lib/install-prompt";

export const INSTALL_REQUIRED_KEY = ["platform-setting", "public.install_required"];

/** Réglage Super Admin : obligation d'installer l'application avant la connexion (activée par défaut). */
export function useInstallRequired(): { enabled: boolean; loading: boolean } {
  const { data, isLoading } = useQuery({
    queryKey: INSTALL_REQUIRED_KEY, staleTime: 60_000, retry: false,
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await (supabase as any).from("platform_settings").select("value").eq("key", "public.install_required").maybeSingle();
      if (error) return false; // en cas de panne on ne bloque personne
      return data?.value?.enabled !== false;
    },
  });
  return { enabled: data ?? false, loading: isLoading };
}

/** Analyse l'appareil (déjà installée ? installable ?) puis impose l'installation avant d'afficher la connexion. */
export function InstallGate({ children }: { children: ReactNode }) {
  const { enabled, loading } = useInstallRequired();
  const [, force] = useState(0);
  const [waitElapsed, setWaitElapsed] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const off = subscribePrompt(() => force((n) => n + 1));
    const t = window.setTimeout(() => setWaitElapsed(true), 3000);
    return () => { off(); window.clearTimeout(t); };
  }, []);

  if (loading) return <Centered><Loader2 className="size-6 animate-spin" /></Centered>;
  const ua = window.navigator.userAgent;
  const state = decideInstallGate({
    enabled, standalone: isStandalone(), installedBefore: wasInstalled() || done, platform: detectPlatform(ua, window.navigator.maxTouchPoints),
    inAppBrowser: isInAppBrowser(ua), canPrompt: !!getDeferredPrompt(), waitElapsed,
  });
  if (state === "allowed") return <>{children}</>;
  if (state === "checking") return <Centered><div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />Vérification de l'appareil…</div></Centered>;

  async function install() {
    const p = getDeferredPrompt();
    if (!p) return;
    p.prompt();
    const choice = await p.userChoice;
    clearDeferredPrompt();
    if (choice?.outcome === "accepted") { markInstalled(); setDone(true); }
  }

  return (
    <Centered>
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary"><Smartphone className="size-6" /></div>
          <CardTitle>Installez l'application</CardTitle>
          <CardDescription>Pour vous connecter à MBGEduGuinée, installez d'abord l'application sur cet appareil. C'est gratuit, rapide et ne prend que quelques secondes.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {state === "prompt" && (
            <Button className="w-full gap-2" size="lg" onClick={install}><Download className="size-4" />Installer l'application</Button>
          )}
          {state === "ios" && (
            <ol className="space-y-3 text-sm">
              <li className="flex items-start gap-3"><Share className="mt-0.5 size-5 shrink-0 text-primary" /><span>Touchez le bouton <b>Partager</b> de Safari (le carré avec une flèche).</span></li>
              <li className="flex items-start gap-3"><SquarePlus className="mt-0.5 size-5 shrink-0 text-primary" /><span>Choisissez <b>« Sur l'écran d'accueil »</b>, puis <b>Ajouter</b>.</span></li>
              <li className="flex items-start gap-3"><Smartphone className="mt-0.5 size-5 shrink-0 text-primary" /><span>Ouvrez ensuite <b>MBGEduGuinée</b> depuis votre écran d'accueil pour vous connecter.</span></li>
            </ol>
          )}
          {state === "open_in_browser" && (
            <p className="text-sm">Ce lien est ouvert dans une application (WhatsApp, Facebook…) qui ne permet pas l'installation. Ouvrez-le dans <b>Chrome</b> ou <b>Safari</b> (menu ⋮ ou « Ouvrir dans le navigateur »), puis installez l'application.</p>
          )}
          <p className="text-center text-xs text-muted-foreground">Déjà installée ? Ouvrez-la depuis l'icône MBGEduGuinée de votre appareil.</p>
        </CardContent>
      </Card>
    </Centered>
  );
}

function Centered({ children }: { children: ReactNode }) {
  return <div className="flex min-h-screen items-center justify-center bg-background p-4">{children}</div>;
}
