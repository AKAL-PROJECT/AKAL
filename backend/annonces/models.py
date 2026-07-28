# pyrefly: ignore [missing-import]
import uuid

from django.conf import settings
from django.contrib.gis.db import models as gis_models
from django.db import models
from django.utils.text import slugify

from .managers import AnnonceManager


# ──────────────────────────────────────────────
# PARCELLE — Le terrain physique
# ──────────────────────────────────────────────

class Parcelle(models.Model):
    """Parcelle de terrain agricole."""

    class StatutFoncier(models.TextChoices):
        MELKIA = 'melkia', 'Melkia'
        SOULALIYA = 'soulaliya', 'Soulaliya'
        GUICH = 'guich', 'Guich'
        HABOUS = 'habous', 'Habous'
        IMMATRICULE = 'immatricule', 'Immatriculé'

    class AccesEau(models.TextChoices):
        IRRIGUEE = 'irriguee', 'Irriguée'
        BOUR = 'bour', 'Bour'
        MIXTE = 'mixte', 'Mixte'

    class Topographie(models.TextChoices):
        PLAT = 'plat', 'Plat'
        PENTU = 'pentu', 'Pentu'
        VALLONNE = 'vallonne', 'Vallonné'

    class AccesRoutier(models.TextChoices):
        GOUDRON = 'goudron', 'Goudron'
        PISTE = 'piste', 'Piste'
        DIFFICILE = 'difficile', 'Difficile'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    # Nullable depuis F03 (dépôt d'annonce) : un brouillon peut exister avant
    # que l'étape "Localisation" du formulaire ne soit renseignée. Le reste
    # des champs (qualité du terrain) reste requis dès la création — seule la
    # localisation est différée. cf. Annonce.can_publish() / is_geolocated()
    # ci-dessous pour la garde-fou avant passage en_ligne (contrat §6.1).
    commune = models.ForeignKey(
        'geo.Commune', on_delete=models.CASCADE, related_name='parcelles',
        null=True, blank=True,
    )
    surface_ha = models.DecimalField(
        max_digits=8, decimal_places=2, help_text='Surface en hectares'
    )
    statut_foncier = models.CharField(max_length=20, choices=StatutFoncier.choices)
    acces_eau = models.CharField(max_length=20, choices=AccesEau.choices)
    topographie = models.CharField(max_length=20, choices=Topographie.choices)
    acces_routier = models.CharField(max_length=20, choices=AccesRoutier.choices)
    latitude = models.FloatField(null=True, blank=True)
    longitude = models.FloatField(null=True, blank=True)
    geom = gis_models.PointField(srid=4326, null=True, blank=True)
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'parcelle'
        verbose_name = 'Parcelle'
        verbose_name_plural = 'Parcelles'

    def is_geolocated(self):
        """Vrai si commune + coordonnées + géométrie sont renseignées (§6.1)."""
        return (
            self.commune_id is not None
            and self.latitude is not None
            and self.longitude is not None
            and self.geom is not None
        )

    def __str__(self):
        return f"Parcelle {self.id} — {self.surface_ha} ha"


# ──────────────────────────────────────────────
# DONNEES GEO — Contour géographique (§3.2)
# ──────────────────────────────────────────────

