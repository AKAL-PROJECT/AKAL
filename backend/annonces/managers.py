"""
Managers & QuerySets custom pour le modèle Annonce.

Fournit des méthodes chainables pour :
- Filtrer les annonces publiées (en_ligne)
- Charger les relations FK sans requêtes N+1 (with_relations)
- Effectuer une recherche textuelle sur titre/description (search)
"""

from django.db import models
from django.db.models import Q


class AnnonceQuerySet(models.QuerySet):
    """QuerySet chainable avec des méthodes métier réutilisables."""

    def en_ligne(self):
        """Filtre uniquement les annonces publiées (statut 'en_ligne')."""
        return self.filter(statut='en_ligne')

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

    def with_relations(self):
        return self.get_queryset().with_relations()

    def search(self, query):
        return self.get_queryset().search(query)
