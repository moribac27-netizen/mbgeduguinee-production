\set ON_ERROR_STOP off
\pset pager off
-- jeu de données
insert into auth.users values ('00000000-0000-0000-0000-00000000000a','sa@x'),('00000000-0000-0000-0000-00000000000b','dir1@x'),('00000000-0000-0000-0000-00000000000c','dir2@x'),('00000000-0000-0000-0000-00000000000d','prof@x');
insert into public.schools(id,name) values ('11111111-1111-1111-1111-111111111111','Ecole A'),('22222222-2222-2222-2222-222222222222','Ecole B');
insert into public.profiles values ('00000000-0000-0000-0000-00000000000a',null,'super'),('00000000-0000-0000-0000-00000000000b','11111111-1111-1111-1111-111111111111','directeur'),('00000000-0000-0000-0000-00000000000c','22222222-2222-2222-2222-222222222222','directeur'),('00000000-0000-0000-0000-00000000000d','11111111-1111-1111-1111-111111111111','enseignant');
insert into public.students(school_id) select '11111111-1111-1111-1111-111111111111' from generate_series(1,600);
insert into public.students(school_id,status) values ('11111111-1111-1111-1111-111111111111','sorti');
insert into public.students(school_id) select '22222222-2222-2222-2222-222222222222' from generate_series(1,601);
\echo === T1 valeurs initiales
select code, monthly_price, max_students, is_active from billing_plans order by sort_order;
select annual_free_months from billing_settings;
\echo === T2 compute (150000 mensuel, annuel) puis 200000 annuel
select * from billing_compute(150000,'monthly',2);
select * from billing_compute(150000,'yearly',2);
select * from billing_compute(200000,'yearly',2);
select * from billing_compute(150000,'yearly',0);
select * from billing_compute(150000,'yearly',12);
\echo === T3 forfait applicable : 600 -> forfait_1 ; 601 -> forfait_2 ; 0 -> forfait_1 ; 1000001 -> aucun
select (billing_plan_for_headcount(600)).code, (billing_plan_for_headcount(601)).code, (billing_plan_for_headcount(0)).code, (billing_plan_for_headcount(1000001)).code is null as none;
\echo === T4 devis ecole A (600 actifs, 1 sorti exclu) et ecole B (601)
set test.uid='00000000-0000-0000-0000-00000000000b'; set role authenticated;
select billing_quote('11111111-1111-1111-1111-111111111111','monthly')->>'plan_code' pc, billing_quote('11111111-1111-1111-1111-111111111111','monthly')->>'students_count' n, billing_quote('11111111-1111-1111-1111-111111111111','yearly')->>'amount' annual;
\echo --- directeur A ne peut pas devis ecole B (FORBIDDEN attendu)
select billing_quote('22222222-2222-2222-2222-222222222222','monthly');
reset role; set test.uid='00000000-0000-0000-0000-00000000000c'; set role authenticated;
select billing_quote('22222222-2222-2222-2222-222222222222','yearly')->>'plan_code' pc, billing_quote('22222222-2222-2222-2222-222222222222','yearly')->>'amount' annual;
reset role;
\echo === T5 non autorise ne peut pas configurer (directeur, enseignant) ; ecriture directe refusee
set test.uid='00000000-0000-0000-0000-00000000000b'; set role authenticated;
select save_billing_config('[{"code":"forfait_1","monthly_price":1,"max_students":600,"is_active":true}]'::jsonb, 2);
update billing_plans set monthly_price=1;
insert into billing_plans(code,name,monthly_price,max_students) values ('x','x',1,1);
reset role;
\echo === T6 Super Admin modifie prix + seuil + mois offerts ; validations
set test.uid='00000000-0000-0000-0000-00000000000a'; set role authenticated;
select save_billing_config('[{"code":"forfait_1","monthly_price":160000,"max_students":700,"is_active":true},{"code":"forfait_2","monthly_price":210000,"max_students":2000000,"is_active":true}]'::jsonb, 3);
select code, monthly_price, max_students from billing_plans order by sort_order;
select annual_free_months from billing_settings;
\echo --- prix negatif
select save_billing_config('[{"code":"forfait_1","monthly_price":-5,"max_students":700,"is_active":true}]'::jsonb, 3);
\echo --- seuils qui se chevauchent (f1 max >= f2 max)
select save_billing_config('[{"code":"forfait_1","monthly_price":160000,"max_students":2000000,"is_active":true}]'::jsonb, 3);
\echo --- seuil 0 / non entier
select save_billing_config('[{"code":"forfait_1","monthly_price":160000,"max_students":0,"is_active":true}]'::jsonb, 3);
select save_billing_config('[{"code":"forfait_1","monthly_price":160000,"max_students":10.5,"is_active":true}]'::jsonb, 3);
\echo --- reduction 13 mois / -1
select save_billing_config('[]'::jsonb, 13);
select save_billing_config('[]'::jsonb, -1);
\echo --- desactiver les deux forfaits
select save_billing_config('[{"code":"forfait_1","monthly_price":160000,"max_students":700,"is_active":false},{"code":"forfait_2","monthly_price":210000,"max_students":2000000,"is_active":false}]'::jsonb, 3);
\echo --- code inconnu
select save_billing_config('[{"code":"zzz","monthly_price":1,"max_students":5}]'::jsonb, 3);
\echo --- etat apres rejets : inchange
select code, monthly_price, max_students, is_active from billing_plans order by sort_order;
select count(*) as history_rows from billing_plan_history;
select entity, plan_code, field, old_value, new_value, changed_by_email from billing_plan_history order by changed_at, field;
reset role;
\echo === T7 recalcul auto apres changement de prix : ecole A (600) annuel = 160000*(12-3)
set test.uid='00000000-0000-0000-0000-00000000000b'; set role authenticated;
select billing_quote('11111111-1111-1111-1111-111111111111','yearly');
\echo === T8 declaration : sans reference, puis mensuel, doublon ref, en attente deja
select declare_school_billing_payment('11111111-1111-1111-1111-111111111111','monthly','  ');
select id, amount, gross_amount, discount_amount, status from declare_school_billing_payment('11111111-1111-1111-1111-111111111111','monthly','OM-001');
select declare_school_billing_payment('11111111-1111-1111-1111-111111111111','yearly','OM-002');
\echo --- ecole B tente une ref deja utilisee
reset role; set test.uid='00000000-0000-0000-0000-00000000000c'; set role authenticated;
select declare_school_billing_payment('22222222-2222-2222-2222-222222222222','yearly','OM-001');
\echo --- enseignant ne peut pas declarer
reset role; set test.uid='00000000-0000-0000-0000-00000000000d'; set role authenticated;
select declare_school_billing_payment('11111111-1111-1111-1111-111111111111','yearly','OM-009');
\echo --- cycle invalide
reset role; set test.uid='00000000-0000-0000-0000-00000000000b'; set role authenticated;
select billing_quote('11111111-1111-1111-1111-111111111111','weekly');
reset role;
\echo === T9 le prix change APRES declaration : le montant declare reste fige
set test.uid='00000000-0000-0000-0000-00000000000a'; set role authenticated;
select save_billing_config('[{"code":"forfait_1","monthly_price":170000,"max_students":700,"is_active":true}]'::jsonb, 3);
select amount as montant_declare_fige, monthly_price from school_billing_payments where reference='OM-001';
\echo === T10 validation : non autorise puis Super Admin
reset role; set test.uid='00000000-0000-0000-0000-00000000000b'; set role authenticated;
select review_school_billing_payment((select id from school_billing_payments where reference='OM-001'), true);
reset role; set test.uid='00000000-0000-0000-0000-00000000000a'; set role authenticated;
select status, amount, receipt_number is not null as recu, (period_end - period_start) as duree from review_school_billing_payment((select id from school_billing_payments where reference='OM-001'), true);
select review_school_billing_payment((select id from school_billing_payments where reference='OM-001'), true);
select plan_code, monthly_price, billing_cycle from school_billing_subscriptions;
\echo === T11 paiement valide immuable (update/delete) meme par service
reset role;
update school_billing_payments set amount=1 where reference='OM-001';
delete from school_billing_payments where reference='OM-001';
\echo === T12 annuel : declare, refus sans motif, refus avec motif, redeclare meme ref (permis apres refus)
set test.uid='00000000-0000-0000-0000-00000000000b'; set role authenticated;
select amount, gross_amount, discount_amount from declare_school_billing_payment('11111111-1111-1111-1111-111111111111','yearly','OM-010');
reset role; set test.uid='00000000-0000-0000-0000-00000000000a'; set role authenticated;
select review_school_billing_payment((select id from school_billing_payments where reference='OM-010'), false, '');
select status, rejection_reason from review_school_billing_payment((select id from school_billing_payments where reference='OM-010'), false, 'Reference introuvable');
reset role; set test.uid='00000000-0000-0000-0000-00000000000b'; set role authenticated;
select status from declare_school_billing_payment('11111111-1111-1111-1111-111111111111','yearly','OM-010');
reset role; set test.uid='00000000-0000-0000-0000-00000000000a'; set role authenticated;
select status, period_end - period_start as duree, period_start >= (select period_end from school_billing_payments where reference='OM-001') as renouvelle_apres_periode_en_cours from review_school_billing_payment((select id from school_billing_payments where reference='OM-010' and status='PENDING'), true);
\echo === T13 RLS lecture : directeur A voit ses paiements seulement ; directeur B voit 0 ; anon voit forfaits actifs mais aucun paiement
reset role; set test.uid='00000000-0000-0000-0000-00000000000b'; set role authenticated;
select count(*) as voit_A from school_billing_payments;
select count(*) as historique_visible from billing_plan_history;
reset role; set test.uid='00000000-0000-0000-0000-00000000000c'; set role authenticated;
select count(*) as voit_B from school_billing_payments;
reset role; set test.uid=''; set role anon;
select count(*) as anon_forfaits from billing_plans;
select count(*) as anon_paiements from school_billing_payments;
reset role;
\echo === T14 rejoue les migrations dans l ordre (idempotence) : valeurs du Super Admin conservees
\i ../../supabase/migrations/20261017120000_school_billing_plans.sql
\i ../../supabase/migrations/20261018120000_billing_numeric_hardening.sql
select code, monthly_price, max_students from billing_plans order by sort_order;
select annual_free_months from billing_settings;
\echo === T15 durcissement : NaN / Infinity / valeurs illisibles refuses, etat inchange
set test.uid='00000000-0000-0000-0000-00000000000a'; set role authenticated;
\echo --- prix NaN (INVALID_PRICE attendu)
select save_billing_config('[{"code":"forfait_1","monthly_price":"NaN","max_students":700,"is_active":true}]'::jsonb, 3);
\echo --- prix Infinity (INVALID_PRICE attendu)
select save_billing_config('[{"code":"forfait_1","monthly_price":"Infinity","max_students":700,"is_active":true}]'::jsonb, 3);
\echo --- prix 1e12 (INVALID_PRICE attendu)
select save_billing_config('[{"code":"forfait_1","monthly_price":1000000000000,"max_students":700,"is_active":true}]'::jsonb, 3);
\echo --- seuil NaN / Infinity / 2147483648 (INVALID_THRESHOLD attendu x3)
select save_billing_config('[{"code":"forfait_1","monthly_price":160000,"max_students":"NaN","is_active":true}]'::jsonb, 3);
select save_billing_config('[{"code":"forfait_1","monthly_price":160000,"max_students":"Infinity","is_active":true}]'::jsonb, 3);
select save_billing_config('[{"code":"forfait_1","monthly_price":160000,"max_students":2147483648,"is_active":true}]'::jsonb, 3);
\echo --- valeur non numerique / booleen invalide (INVALID_VALUES attendu x2)
select save_billing_config('[{"code":"forfait_1","monthly_price":"abc","max_students":700,"is_active":true}]'::jsonb, 3);
select save_billing_config('[{"code":"forfait_1","monthly_price":160000,"max_students":700,"is_active":"maybe"}]'::jsonb, 3);
\echo --- prix absent (INVALID_PRICE attendu)
select save_billing_config('[{"code":"forfait_1"}]'::jsonb, 3);
\echo --- billing_compute NaN (INVALID_PRICE attendu)
select * from billing_compute('NaN'::numeric,'monthly',2);
reset role;
\echo --- etat apres rejets : inchange (170000 / 700 / 210000)
select code, monthly_price, max_students, is_active from billing_plans order by sort_order;
\echo --- contrainte directe (superuser) : NaN refuse
update billing_plans set monthly_price='NaN' where code='forfait_1';
update billing_plans set monthly_price='Infinity' where code='forfait_1';
