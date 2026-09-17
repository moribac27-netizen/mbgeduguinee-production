import { createFileRoute } from "@tanstack/react-router";
import { CrudSection } from "@/components/CrudSection";
import { useStudentOptions, useClassOptions } from "@/hooks/useOptions";
import { fmtDate } from "@/lib/reports";
import { ShieldAlert } from "lucide-react";

export const Route = createFileRoute("/_authenticated/discipline")({
  head: () => ({
    meta: [
      { title: "Discipline — MBGEduGuinée" },
      { name: "description", content: "Incidents disciplinaires, sanctions et suivi par élève." },
    ],
  }),
  component: Discipline,
});

const INCIDENT_TYPES = [
  { value: "retard", label: "Retard" },
  { value: "absence_injustifiee", label: "Absence injustifiée" },
  { value: "bagarre", label: "Bagarre / violence" },
  { value: "insolence", label: "Insolence / irrespect" },
  { value: "tricherie", label: "Tricherie / fraude" },
  { value: "tenue", label: "Tenue non conforme" },
  { value: "materiel", label: "Dégradation de matériel" },
  { value: "autre", label: "Autre" },
];

const SANCTIONS = [
  { value: "aucune", label: "Aucune (avertissement verbal)" },
  { value: "avertissement_ecrit", label: "Avertissement écrit" },
  { value: "retenue", label: "Retenue" },
  { value: "convocation_parents", label: "Convocation des parents" },
  { value: "exclusion_temporaire", label: "Exclusion temporaire" },
  { value: "conseil_discipline", label: "Conseil de discipline" },
];

const label = (opts: { value: string; label: string }[], v: any) =>
  opts.find((o) => o.value === v)?.label ?? v ?? "—";
const studentName = (r: any) => r?.students?.full_name ?? "—";
const today = () => new Date().toISOString().slice(0, 10);

function Discipline() {
  const { options: studentOptions } = useStudentOptions();
  const { options: classOptions } = useClassOptions();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="size-11 rounded-xl bg-destructive/10 text-destructive flex items-center justify-center">
          <ShieldAlert className="size-5" />
        </div>
        <div>
          <h1 className="font-display text-3xl font-bold">Discipline</h1>
          <p className="text-muted-foreground mt-1">
            Incidents, sanctions et suivi disciplinaire par élève.
          </p>
        </div>
      </div>

      <CrudSection
        table="discipline_incidents"
        title="Incidents disciplinaires"
        singular="Incident"
        queryKey={["discipline_incidents"]}
        select="*, students(full_name), classes(name)"
        orderBy={{ column: "incident_date", ascending: false }}
        searchKeys={["students.full_name", "description"]}
        fields={[
          { name: "student_id", label: "Élève", type: "select", options: studentOptions, required: true },
          { name: "class_id", label: "Classe", type: "select", options: classOptions },
          { name: "incident_date", label: "Date", type: "date", required: true, default: today() },
          { name: "incident_type", label: "Type d'incident", type: "select", options: INCIDENT_TYPES, required: true, default: "autre" },
          { name: "description", label: "Description des faits", type: "textarea", required: true },
          { name: "sanction", label: "Sanction", type: "select", options: SANCTIONS, default: "aucune" },
          { name: "follow_up", label: "Suivi", type: "textarea", placeholder: "Décision prise, résultat de la convocation, évolution..." },
        ]}
        columns={[
          { key: "incident_date", label: "Date", render: (r) => fmtDate(r.incident_date), exportFormat: (r) => fmtDate(r.incident_date) },
          { key: "student", label: "Élève", render: studentName, exportFormat: studentName },
          { key: "class", label: "Classe", render: (r) => r.classes?.name ?? "—", exportFormat: (r) => r.classes?.name ?? "" },
          { key: "incident_type", label: "Type", render: (r) => label(INCIDENT_TYPES, r.incident_type), exportFormat: (r) => label(INCIDENT_TYPES, r.incident_type) },
          { key: "description", label: "Description" },
          { key: "sanction", label: "Sanction", render: (r) => label(SANCTIONS, r.sanction), exportFormat: (r) => label(SANCTIONS, r.sanction) },
          { key: "follow_up", label: "Suivi" },
        ]}
        emptyHint="Aucun incident enregistré."
      />
    </div>
  );
}
