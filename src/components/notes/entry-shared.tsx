import { forwardRef, type ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { progressBar, STATUS_LABELS, type StudentStatus } from "@/lib/grade-entry";

/** Affichage d'une note : virgule décimale, jamais « 0 » pour une note absente. */
export const scoreText = (n: number | null | undefined) => (n == null ? "" : String(n).replace(".", ","));

const STATUS_STYLE: Record<StudentStatus, string> = {
  termine: "bg-emerald-50 text-emerald-800 border-emerald-200",
  en_cours: "bg-amber-50 text-amber-800 border-amber-200",
  non_commence: "bg-slate-50 text-slate-700 border-slate-200",
  a_verifier: "bg-red-50 text-red-800 border-red-200",
};

/** Statut = pastille + icône + libellé : jamais la couleur seule. */
export function StatusBadge({ status, className }: { status: StudentStatus; className?: string }) {
  const s = STATUS_LABELS[status];
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap", STATUS_STYLE[status], className)}>
      <span aria-hidden>{s.icon}</span>
      {s.label}
    </span>
  );
}

export function ProgressMeter({ percent, className }: { percent: number | null; className?: string }) {
  return (
    <div className={cn("flex items-center gap-2", className)} aria-label={percent == null ? "Progression indisponible" : `Progression ${percent} %`}>
      <Progress value={percent ?? 0} className="h-2 flex-1" />
      <span className="text-xs tabular-nums text-muted-foreground w-10 text-right">{percent == null ? "—" : `${percent} %`}</span>
    </div>
  );
}

/** Version texte (lisible en noir et blanc / lecteurs d'écran). */
export function TextBar({ percent }: { percent: number | null }) {
  return <span className="font-mono text-sm" aria-hidden>{progressBar(percent)}</span>;
}

export function Kpi({ label, value, tone = "default" }: { label: string; value: ReactNode; tone?: "default" | "warn" | "bad" | "good" }) {
  const toneCls = { default: "", warn: "text-amber-700", bad: "text-red-700", good: "text-emerald-700" }[tone];
  return (
    <div className="rounded-lg border bg-card px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn("text-xl font-bold leading-tight tabular-nums", toneCls)}>{value}</div>
    </div>
  );
}

interface ScoreInputProps extends Omit<React.ComponentProps<typeof Input>, "onChange" | "value"> {
  value: string;
  onValue: (v: string) => void;
  changed?: boolean;
  invalid?: boolean;
  warning?: boolean;
  row?: number;
  col?: number;
}

/**
 * Champ de note. `inputMode="decimal"` pour le pavé numérique des tablettes,
 * virgule ou point acceptés. Un champ vide reste vide (jamais 0).
 * État visible par bordure + icône textuelle, pas par la couleur seule.
 */
export const ScoreInput = forwardRef<HTMLInputElement, ScoreInputProps>(function ScoreInput(
  { value, onValue, changed, invalid, warning, row, col, className, ...rest },
  ref,
) {
  return (
    <Input
      ref={ref}
      inputMode="decimal"
      autoComplete="off"
      value={value}
      data-row={row}
      data-col={col}
      aria-invalid={invalid || undefined}
      onChange={(e) => onValue(e.target.value)}
      onFocus={(e) => e.currentTarget.select()}
      className={cn(
        "h-9 w-20 text-center tabular-nums",
        changed && "border-sky-500 bg-sky-50 ring-1 ring-sky-300",
        warning && !changed && "border-amber-500",
        invalid && "border-red-600 bg-red-50 ring-1 ring-red-300",
        className,
      )}
      {...rest}
    />
  );
});

/** Passe le focus à la case (ligne, colonne) de la grille, si elle existe. */
export function focusCell(root: HTMLElement | null, row: number, col: number): boolean {
  const el = root?.querySelector<HTMLInputElement>(`input[data-row="${row}"][data-col="${col}"]`);
  if (!el) return false;
  el.focus();
  return true;
}

