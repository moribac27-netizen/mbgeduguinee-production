import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { detectPlatform, isIPad } from "@/lib/install-gate";

/** Bouton discret « Installer l'application » (Android / desktop) + astuce iOS. */
export function InstallPWA({ className }: { className?: string }) {
  const [prompt, setPrompt] = useState<any>(null);
  const [iosHint, setIosHint] = useState(false);
  const [ipad, setIpad] = useState(false);

  useEffect(() => {
    const onPrompt = (e: any) => {
      e.preventDefault();
      setPrompt(e);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);

    const ua = window.navigator.userAgent;
    const isIOS = detectPlatform(ua, window.navigator.maxTouchPoints) === "ios"; // inclut l'iPad (iPadOS se présente comme un Mac)
    setIpad(isIPad(ua, window.navigator.maxTouchPoints));
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches || (window.navigator as any).standalone === true;
    if (isIOS && !standalone) setIosHint(true);

    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  if (!prompt && !iosHint) return null;

  async function install() {
    if (!prompt) return;
    prompt.prompt();
    await prompt.userChoice;
    setPrompt(null);
  }

  if (iosHint && !prompt) {
    return (
      <div className={`text-[11px] leading-tight text-sidebar-foreground/60 ${className ?? ""}`}>
        Installer : bouton Partager{ipad ? " (en haut à droite)" : ""} → « Sur l'écran d'accueil »
      </div>
    );
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={install}
      className={`w-full justify-start gap-2 bg-transparent text-sidebar-foreground border-sidebar-border hover:bg-sidebar-accent hover:text-sidebar-accent-foreground ${className ?? ""}`}
    >
      <Download className="size-4" /> Installer l'application
    </Button>
  );
}
