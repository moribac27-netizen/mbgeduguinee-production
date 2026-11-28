/**
 * Lit toutes les lignes d'une requête Supabase par pages de 1000 (la base coupe silencieusement à 1000 lignes).
 * `build` reçoit les bornes (from, to) et renvoie la requête avec .range(from, to) ; prévoir un .order(...) stable.
 */
export async function fetchAll<T = any>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: any }>, pageSize = 1000): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await build(from, from + pageSize - 1);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
  }
  return out;
}
