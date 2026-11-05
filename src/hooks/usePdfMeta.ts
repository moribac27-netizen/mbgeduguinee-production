import { useMemo } from "react";
import { useSchool } from "@/hooks/useSchool";
import type { PdfMeta } from "@/lib/reports";

/**
 * Métadonnées d'en-tête (logo + infos école) pour les exports PDF,
 * alignées sur le modèle utilisé par BulletinDocument / SchoolLetterhead.
 */
export function usePdfMeta(subtitle?: string | null): PdfMeta {
  const { school, logoUrl, stampUrl, signatureUrl } = useSchool();
  return useMemo(
    () => ({
      schoolName: school?.name ?? null,
      schoolAddress: [school?.address, school?.city].filter(Boolean).join(", ") || null,
      schoolContact: [school?.phone, school?.email].filter(Boolean).join(" · ") || null,
      academicYear: school?.academic_year ?? null,
      logoUrl: logoUrl ?? null,
      stampUrl: school?.bulletin_settings?.show_stamp === false ? null : (stampUrl ?? null),
      signatureUrl: school?.bulletin_settings?.show_signature === false ? null : (signatureUrl ?? null),
      accent: school?.theme_primary ?? null,
      subtitle: subtitle ?? null,
    }),
    [school, logoUrl, stampUrl, signatureUrl, subtitle],
  );
}
