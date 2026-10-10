/**
 * Maternelle : une section = une classe.
 * Créer (ou renommer) une section crée ou relie automatiquement la classe de niveau « Maternelle »
 * du même nom ; l'utilisateur ne choisit plus de « classe rattachée ».
 */
export type ClassLite = { id: string; name: string; level?: string | null };
export type SectionLite = { id: string; class_id?: string | null };

export const normName = (s: string) =>
  (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

export const isNurseryLevel = (level?: string | null) => /maternelle/i.test(level ?? "");

export type ClassPlan = { action: "link"; id: string } | { action: "rename"; id: string } | { action: "create" };

/**
 * Décide quoi faire pour une section :
 * 1. une classe Maternelle porte déjà ce nom → on la relie ;
 * 2. sinon, si la section est déjà sur une classe Maternelle qu'aucune autre section n'utilise → on la renomme ;
 * 3. sinon (aucune classe, ou section encore sur une classe de primaire/collège/lycée, ou classe partagée) → on en crée une.
 */
export function pickNurseryClass(opts: {
  name: string;
  classes: ClassLite[];
  sections: SectionLite[];
  sectionId?: string | null;
  currentClassId?: string | null;
}): ClassPlan {
  const key = normName(opts.name);
  const nursery = opts.classes.filter((c) => isNurseryLevel(c.level));
  const same = nursery.find((c) => normName(c.name) === key);
  if (same) return { action: "link", id: same.id };
  const cur = opts.currentClassId ? nursery.find((c) => c.id === opts.currentClassId) : undefined;
  if (cur) {
    const sharedWithOther = opts.sections.some((s) => s.id !== opts.sectionId && s.class_id === cur.id);
    if (!sharedWithOther) return { action: "rename", id: cur.id };
  }
  return { action: "create" };
}

/** Résout (et au besoin crée / renomme) la classe Maternelle d'une section. Renvoie son id. */
export async function ensureNurseryClass(
  supabase: any,
  opts: { name: string; sectionId?: string | null; currentClassId?: string | null },
): Promise<string> {
  const name = opts.name.trim();
  if (!name) throw new Error("Le nom de la section est obligatoire.");
  const [{ data: classes, error: e1 }, { data: sections, error: e2 }] = await Promise.all([
    supabase.from("classes").select("id, name, level"),
    supabase.from("nursery_sections").select("id, class_id"),
  ]);
  if (e1 || e2) throw new Error((e1 ?? e2).message);
  const plan = pickNurseryClass({ name, classes: classes ?? [], sections: sections ?? [], sectionId: opts.sectionId, currentClassId: opts.currentClassId });
  if (plan.action === "link") return plan.id;
  if (plan.action === "rename") {
    const { data, error } = await supabase.from("classes").update({ name }).eq("id", plan.id).select("id");
    if (error) throw new Error(error.message);
    if (!data?.length) throw new Error("Renommage de la classe refusé : vérifiez vos droits.");
    return plan.id;
  }
  const { data, error } = await supabase.from("classes").insert({ name, level: "Maternelle", annual_fee: 0 }).select("id").single();
  if (error || !data) throw new Error(error?.message ?? "Création de la classe impossible : vérifiez vos droits.");
  return data.id;
}
