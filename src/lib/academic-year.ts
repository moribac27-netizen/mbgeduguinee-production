/**
 * Année scolaire MBGEduGuinée.
 *
 * La rentrée est fixée au 1er septembre. Les calculs sont volontairement
 * effectués dans le fuseau de la Guinée afin de ne pas dépendre du fuseau
 * horaire configuré sur l'appareil de l'utilisateur.
 */
export const GUINEA_TIME_ZONE = "Africa/Conakry";
export const ACADEMIC_YEAR_START_MONTH = 9;

function getGuineaParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: GUINEA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
  };
}

/** Retourne l'année scolaire active à une date donnée (rentrée le 1er septembre). */
export function getCurrentAcademicYear(date = new Date()): string {
  const { year, month } = getGuineaParts(date);
  const startYear = month >= ACADEMIC_YEAR_START_MONTH ? year : year - 1;
  return `${startYear}-${startYear + 1}`;
}

export function isAcademicYear(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{4}$/.test(value);
}

export function getAcademicYearOptions(current = getCurrentAcademicYear()): string[] {
  const start = Number(current.slice(0, 4));
  return [start - 1, start, start + 1].map((year) => `${year}-${year + 1}`);
}
