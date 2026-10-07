/**
 * Référentiel de compétences Maternelle proposé par défaut (modifiable ensuite).
 * Domaines = ceux de l'écran Maternelle (langage, motricité, socialisation, autonomie, éveil).
 */
export const NURSERY_DOMAINS = ["langage", "motricite", "socialisation", "autonomie", "eveil"] as const;

const RAW: Record<(typeof NURSERY_DOMAINS)[number], string[]> = {
  langage: ["Reconnaît son prénom écrit", "S'exprime en phrases simples", "Écoute et comprend une histoire courte", "Chante des comptines"],
  motricite: ["Court, saute et grimpe avec aisance", "Tient correctement son crayon", "Découpe et colle", "Dessine un bonhomme"],
  socialisation: ["Joue avec les autres enfants", "Respecte les règles de la classe", "Partage le matériel", "Dit bonjour, merci et s'il te plaît"],
  autonomie: ["Va aux toilettes seul", "S'habille et se déchausse seul", "Mange seul", "Range son matériel"],
  eveil: ["Reconnaît les couleurs", "Compte jusqu'à 10", "Reconnaît des formes simples", "Participe aux activités créatives"],
};

export const STANDARD_COMPETENCIES: Array<{ domain: string; label: string; display_order: number }> = NURSERY_DOMAINS.flatMap(
  (domain, d) => RAW[domain].map((label, i) => ({ domain, label, display_order: d * 10 + i + 1 })),
);
