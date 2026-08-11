"""
Managers & QuerySets custom pour le modèle Annonce.

Fournit des méthodes chainables pour :
- Filtrer les annonces publiées (en_ligne)
- Filtrer par jeu de données actif (dataset_actif, cf. settings.AKAL_DATASET)
- Charger les relations FK sans requêtes N+1 (with_relations)
- Effectuer une recherche textuelle sur titre/description (search)
"""

from django.conf import settings
from django.db import models
from django.db.models import Q

# Bascule simulated/scraped (2026-08-11, cf. import_scraped_data) — filtre en
# lecture seule sur Annonce.source, jamais une suppression/modification de
# données : les deux jeux coexistent toujours en base, seule la valeur par
# défaut de settings.AKAL_DATASET détermine lequel les vues PUBLIQUES
# (catalogue + fiche, cf. annonces/api_views.py) exposent. Volontairement
# non appliqué à mes-annonces/dashboard : un propriétaire retrouve toujours
# ses propres annonces quel que soit AKAL_DATASET (la séparation par
# propriétaire — comptes bot dédiés pour les sources scrapées — suffit déjà
# à ne jamais mélanger les deux dans un contexte "mes annonces").
SOURCES_PAR_DATASET = {
    'simulated': ['interne'],
    'scraped': ['avito', 'mubawab'],
}


class AnnonceQuerySet(models.QuerySet):
    """QuerySet chainable avec des méthodes métier réutilisables."""

    def en_ligne(self):
        """Filtre uniquement les annonces publiées (statut 'en_ligne')."""
        return self.filter(statut='en_ligne')

    def dataset_actif(self):
        """
        Filtre par jeu de données actif (settings.AKAL_DATASET).

        Valeur inconnue/absente => repli silencieux sur 'simulated' (jamais
        d'exception ici : une faute de frappe dans la variable d'env ne doit
        pas faire disparaître tout le catalogue public, juste retomber sur
        le comportement historique).
        """
        sources = SOURCES_PAR_DATASET.get(
            getattr(settings, 'AKAL_DATASET', 'simulated'),
            SOURCES_PAR_DATASET['simulated'],
        )
        return self.filter(source__in=sources)

    def with_relations(self):
        """
        Charge les relations FK/OneToOne en une seule requête SQL.

        select_related (JOIN SQL) :
            - parcelle                                    → évite 1 requête/annonce
            - parcelle__commune__province__region          → chaîne géo legacy
            - parcelle__commune_geom__province__region      → chaîne géo officielle
              (2026-08-06) — les deux sont chargées, les serializers de
              lecture choisissent laquelle lire selon ce qui est renseigné
              sur la Parcelle (cf. ParcelleListSerializer/ParcelleDetailSerializer)
            - proprietaire                                → vendeur

        prefetch_related (requête séparée, mise en cache) :
            - photos                                      → relation inverse 1:N
        """
        return self.select_related(
            'parcelle',
            'parcelle__commune',
            'parcelle__commune__province',
            'parcelle__commune__province__region',
            'parcelle__commune_geom',
            'parcelle__commune_geom__province',
            'parcelle__commune_geom__province__region',
            'proprietaire',
        ).prefetch_related(
            'photos',
        )

    def search(self, query):
        """
        Recherche textuelle insensible à la casse sur le titre et la description.

        Utilise des Q objects combinés avec OR pour matcher l'un ou l'autre champ.
        Retourne le queryset inchangé si la query est vide.
        """
        if not query:
            return self
        return self.filter(
            Q(titre__icontains=query) | Q(description__icontains=query)
        )


class AnnonceManager(models.Manager):
    """
    Manager custom pour Annonce.

    Utilise AnnonceQuerySet pour exposer les méthodes chainables
    directement sur Annonce.objects.

    Exemples d'utilisation :
        Annonce.objects.en_ligne()
        Annonce.objects.en_ligne().with_relations()
        Annonce.objects.search("irrigué").en_ligne()
    """

    def get_queryset(self):
        return AnnonceQuerySet(self.model, using=self._db)

    def en_ligne(self):
        return self.get_queryset().en_ligne()

    def dataset_actif(self):
        return self.get_queryset().dataset_actif()

    def with_relations(self):
        return self.get_queryset().with_relations()

    def search(self, query):
        return self.get_queryset().search(query)
