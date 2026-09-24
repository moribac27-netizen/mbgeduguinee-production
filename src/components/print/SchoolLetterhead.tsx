import { School } from "lucide-react";
import type { SchoolInfo } from "@/hooks/useSchool";

interface Props {
  school: SchoolInfo | null;
  logoUrl?: string | null;
  title?: string;
  subtitle?: string | null;
  compact?: boolean;
}

/** En-tête commun à tous les documents MBGEduGuinée. */
export function SchoolLetterhead({ school, logoUrl, title, subtitle, compact = false }: Props) {
  const contact = [school?.phone, school?.email].filter(Boolean).join(" · ");
  const place = [school?.address, school?.city].filter(Boolean).join(", ");
  return (
    <div className={`mbg-letterhead ${compact ? "mbg-letterhead-compact" : ""}`}>
      <div className="mbg-brand-mark">
        {logoUrl ? (
          <img src={logoUrl} alt={school?.name ?? "Logo de l'établissement"} />
        ) : (
          <div className="mbg-brand-fallback"><School className="size-5" /></div>
        )}
      </div>
      <div className="mbg-school-meta">
        <div className="mbg-school-name">{school?.name ?? "Établissement scolaire"}</div>
        {place && <div>{place}</div>}
        {contact && <div>{contact}</div>}
        {school?.website && <div>{school.website}</div>}
      </div>
      <div className="mbg-doc-meta">
        <div className="mbg-country">RÉPUBLIQUE DE GUINÉE</div>
        <div>Travail — Justice — Solidarité</div>
        {school?.academic_year && <div className="mbg-year">Année scolaire : {school.academic_year}</div>}
        {title && <div className="mbg-document-title">{title}</div>}
        {subtitle && <div>{subtitle}</div>}
      </div>
    </div>
  );
}

export function SchoolPrintFooter({ school, documentRef }: { school: SchoolInfo | null; documentRef?: string | null }) {
  return (
    <div className="mbg-print-footer">
      <span>{school?.name ?? "Établissement"}{school?.phone ? ` · ${school.phone}` : ""}</span>
      <span>{documentRef ? `Réf. ${documentRef} · ` : ""}Document généré par MBGEduGuinée le ${new Date().toLocaleDateString("fr-FR")}</span>
    </div>
  );
}
