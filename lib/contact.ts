// lib/contact.ts
//
// Coordonnées publiques affichées sur la landing et la page /contact.
// Source unique : modifier ici se répercute partout.
//
// `whatsapp` accepte un format lisible (« + », espaces) : il est normalisé
// avant construction du lien, wa.me n'acceptant que des chiffres.

export const CONTACT = {
  whatsapp: "+213 6 70 66 87 90",
  email: "contact@flowmerce.com",
};

/**
 * Lien wa.me prêt à l'emploi, ou `null` si le numéro est absent ou trop court
 * pour être valide. Les appelants n'affichent le bouton que si le lien existe,
 * ce qui évite de publier une URL cassée.
 */
export const whatsappUrl: string | null = (() => {
  const digits = CONTACT.whatsapp.replace(/\D/g, "");
  return digits.length >= 8 ? `https://wa.me/${digits}` : null;
})();

/**
 * Réseaux sociaux affichés dans le pied de page.
 *
 * ⚠️ Renseigner l'URL complète de chaque compte. Une entrée laissée vide n'est
 * pas affichée : mieux vaut trois icônes que quatre dont une mène à une page
 * inexistante.
 */
export const SOCIALS: { name: string; url: string }[] = [
  { name: "Instagram", url: "" }, // ex. "https://instagram.com/flowmerce"
  { name: "Facebook", url: "" }, // ex. "https://facebook.com/flowmerce"
  { name: "TikTok", url: "" }, // ex. "https://tiktok.com/@flowmerce"
  { name: "WhatsApp", url: whatsappUrl ?? "" },
];
