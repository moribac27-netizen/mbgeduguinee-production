import { createFileRoute } from "@tanstack/react-router";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { CrudSection } from "@/components/CrudSection";
import { useStudentOptions, useTableOptions } from "@/hooks/useOptions";
import { fmtDate, fmtMoney } from "@/lib/reports";
import { Bus } from "lucide-react";

export const Route = createFileRoute("/_authenticated/transport")({
  head: () => ({
    meta: [
      { title: "Transport scolaire — MBGEduGuinée" },
      { name: "description", content: "Gestion des bus, chauffeurs, circuits, abonnements et présences du transport scolaire." },
      { property: "og:title", content: "Transport scolaire — MBGEduGuinée" },
      { property: "og:description", content: "Pilotez la flotte, les circuits et les abonnements de transport de votre école." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Transport,
});

const STATUS = [
  { value: "actif", label: "Actif" },
  { value: "suspendu", label: "Suspendu" },
  { value: "inactif", label: "Inactif" },
];
const BUS_STATUS = [
  { value: "actif", label: "En service" },
  { value: "maintenance", label: "En maintenance" },
  { value: "hors_service", label: "Hors service" },
];
const DIRECTION = [
  { value: "aller", label: "Aller" },
  { value: "retour", label: "Retour" },
  { value: "aller_retour", label: "Aller-retour" },
];
const ATT_STATUS = [
  { value: "present", label: "Présent" },
  { value: "absent", label: "Absent" },
  { value: "retard", label: "Retard" },
];

const studentName = (r: any) => r?.students?.full_name ?? "—";

function Transport() {
  const { options: studentOptions } = useStudentOptions();
  const { options: driverOptions } = useTableOptions("transport_drivers", "full_name");
  const { options: busOptions } = useTableOptions("transport_buses");
  const { options: routeOptions } = useTableOptions("transport_routes");

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="size-11 rounded-xl bg-chart-2/10 text-chart-2 flex items-center justify-center">
          <Bus className="size-5" />
        </div>
        <div>
          <h1 className="font-display text-3xl font-bold">Transport scolaire</h1>
          <p className="text-muted-foreground mt-1">Bus, chauffeurs, circuits, abonnements et présences.</p>
        </div>
      </div>

      <Tabs defaultValue="bus">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="bus">Bus</TabsTrigger>
          <TabsTrigger value="chauffeurs">Chauffeurs</TabsTrigger>
          <TabsTrigger value="circuits">Circuits</TabsTrigger>
          <TabsTrigger value="abonnements">Abonnements</TabsTrigger>
          <TabsTrigger value="presences">Présences</TabsTrigger>
        </TabsList>

        <TabsContent value="bus" className="mt-6">
          <CrudSection
            table="transport_buses"
            title="Bus"
            singular="Bus"
            queryKey={["transport_buses"]}
            select="*, transport_drivers(full_name)"
            orderBy={{ column: "name" }}
            searchKeys={["name", "plate_number", "model"]}
            fields={[
              { name: "name", label: "Nom / numéro", required: true },
              { name: "plate_number", label: "Immatriculation", required: true },
              { name: "capacity", label: "Capacité (places)", type: "number", min: 1, required: true, default: 30 },
              { name: "model", label: "Modèle" },
              { name: "year", label: "Année", type: "number", min: 1950 },
              { name: "driver_id", label: "Chauffeur affecté", type: "select", options: driverOptions },
              { name: "status", label: "État", type: "select", options: BUS_STATUS, required: true, default: "actif" },
              { name: "notes", label: "Notes", type: "textarea" },
            ]}
            columns={[
              { key: "name", label: "Bus" },
              { key: "plate_number", label: "Immatriculation" },
              { key: "capacity", label: "Places" },
              { key: "model", label: "Modèle" },
              { key: "driver", label: "Chauffeur", render: (r) => r.transport_drivers?.full_name ?? "—", exportFormat: (r) => r.transport_drivers?.full_name ?? "" },
              {
                key: "status", label: "État",
                render: (r) => <Badge variant={r.status === "actif" ? "default" : "outline"}>{BUS_STATUS.find((s) => s.value === r.status)?.label ?? r.status}</Badge>,
                exportFormat: (r) => BUS_STATUS.find((s) => s.value === r.status)?.label ?? r.status,
              },
            ]}
          />
        </TabsContent>

        <TabsContent value="chauffeurs" className="mt-6">
          <CrudSection
            table="transport_drivers"
            title="Chauffeurs"
            singular="Chauffeur"
            queryKey={["transport_drivers"]}
            orderBy={{ column: "full_name" }}
            searchKeys={["full_name", "phone", "license_number"]}
            fields={[
              { name: "full_name", label: "Nom complet", required: true },
              { name: "phone", label: "Téléphone" },
              { name: "license_number", label: "N° de permis" },
              { name: "license_expiry", label: "Expiration du permis", type: "date" },
              { name: "hire_date", label: "Date d'embauche", type: "date" },
              { name: "status", label: "Statut", type: "select", options: STATUS, required: true, default: "actif" },
              { name: "notes", label: "Notes", type: "textarea" },
            ]}
            columns={[
              { key: "full_name", label: "Nom" },
              { key: "phone", label: "Téléphone" },
              { key: "license_number", label: "Permis" },
              { key: "license_expiry", label: "Expire le", render: (r) => fmtDate(r.license_expiry) || "—", exportFormat: (r) => fmtDate(r.license_expiry) },
              {
                key: "status", label: "Statut",
                render: (r) => <Badge variant={r.status === "actif" ? "default" : "outline"}>{STATUS.find((s) => s.value === r.status)?.label ?? r.status}</Badge>,
                exportFormat: (r) => STATUS.find((s) => s.value === r.status)?.label ?? r.status,
              },
            ]}
          />
        </TabsContent>

        <TabsContent value="circuits" className="mt-6">
          <CrudSection
            table="transport_routes"
            title="Circuits"
            singular="Circuit"
            queryKey={["transport_routes"]}
            select="*, transport_buses(name), transport_drivers(full_name)"
            orderBy={{ column: "name" }}
            searchKeys={["name", "description"]}
            fields={[
              { name: "name", label: "Nom du circuit", required: true },
              { name: "description", label: "Description", type: "textarea" },
              {
                name: "stops", label: "Arrêts (un par ligne)", type: "textarea", full: true,
                help: "Saisissez un arrêt par ligne.",
                parse: (v) => String(v ?? "").split("\n").map((s) => s.trim()).filter(Boolean),
                serialize: (v) => (Array.isArray(v) ? v.join("\n") : ""),
              },
              { name: "bus_id", label: "Bus", type: "select", options: busOptions },
              { name: "driver_id", label: "Chauffeur", type: "select", options: driverOptions },
              { name: "monthly_fee", label: "Tarif mensuel (GNF)", type: "number", min: 0, required: true, default: 0 },
              { name: "departure_time", label: "Heure de départ", type: "time" },
              { name: "return_time", label: "Heure de retour", type: "time" },
              { name: "status", label: "Statut", type: "select", options: STATUS, required: true, default: "actif" },
            ]}
            columns={[
              { key: "name", label: "Circuit" },
              { key: "stops", label: "Arrêts", render: (r) => (Array.isArray(r.stops) ? r.stops.length : 0), exportFormat: (r) => (Array.isArray(r.stops) ? r.stops.join(" · ") : "") },
              { key: "bus", label: "Bus", render: (r) => r.transport_buses?.name ?? "—", exportFormat: (r) => r.transport_buses?.name ?? "" },
              { key: "driver", label: "Chauffeur", render: (r) => r.transport_drivers?.full_name ?? "—", exportFormat: (r) => r.transport_drivers?.full_name ?? "" },
              { key: "monthly_fee", label: "Tarif", render: (r) => fmtMoney(r.monthly_fee), exportFormat: (r) => Number(r.monthly_fee ?? 0) },
              { key: "departure_time", label: "Départ", render: (r) => (r.departure_time ? String(r.departure_time).slice(0, 5) : "—") },
            ]}
          />
        </TabsContent>

        <TabsContent value="abonnements" className="mt-6">
          <CrudSection
            table="transport_subscriptions"
            title="Abonnements transport"
            singular="Abonnement"
            queryKey={["transport_subscriptions"]}
            select="*, students(full_name), transport_routes(name)"
            orderBy={{ column: "start_date", ascending: false }}
            searchKeys={["students.full_name", "stop_name"]}
            fields={[
              { name: "student_id", label: "Élève", type: "select", searchable: true, options: studentOptions, required: true },
              { name: "route_id", label: "Circuit", type: "select", options: routeOptions, required: true },
              { name: "stop_name", label: "Arrêt" },
              { name: "direction", label: "Sens", type: "select", options: DIRECTION, required: true, default: "aller_retour" },
              { name: "start_date", label: "Début", type: "date", required: true, default: new Date().toISOString().slice(0, 10) },
              { name: "end_date", label: "Fin", type: "date" },
              { name: "monthly_fee", label: "Tarif mensuel (GNF)", type: "number", min: 0, required: true, default: 0 },
              { name: "status", label: "Statut", type: "select", options: STATUS, required: true, default: "actif" },
              { name: "notes", label: "Notes", type: "textarea" },
            ]}
            columns={[
              { key: "student", label: "Élève", render: studentName, exportFormat: studentName },
              { key: "route", label: "Circuit", render: (r) => r.transport_routes?.name ?? "—", exportFormat: (r) => r.transport_routes?.name ?? "" },
              { key: "stop_name", label: "Arrêt" },
              { key: "direction", label: "Sens", render: (r) => DIRECTION.find((d) => d.value === r.direction)?.label ?? r.direction, exportFormat: (r) => DIRECTION.find((d) => d.value === r.direction)?.label ?? r.direction },
              { key: "monthly_fee", label: "Tarif", render: (r) => fmtMoney(r.monthly_fee), exportFormat: (r) => Number(r.monthly_fee ?? 0) },
              {
                key: "status", label: "Statut",
                render: (r) => <Badge variant={r.status === "actif" ? "default" : "outline"}>{STATUS.find((s) => s.value === r.status)?.label ?? r.status}</Badge>,
                exportFormat: (r) => STATUS.find((s) => s.value === r.status)?.label ?? r.status,
              },
            ]}
          />
        </TabsContent>

        <TabsContent value="presences" className="mt-6">
          <CrudSection
            table="transport_attendance"
            title="Présences transport"
            singular="Pointage"
            queryKey={["transport_attendance"]}
            select="*, students(full_name), transport_routes(name)"
            orderBy={{ column: "date", ascending: false }}
            searchKeys={["students.full_name"]}
            fields={[
              { name: "student_id", label: "Élève", type: "select", searchable: true, options: studentOptions, required: true },
              { name: "route_id", label: "Circuit", type: "select", options: routeOptions },
              { name: "date", label: "Date", type: "date", required: true, default: new Date().toISOString().slice(0, 10) },
              { name: "direction", label: "Sens", type: "select", options: DIRECTION.slice(0, 2), required: true, default: "aller" },
              { name: "status", label: "Statut", type: "select", options: ATT_STATUS, required: true, default: "present" },
              { name: "notes", label: "Notes", type: "textarea" },
            ]}
            columns={[
              { key: "date", label: "Date", render: (r) => fmtDate(r.date), exportFormat: (r) => fmtDate(r.date) },
              { key: "student", label: "Élève", render: studentName, exportFormat: studentName },
              { key: "route", label: "Circuit", render: (r) => r.transport_routes?.name ?? "—", exportFormat: (r) => r.transport_routes?.name ?? "" },
              { key: "direction", label: "Sens", render: (r) => DIRECTION.find((d) => d.value === r.direction)?.label ?? r.direction, exportFormat: (r) => DIRECTION.find((d) => d.value === r.direction)?.label ?? r.direction },
              {
                key: "status", label: "Statut",
                render: (r) => <Badge variant={r.status === "present" ? "default" : r.status === "absent" ? "destructive" : "outline"}>{ATT_STATUS.find((s) => s.value === r.status)?.label ?? r.status}</Badge>,
                exportFormat: (r) => ATT_STATUS.find((s) => s.value === r.status)?.label ?? r.status,
              },
            ]}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
