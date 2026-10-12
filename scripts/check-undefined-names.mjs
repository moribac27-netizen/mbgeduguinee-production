// Détecte les noms non définis (ex. une variable utilisée hors de sa portée) et les erreurs de syntaxe.
// Ces erreurs passent un « vite build » mais font planter la page en production.
// Volontairement limité à ces codes d'erreur TypeScript : le reste du typage n'est pas contrôlé ici.
import { spawnSync } from "node:child_process";
import { readdirSync, statSync, existsSync, writeFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

function walk(dir, out = []) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(f)) out.push(p);
  }
  return out;
}

const tsc = process.env.TSC_BIN || join("node_modules", "typescript", "bin", "tsc");
if (!existsSync(tsc)) {
  console.error("check-undefined-names : TypeScript introuvable (npm ci requis).");
  process.exit(1);
}

// Configuration temporaire : fonctionne avec TypeScript 5 comme avec TypeScript 6.
const files = walk("src");
const cfgPath = join(tmpdir(), `tsconfig.check-${process.pid}.json`);
writeFileSync(
  cfgPath,
  JSON.stringify({
    compilerOptions: { noEmit: true, jsx: "preserve", skipLibCheck: true, noResolve: true, target: "es2022", module: "esnext", moduleResolution: "bundler", lib: ["es2022", "dom", "dom.iterable"], types: [] },
    files: files.map((f) => resolve(f)),
  }),
);
const r = spawnSync(process.execPath, [tsc, "-p", cfgPath], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
rmSync(cfgPath, { force: true });
const out = `${r.stdout}\n${r.stderr}`;
// TS5xxx = erreur de configuration : on échoue plutôt que de ne rien contrôler sans le dire.
const CODES = /error TS(2304|2552|2451|2448|2454|2686|1\d{3}|5\d{3}):/;
const bad = out.split("\n").filter((l) => CODES.test(l));
if (bad.length) {
  console.error(`Noms non définis ou erreurs de syntaxe (${bad.length}) :\n${bad.join("\n")}`);
  process.exit(1);
}
console.log(`check-undefined-names : OK (${files.length} fichiers).`);
