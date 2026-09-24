import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  DatabaseBackup, Download, Upload, RotateCcw, Trash2, ShieldAlert, Clock,
  CheckCircle2, XCircle, Loader2, FileArchive, HardDriveDownload, Play, Save, Lock,
} from "lucide-react";
import { toast } from "sonner";
import { logActivity } from "@/lib/audit";

export const Route = createFileRoute("/_authenticated/sauvegarde")({
  component: BackupPage,
  head: () => ({ meta: [{ title: "Sauvegarde — MBGEduGuinée" }] }),
});

// Tables sauvegardées (ordre = ordre de restauration pour respecter les FK)
const BACKUP_TABLES = [
  "schools", "profiles", "user_roles",
  "subjects", "classes", "rooms", "teachers", "teacher_class_assignments",
  "students", "student_parents", "student_access_codes",
  "schedule_slots", "exams", "grades", "student_attendance", "teacher_attendance",
  "payments", "student_plan_payments", "cotisation_payment_audit",
  "financial_accounts", "revenues", "expenses",
  "employee_contracts", "employee_leaves", "payslips",
  "library_categories", "library_books", "library_loans",
  "medical_records", "medical_visits", "medicines", "treatments", "accidents",
  "discipline_incidents",
  "transport_routes", "transport_buses", "transport_drivers", "transport_subscriptions", "transport_attendance",
  "canteen_menus", "canteen_subscriptions", "canteen_payments", "canteen_consumption",
  "nursery_sections", "nursery_children", "nursery_competencies", "nursery_evaluations", "nursery_daily_logs", "nursery_schedule_slots",
  "announcements", "circulars", "circular_reads", "messages", "message_broadcasts", "notifications",
  "calendar_events", "school_events", "activity_logs",
  "backups", "backup_schedules",
] as const;
const SCHOOL_SCOPED_TABLES = new Set<string>([
  ...BACKUP_TABLES.filter((t) => !["schools", "user_roles", "circular_reads"].includes(t)),
]);

type BackupRow = {
  id: string;
  school_id: string;
  created_by: string | null;
  kind: string;
  scope: string;
  status: string;
  tables: string[];
  row_counts: Record<string, number>;
  total_rows: number;
  size_bytes: number;
  storage_path: string | null;
  error_message: string | null;
  notes: string | null;
  created_at: string;
};

type Schedule = {
  id: string;
  school_id: string;
  frequency: "daily" | "weekly" | "monthly";
  hour_of_day: number;
  day_of_week: number | null;
  day_of_month: number | null;
  retention_days: number;
  enabled: boolean;
  last_run_at: string | null;
  next_run_at: string | null;
};

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString("fr-FR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });

const fmtBytes = (n: number) => {
  if (!n) return "0 o";
  const u = ["o", "Ko", "Mo", "Go"];
  const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), u.length - 1);
  return `${(n / Math.pow(1024, i)).toFixed(1)} ${u[i]}`;
};

