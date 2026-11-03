-- Relances de paiement : message aux parents des élèves en retard (messagerie + notification), avec historique.
-- Le reste à payer est calculé par le serveur (frais annuels de la classe − paiements validés) ; jamais un élève soldé,
-- et pas deux relances en moins de 7 jours pour le même élève. Réservé à la direction et aux finances. Idempotent.

create table if not exists public.payment_reminders (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null default public.current_school_id() references public.schools(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  amount_due numeric not null,
  recipients integer not null default 0,
  channel text not null default 'app',
  message text,
  sent_by uuid default auth.uid(),
  sent_at timestamptz not null default now()
);
create index if not exists payment_reminders_student_idx on public.payment_reminders (school_id, student_id, sent_at desc);

alter table public.payment_reminders enable row level security;
grant select on public.payment_reminders to authenticated;
drop policy if exists payment_reminders_read on public.payment_reminders;
create policy payment_reminders_read on public.payment_reminders for select to authenticated
  using (public.is_super_admin(auth.uid()) or (school_id = public.current_school_id() and (public.is_direction(auth.uid()) or public.is_finance(auth.uid()))));

-- Envoie une relance aux parents des élèves choisis. _message : modèle facultatif ({eleve} et {reste} sont remplacés).
create or replace function public.send_payment_reminders(_student_ids uuid[], _message text default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare
  v_school uuid := public.current_school_id();
  s record; v_due numeric; v_paid numeric; v_rest numeric; v_body text; v_rest_txt text; v_parent uuid; v_n int;
  v_sent int := 0; v_paid_skip int := 0; v_recent int := 0; v_noparent int := 0; v_tpl text;
begin
  if auth.uid() is null or not (public.is_super_admin(auth.uid()) or public.is_direction(auth.uid()) or public.is_finance(auth.uid())) then
    raise exception 'Accès refusé' using errcode = '42501';
  end if;
  if _student_ids is null or array_length(_student_ids, 1) is null then return jsonb_build_object('sent', 0); end if;
  if array_length(_student_ids, 1) > 500 then raise exception 'Trop d''élèves à la fois (500 maximum)'; end if;
  v_tpl := coalesce(nullif(btrim(_message), ''),
    'Bonjour, sauf erreur de notre part, il reste {reste} GNF à régler pour la scolarité de {eleve}. Merci de passer à l''administration ou de régulariser dès que possible. Si vous avez déjà payé, veuillez ignorer ce message.');
  if length(v_tpl) > 1000 then raise exception 'Message trop long (1000 caractères maximum)'; end if;

  for s in
    select st.id, st.full_name, st.school_id, st.parent_user_id, coalesce(c.annual_fee, 0) as fee
    from public.students st left join public.classes c on c.id = st.class_id
    where st.id = any(_student_ids) and (st.school_id = v_school or public.is_super_admin(auth.uid()))
  loop
    v_due := s.fee;
    select coalesce(sum(p.amount), 0) into v_paid from public.payments p where p.student_id = s.id and p.validation_status = 'validé';
    v_rest := v_due - v_paid;
    if v_due <= 0 or v_rest <= 0 then v_paid_skip := v_paid_skip + 1; continue; end if;
    if exists (select 1 from public.payment_reminders r where r.student_id = s.id and r.sent_at > now() - interval '7 days') then
      v_recent := v_recent + 1; continue;
    end if;
    v_rest_txt := replace(to_char(v_rest, 'FM999,999,999,999'), ',', ' ');
    v_body := replace(replace(v_tpl, '{eleve}', s.full_name), '{reste}', v_rest_txt);
    v_n := 0;
    for v_parent in
      select distinct u from (
        select s.parent_user_id as u
        union all select sp.parent_user_id from public.student_parents sp where sp.student_id = s.id
      ) x where u is not null
    loop
      insert into public.messages(school_id, sender_id, recipient_id, subject, body)
        values (s.school_id, auth.uid(), v_parent, 'Rappel de paiement — ' || s.full_name, v_body);
      insert into public.notifications(user_id, school_id, type, title, body, entity_type, entity_id, link)
        values (v_parent, s.school_id, 'payment_reminder', 'Rappel de paiement', 'Il reste ' || v_rest_txt || ' GNF pour ' || s.full_name, 'student', s.id, '/parent');
      v_n := v_n + 1;
    end loop;
    if v_n = 0 then v_noparent := v_noparent + 1; continue; end if;
    insert into public.payment_reminders(school_id, student_id, amount_due, recipients, channel, message)
      values (s.school_id, s.id, v_rest, v_n, 'app', v_body);
    v_sent := v_sent + 1;
  end loop;
  return jsonb_build_object('sent', v_sent, 'skipped_paid', v_paid_skip, 'skipped_recent', v_recent, 'skipped_no_parent', v_noparent);
end $function$;
revoke execute on function public.send_payment_reminders(uuid[], text) from public, anon;
grant execute on function public.send_payment_reminders(uuid[], text) to authenticated;
