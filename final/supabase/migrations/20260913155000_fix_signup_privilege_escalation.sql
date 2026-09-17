-- ⚠️ CORRECTIF DE SÉCURITÉ CRITIQUE — découvert en construisant le Prompt 3.
--
-- handle_new_user() (voir 20260710155523_...) lisait `role` et `school_id`
-- depuis NEW.raw_user_meta_data. Ce champ correspond à `options.data` passé
-- à supabase.auth.signUp() côté client — entièrement contrôlé par
-- quiconque possède juste la clé publique (anon/publishable), embarquée
-- dans le frontend et donc jamais secrète.
--
-- Concrètement, N'IMPORTE QUI pouvait s'auto-attribuer n'importe quel rôle
-- (admin, directeur, comptable...) sur N'IMPORTE QUELLE école existante en
-- appelant directement l'API Supabase Auth avec :
--   supabase.auth.signUp({ email, password,
--     options: { data: { role: 'admin', school_id: '<uuid école ciblée>' } } })
-- ...sans jamais passer par l'application, encore moins par un code
-- d'accès. C'est la faille de fond derrière l'exigence du Prompt 3
-- (« aucune inscription libre n'est autorisée ») — et elle allait bien
-- au-delà du seul espace Parent/Élève.
--
-- Correctif : `role` et `school_id` ne sont plus lus que depuis
-- raw_app_meta_data, qui n'est modifiable QUE via l'API admin (clé
-- service_role, jamais exposée au navigateur) — donc uniquement par nos
-- fonctions serveur de confiance (registerSchool, addCollaborator,
-- redeemAccessCodeAndSignUp, linkAdditionalChild). Un signUp() public
-- continue de fonctionner (compte créé) mais n'obtient plus aucun rôle et
-- atterrit dans une école bac-à-sable inerte : aucun accès nulle part.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _school_id uuid;
  _role app_role;
BEGIN
  _school_id := COALESCE(
    (NEW.raw_app_meta_data->>'school_id')::uuid,
    '00000000-0000-0000-0000-000000000001'::uuid  -- école bac-à-sable, sans staff ni données
  );
  _role := (NEW.raw_app_meta_data->>'role')::app_role;

  INSERT INTO public.profiles (id, full_name, phone, school_id)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'phone',
    _school_id
  );

  -- Plus de valeur par défaut ('parent') : sans rôle explicite fourni via
  -- l'API admin, le compte n'a accès à rien (is_staff/has_role renvoient
  -- systématiquement faux).
  IF _role IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, _role);
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
