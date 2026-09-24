import { useEffect, useState } from "react";
import { Clock3 } from "lucide-react";
import { GUINEA_TIME_ZONE } from "@/lib/academic-year";

const FULL_FORMATTER = new Intl.DateTimeFormat("fr-FR", {
  timeZone: GUINEA_TIME_ZONE,
  weekday: "long",
  day: "2-digit",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const TIME_FORMATTER = new Intl.DateTimeFormat("fr-FR", {
  timeZone: GUINEA_TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export function ConakryClock() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, []);

  const fullLabel = now ? FULL_FORMATTER.format(now) : "Heure de Guinée";
  const timeLabel = now ? TIME_FORMATTER.format(now) : "--:--";

  return (
    <div
      className="flex items-center gap-1.5 text-xs text-muted-foreground whitespace-nowrap"
      title="Heure de la Guinée — Africa/Conakry (UTC+0)"
      aria-label={`Heure de la Guinée : ${fullLabel}`}
    >
      <Clock3 className="size-3.5" aria-hidden="true" />
      <span className="sm:hidden">{timeLabel}</span>
      <span className="hidden sm:inline">{fullLabel}</span>
    </div>
  );
}
