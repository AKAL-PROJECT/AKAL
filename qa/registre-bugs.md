# AKAL — Registre de bugs

**Propriétaire :** Destiné (QA — livrable, cf. PDF de répartition §3)

Tableau vivant, à mettre à jour dès qu'un bug est trouvé pendant le
protocole de test ([`protocole-de-test.md`](./protocole-de-test.md)) ou en
usage normal. Référence l'ID du scénario testé (colonne "Scénario") pour
retrouver le contexte de reproduction.

**Statuts :** À faire · En cours · Fait · À étudier — même vocabulaire que
le registre de prise en charge des remarques (PDF §9), pour ne pas avoir
deux systèmes de suivi différents dans l'équipe.

## Comment ouvrir un ticket

1. Reproduis le bug une deuxième fois pour confirmer que ce n'est pas un
   accident isolé (cf. le bug type visé par ce protocole : une succession
   d'actions qui casse, pas un bouton unitaire cassé).
2. Ajoute une ligne au tableau ci-dessous avec un ID `BUG-XX` (numéro
   suivant disponible), le scénario source, les étapes de reproduction, la
   priorité et le responsable pressenti (celui qui possède le dossier
   concerné, cf. §4 du PDF — on ne corrige jamais dans le dossier d'un
   autre sans lui demander).
3. Priorité : `P0` bloque la démo · `P1` gênant mais contournable · `P2` à
   étudier plus tard.

---

| ID | Scénario | Description / repro | Prio | Responsable | Statut | Validation |
|---|---|---|---|---|---|---|
| BUG-01 | — (audit texte, hors protocole ci-dessus) | Wording "Statut foncier vérifié" / "terres vérifiées" présent sur la homepage et dans "Comment ça marche" — contraire à P0-01a (aucune promesse de vérification, seulement "informations déclarées par le vendeur") | P0 | Destiné | Fait | Wording corrigé sur homepage + CommentCaMarcheSection (branche `feat/home-reports-qa`) |
| BUG-02 | — (audit structure, hors protocole ci-dessus) | Liens footer "Comment ça marche" (pointait vers une ancre `/#comment-ca-marche` qui n'existait plus), "Notre mission" et "Financement" (non cliquables) | P1 | Destiné | Fait | Les 3 liens pointent vers de vraies pages dédiées (`/comment-ca-marche`, `/proposition-de-valeur`, `/financement`) |

*(Le registre démarre avec 2 entrées déjà closes, trouvées pendant le
développement des chantiers Homepage et Pages institutionnelles. Les
prochaines lignes viendront de l'exécution réelle du protocole de test
sur les parcours Acheteur/Vendeur/Curieux — nécessite que ces parcours
soient "à peu près debout" côté Mégane/Ibrahim pour être testables.)*
