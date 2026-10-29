// Codes de motif de modération — doivent rester alignés sur
// backend/annonces/moderation_actions.py::MOTIFS (le backend refuse tout
// autre code) et sur Signalement.Raison (backend/annonces/models.py).

export const MOTIFS_DECISION: { code: string; libelle: string }[] = [
  { code: "photos_non_conformes", libelle: "Photos non conformes" },
  { code: "informations_incompletes", libelle: "Informations incomplètes" },
  { code: "prix_incoherent", libelle: "Prix incohérent" },
  { code: "hors_sujet", libelle: "Pas un terrain agricole" },
  { code: "coordonnees_dans_le_texte", libelle: "Coordonnées ou liens dans le texte" },
  { code: "doublon", libelle: "Annonce en double" },
  { code: "arnaque_suspectee", libelle: "Fraude suspectée" },
  { code: "autre", libelle: "Autre (préciser)" },
];

export const RAISONS_SIGNALEMENT: { code: string; libelle: string }[] = [
  { code: "arnaque", libelle: "Arnaque ou fraude suspectée" },
  { code: "hors_sujet", libelle: "Ce n'est pas un terrain agricole" },
  { code: "informations_fausses", libelle: "Informations fausses ou trompeuses" },
  { code: "deja_vendue", libelle: "Parcelle déjà vendue" },
  { code: "doublon", libelle: "Annonce en double" },
  { code: "contenu_inapproprie", libelle: "Contenu inapproprié" },
  { code: "autre", libelle: "Autre (préciser)" },
];

export function libelleMotif(code: string): string {
  return MOTIFS_DECISION.find((m) => m.code === code)?.libelle ?? code;
}
