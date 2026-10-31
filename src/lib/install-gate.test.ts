import { describe, expect, it } from "vitest";
import { decideInstallGate, detectPlatform, isInAppBrowser, type GateInput } from "./install-gate";

const base: GateInput = { enabled: true, standalone: false, installedBefore: false, platform: "android", inAppBrowser: false, canPrompt: false, waitElapsed: false };
const d = (o: Partial<GateInput>) => decideInstallGate({ ...base, ...o });

describe("detectPlatform", () => {
  it("iPhone, iPad moderne, Android, ordinateur", () => {
    expect(detectPlatform("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)")).toBe("ios");
    expect(detectPlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 5)).toBe("ios");
    expect(detectPlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 0)).toBe("desktop");
    expect(detectPlatform("Mozilla/5.0 (Linux; Android 14; SM-A15)")).toBe("android");
    expect(detectPlatform("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe("desktop");
  });
  it("navigateurs intégrés", () => {
    expect(isInAppBrowser("Mozilla/5.0 (Linux; Android 14) [FBAN/FB4A;FBAV/400]")).toBe(true);
    expect(isInAppBrowser("Mozilla/5.0 (Linux; Android 14) Chrome/120 Mobile Safari/537")).toBe(false);
  });
});

describe("decideInstallGate", () => {
  it("laisse passer si désactivé, installée, ou déjà installée une fois", () => {
    expect(d({ enabled: false })).toBe("allowed");
    expect(d({ standalone: true })).toBe("allowed");
    expect(d({ installedBefore: true, canPrompt: true })).toBe("allowed");
  });
  it("impose l'installation quand le navigateur la propose", () => {
    expect(d({ canPrompt: true })).toBe("prompt");
    expect(d({ platform: "desktop", canPrompt: true })).toBe("prompt");
  });
  it("iPhone/iPad : instructions Safari tout de suite", () => {
    expect(d({ platform: "ios" })).toBe("ios");
  });
  it("navigateur intégré : demander d'ouvrir le navigateur", () => {
    expect(d({ inAppBrowser: true, platform: "ios" })).toBe("open_in_browser");
  });
  it("attend l'invite puis ne bloque jamais un navigateur sans installation possible", () => {
    expect(d({})).toBe("checking");
    expect(d({ waitElapsed: true })).toBe("allowed");
    expect(d({ platform: "desktop", waitElapsed: true })).toBe("allowed");
  });
});
