"""
Machine d'états des statuts d'annonce (P2 — 2026-07-30).

Module métier autonome — ne dépend d'aucun modèle Django (uniquement des
chaînes correspondant aux valeurs de Annonce.StatutAnnonce), pour rester
testable seul et pour que l'ajout d'un futur statut ou d'une future règle
de modération se fasse ici, sans toucher Annonce ni ses serializers.

Toute nouvelle transition, où qu'elle soit exposée à l'avenir (API, admin,
tâche planifiée), doit être ajoutée à TRANSITIONS_AUTORISEES ci-dessous —
jamais vérifiée ad hoc ailleurs dans le code.

Graphe des transitions autorisées :

    brouillon  → en_ligne    : publication. Garde métier additionnelle non
                                gérée ici : Annonce.can_publish() (géoloc,
                                photo, prix) — appelée par
                                AnnonceEcritureSerializer.update() pour
                                toute transition ENTRANTE vers en_ligne,
                                quelle que soit son origine.
    brouillon  → en_attente  : soumission pour modération. Réservé : aucun
                                déclencheur actuel ne produit cette
                                transition (pas de flux de modération
                                construit) — le graphe l'accepte déjà pour
                                qu'un futur outil n'ait qu'à l'utiliser.
    en_attente → en_ligne    : approbation (même garde can_publish() que
                                brouillon → en_ligne). Réservé, idem.
    en_attente → brouillon   : rejet, retour en brouillon. Réservé, idem.
    en_ligne   → archivee    : archivage par le propriétaire.
    en_ligne   → vendue      : vente conclue directement depuis en_ligne —
                                pas de passage obligé par archivee.
    archivee   → en_ligne    : RÉACTIVATION IMMÉDIATE. Une annonce archivée
                                peut être remise en ligne par son
                                propriétaire sans étape d'approbation
                                supplémentaire ; can_publish() s'applique
                                quand même (même mécanisme générique que
                                ci-dessus), donc une annonce qui ne
                                satisferait plus les prérequis de
                                publication resterait bloquée.
    vendue                   : état TERMINAL — aucune transition sortante.

archivee → vendue n'est volontairement PAS une arête directe : une annonce
archivée doit d'abord être réactivée (archivee → en_ligne) avant de pouvoir
être marquée vendue — évite de dupliquer la sémantique "vente conclue" sur
deux chemins différents.
"""

TRANSITIONS_AUTORISEES: dict[str, frozenset[str]] = {
    "brouillon": frozenset({"en_ligne", "en_attente"}),
    "en_attente": frozenset({"en_ligne", "brouillon"}),
    "en_ligne": frozenset({"archivee", "vendue"}),
    "archivee": frozenset({"en_ligne"}),
    "vendue": frozenset(),
}


def transition_autorisee(statut_actuel: str, nouveau_statut: str) -> bool:
    """Vrai si le passage statut_actuel → nouveau_statut est autorisé par le graphe ci-dessus."""
    return nouveau_statut in TRANSITIONS_AUTORISEES.get(statut_actuel, frozenset())
