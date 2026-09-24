-- MBGEduGuinée : vérification publique des reçus de cotisation annuelle.
-- Le modèle unique utilise student_plan_payments ; l'ancienne fonction
-- verify_receipt() pointait encore vers payments et ses anciens statuts.

CREATE OR REPLACE FUNCTION public.verify_receipt(_receipt_number text)
RETURNS TABLE (
  receipt_number text,
  amount numeric,
  payment_type text,
  period text,
  payment_method text,
  paid_at timestamptz,
  validation_status text,
  student_name text,
  class_name text,
  school_name text,
  school_address text,
  school_logo_url text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.receipt_number,
    p.amount,
    'cotisation_annuelle'::text AS payment_type,
    p.academic_year::text AS period,
    p.payment_method,
    COALESCE(p.validated_at, p.paid_at) AS paid_at,
    'validé'::text AS validation_status,
    st.full_name,
    c.name,
    s.name,
    s.address,
    s.logo_url
  FROM public.student_plan_payments p
  LEFT JOIN public.students st ON st.id = p.student_id
  LEFT JOIN public.classes c ON c.id = st.class_id
  LEFT JOIN public.schools s ON s.id = p.school_id
  WHERE p.receipt_number = _receipt_number
    AND p.status = 'VALIDATED'
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.verify_receipt(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_receipt(text) TO anon, authenticated;