function BackupPage() {
  const [isSuperAdmin, setIsSuperAdmin] = useState<boolean | null>(null);
  const [schoolId, setSchoolId] = useState<string | null>(null);
  const [backups, setBackups] = useState<BackupRow[]>([]);
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [notes, setNotes] = useState("");
  const [restoreOpen, setRestoreOpen] = useState<BackupRow | null>(null);
  const [restoreConfirm, setRestoreConfirm] = useState("");
  const [restoring, setRestoring] = useState(false);

  // Vérifier super admin
  useEffect(() => { (async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setIsSuperAdmin(false); return; }
    const { data: sa } = await supabase.from("super_admins").select("user_id").eq("user_id", user.id).maybeSingle();
    setIsSuperAdmin(!!sa);
    const { data: p } = await supabase.from("profiles").select("school_id").eq("id", user.id).maybeSingle();
    setSchoolId((p as any)?.school_id ?? null);
  })(); }, []);

  async function loadAll() {
    setLoading(true);
    const [{ data: bks }, { data: sch }] = await Promise.all([
      supabase.from("backups").select("*").order("created_at", { ascending: false }).limit(100),
      supabase.from("backup_schedules").select("*").maybeSingle(),
    ]);
    setBackups((bks as any) ?? []);
    setSchedule((sch as any) ?? null);
    setLoading(false);
  }

  useEffect(() => { if (isSuperAdmin) loadAll(); }, [isSuperAdmin]);

  async function snapshotToJSON(targetSchoolId: string) {
    const dump: Record<string, any[]> = {};
    const counts: Record<string, number> = {};
    let total = 0;

    // Les tables globales sont réduites aux enregistrements rattachés à l'école.
    const { data: schoolProfiles, error: profilesError } = await supabase
      .from("profiles")
      .select("id")
      .eq("school_id", targetSchoolId);
    if (profilesError) throw new Error(`Sauvegarde impossible pour profiles: ${profilesError.message}`);
    const userIds = (schoolProfiles ?? []).map((r) => r.id);

    const { data: schoolCirculars, error: circularsError } = await supabase
      .from("circulars")
      .select("id")
      .eq("school_id", targetSchoolId);
    if (circularsError) throw new Error(`Sauvegarde impossible pour circulars: ${circularsError.message}`);
    const circularIds = (schoolCirculars ?? []).map((r) => r.id);

    for (const t of BACKUP_TABLES) {
      const rows: any[] = [];
      const pageSize = 1000;
      for (let from = 0; ; from += pageSize) {
        let query = supabase.from(t as any).select("*");
        if (SCHOOL_SCOPED_TABLES.has(t)) query = query.eq("school_id", targetSchoolId) as any;
        else if (t === "schools") query = query.eq("id", targetSchoolId) as any;
        else if (t === "user_roles") {
          if (!userIds.length) { dump[t] = []; counts[t] = 0; break; }
          query = query.in("user_id", userIds) as any;
        } else if (t === "circular_reads") {
          if (!circularIds.length) { dump[t] = []; counts[t] = 0; break; }
          query = query.in("circular_id", circularIds) as any;
        }
        const { data, error } = await query.range(from, from + pageSize - 1);
        if (error) throw new Error(`Sauvegarde impossible pour ${t}: ${error.message}`);
        const page = (data as any[]) ?? [];
        rows.push(...page);
        if (page.length < pageSize) break;
      }
      if (!(t in dump)) dump[t] = rows;
      counts[t] = dump[t].length;
      total += counts[t];
    }
    return { dump, counts, total };
  }

  async function runBackup(kind: "manual" | "automatic" = "manual") {
    if (!schoolId) { toast.error("École introuvable"); return; }
    setRunning(true);
    try {
      const backupId = crypto.randomUUID();
      const { data: userRes } = await supabase.auth.getUser();
      const createdBy = userRes.user?.id ?? null;

      const { dump, counts, total } = await snapshotToJSON(schoolId);

      const payload = {
        version: 1,
        app: "MBGEduGuinée",
        school_id: schoolId,
        created_at: new Date().toISOString(),
        tables: BACKUP_TABLES,
        data: dump,
      };
      const json = JSON.stringify(payload);
      const blob = new Blob([json], { type: "application/json" });
      const path = `${schoolId}/${new Date().toISOString().slice(0, 10)}/${backupId}.json`;

      const { error: upErr } = await supabase.storage
        .from("school-backups").upload(path, blob, { contentType: "application/json", upsert: false });
      if (upErr) throw upErr;

      const { error: insErr } = await supabase.from("backups").insert({
        id: backupId,
        school_id: schoolId,
        created_by: createdBy,
        kind,
        scope: "full",
        status: "success",
        tables: [...BACKUP_TABLES],
        row_counts: counts,
        total_rows: total,
        size_bytes: blob.size,
        storage_path: path,
        notes: notes || null,
      } as any);
      if (insErr) throw insErr;

      await logActivity({ action: "create", entity_type: "backup", entity_id: backupId,
        entity_label: `Sauvegarde ${kind}`, metadata: { total, size: blob.size } });

      setNotes("");
      toast.success(`Sauvegarde créée (${total} enregistrements)`);
      loadAll();
    } catch (e: any) {
      toast.error("Échec de la sauvegarde : " + (e?.message ?? "erreur"));
      if (schoolId) {
        await supabase.from("backups").insert({
          school_id: schoolId, kind, status: "failed",
          error_message: e?.message ?? "erreur inconnue",
        } as any);
      }
      loadAll();
    } finally {
      setRunning(false);
    }
  }

  async function downloadBackup(b: BackupRow) {
    if (!b.storage_path) { toast.error("Fichier introuvable"); return; }
    const { data, error } = await supabase.storage.from("school-backups").download(b.storage_path);
    if (error || !data) { toast.error("Téléchargement impossible"); return; }
    const url = URL.createObjectURL(data);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mbgeduguinee-backup-${b.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
    await logActivity({ action: "download", entity_type: "backup", entity_id: b.id });
  }

  async function deleteBackup(b: BackupRow) {
    if (!confirm("Supprimer définitivement cette sauvegarde ?")) return;
    if (b.storage_path) await supabase.storage.from("school-backups").remove([b.storage_path]);
    await supabase.from("backups").delete().eq("id", b.id);
    await logActivity({ action: "delete", entity_type: "backup", entity_id: b.id });
    toast.success("Sauvegarde supprimée");
    loadAll();
  }

  async function exportFullJSON() {
    setRunning(true);
    try {
      const { dump, total } = await snapshotToJSON(schoolId!);
      const payload = { version: 1, app: "MBGEduGuinée", school_id: schoolId,
        created_at: new Date().toISOString(), tables: BACKUP_TABLES, data: dump };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `mbgeduguinee-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      await logActivity({ action: "export", entity_type: "database",
        entity_label: "Export JSON complet", metadata: { total } });
      toast.success(`Export téléchargé (${total} enregistrements)`);
    } catch (e: any) {
      toast.error("Erreur export : " + (e?.message ?? ""));
    } finally { setRunning(false); }
  }

  async function performRestore() {
    if (!restoreOpen || restoreConfirm !== "RESTAURER") return;
    setRestoring(true);
    try {
      const { data: file, error } = await supabase.storage
        .from("school-backups").download(restoreOpen.storage_path!);
      if (error || !file) throw error ?? new Error("Fichier introuvable");
      const text = await file.text();
      const payload = JSON.parse(text);
      const tables: string[] = payload.tables ?? BACKUP_TABLES;
      let restored = 0;
      const errors: string[] = [];
      for (const t of tables) {
        const rows = payload.data?.[t];
        if (!Array.isArray(rows) || rows.length === 0) continue;
        // Découper en lots pour éviter les limites de requête
        for (let i = 0; i < rows.length; i += 500) {
          const chunk = rows.slice(i, i + 500);
          const { error: upErr } = await supabase.from(t as any).upsert(chunk, { onConflict: "id" });
          if (upErr) { errors.push(`${t}: ${upErr.message}`); break; }
          restored += chunk.length;
        }
      }
      await logActivity({ action: "update", entity_type: "backup", entity_id: restoreOpen.id,
        entity_label: "Restauration", metadata: { restored, errors: errors.length } });
      if (errors.length) {
        await supabase.from("backups").update({ status: "failed", error_message: errors.join("\n") }).eq("id", restoreOpen.id);
        toast.error(`Restauration incomplète : ${restored} lignes. ${errors.length} erreur(s).`);
      } else {
        toast.success(`Restauration terminée : ${restored} enregistrements`);
      }
      setRestoreOpen(null);
      setRestoreConfirm("");
      loadAll();
    } catch (e: any) {
      toast.error("Restauration échouée : " + (e?.message ?? ""));
    } finally { setRestoring(false); }
  }

  async function saveSchedule(update: Partial<Schedule>) {
    if (!schoolId) return;
    const row = { school_id: schoolId, ...(schedule ?? {}), ...update };
    delete (row as any).id;
    delete (row as any).last_run_at;
    delete (row as any).next_run_at;
    const { error } = await supabase
      .from("backup_schedules")
      .upsert(row as any, { onConflict: "school_id" });
    if (error) { toast.error(error.message); return; }
    toast.success("Planification enregistrée");
    loadAll();
  }

  const stats = useMemo(() => ({
    total: backups.length,
    success: backups.filter((b) => b.status === "success").length,
    failed: backups.filter((b) => b.status === "failed").length,
    size: backups.reduce((s, b) => s + (b.size_bytes ?? 0), 0),
    last: backups[0]?.created_at ?? null,
  }), [backups]);

  if (isSuperAdmin === null) {
    return <div className="flex items-center justify-center py-24"><Loader2 className="size-6 animate-spin" /></div>;
  }
  if (!isSuperAdmin) {
    return (
      <Card className="max-w-xl mx-auto mt-16">
        <CardContent className="p-10 text-center space-y-3">
          <Lock className="size-12 mx-auto text-muted-foreground" />
          <h2 className="text-xl font-bold">Accès réservé</h2>
          <p className="text-muted-foreground">
            Le module Sauvegarde est accessible uniquement au Super Administrateur.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-display font-bold flex items-center gap-3">
            <DatabaseBackup className="size-8 text-primary" />
            Sauvegarde & Restauration
          </h1>
          <p className="text-muted-foreground">
            Protégez les données de votre établissement. Réservé au Super Administrateur.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportFullJSON} disabled={running}>
            <HardDriveDownload className="size-4 mr-2" />Exporter (JSON)
          </Button>
          <Button onClick={() => runBackup("manual")} disabled={running}>
            {running ? <Loader2 className="size-4 mr-2 animate-spin" /> : <Play className="size-4 mr-2" />}
            Nouvelle sauvegarde
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Sauvegardes</div>
          <div className="text-2xl font-bold">{stats.total}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Réussies</div>
          <div className="text-2xl font-bold text-emerald-600">{stats.success}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Échecs</div>
          <div className="text-2xl font-bold text-red-600">{stats.failed}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Espace utilisé</div>
          <div className="text-2xl font-bold">{fmtBytes(stats.size)}</div>
        </CardContent></Card>
      </div>

      <Tabs defaultValue="history">
        <TabsList>
          <TabsTrigger value="history">Historique</TabsTrigger>
          <TabsTrigger value="schedule">Sauvegarde automatique</TabsTrigger>
          <TabsTrigger value="manual">Créer une sauvegarde</TabsTrigger>
        </TabsList>

        <TabsContent value="history" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-lg">Historique des sauvegardes</CardTitle></CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="flex items-center justify-center py-16"><Loader2 className="size-6 animate-spin" /></div>
              ) : backups.length === 0 ? (
                <div className="text-center py-16 text-muted-foreground">
                  <FileArchive className="size-12 mx-auto mb-3 opacity-30" />
                  Aucune sauvegarde pour le moment. Créez-en une pour commencer.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                      <tr>
                        <th className="text-left p-3">Date</th>
                        <th className="text-left p-3">Type</th>
                        <th className="text-left p-3">Statut</th>
                        <th className="text-right p-3">Lignes</th>
                        <th className="text-right p-3">Taille</th>
                        <th className="text-left p-3">Note</th>
                        <th className="text-right p-3">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {backups.map((b) => (
                        <tr key={b.id} className="border-t hover:bg-muted/30">
                          <td className="p-3 font-mono text-xs whitespace-nowrap">{fmtDate(b.created_at)}</td>
                          <td className="p-3">
                            <Badge variant={b.kind === "automatic" ? "secondary" : "outline"}>
                              {b.kind === "automatic" ? "Automatique" : "Manuelle"}
                            </Badge>
                          </td>
                          <td className="p-3">
                            {b.status === "success" ? (
                              <span className="inline-flex items-center gap-1 text-emerald-700 text-xs">
                                <CheckCircle2 className="size-4" /> Réussie
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-red-700 text-xs" title={b.error_message ?? ""}>
                                <XCircle className="size-4" /> Échec
                              </span>
                            )}
                          </td>
                          <td className="p-3 text-right tabular-nums">{b.total_rows.toLocaleString("fr-FR")}</td>
                          <td className="p-3 text-right tabular-nums">{fmtBytes(b.size_bytes)}</td>
                          <td className="p-3 max-w-xs truncate text-muted-foreground">{b.notes ?? "—"}</td>
                          <td className="p-3 text-right whitespace-nowrap">
                            {b.status === "success" && b.storage_path && (
                              <>
                                <Button variant="ghost" size="icon" title="Télécharger"
                                  onClick={() => downloadBackup(b)}>
                                  <Download className="size-4" />
                                </Button>
                                <Button variant="ghost" size="icon" title="Restaurer"
                                  onClick={() => setRestoreOpen(b)}>
                                  <RotateCcw className="size-4" />
                                </Button>
                              </>
                            )}
                            <Button variant="ghost" size="icon" title="Supprimer"
                              onClick={() => deleteBackup(b)}>
                              <Trash2 className="size-4 text-red-600" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="schedule" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Clock className="size-5" /> Sauvegarde automatique
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 max-w-2xl">
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div>
                  <div className="font-medium">Activer les sauvegardes automatiques</div>
                  <div className="text-sm text-muted-foreground">
                    Une sauvegarde sera créée selon la fréquence choisie.
                  </div>
                </div>
                <Switch
                  checked={schedule?.enabled ?? false}
                  onCheckedChange={(v) => saveSchedule({ enabled: v })}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Fréquence</Label>
                  <Select
                    value={schedule?.frequency ?? "daily"}
                    onValueChange={(v: any) => saveSchedule({ frequency: v })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="daily">Quotidienne</SelectItem>
                      <SelectItem value="weekly">Hebdomadaire</SelectItem>
                      <SelectItem value="monthly">Mensuelle</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Heure d'exécution (0-23)</Label>
                  <Input type="number" min={0} max={23}
                    value={schedule?.hour_of_day ?? 2}
                    onChange={(e) => saveSchedule({ hour_of_day: Number(e.target.value) })}
                  />
                </div>
                {schedule?.frequency === "weekly" && (
                  <div>
                    <Label>Jour de la semaine</Label>
                    <Select
                      value={String(schedule?.day_of_week ?? 0)}
                      onValueChange={(v) => saveSchedule({ day_of_week: Number(v) })}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {["Dimanche","Lundi","Mardi","Mercredi","Jeudi","Vendredi","Samedi"].map((d, i) => (
                          <SelectItem key={i} value={String(i)}>{d}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {schedule?.frequency === "monthly" && (
                  <div>
                    <Label>Jour du mois (1-28)</Label>
                    <Input type="number" min={1} max={28}
                      value={schedule?.day_of_month ?? 1}
                      onChange={(e) => saveSchedule({ day_of_month: Number(e.target.value) })}
                    />
                  </div>
                )}
                <div>
                  <Label>Rétention (jours)</Label>
                  <Input type="number" min={1} max={365}
                    value={schedule?.retention_days ?? 30}
                    onChange={(e) => saveSchedule({ retention_days: Number(e.target.value) })}
                  />
                </div>
              </div>

              {schedule?.last_run_at && (
                <div className="text-sm text-muted-foreground border-t pt-3">
                  Dernière exécution : <span className="font-medium">{fmtDate(schedule.last_run_at)}</span>
                </div>
              )}

              <div className="text-xs text-muted-foreground bg-muted/40 rounded p-3 flex gap-2">
                <ShieldAlert className="size-4 shrink-0 mt-0.5" />
                Vous pouvez également lancer une sauvegarde immédiate depuis l'onglet « Créer une sauvegarde ».
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="manual" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-lg">Créer une sauvegarde manuelle</CardTitle></CardHeader>
            <CardContent className="space-y-4 max-w-2xl">
              <div>
                <Label>Note (facultative)</Label>
                <Textarea
                  placeholder="Ex : Avant la clôture du trimestre 2..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
              <div className="text-sm text-muted-foreground">
                {BACKUP_TABLES.length} tables seront sauvegardées :{" "}
                <span className="font-mono text-xs">{BACKUP_TABLES.slice(0, 6).join(", ")}, …</span>
              </div>
              <div className="flex gap-2">
                <Button onClick={() => runBackup("manual")} disabled={running}>
                  {running ? <Loader2 className="size-4 mr-2 animate-spin" /> : <Save className="size-4 mr-2" />}
                  Lancer la sauvegarde
                </Button>
                <Button variant="outline" onClick={exportFullJSON} disabled={running}>
                  <Download className="size-4 mr-2" />Télécharger sans archiver
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Dialog de restauration */}
      <Dialog open={!!restoreOpen} onOpenChange={(o) => { if (!o) { setRestoreOpen(null); setRestoreConfirm(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldAlert className="size-5 text-red-600" /> Restaurer cette sauvegarde
            </DialogTitle>
            <DialogDescription>
              Cette action va <strong>écraser les données actuelles</strong> avec le contenu de la sauvegarde
              du <strong>{restoreOpen && fmtDate(restoreOpen.created_at)}</strong>. Les enregistrements ajoutés
              depuis cette date pourront être perdus. Cette opération est irréversible.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="text-sm bg-red-50 border border-red-200 text-red-800 rounded p-3">
              Tapez <span className="font-mono font-bold">RESTAURER</span> pour confirmer.
            </div>
            <Input
              placeholder="RESTAURER"
              value={restoreConfirm}
              onChange={(e) => setRestoreConfirm(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setRestoreOpen(null); setRestoreConfirm(""); }}>Annuler</Button>
            <Button
              variant="destructive"
              disabled={restoreConfirm !== "RESTAURER" || restoring}
              onClick={performRestore}
            >
              {restoring ? <Loader2 className="size-4 mr-2 animate-spin" /> : <Upload className="size-4 mr-2" />}
              Restaurer maintenant
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
