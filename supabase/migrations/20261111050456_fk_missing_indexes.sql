-- Index manquants sur les clés étrangères du schéma public (additif, idempotent). Retour arrière : drop index sur les index nommés fk_*.
do $$
declare r record; n int := 0;
begin
  for r in
    select c.conrelid, c.conkey, (select relname from pg_class where oid = c.conrelid) as tbl,
           (select string_agg(quote_ident(a.attname), ', ' order by x.ord) from unnest(c.conkey) with ordinality x(attnum, ord)
              join pg_attribute a on a.attrelid = c.conrelid and a.attnum = x.attnum) as cols
      from pg_constraint c
     where c.contype = 'f' and c.connamespace = 'public'::regnamespace
       and not exists (select 1 from pg_index i where i.indrelid = c.conrelid and (i.indkey::int2[])[0:array_length(c.conkey, 1) - 1] = c.conkey)
  loop
    execute format('create index if not exists %I on public.%I (%s)', 'fk_' || r.tbl || '_' || substr(md5(r.tbl || r.cols), 1, 8), r.tbl, r.cols);
    n := n + 1;
  end loop;
  raise notice 'index créés : %', n;
end $$;
