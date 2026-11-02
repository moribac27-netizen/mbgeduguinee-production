-- Comptabilité : pièces jointes (factures, reçus, justificatifs) sur les recettes, dépenses et virements.
-- Fichiers dans un bucket PRIVÉ (accès par lien temporaire), réservés à la direction et aux finances de l'école.
-- On peut toujours ajouter un justificatif ; on ne peut plus en retirer une fois la période clôturée. Idempotent ; aucune donnée modifiée.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('accounting-attachments', 'accounting-attachments', false, 5242880,
        array['application/pdf','image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = false, file_size_limit = 5242880,
  allowed_mime_types = array['application/pdf','image/jpeg','image/png','image/webp'];

create table if not exists public.accounting_attachments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null default public.current_school_id() references public.schools(id) on delete cascade,
  kind text not null check (kind in ('revenue','expense','transfer')),
  entry_id uuid not null,
  storage_path text not null unique,
  file_name text not null,
  mime_type text,
  size_bytes integer,
  uploaded_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists accounting_attachments_entry_idx on public.accounting_attachments (school_id, kind, entry_id);

-- Vrai si l'écriture appartient à une période clôturée.
create or replace function public.accounting_entry_closed(_kind text, _entry_id uuid)
returns boolean language plpgsql stable security definer set search_path to 'public' as $function$
declare v_school uuid; v_date date; v_closed date;
begin
  if _kind = 'revenue' then select school_id, occurred_at::date into v_school, v_date from public.revenues where id = _entry_id;
  elsif _kind = 'expense' then select school_id, occurred_at::date into v_school, v_date from public.expenses where id = _entry_id;
  elsif _kind = 'transfer' then select school_id, occurred_at::date into v_school, v_date from public.account_transfers where id = _entry_id;
  end if;
  if v_school is null then return false; end if;
  select closed_until into v_closed from public.accounting_settings where school_id = v_school;
  return v_closed is not null and v_date <= v_closed;
end $function$;
revoke execute on function public.accounting_entry_closed(text, uuid) from public, anon;
grant execute on function public.accounting_entry_closed(text, uuid) to authenticated;

alter table public.accounting_attachments enable row level security;
grant select, insert, delete on public.accounting_attachments to authenticated;

drop policy if exists acc_att_read on public.accounting_attachments;
create policy acc_att_read on public.accounting_attachments for select to authenticated
  using (public.is_super_admin(auth.uid()) or (school_id = public.current_school_id() and (public.is_direction(auth.uid()) or public.is_finance(auth.uid()))));

drop policy if exists acc_att_insert on public.accounting_attachments;
create policy acc_att_insert on public.accounting_attachments for insert to authenticated
  with check (school_id = public.current_school_id() and (public.is_direction(auth.uid()) or public.is_finance(auth.uid()))
              and storage_path like (school_id::text || '/%'));

drop policy if exists acc_att_delete on public.accounting_attachments;
create policy acc_att_delete on public.accounting_attachments for delete to authenticated
  using (public.is_super_admin(auth.uid())
         or (school_id = public.current_school_id() and (public.is_direction(auth.uid()) or public.is_finance(auth.uid()))
             and not public.accounting_entry_closed(kind, entry_id)));

-- Fichiers : dossier = identifiant de l'école.
drop policy if exists acc_att_obj_read on storage.objects;
create policy acc_att_obj_read on storage.objects for select to authenticated
  using (bucket_id = 'accounting-attachments' and (public.is_super_admin(auth.uid())
         or (split_part(name, '/', 1) = public.current_school_id()::text and (public.is_direction(auth.uid()) or public.is_finance(auth.uid())))));
drop policy if exists acc_att_obj_insert on storage.objects;
create policy acc_att_obj_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'accounting-attachments'
         and split_part(name, '/', 1) = public.current_school_id()::text and (public.is_direction(auth.uid()) or public.is_finance(auth.uid())));
drop policy if exists acc_att_obj_delete on storage.objects;
create policy acc_att_obj_delete on storage.objects for delete to authenticated
  using (bucket_id = 'accounting-attachments' and (public.is_super_admin(auth.uid())
         or (split_part(name, '/', 1) = public.current_school_id()::text and (public.is_direction(auth.uid()) or public.is_finance(auth.uid()))
             and not exists (select 1 from public.accounting_attachments a where a.storage_path = name and public.accounting_entry_closed(a.kind, a.entry_id)))));
