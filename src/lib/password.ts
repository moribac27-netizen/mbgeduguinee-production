/** Règles du nouveau mot de passe (null = valide). */
export function validateNewPassword(current: string, next: string, confirmation: string): string | null {
  if (!current) return "Saisissez votre mot de passe actuel.";
  if (next.length < 8) return "Le nouveau mot de passe doit contenir au moins 8 caractères.";
  if (!/[A-Za-z]/.test(next) || !/[0-9]/.test(next)) return "Utilisez des lettres et des chiffres.";
  if (next === current) return "Le nouveau mot de passe doit être différent de l'ancien.";
  if (next !== confirmation) return "Les deux mots de passe ne correspondent pas.";
  return null;
}
