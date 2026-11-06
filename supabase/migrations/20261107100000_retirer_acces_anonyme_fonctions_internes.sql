-- Audit des fonctions SECURITY DEFINER : deux fonctions internes n'ont aucune raison d'être appelables par un visiteur non connecté.
--  - student_recipient_users(_student_id) renvoie les identifiants des comptes parents/élève d'un élève.
--  - has_student_list_role(_user_id) renvoie si un compte donné a un rôle de liste d'élèves.
-- Les déclencheurs et fonctions internes (qui s'exécutent avec les droits du propriétaire) ne sont pas affectés.
-- has_student_list_role reste explicitement accordée aux utilisateurs connectés : la politique « students_staff_read » en dépend.
revoke execute on function public.student_recipient_users(uuid) from public, anon;
revoke execute on function public.has_student_list_role(uuid) from public, anon;
grant execute on function public.has_student_list_role(uuid) to authenticated, service_role;
