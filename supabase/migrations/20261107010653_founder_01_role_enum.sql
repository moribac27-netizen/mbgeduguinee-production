-- Module « Vue Fondateur » — migration 1 : nouveau rôle (doit être validée seule avant d'être utilisée)
-- Retour arrière : une valeur d'énumération ne se supprime pas ; il suffit de ne plus l'attribuer (user_roles) — aucune autre table n'en dépend.
alter type public.app_role add value if not exists 'fondateur';
