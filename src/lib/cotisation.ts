import { supabase as defaultSupabase } from "@/integrations/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";

export type RegisterPaymentResult =
  | { status: "created"; row: any }
  | { status: "error"; error: string };

export async function registerStudentPayment(opts: {
  studentId: string;
  reference: string;
  transferDate?: string | null;
  payerPhone?: string | null;
  supabase?: SupabaseClient;
}): Promise<RegisterPaymentResult> {
  const supabase = opts.supabase ?? (defaultSupabase as unknown as SupabaseClient);
  try {
    const { data, error } = await (supabase as any).rpc("declare_cotisation_payment", {
      _student_id: opts.studentId,
      _reference: opts.reference,
      _transfer_date: opts.transferDate ?? null,
      _payer_phone: opts.payerPhone ?? null,
    });
    if (error) return { status: "error", error: error.message };
    return { status: "created", row: data };
  } catch (err: any) {
    return { status: "error", error: err?.message ?? String(err) };
  }
}
