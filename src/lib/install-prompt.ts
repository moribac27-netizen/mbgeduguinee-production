/** Capture globale de l'invite d'installation du navigateur (elle peut arriver avant l'affichage de la page de connexion). */
let deferred: any = null;
const listeners = new Set<() => void>();
export const INSTALLED_FLAG_KEY = "mbg.installed.v1";

export function markInstalled() {
  try { window.localStorage.setItem(INSTALLED_FLAG_KEY, "1"); } catch { /* stockage indisponible */ }
}
export const wasInstalled = (): boolean => { try { return window.localStorage.getItem(INSTALLED_FLAG_KEY) === "1"; } catch { return false; } };
export const isStandalone = (): boolean =>
  typeof window !== "undefined" && (window.matchMedia("(display-mode: standalone)").matches || (window.navigator as any).standalone === true);
export const getDeferredPrompt = () => deferred;
export function clearDeferredPrompt() { deferred = null; listeners.forEach((l) => l()); }
export function subscribePrompt(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferred = e; listeners.forEach((l) => l()); });
  window.addEventListener("appinstalled", () => { markInstalled(); deferred = null; listeners.forEach((l) => l()); });
  if (isStandalone()) markInstalled();
}
