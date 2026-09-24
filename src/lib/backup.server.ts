import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const BACKUP_TABLES = [
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
] as const;

const SCHOOL_SCOPED_TABLES = new Set<string>(
  BACKUP_TABLES.filter((t) => !["schools", "user_roles", "circular_reads"].includes(t)),
);

async function readAll(table: string, schoolId: string, userIds: string[], circularIds: string[]) {
  const rows: any[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    let query = supabaseAdmin.from(table).select("*");
    if (SCHOOL_SCOPED_TABLES.has(table)) query = query.eq("school_id", schoolId);
    else if (table === "schools") query = query.eq("id", schoolId);
    else if (table === "user_roles") query = userIds.length ? query.in("user_id", userIds) : null as any;
    else if (table === "circular_reads") query = circularIds.length ? query.in("circular_id", circularIds) : null as any;
    if (!query) return [];
    const { data, error } = await query.range(from, from + pageSize - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    const page = (data as any[]) ?? [];
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}

export async function createSchoolBackup(schoolId: string, kind: "manual" | "automatic") {
  const { data: profiles, error: profilesError } = await supabaseAdmin
    .from("profiles").select("id").eq("school_id", schoolId);
  if (profilesError) throw new Error(`profiles: ${profilesError.message}`);
  const userIds = (profiles ?? []).map((p) => p.id);

  const { data: circulars, error: circularsError } = await supabaseAdmin
    .from("circulars").select("id").eq("school_id", schoolId);
  if (circularsError) throw new Error(`circulars: ${circularsError.message}`);
  const circularIds = (circulars ?? []).map((c) => c.id);

  const dump: Record<string, any[]> = {};
  const counts: Record<string, number> = {};
  let totalRows = 0;
  for (const table of BACKUP_TABLES) {
    const rows = await readAll(table, schoolId, userIds, circularIds);
    dump[table] = rows;
    counts[table] = rows.length;
    totalRows += rows.length;
  }

  const backupId = crypto.randomUUID();
  const payload = {
    version: 2,
    app: "MBGEduGuinée",
    school_id: schoolId,
    created_at: new Date().toISOString(),
    tables: BACKUP_TABLES,
    data: dump,
  };
  const body = JSON.stringify(payload);
  const path = `${schoolId}/${new Date().toISOString().slice(0, 10)}/${backupId}.json`;
  const blob = new Blob([body], { type: "application/json" });

  const { error: uploadError } = await supabaseAdmin.storage
    .from("school-backups")
    .upload(path, blob, { contentType: "application/json", upsert: false });
  if (uploadError) throw new Error(`storage: ${uploadError.message}`);

  const { error: insertError } = await supabaseAdmin.from("backups").insert({
    id: backupId,
    school_id: schoolId,
    created_by: null,
    kind,
    scope: "school",
    status: "success",
    tables: [...BACKUP_TABLES],
    row_counts: counts,
    total_rows: totalRows,
    size_bytes: blob.size,
    storage_path: path,
  } as any);
  if (insertError) {
    await supabaseAdmin.storage.from("school-backups").remove([path]);
    throw new Error(`backups: ${insertError.message}`);
  }

  return { id: backupId, path, totalRows, sizeBytes: blob.size };
}
