"""
Tableau de bord de pilotage AKAL — GET /admin/pilotage/, réservé au staff
(@staff_member_required, même session que Django Admin).

Volontairement un module de PROJET (akal/), pas une app Django : cette vue
agrège en LECTURE SEULE des données de 4 apps (accounts, annonces,
messaging, agriscore) sans appartenir en propre à aucune d'elles — créer
une 5ᵉ app Django juste pour une vue de synthèse aurait été disproportionné
pour ce MVP (cf. Priorité 5 / O7 : "pas un énorme dashboard").

Aucune API JSON exposée ici : pas de consommateur frontend prévu pour ce
MVP, l'administrateur consulte directement cette page comme le reste de
Django Admin (server-rendered, aucun JS, aucune dépendance de graphique —
les "quelques graphiques simples" sont des barres CSS calculées côté Python
et injectées en largeur %, cf. _barres() ci-dessous).
"""

from __future__ import annotations

from datetime import timedelta

from django.contrib import admin
from django.contrib.admin.views.decorators import staff_member_required
from django.contrib.auth import get_user_model
from django.db.models import Sum
from django.shortcuts import render
from django.utils import timezone

from agriscore.models import StatistiquePasseport
from annonces.api_views import stats_annonces_par_region
from annonces.models import Annonce, StatistiqueAnnonce
from messaging.models import Conversation, Favori

#: "Utilisateur actif" = connexion dans cette fenêtre. Pas de tracking de
#: session/activité plus fin dans le projet — c'est le proxy le plus honnête
#: disponible sans ajouter de nouvelle collecte pour ce MVP.
FENETRE_ACTIVITE_JOURS = 30


def _pourcentage(numerateur: int, denominateur: int) -> float:
    """0.0 si le dénominateur est nul, jamais une ZeroDivisionError — un
    taux de conversion est indéfini avant la première vue, pas une erreur."""
    return round(numerateur / denominateur * 100, 1) if denominateur else 0.0


def _barres(lignes: list[dict]) -> list[dict]:
    """Ajoute `pct` (0-100, relatif au maximum de la série) à chaque ligne
    — alimente un graphique en barres 100 % CSS (largeur en %), sans
    bibliothèque JS. `lignes` doit déjà être triée par l'appelant : les deux
    graphiques du tableau de bord ont un ordre différent (décroissant par
    volume pour les régions, ordre du cycle de vie pour les statuts) — pas
    de tri générique ici qui imposerait un seul ordre aux deux."""
    maximum = max((ligne['count'] for ligne in lignes), default=0)
    return [
        {**ligne, 'pct': round(ligne['count'] / maximum * 100) if maximum else 0}
        for ligne in lignes
    ]


@staff_member_required
def tableau_de_bord(request):
    depuis = timezone.now() - timedelta(days=FENETRE_ACTIVITE_JOURS)

    utilisateurs_actifs = get_user_model().objects.filter(last_login__gte=depuis).count()
    # .dataset_actif() : même filtre que stats_annonces_par_region() ci-dessous
    # — la tuile "Parcelles publiées" doit correspondre à la somme du
    # graphique par région, pas à un total différent qui ne s'additionnerait
    # jamais avec lui à l'écran.
    parcelles_publiees = Annonce.objects.en_ligne().dataset_actif().count()
    vues_totales = StatistiqueAnnonce.objects.aggregate(t=Sum('vues'))['t'] or 0
    favoris_total = Favori.objects.count()
    contacts_total = Conversation.objects.count()
    consultations_agriscore = StatistiquePasseport.objects.aggregate(t=Sum('compteur'))['t'] or 0

    kpis = [
        {'emoji': '👥', 'label': 'Utilisateurs actifs (30 j)', 'valeur': utilisateurs_actifs},
        {'emoji': '🏡', 'label': 'Parcelles publiées', 'valeur': parcelles_publiees},
        {'emoji': '👁️', 'label': 'Consultations de fiches', 'valeur': vues_totales},
        {'emoji': '❤️', 'label': 'Favoris', 'valeur': favoris_total},
        {'emoji': '💬', 'label': 'Contacts vendeurs', 'valeur': contacts_total},
        {'emoji': '📈', 'label': 'Taux visite → contact', 'valeur': f"{_pourcentage(contacts_total, vues_totales)} %"},
        {'emoji': '🌱', 'label': 'Consultations AgriScore', 'valeur': consultations_agriscore},
    ]

    regions_chart = _barres(sorted(
        (
            {'label': ligne['region'].nom, 'count': ligne['count']}
            for ligne in stats_annonces_par_region()
        ),
        key=lambda ligne: -ligne['count'],
    ))

    # Répartition par statut — TOUT le pipeline (brouillon → en_ligne →
    # vendue), pas seulement dataset_actif() : question différente de
    # "que voit le public maintenant" (régions ci-dessus), plutôt "à quoi
    # ressemble l'activité de dépôt dans son ensemble".
    statuts_chart = _barres([
        {'label': label, 'count': Annonce.objects.filter(statut=valeur).count()}
        for valeur, label in Annonce.StatutAnnonce.choices
    ])

    contexte = {
        **admin.site.each_context(request),
        'title': 'Pilotage AKAL',
        'kpis': kpis,
        'regions_chart': regions_chart,
        'statuts_chart': statuts_chart,
        'fenetre_activite_jours': FENETRE_ACTIVITE_JOURS,
    }
    return render(request, 'pilotage/dashboard.html', contexte)
