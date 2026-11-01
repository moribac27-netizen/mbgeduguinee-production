-- Un seul essai gratuit par e-mail et par numéro de téléphone.
-- Les identités restent enregistrées même si l'établissement est supprimé (pas de clé étrangère) : supprimer puis
-- recréer une école avec les mêmes coordonnées ne redonne pas d'essai. Accès réservé au serveur (service_role).
create table if not exists public.trial_identities (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('email','phone')),
  value text not null,
  school_id uuid,
  school_name text,
  created_at timestamptz not null default now(),
  unique (kind, value)
);
alter table public.trial_identities enable row level security;
revoke all on public.trial_identities from anon, authenticated;
grant all on public.trial_identities to service_role;

-- Les écoles déjà existantes comptent comme essai utilisé pour leur e-mail.
insert into public.trial_identities(kind, value, school_id, school_name)
select 'email', lower(trim(s.email)), s.id, s.name
from public.schools s
where s.email is not null and trim(s.email) <> '' and s.id <> '00000000-0000-0000-0000-000000000001'
on conflict (kind, value) do nothing;
