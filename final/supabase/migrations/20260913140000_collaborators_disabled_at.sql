-- Prompt 2 : écran de gestion des collaborateurs
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS disabled_at timestamptz;
