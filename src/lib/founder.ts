import { supabase } from "@/integrations/supabase/client";

const db = supabase as any;

export type FounderSchool = { school_id: string; name: string; status: string; suspended: boolean; linked_at: string };
export type MyFounder = { is_founder: boolean; is_pure: boolean; active_school_id: string | null; schools: FounderSchool[] };

export type FounderOverview = {
  school: { id: string; name: string; status: string };
  period: { from: string; to: string; previous_from?: string; previous_to?: string; whole_months?: boolean };
  generated_at: string;
  timezone: string;
  suspended: boolean;
  subscription: Record<string, any> | null;
  unavailable?: Array<{ block: string; reason: string }>;
  headline?: {
    students: number; student_cap: number | null; collections: number; collections_previous: number; collections_variation_pct: number | null;
    unpaid_amount?: number; unpaid_families?: number; treasury_total: number; treasury_by_type: Record<string, number>;
  };
  finance?: {
    revenue: number; expense: number; result: number;
    previous: { revenue: number; expense: number; result: number };
    revenue_by_category: Array<Record<string, any>> | null; expense_by_category: Array<Record<string, any>> | null;
    months: Array<{ month: string; revenue: number; expense: number; result: number }>;
  };
  recovery?: {
    academic_year: string; since: string; basis: string; fees_expected: number; fees_collected: number; amount_due: number;
    students_late: number; families_late: number; by_class: Array<{ class: string | null; level: string | null; students_late: number; amount_due: number }>;
  };
  staff?: { payroll_total: number; payslips_unpaid: number; teachers: number; staff_contracts_active: number };
  pedagogy?: {
    attendance_rate: number | null; attendance_rate_definition: string; attendance_records: number;
    by_level: Array<{ level: string; records: number; present: number; late: number; absent: number; justified: number; attendance_rate: number | null; students: number }>;
  };
  alerts?: { voided_entries: { count: number; amount: number } };
};

export async function fetchMyFounder(): Promise<MyFounder> {
  const { data, error } = await db.rpc("my_founder_schools");
  if (error) throw error;
  return data as MyFounder;
}

export async function fetchFounderOverview(schoolId: string, from: string, to: string): Promise<FounderOverview> {
  const { data, error } = await db.rpc("founder_overview", { _school_id: schoolId, _from: from, _to: to });
  if (error) throw error;
  return data as FounderOverview;
}

/** Journalise côté serveur un export (Excel / PDF) : le fondateur ne peut pas l'omettre. */
export async function logFounderExport(schoolId: string, kind: "xlsx" | "pdf", from: string, to: string) {
  const { error } = await db.rpc("founder_log_export", { _school_id: schoolId, _kind: kind, _details: { from, to } });
  if (error) throw error;
}

export { monthBounds, shiftMonth, currentMonthConakry, FOUNDER_ERRORS, founderErrorMessage } from "./founder-utils";
