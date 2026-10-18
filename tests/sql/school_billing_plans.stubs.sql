-- Les rôles sont globaux au cluster : on ne les crée que s'ils n'existent pas (fichier réexécutable).
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
END $$;
CREATE SCHEMA auth;
CREATE TABLE auth.users(id uuid primary key, email text);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ select nullif(current_setting('test.uid', true),'')::uuid $$;
CREATE TABLE public.schools(id uuid primary key default gen_random_uuid(), name text);
CREATE TABLE public.students(id uuid primary key default gen_random_uuid(), school_id uuid, status text not null default 'actif');
CREATE TABLE public.profiles(user_id uuid, school_id uuid, role text);
CREATE FUNCTION public.is_super_admin(_uid uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ select exists(select 1 from public.profiles where user_id=_uid and role='super') $$;
CREATE FUNCTION public.same_school(_s uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ select exists(select 1 from public.profiles where user_id=auth.uid() and school_id=_s) $$;
CREATE FUNCTION public.is_direction(_uid uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ select exists(select 1 from public.profiles where user_id=_uid and role in ('admin','directeur')) $$;
CREATE FUNCTION public.is_finance(_uid uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ select exists(select 1 from public.profiles where user_id=_uid and role='comptable') $$;
GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
GRANT SELECT ON public.students, public.profiles TO authenticated;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated;
