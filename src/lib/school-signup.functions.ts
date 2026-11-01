import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { trialIdentities } from "@/lib/trial-identity";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(12),
  fullName: z.string().min(1),
  phone: z.string().optional().nullable(),
  schoolName: z.string().min(1),
  schoolAddress: z.string().optional().nullable(),
  schoolPhone: z.string().optional().nullable(),
  // Offre choisie à l'étape « Choix de l'offre » : obligatoire, vérifiée côté serveur.
  offerCode: z.string().trim().min(1).max(64),
  // Prix affiché à l'utilisateur (mensuel pour un forfait, annuel par élève sinon). Jamais utilisé comme prix : sert uniquement
  // à refuser la création si le tarif a changé entre l'affichage et la validation. Le prix retenu est toujours celui de la base.
  expectedPrice: z.number().finite().nonnegative().optional().nullable(),
});

type Result =
  | { ok: true; schoolId: string; userId: string; emailConfirmed: true }
  | { ok: false; error: string };

export const registerSchool = createServerFn({ method: "POST" })
  .inputValidator((d) => schema.parse(d))
  .handler(async ({ data }): Promise<Result> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // 0. L'offre choisie doit exister et être active (aucune création sans offre valide).
    const { data: offer, error: offerErr } = await (supabaseAdmin as any)
      .from("subscription_offers")
      .select("*")
      .eq("code", data.offerCode)
      .eq("is_active", true)
      .maybeSingle();
    const today = new Date().toISOString().slice(0, 10);
    // Offre par établissement : valable seulement dans sa période de validité (contrôlé aussi par la base).
    const flatExpired = !!offer && offer.offer_type === "per_school" && !(offer.valid_from <= today && today <= offer.valid_until);
    if (offerErr || !offer || flatExpired) {
      return { ok: false, error: "Offre invalide ou indisponible. Retournez au choix de l'offre pour en sélectionner une." };
    }

    // Le tarif affiché doit être le tarif actuel (jamais de prix fourni par le navigateur).
    if (data.expectedPrice !== undefined && data.expectedPrice !== null) {
      const current = Number(offer.offer_type === "per_school" ? offer.monthly_price : offer.annual_price_per_student);
      if (Math.round(current) !== Math.round(data.expectedPrice)) {
        return { ok: false, error: "Les tarifs de cette offre ont été mis à jour. Retournez au choix de l'offre pour consulter le tarif actuel." };
      }
    }

    // 0b. Un seul essai gratuit par e-mail et par numéro de téléphone (réservation atomique : index unique).
    const identities = trialIdentities({ email: data.email, phone: data.phone, schoolPhone: data.schoolPhone });
    const claimedIds: string[] = [];
    const releaseClaims = async () => {
      if (claimedIds.length) await (supabaseAdmin as any).from("trial_identities").delete().in("id", claimedIds);
    };
    for (const idn of identities) {
      const { data: row, error: claimErr } = await (supabaseAdmin as any)
        .from("trial_identities")
        .insert({ kind: idn.kind, value: idn.value, school_name: data.schoolName })
        .select("id")
        .single();
      if (claimErr || !row) {
        await releaseClaims();
        if (claimErr?.code === "23505") {
          return { ok: false, error: "L'essai gratuit a déjà été utilisé avec cet e-mail ou ce numéro de téléphone. Connectez-vous à votre établissement existant ou contactez le support." };
        }
        return { ok: false, error: `Impossible de vérifier l'essai gratuit: ${claimErr?.message ?? "erreur inconnue"}` };
      }
      claimedIds.push(row.id);
    }

    // 1. Create school first
    const { data: school, error: schoolErr } = await supabaseAdmin
      .from("schools")
      .insert({
        name: data.schoolName,
        address: data.schoolAddress ?? null,
        phone: data.schoolPhone ?? null,
        email: data.email,
      })
      .select("id")
      .single();
    if (schoolErr || !school) {
      await releaseClaims();
      return { ok: false, error: `Impossible de créer l'établissement: ${schoolErr?.message ?? "erreur inconnue"}` };
    }

    // 2. Create admin user
    const { data: userRes, error: userErr } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: {
        full_name: data.fullName,
        phone: data.phone ?? null,
      },
      app_metadata: {
        school_id: school.id,
        role: "admin",
      },
    });
    if (userErr || !userRes.user) {
      await supabaseAdmin.from("schools").delete().eq("id", school.id);
      await releaseClaims();
      const msg = userErr?.message ?? "";
      if (/already registered|already been registered|exists/i.test(msg)) {
        return { ok: false, error: "Cette adresse e-mail est déjà utilisée. Connectez-vous ou utilisez une autre adresse." };
      }
      return { ok: false, error: `Impossible de créer le compte administrateur: ${msg || "erreur inconnue"}` };
    }

    // 3. Explicitly attach profile + role. The DB trigger (handle_new_user)
    // fires on INSERT into auth.users, but at that point app_metadata is not
    // yet the final value written by createUser() above — it reliably falls
    // back to the sandbox school and no role. So we set the real values here
    // ourselves, right after the user is confirmed created.
    const { error: profileErr } = await supabaseAdmin
      .from("profiles")
      .update({
        full_name: data.fullName,
        phone: data.phone ?? null,
        school_id: school.id,
      })
      .eq("id", userRes.user.id);
    if (profileErr) {
      await supabaseAdmin.auth.admin.deleteUser(userRes.user.id);
      await supabaseAdmin.from("schools").delete().eq("id", school.id);
      await releaseClaims();
      return { ok: false, error: `Impossible de finaliser le profil: ${profileErr.message}` };
    }

    const { error: roleErr } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: userRes.user.id, role: "admin" });
    if (roleErr) {
      await supabaseAdmin.auth.admin.deleteUser(userRes.user.id);
      await supabaseAdmin.from("schools").delete().eq("id", school.id);
      await releaseClaims();
      return { ok: false, error: `Impossible d'attribuer le rôle: ${roleErr.message}` };
    }

    // 4. Associe l'offre choisie à l'établissement via la fonction existante de la base (source « registration »).
    // Ce n'est pas un paiement : les cotisations restent déclarées puis validées comme d'habitude.
    const { error: subErr } = await (supabaseAdmin as any).rpc("register_school_offer", {
      _school_id: school.id,
      _offer_code: offer.code,
    });
    if (subErr) {
      await supabaseAdmin.from("user_roles").delete().eq("user_id", userRes.user.id);
      await supabaseAdmin.auth.admin.deleteUser(userRes.user.id);
      await supabaseAdmin.from("schools").delete().eq("id", school.id);
      await releaseClaims();
      return { ok: false, error: `Impossible d'enregistrer l'offre choisie: ${subErr.message}` };
    }

    if (claimedIds.length) await (supabaseAdmin as any).from("trial_identities").update({ school_id: school.id }).in("id", claimedIds);

    return { ok: true, schoolId: school.id, userId: userRes.user.id, emailConfirmed: true };
  });