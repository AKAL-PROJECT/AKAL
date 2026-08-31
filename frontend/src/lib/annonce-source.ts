// Provenance d'une annonce (miroir de Annonce.Source côté backend).
//
// `interne` : déposée par un vrai vendeur via /publier → messagerie AKAL + WhatsApp.
// autre     : importée d'une plateforme tierce (Avito, Mubawab). Le
//             « propriétaire » est un compte bot d'import — pas de messagerie
//             AKAL ni de WhatsApp, on renvoie vers l'annonce d'origine.
//
// Le catalogue de démonstration (AKAL_DATASET='simulated') ne contient que
// des annonces `interne` ; cette distinction est un garde-fou pour tout
// environnement qui exposerait le jeu scrapé.

export type SourceAnnonce = "interne" | "avito" | "mubawab" | (string & {});

export const LABEL_SOURCE: Record<string, string> = {
  avito: "Avito",
  mubawab: "Mubawab",
};

// `undefined` (annonce mock, DTO ancien) est traité comme interne : par
// défaut on ne masque rien.
export function estSourceExterne(source: SourceAnnonce | null | undefined): boolean {
  return !!source && source !== "interne";
}

export function libelleSource(source: SourceAnnonce | null | undefined): string {
  if (!source) return "une source externe";
  return LABEL_SOURCE[source] ?? "une source externe";
}
