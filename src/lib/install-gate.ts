/** Logique pure de l'obligation d'installer l'application avant la première connexion. */
export type Platform = "ios" | "android" | "desktop";
export type GateState = "allowed" | "checking" | "prompt" | "ios" | "open_in_browser";

export function detectPlatform(ua: string, maxTouchPoints = 0): Platform {
  if (/iPad|iPhone|iPod/.test(ua)) return "ios";
  // iPadOS 13+ se présente comme un Mac mais avec écran tactile
  if (/Macintosh/.test(ua) && maxTouchPoints > 1) return "ios";
  if (/Android/i.test(ua)) return "android";
  return "desktop";
}

/** Navigateurs intégrés (Facebook, WhatsApp, Instagram…) : impossible d'y installer une application. */
export function isInAppBrowser(ua: string): boolean {
  return /FBAN|FBAV|Instagram|WhatsApp|Line\/|MicroMessenger|Snapchat|TikTok|; wv\)/i.test(ua);
}

export interface GateInput {
  enabled: boolean;            // réglage Super Admin
  standalone: boolean;         // ouverte depuis l'application installée
  installedBefore: boolean;    // déjà installée une fois sur cet appareil (mémoire locale ou événement d'installation)
  platform: Platform;
  inAppBrowser: boolean;
  canPrompt: boolean;          // le navigateur propose l'installation (beforeinstallprompt reçu)
  waitElapsed: boolean;        // délai d'attente de l'invite écoulé
}

/**
 * allowed : connexion possible. checking : analyse en cours. prompt : bouton « Installer ».
 * ios : instructions Safari. open_in_browser : à ouvrir dans Safari/Chrome.
 * Sans possibilité d'installation détectée (navigateur incompatible, ou application déjà installée dont le navigateur ne repropose plus l'invite),
 * on laisse passer pour ne jamais enfermer un utilisateur hors de l'application.
 */
export function decideInstallGate(i: GateInput): GateState {
  if (!i.enabled || i.standalone || i.installedBefore) return "allowed";
  if (i.inAppBrowser) return "open_in_browser";
  if (i.canPrompt) return "prompt";
  if (i.platform === "ios") return "ios";
  return i.waitElapsed ? "allowed" : "checking";
}
