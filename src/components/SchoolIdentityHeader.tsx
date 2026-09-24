import { MapPin, Mail, Phone, AlertTriangle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useSchool } from "@/hooks/useSchool";

/**
 * Identité institutionnelle de l'établissement courant.
 * Ce bloc est volontairement partagé par toutes les pages authentifiées
 * afin que direction, staff, parents et élèves voient la même identité.
 */
export function SchoolIdentityHeader() {
  const { school, logoUrl, loading, error } = useSchool();

  if (loading) return <Card className="mb-5 border-border/80 shadow-sm"><CardContent className="p-4 text-sm text-muted-foreground">Chargement de l’établissement…</CardContent></Card>;
  if (error) return (
    <Card className="mb-5 border-destructive/30 shadow-sm">
      <CardContent className="p-4 flex items-center gap-2 text-sm text-destructive">
        <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
        <span>Impossible de charger l’identité de l’établissement. Réessayez.</span>
      </CardContent>
    </Card>
  );
  if (!school) return null;

  const location = [school.address, school.city]
    .filter(Boolean)
    .join(", ");

  return (
    <Card className="mb-5 overflow-hidden border-border/80 shadow-sm">
      <CardContent className="p-4 sm:p-5 flex items-center gap-4">
        {logoUrl ? (
          <img
            src={logoUrl}
            alt={school.name ?? "Logo de l'établissement"}
            className="size-14 sm:size-16 rounded-xl object-cover border border-border shrink-0 bg-background"
          />
        ) : (
          <div
            aria-hidden="true"
            className="size-14 sm:size-16 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-display font-bold text-xl shrink-0 border border-border/70"
          >
            {(school.name ?? "É").charAt(0).toUpperCase()}
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="font-display text-lg sm:text-xl font-bold truncate text-foreground">
            {school.name ?? "Établissement scolaire"}
          </div>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1.5 text-xs sm:text-sm text-muted-foreground">
            {location && (
              <span className="inline-flex items-center gap-1.5 min-w-0">
                <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
                <span className="truncate">{location}</span>
              </span>
            )}
            {school.phone && (
              <span className="inline-flex items-center gap-1.5">
                <Phone className="size-3.5 shrink-0" aria-hidden="true" />
                <span>{school.phone}</span>
              </span>
            )}
            {school.email && (
              <span className="inline-flex items-center gap-1.5 min-w-0">
                <Mail className="size-3.5 shrink-0" aria-hidden="true" />
                <span className="truncate">{school.email}</span>
              </span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
