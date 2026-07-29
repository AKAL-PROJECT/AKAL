// Types front pour la messagerie (F05) — alignés sur messaging/serializers.py.
//
// Vocabulaire conservé tel quel côté backend (décision F05 du 2026-07-28) :
// `initiateur`/`autre_participant` déduit, jamais traduit en acheteur/vendeur.

export type Participant = {
  id: string;
  prenom: string;
};

export type AnnonceResume = {
  id: string;
  slug: string;
  titre: string;
  photo_principale: string | null;
};

export type Message = {
  id: string;
  auteur: Participant;
  contenu: string;
  is_lu: boolean;
  created_at: string;
};

export type DernierMessage = {
  contenu: string;
  created_at: string;
  auteur_id: string;
};

// Un fil tel que listé dans l'inbox — `messages_non_lus` et
// `autre_participant` sont toujours relatifs à l'utilisateur connecté.
export type Conversation = {
  id: string;
  annonce: AnnonceResume;
  autre_participant: Participant;
  dernier_message: DernierMessage | null;
  messages_non_lus: number;
  updated_at: string;
};
