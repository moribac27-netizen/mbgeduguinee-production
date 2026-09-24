import type { ReactNode } from "react";
import { StudentPhoto } from "@/components/StudentPhoto";

export function DocumentHeader({
  school,
  logoUrl,
  title,
  subtitle,
  reference,
}: {
  school: any;
  logoUrl?: string | null;
  title: string;
  subtitle?: string;
  reference?: string;
}) {
  return (
    <header className="mbg-letterhead print-avoid-break">
      <div className="mbg-brand-mark">
        {logoUrl ? <img src={logoUrl} alt="Logo de l'établissement" /> : <div className="mbg-brand-fallback">MBG</div>}
      </div>
      <div className="mbg-school-meta">
        <div className="mbg-school-name">{school?.name ?? "MBGEduGuinée"}</div>
        <div>{[school?.address, school?.city].filter(Boolean).join(" · ") || ""}</div>
        <div>{[school?.phone, school?.email].filter(Boolean).join(" · ") || ""}</div>
      </div>
      <div className="mbg-doc-meta">
        <div className="mbg-country">RÉPUBLIQUE DE GUINÉE</div>
        <div>Travail — Justice — Solidarité</div>
        <div className="mbg-year">Année scolaire : {school?.academic_year ?? "—"}</div>
        <div className="mbg-document-title">{title}</div>
        {subtitle && <div>{subtitle}</div>}
        {reference && <div className="font-mono">Réf. {reference}</div>}
      </div>
    </header>
  );
}

export function DocumentFooter({ reference }: { reference?: string }) {
  return (
    <footer className="mbg-print-footer">
      <span>MBGEduGuinée · Document officiel</span>
      <span>{reference ? `Réf. ${reference} · ` : ""}Édité le {new Date().toLocaleDateString("fr-FR")}</span>
    </footer>
  );
}

export function DocumentStat({ label, value, tone = "default" }: { label: string; value: ReactNode; tone?: "default" | "success" | "warning" }) {
  return (
    <div className={`mbg-stat mbg-stat-${tone}`}>
      <div className="mbg-stat-label">{label}</div>
      <div className="mbg-stat-value">{value}</div>
    </div>
  );
}

export function StudentIdentity({ student, photoUrl, children }: { student: any; photoUrl?: string | null; children?: ReactNode }) {
  return (
    <section className="grid grid-cols-[72px_1fr] gap-4 rounded-xl border bg-white p-4 print-avoid-break">
      <StudentPhoto path={photoUrl ?? student?.photo_url} name={student?.full_name ?? "Élève"} size="lg" />
      <div className="min-w-0">
        <h2 className="text-xl font-bold">{student?.full_name ?? "—"}</h2>
        <div className="mt-1 grid grid-cols-2 gap-x-6 gap-y-1 text-sm text-slate-600">
          <span><b>Matricule :</b> {student?.matricule ?? "—"}</span>
          <span><b>Classe :</b> {student?.classes?.name ?? "—"}</span>
          <span><b>Né(e) le :</b> {student?.birth_date ? new Date(student.birth_date).toLocaleDateString("fr-FR") : "—"}</span>
          <span><b>Statut :</b> {student?.status ?? "—"}</span>
        </div>
        {children}
      </div>
    </section>
  );
}