class DonneesGeo(models.Model):
    """Données géographiques étendues d'une parcelle (contour polygonal)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    parcelle = models.OneToOneField(
        Parcelle, on_delete=models.CASCADE, related_name='donnees_geo'
    )
    contour = gis_models.PolygonField(
        srid=4326, help_text='Contour géographique de la parcelle'
    )

    class Meta:
        db_table = 'donnees_geo'
        verbose_name = 'Données Géo'
        verbose_name_plural = 'Données Géo'

    def __str__(self):
        return f"DonneesGeo — {self.parcelle}"


# ──────────────────────────────────────────────
# ANNONCE — La mise en vente
# ──────────────────────────────────────────────

class Annonce(models.Model):
    """Annonce de vente d'une parcelle."""

    class StatutAnnonce(models.TextChoices):
        BROUILLON = 'brouillon', 'Brouillon'
        EN_ATTENTE = 'en_attente', 'En attente'
        EN_LIGNE = 'en_ligne', 'En ligne'
        ARCHIVEE = 'archivee', 'Archivée'
        VENDUE = 'vendue', 'Vendue'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    parcelle = models.ForeignKey(
        Parcelle, on_delete=models.CASCADE, related_name='annonces'
    )
    proprietaire = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='annonces'
    )
    slug = models.SlugField(max_length=255, unique=True, blank=True)
    titre = models.CharField(max_length=120)
    description = models.TextField()
    prix_mad = models.DecimalField(
        max_digits=12, decimal_places=2, help_text='Prix en MAD'
    )
    statut = models.CharField(
        max_length=20, choices=StatutAnnonce.choices, default=StatutAnnonce.BROUILLON
    )
    loc_confidentielle = models.BooleanField(default=False)
    date_publication = models.DateTimeField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'annonce'
        verbose_name = 'Annonce'
        verbose_name_plural = 'Annonces'

    objects = AnnonceManager()

    def save(self, *args, **kwargs):
        if not self.slug:
            base_slug = slugify(self.titre)
            self.slug = f"{base_slug}-{str(self.id)[:8]}"
        super().save(*args, **kwargs)

    def can_publish(self):
        """
        Prérequis de publication brouillon → en_ligne (contrat §6.1) :
        parcelle géolocalisée, au moins une photo, prix strictement positif.

        Retourne (bool, list[str]) — la liste contient les raisons de blocage
        si le premier élément est False, vide sinon. N'écrit rien en base :
        appelée aussi bien en lecture seule (front) qu'avant la transition
        réelle (serializer d'écriture).
        """
        raisons = []
        if not self.parcelle.is_geolocated():
            raisons.append("La localisation de la parcelle doit être renseignée avant publication.")
        if not self.photos.exists():
            raisons.append("Au moins une photo est requise avant publication.")
        if not self.prix_mad or self.prix_mad <= 0:
            raisons.append("Le prix doit être strictement positif avant publication.")
        return (len(raisons) == 0, raisons)

    def __str__(self):
        return self.titre


# ──────────────────────────────────────────────
# STATISTIQUE ANNONCE — Compteurs de vues (§3.4)
# ──────────────────────────────────────────────

class StatistiqueAnnonce(models.Model):
    """Statistiques journalières d'une annonce (vues par jour)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    annonce = models.ForeignKey(
        Annonce, on_delete=models.CASCADE, related_name='statistiques'
    )
    date = models.DateField()
    vues = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = 'statistique_annonce'
        verbose_name = 'Statistique Annonce'
        verbose_name_plural = 'Statistiques Annonces'
        unique_together = ('annonce', 'date')

    def __str__(self):
        return f"{self.annonce} — {self.date} — {self.vues} vues"


# ──────────────────────────────────────────────
# AGRISCORE — Évaluation de la parcelle
# ──────────────────────────────────────────────

class AgriScore(models.Model):
    """Score agricole calculé pour une parcelle."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    parcelle = models.ForeignKey(
        Parcelle, on_delete=models.CASCADE, related_name='scores'
    )
    score_global = models.FloatField(blank=True, null=True)
    sous_scores = models.JSONField(blank=True, null=True)
    indice_confiance = models.FloatField(blank=True, null=True)
    version_ponderation = models.CharField(max_length=50)
    calculated_at = models.DateTimeField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'agriscore'
        verbose_name = 'AgriScore'
        verbose_name_plural = 'AgriScores'

    def __str__(self):
        return f"AgriScore {self.parcelle} — {self.score_global}"


# ──────────────────────────────────────────────
# PHOTO — Images de l'annonce (§3.6)
# ──────────────────────────────────────────────

class Photo(models.Model):
    """
    Photo associée à une annonce.

    La photo principale est celle avec ordre=0.
    L'ordre est unique par annonce et commence à 0.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    annonce = models.ForeignKey(
        Annonce, on_delete=models.CASCADE, related_name='photos'
    )
    image = models.ImageField(upload_to='photos/')
    ordre = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'photo'
        verbose_name = 'Photo'
        verbose_name_plural = 'Photos'
        ordering = ['ordre']
        unique_together = ('annonce', 'ordre')

    def __str__(self):
        return f"Photo {self.ordre} — {self.annonce}"
