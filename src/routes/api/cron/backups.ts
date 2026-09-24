import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { createSchoolBackup } from "@/lib/backup.server";

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

function isDue(schedule: any, now: Date) {
  if (!schedule?.enabled || !schedule.next_run_at) return false;
  return new Date(schedule.next_run_at).getTime() <= now.getTime();
}

function nextRun(schedule: any, from: Date) {
  const d = new Date(from);
  d.setUTCMinutes(0, 0, 0);
  d.setUTCHours(Number(schedule.hour_of_day ?? 2));
  if (schedule.frequency === "weekly") {
    const target = Number(schedule.day_of_week ?? 0);
    const delta = (target - d.getUTCDay() + 7) % 7 || 7;
    d.setUTCDate(d.getUTCDate() + delta);
  } else if (schedule.frequency === "monthly") {
    const targetDay = Math.min(Math.max(Number(schedule.day_of_month ?? 1), 1), 28);
    d.setUTCDate(targetDay);
    if (d.getTime() <= from.getTime()) d.setUTCMonth(d.getUTCMonth() + 1);
  } else if (d.getTime() <= from.getTime()) {
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return d.toISOString();
}

export const Route = createFileRoute("/api/cron/backups")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthorized(request)) return new Response("Unauthorized", { status: 401 });
        const now = new Date();
        const { data: schedules, error } = await supabaseAdmin
          .from("backup_schedules")
          .select("*")
          .eq("enabled", true)
          .lte("next_run_at", now.toISOString())
          .limit(100);
        if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

        const results: any[] = [];
        for (const schedule of schedules ?? []) {
          try {
            const backup = await createSchoolBackup(schedule.school_id, "automatic");
            const next = nextRun(schedule, now);
            await supabaseAdmin.from("backup_schedules").update({ last_run_at: now.toISOString(), next_run_at: next }).eq("id", schedule.id);
            const cutoff = new Date(now.getTime() - Number(schedule.retention_days ?? 30) * 86400000).toISOString();
            const { data: oldBackups } = await supabaseAdmin.from("backups").select("id, storage_path").eq("school_id", schedule.school_id).lt("created_at", cutoff).limit(100);
            if (oldBackups?.length) {
              const paths = oldBackups.map((b) => b.storage_path).filter(Boolean) as string[];
              if (paths.length) await supabaseAdmin.storage.from("school-backups").remove(paths);
              await supabaseAdmin.from("backups").delete().in("id", oldBackups.map((b) => b.id));
            }
            results.push({ school_id: schedule.school_id, ok: true, backup_id: backup.id });
          } catch (e: any) {
            await supabaseAdmin.from("backup_schedules").update({ last_run_at: now.toISOString(), next_run_at: nextRun(schedule, now) }).eq("id", schedule.id);
            await supabaseAdmin.from("backups").insert({ school_id: schedule.school_id, kind: "automatic", scope: "school", status: "failed", error_message: e?.message ?? "Erreur inconnue" } as any);
            results.push({ school_id: schedule.school_id, ok: false, error: e?.message ?? "Erreur inconnue" });
          }
        }
        return Response.json({ ok: true, processed: results.length, results });
      },
    },
  },
});
