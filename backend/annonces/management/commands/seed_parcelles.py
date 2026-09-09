"""
Management command : seed_parcelles
Insère 18 parcelles agricoles fictives avec photos pour le développement.

Usage:
    python manage.py seed_parcelles
    python manage.py seed_parcelles --clear   # Nettoyer uniquement (sans recréer)

Dépendances:
    pip install Faker requests Pillow
"""

import os
from decimal import Decimal
from io import BytesIO

import requests
from django.conf import settings
from django.core.files.base import ContentFile
from django.core.management.base import BaseCommand
from django.contrib.gis.geos import Point
from django.utils import timezone

from accounts.models import User
from geo.models import Region, Province, Commune
from annonces.models import Parcelle, Annonce, Photo


# ══════════════════════════════════════════════════════════════
# DONNÉES GÉOGRAPHIQUES FICTIVES (Maroc)
# ══════════════════════════════════════════════════════════════

GEO_REGIONS = [
    {'id': 1, 'nom': 'Fès-Meknès', 'code': 'FM'},
    {'id': 2, 'nom': 'Marrakech-Safi', 'code': 'MS'},
    {'id': 3, 'nom': 'Souss-Massa', 'code': 'SM'},
    {'id': 4, 'nom': 'Rabat-Salé-Kénitra', 'code': 'RSK'},
    {'id': 5, 'nom': 'Béni Mellal-Khénifra', 'code': 'BMK'},
    {'id': 6, 'nom': 'Drâa-Tafilalet', 'code': 'DT'},
]

GEO_PROVINCES = [
    {'id': 101, 'region_id': 1, 'nom': 'Meknès', 'code': 'MEK'},
    {'id': 102, 'region_id': 1, 'nom': 'Fès', 'code': 'FES'},
    {'id': 103, 'region_id': 2, 'nom': 'Marrakech', 'code': 'MRK'},
    {'id': 104, 'region_id': 2, 'nom': 'El Kelâa des Sraghna', 'code': 'EKS'},
    {'id': 105, 'region_id': 3, 'nom': 'Agadir-Ida-Ou-Tanane', 'code': 'AGD'},
    {'id': 106, 'region_id': 3, 'nom': 'Taroudant', 'code': 'TRD'},
    {'id': 107, 'region_id': 4, 'nom': 'Kénitra', 'code': 'KEN'},
    {'id': 108, 'region_id': 4, 'nom': 'Sidi Kacem', 'code': 'SDK'},
    {'id': 109, 'region_id': 5, 'nom': 'Béni Mellal', 'code': 'BEM'},
    {'id': 110, 'region_id': 5, 'nom': 'Khénifra', 'code': 'KHN'},
    {'id': 111, 'region_id': 6, 'nom': 'Errachidia', 'code': 'ERR'},
    {'id': 112, 'region_id': 6, 'nom': 'Ouarzazate', 'code': 'OUZ'},
]

GEO_COMMUNES = [
    {'id': 1001, 'province_id': 101, 'nom': 'Aïn Taoujdate', 'key': 'ain_taoujdate'},
    {'id': 1002, 'province_id': 101, 'nom': 'El Hajeb', 'key': 'el_hajeb'},
    {'id': 1003, 'province_id': 102, 'nom': 'Fès Médina', 'key': 'fes_medina'},
    {'id': 1004, 'province_id': 103, 'nom': 'Tahannaout', 'key': 'tahannaout'},
    {'id': 1005, 'province_id': 104, 'nom': 'El Kelâa des Sraghna', 'key': 'el_kelaa'},
    {'id': 1006, 'province_id': 105, 'nom': 'Aït Melloul', 'key': 'ait_melloul'},
    {'id': 1007, 'province_id': 106, 'nom': 'Taroudant', 'key': 'taroudant'},
    {'id': 1008, 'province_id': 107, 'nom': 'Kénitra', 'key': 'kenitra'},
    {'id': 1009, 'province_id': 108, 'nom': 'Sidi Kacem', 'key': 'sidi_kacem'},
    {'id': 1010, 'province_id': 109, 'nom': 'Béni Mellal', 'key': 'beni_mellal'},
    {'id': 1011, 'province_id': 110, 'nom': 'Khénifra', 'key': 'khenifra'},
    {'id': 1012, 'province_id': 111, 'nom': 'Errachidia', 'key': 'errachidia'},
    {'id': 1013, 'province_id': 112, 'nom': 'Ouarzazate', 'key': 'ouarzazate'},
]


# ══════════════════════════════════════════════════════════════
# UTILISATEURS DE TEST
# ══════════════════════════════════════════════════════════════

SEED_USERS = [
    {
        'email': 'vendeur1@akal.ma',
        'password': 'test1234',
        'nom': 'El Fassi',
        'prenom': 'Ahmed',
        'role': 'VENDEUR',
        'telephone': '+212 6 12 34 56 78',
        'is_verified': True,
    },
    {
        'email': 'vendeur2@akal.ma',
        'password': 'test1234',
        'nom': 'Benkirane',
        'prenom': 'Fatima',
        'role': 'VENDEUR',
        'telephone': '+212 6 98 76 54 32',
        'is_verified': True,
    },
]


# ══════════════════════════════════════════════════════════════
# URLs d'images Unsplash par type de culture (libres de droits)
# Chaque parcelle recevra des images correspondant à sa culture.
# ══════════════════════════════════════════════════════════════

UNSPLASH_IMAGES = {
    'ble': [
        'https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=800&h=600&fit=crop',  # wheat field golden
        'https://images.unsplash.com/photo-1558222218-b7b54eede3f3?w=800&h=600&fit=crop',  # barley field
        'https://images.unsplash.com/photo-1574323347407-f5e1ad6d020b?w=800&h=600&fit=crop',  # wheat harvest
    ],
    'olivier': [
        'https://images.unsplash.com/photo-1445282768818-728615cc910a?w=800&h=600&fit=crop',  # olive grove
        'https://images.unsplash.com/photo-1509281373149-e957c6296406?w=800&h=600&fit=crop',  # olive trees
        'https://images.unsplash.com/photo-1601456713871-996c8c12c530?w=800&h=600&fit=crop',  # olive orchard
    ],
    'arganier': [
        'https://images.unsplash.com/photo-1489392191049-fc10c97e64b6?w=800&h=600&fit=crop',  # arid trees landscape
        'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?w=800&h=600&fit=crop',  # dry hillside trees
        'https://images.unsplash.com/photo-1542601906990-b4d3fb778b09?w=800&h=600&fit=crop',  # natural forest
    ],
    'maraichage': [
        'https://images.unsplash.com/photo-1592838064575-70ed626d3a0e?w=800&h=600&fit=crop',  # greenhouse rows
        'https://images.unsplash.com/photo-1595804368936-e0db7e163b71?w=800&h=600&fit=crop',  # tomato greenhouse
        'https://images.unsplash.com/photo-1464226184884-fa280b87c399?w=800&h=600&fit=crop',  # vegetable farm
    ],
    'agrumes': [
        'https://images.unsplash.com/photo-1611080626919-7cf5a9dbab5b?w=800&h=600&fit=crop',  # orange orchard
        'https://images.unsplash.com/photo-1582979512210-99b6a53386f9?w=800&h=600&fit=crop',  # citrus trees
        'https://images.unsplash.com/photo-1547514701-42782101795e?w=800&h=600&fit=crop',  # orange grove
    ],
    'irrigue': [
        'https://images.unsplash.com/photo-1500651230702-0e2d8a49d4ad?w=800&h=600&fit=crop',  # green irrigated field
        'https://images.unsplash.com/photo-1625246333195-78d9c38ad449?w=800&h=600&fit=crop',  # rice paddy
        'https://images.unsplash.com/photo-1559884743-74a57598c6c7?w=800&h=600&fit=crop',  # farmland aerial
    ],
    'fourrage': [
        'https://images.unsplash.com/photo-1500595046743-cd271d694d30?w=800&h=600&fit=crop',  # green pasture
        'https://images.unsplash.com/photo-1495107334309-fcf20504a5ab?w=800&h=600&fit=crop',  # lush green field
        'https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=800&h=600&fit=crop',  # hay field
    ],
    'palmier': [
        'https://images.unsplash.com/photo-1509316785289-025f5b846b35?w=800&h=600&fit=crop',  # date palm oasis
        'https://images.unsplash.com/photo-1510414842594-a61c69b5ae57?w=800&h=600&fit=crop',  # palm trees landscape
        'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800&h=600&fit=crop',  # palm grove
    ],
    'vigne': [
        'https://images.unsplash.com/photo-1506377585622-bedcbb027afc?w=800&h=600&fit=crop',  # vineyard rows
        'https://images.unsplash.com/photo-1560493676-04071c5f467b?w=800&h=600&fit=crop',  # vineyard hills
        'https://images.unsplash.com/photo-1566903451935-7196f5acd7e8?w=800&h=600&fit=crop',  # grape vines
    ],
    'verger': [
        'https://images.unsplash.com/photo-1457530378978-8bac673b8062?w=800&h=600&fit=crop',  # almond blossoms
        'https://images.unsplash.com/photo-1520052205864-92d242b3a76b?w=800&h=600&fit=crop',  # orchard rows
        'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=800&h=600&fit=crop',  # mixed orchard
    ],
    'bio': [
        'https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=800&h=600&fit=crop',  # organic garden
        'https://images.unsplash.com/photo-1592419044706-39796d40f98c?w=800&h=600&fit=crop',  # vegetable rows
        'https://images.unsplash.com/photo-1523348837708-15d4a09cfac2?w=800&h=600&fit=crop',  # organic farm
    ],
    'ranch': [
        'https://images.unsplash.com/photo-1553284965-83fd3e82fa5a?w=800&h=600&fit=crop',  # horse ranch
        'https://images.unsplash.com/photo-1494947665470-20322015e3a8?w=800&h=600&fit=crop',  # ranch landscape
        'https://images.unsplash.com/photo-1501706362039-c06b2d715385?w=800&h=600&fit=crop',  # equestrian field
    ],
}

# Mapping parcelle → type d'images
PARCELLE_IMAGE_TYPE = {
    0: 'ble',        # Terrain irrigue Meknes (Ble, Olivier)
    1: 'olivier',    # Ferme oleicole El Hajeb
    2: 'ble',        # Parcelle cerealiere Fes
    3: 'arganier',   # Domaine arganier Tahannaout
    4: 'maraichage', # Terre maraichere El Kelaa
    5: 'agrumes',    # Exploitation agrumicole Agadir
    6: 'arganier',   # Parcelle arganier Taroudant
    7: 'irrigue',    # Terrain fertile Kenitra
    8: 'fourrage',   # Ferme laitiere Sidi Kacem
    9: 'olivier',    # Oliveraie Beni Mellal
    10: 'ble',       # Grande exploitation Khenifra
    11: 'palmier',   # Palmeraie Errachidia
    12: 'palmier',   # Oasis Ouarzazate
    13: 'vigne',     # Vignoble premium Meknes
    14: 'arganier',  # Terrain pastoral Taroudant
    15: 'verger',    # Verger moderne Marrakech
    16: 'bio',       # Parcelle bio Kenitra
    17: 'ranch',     # Ranch equestre Beni Mellal
}


# ══════════════════════════════════════════════════════════════
# 18 PARCELLES / ANNONCES (données codées en dur)
# ══════════════════════════════════════════════════════════════

PARCELLES_DATA = [
    # ── 1. Terrain irrigué à Meknès ──
    {
        'titre': 'Terrain irrigué à Meknès',
        'description': (
            "Magnifique terrain agricole irrigué situé dans la plaine du Saïs, "
            "l'une des zones les plus fertiles du Maroc. Sol argilo-limoneux idéal "
            "pour la céréaliculture et l'oléiculture. Accès direct à la route nationale "
            "et proximité du souk hebdomadaire."
        ),
        'commune_key': 'ain_taoujdate',
        'surface': '5.50',
        'prix': '550000.00',
        'statut_foncier': 'melkia',
        'acces_eau': 'irriguee',
        'topographie': 'plat',
        'acces_routier': 'goudron',
        'latitude': 33.94,
        'longitude': -5.22,
        'culture': ['Blé', 'Olivier'],
        'proprietaire_idx': 0,
        'num_photos': 3,
    },
    # ── 2. Ferme oléicole El Hajeb ──
    {
        'titre': 'Ferme oléicole El Hajeb',
        'description': (
            "Exploitation oléicole mature avec plus de 500 oliviers centenaires "
            "en production. Système d'irrigation goutte-à-goutte moderne installé "
            "en 2023. Terrain clôturé avec local de stockage et pressoir traditionnel."
        ),
        'commune_key': 'el_hajeb',
        'surface': '12.00',
        'prix': '1200000.00',
        'statut_foncier': 'immatricule',
        'acces_eau': 'irriguee',
        'topographie': 'vallonne',
        'acces_routier': 'goudron',
        'latitude': 33.69,
        'longitude': -5.37,
        'culture': ['Olivier'],
        'proprietaire_idx': 0,
        'num_photos': 2,
        # Localisation confidentielle : la fiche publique / la carte n'exposent
        # qu'une position floutée (~1 km), déterministe. Sert de cas de démo
        # pour le parcours « confidentialité ». cf. serializers.py.
        'loc_confidentielle': True,
    },
    # ── 3. Parcelle céréalière Fès ──
    {
        'titre': 'Parcelle céréalière Fès',
        'description': (
            "Terrain plat et fertile en bordure de l'oued Fès, idéal pour la culture "
            "du blé tendre et de l'orge. Rendement moyen de 45 quintaux/hectare. "
            "Titre foncier en règle, libre de toute hypothèque."
        ),
        'commune_key': 'fes_medina',
        'surface': '8.00',
        'prix': '640000.00',
        'statut_foncier': 'melkia',
        'acces_eau': 'bour',
        'topographie': 'plat',
        'acces_routier': 'goudron',
        'latitude': 34.04,
        'longitude': -4.98,
        'culture': ['Blé', 'Orge'],
        'proprietaire_idx': 0,
        'num_photos': 2,
    },
    # ── 4. Domaine arganier Tahannaout ──
    {
        'titre': 'Domaine arganier Tahannaout',
        'description': (
            "Domaine exceptionnel au pied du Haut Atlas avec une forêt d'arganiers "
            "naturelle classée patrimoine UNESCO. Potentiel de valorisation en "
            "coopérative d'huile d'argan et agrotourisme."
        ),
        'commune_key': 'tahannaout',
        'surface': '15.00',
        'prix': '2250000.00',
        'statut_foncier': 'soulaliya',
        'acces_eau': 'bour',
        'topographie': 'vallonne',
        'acces_routier': 'piste',
        'latitude': 31.36,
        'longitude': -7.95,
        'culture': ['Arganier'],
        'proprietaire_idx': 1,
        'num_photos': 3,
    },
    # ── 5. Terre maraîchère El Kelâa ──
    {
        'titre': 'Terre maraîchère El Kelâa',
        'description': (
            "Parcelle maraîchère sous serre avec système d'irrigation localisée. "
            "Production annuelle de tomates et poivrons exportée vers l'Europe. "
            "Équipée de 8 serres canariennes en bon état."
        ),
        'commune_key': 'el_kelaa',
        'surface': '3.20',
        'prix': '480000.00',
        'statut_foncier': 'melkia',
        'acces_eau': 'irriguee',
        'topographie': 'plat',
        'acces_routier': 'goudron',
        'latitude': 32.05,
        'longitude': -7.41,
        'culture': ['Tomate', 'Poivron'],
        'proprietaire_idx': 1,
        'num_photos': 2,
    },
    # ── 6. Exploitation agrumicole Agadir ──
    {
        'titre': 'Exploitation agrumicole Agadir',
        'description': (
            "Grande exploitation d'agrumes dans la plaine du Souss, la première "
            "région productrice d'agrumes du Maroc. Verger de clémentines et "
            "d'oranges Navel avec station de conditionnement privée."
        ),
        'commune_key': 'ait_melloul',
        'surface': '20.00',
        'prix': '4000000.00',
        'statut_foncier': 'immatricule',
        'acces_eau': 'irriguee',
        'topographie': 'plat',
        'acces_routier': 'goudron',
        'latitude': 30.33,
        'longitude': -9.50,
        'culture': ['Agrumes'],
        'proprietaire_idx': 0,
        'num_photos': 3,
    },
    # ── 7. Parcelle arganier Taroudant ──
    {
        'titre': 'Parcelle arganier Taroudant',
        'description': (
            "Terrain situé dans la ceinture de l'arganier entre Taroudant et Tiznit. "
            "Sol calcaire adapté aux cultures résistantes à la sécheresse. "
            "Accès par piste carrossable, point d'eau à 2 km."
        ),
        'commune_key': 'taroudant',
        'surface': '10.00',
        'prix': '800000.00',
        'statut_foncier': 'soulaliya',
        'acces_eau': 'bour',
        'topographie': 'pentu',
        'acces_routier': 'piste',
        'latitude': 30.47,
        'longitude': -8.88,
        'culture': ['Arganier'],
        'proprietaire_idx': 1,
        'num_photos': 2,
    },
    # ── 8. Terrain fertile Kénitra ──
    {
        'titre': 'Terrain fertile Kénitra',
        'description': (
            "Parcelle dans le périmètre irrigué du Gharb, première zone rizicole "
            "du Maroc. Sol alluvial riche en nutriments, idéal pour le riz et la "
            "canne à sucre. Accès à l'eau du barrage Al Wahda garanti toute l'année."
        ),
        'commune_key': 'kenitra',
        'surface': '7.50',
        'prix': '1125000.00',
        'statut_foncier': 'melkia',
        'acces_eau': 'irriguee',
        'topographie': 'plat',
        'acces_routier': 'goudron',
        'latitude': 34.26,
        'longitude': -6.58,
        'culture': ['Riz', 'Canne à sucre'],
        'proprietaire_idx': 0,
        'num_photos': 2,
    },
    # ── 9. Ferme laitière Sidi Kacem ──
    {
        'titre': 'Ferme laitière Sidi Kacem',
        'description': (
            "Exploitation agricole polyvalente orientée élevage laitier dans le Gharb. "
            "18 hectares de cultures fourragères (luzerne et maïs ensilage) avec "
            "étable moderne de 80 vaches. Contrat d'approvisionnement avec Centrale Danone."
        ),
        'commune_key': 'sidi_kacem',
        'surface': '18.00',
        'prix': '1800000.00',
        'statut_foncier': 'immatricule',
        'acces_eau': 'mixte',
        'topographie': 'plat',
        'acces_routier': 'goudron',
        'latitude': 34.22,
        'longitude': -5.71,
        'culture': ['Luzerne', 'Maïs'],
        'proprietaire_idx': 1,
        'num_photos': 3,
    },
    # ── 10. Oliveraie Béni Mellal ──
    {
        'titre': 'Oliveraie Béni Mellal',
        'description': (
            "Belle oliveraie dans le piémont du Moyen Atlas, bénéficiant d'un "
            "microclimat favorable. 300 oliviers variété Picholine marocaine en "
            "pleine production. Rendement huile de 20 litres par arbre en moyenne."
        ),
        'commune_key': 'beni_mellal',
        'surface': '6.00',
        'prix': '720000.00',
        'statut_foncier': 'melkia',
        'acces_eau': 'irriguee',
        'topographie': 'pentu',
        'acces_routier': 'piste',
        'latitude': 32.34,
        'longitude': -6.36,
        'culture': ['Olivier'],
        'proprietaire_idx': 0,
        'num_photos': 2,
    },
    # ── 11. Grande exploitation Khénifra ──
    {
        'titre': 'Grande exploitation Khénifra',
        'description': (
            "Vaste domaine agricole dans la plaine de Tadla, périmètre irrigué par "
            "les barrages Bin El Ouidane et Ahmed El Hansali. Rotation blé-betterave "
            "sucrière avec rendements supérieurs à la moyenne nationale."
        ),
        'commune_key': 'khenifra',
        'surface': '25.00',
        'prix': '2000000.00',
        'statut_foncier': 'immatricule',
        'acces_eau': 'mixte',
        'topographie': 'plat',
        'acces_routier': 'goudron',
        'latitude': 32.93,
        'longitude': -5.67,
        'culture': ['Blé', 'Betterave'],
        'proprietaire_idx': 1,
        'num_photos': 2,
    },
    # ── 12. Palmeraie Errachidia ──
    {
        'titre': 'Palmeraie Errachidia',
        'description': (
            "Palmeraie traditionnelle dans la vallée du Ziz avec 200 palmiers "
            "dattiers variété Mejhoul, la plus prisée au monde. Système d'irrigation "
            "par khettara réhabilité. Certification bio en cours d'obtention."
        ),
        'commune_key': 'errachidia',
        'surface': '4.00',
        'prix': '600000.00',
        'statut_foncier': 'guich',
        'acces_eau': 'irriguee',
        'topographie': 'plat',
        'acces_routier': 'goudron',
        'latitude': 31.93,
        'longitude': -4.43,
        'culture': ['Palmier dattier'],
        'proprietaire_idx': 0,
        'num_photos': 3,
    },
    # ── 13. Oasis Ouarzazate ──
    {
        'titre': 'Oasis Ouarzazate',
        'description': (
            "Terre oasienne au cœur de la vallée du Drâa, combinant palmiers "
            "dattiers et culture du safran de Taliouine, l'or rouge du Maroc. "
            "Paysage spectaculaire propice au développement de l'agrotourisme."
        ),
        'commune_key': 'ouarzazate',
        'surface': '2.50',
        'prix': '500000.00',
        'statut_foncier': 'habous',
        'acces_eau': 'irriguee',
        'topographie': 'vallonne',
        'acces_routier': 'piste',
        'latitude': 30.92,
        'longitude': -6.90,
        'culture': ['Palmier dattier', 'Safran'],
        'proprietaire_idx': 1,
        'num_photos': 2,
    },
    # ── 14. Vignoble premium Meknès ──
    {
        'titre': 'Vignoble premium Meknès',
        'description': (
            "Domaine viticole d'exception dans l'AOG Guerrouane, première appellation "
            "d'origine du Maroc. Vignes de cépages nobles (Cabernet Sauvignon, Syrah) "
            "sur sol argilo-calcaire. Cave de vinification équipée."
        ),
        'commune_key': 'ain_taoujdate',
        'surface': '9.00',
        'prix': '1800000.00',
        'statut_foncier': 'immatricule',
        'acces_eau': 'irriguee',
        'topographie': 'vallonne',
        'acces_routier': 'goudron',
        'latitude': 33.88,
        'longitude': -5.30,
        'culture': ['Vigne'],
        'proprietaire_idx': 0,
        'num_photos': 2,
        'loc_confidentielle': True,  # cf. entrée « Ferme oléicole El Hajeb »
    },
    # ── 15. Terrain pastoral Taroudant ──
    {
        'titre': 'Terrain pastoral Taroudant',
        'description': (
            "Vaste terrain de parcours dans l'arrière-pays de Taroudant, combinant "
            "zones de pâturage et forêt d'arganiers. Idéal pour l'élevage caprin "
            "extensif et la production d'huile d'argan."
        ),
        'commune_key': 'taroudant',
        'surface': '30.00',
        'prix': '900000.00',
        'statut_foncier': 'soulaliya',
        'acces_eau': 'bour',
        'topographie': 'pentu',
        'acces_routier': 'difficile',
        'latitude': 30.40,
        'longitude': -8.95,
        'culture': ['Parcours', 'Arganier'],
        'proprietaire_idx': 1,
        'num_photos': 3,
    },
    # ── 16. Verger moderne Marrakech ──
    {
        'titre': 'Verger moderne Marrakech',
        'description': (
            "Verger moderne en intensif dans la zone périurbaine de Marrakech. "
            "Plantation d'amandiers et d'oliviers avec système de fertigation "
            "automatisé. Forage privé avec débit de 15 l/s."
        ),
        'commune_key': 'tahannaout',
        'surface': '11.00',
        'prix': '1650000.00',
        'statut_foncier': 'melkia',
        'acces_eau': 'irriguee',
        'topographie': 'plat',
        'acces_routier': 'goudron',
        'latitude': 31.40,
        'longitude': -7.90,
        'culture': ['Amandier', 'Olivier'],
        'proprietaire_idx': 0,
        'num_photos': 2,
    },
    # ── 17. Parcelle bio Kénitra ──
    {
        'titre': 'Parcelle bio Kénitra',
        'description': (
            "Exploitation certifiée bio dans le périmètre du Gharb, spécialisée "
            "en maraîchage de saison. Clientèle fidèle de restaurants et hôtels "
            "de Rabat. Label bio ONSSA obtenu en 2024."
        ),
        'commune_key': 'kenitra',
        'surface': '4.50',
        'prix': '900000.00',
        'statut_foncier': 'melkia',
        'acces_eau': 'irriguee',
        'topographie': 'plat',
        'acces_routier': 'goudron',
        'latitude': 34.30,
        'longitude': -6.55,
        'culture': ['Légumes bio'],
        'proprietaire_idx': 1,
        'num_photos': 2,
    },
    # ── 18. Ranch équestre Béni Mellal ──
    {
        'titre': 'Ranch équestre Béni Mellal',
        'description': (
            "Domaine polyvalent à vocation équestre et fourragère au pied du "
            "Moyen Atlas. Carrière de dressage, paddocks clôturés et 14 hectares "
            "de luzerne et d'avoine pour l'alimentation des chevaux."
        ),
        'commune_key': 'beni_mellal',
        'surface': '14.00',
        'prix': '2100000.00',
        'statut_foncier': 'immatricule',
        'acces_eau': 'mixte',
        'topographie': 'plat',
        'acces_routier': 'goudron',
        'latitude': 32.30,
        'longitude': -6.40,
        'culture': ['Luzerne', 'Avoine'],
        'proprietaire_idx': 1,
        'num_photos': 3,
    },
]


# ══════════════════════════════════════════════════════════════
# COMMANDE DJANGO
# ══════════════════════════════════════════════════════════════

class Command(BaseCommand):
    help = 'Seed 18 parcelles agricoles fictives avec photos pour le développement'

    def add_arguments(self, parser):
        parser.add_argument(
            '--clear',
            action='store_true',
            help='Supprimer les données seed existantes sans recréer',
        )

    def handle(self, *args, **options):
        self.stdout.write(self.style.WARNING(
            '\n[SEED] =========================================='
            '\n   AKAL -- Seed des parcelles fictives'
            '\n   ==========================================\n'
        ))

        # Étape 1: Nettoyage
        self._clean_seed_data()

        if options['clear']:
            self.stdout.write(self.style.SUCCESS('\n[OK] Nettoyage termine (--clear).'))
            return

        # Étape 2: Données géographiques
        commune_map = self._create_geo_data()

        # Étape 3: Utilisateurs de test
        users = self._create_test_users()

        # Étape 4: Parcelles, Annonces, Photos
        self._create_parcelles_and_annonces(commune_map, users)

        # Résumé final
        self.stdout.write(self.style.SUCCESS(
            f'\n[OK] =========================================='
            f'\n   Seed termine avec succes !'
            f'\n   ------------------------------------------'
            f'\n   Parcelles  : {Parcelle.objects.count()}'
            f'\n   Annonces   : {Annonce.objects.count()}'
            f'\n   Photos     : {Photo.objects.count()}'
            f'\n   Vendeurs   : {User.objects.filter(email__endswith="@akal.ma").exclude(email="admin@akal.ma").count()}'
            f'\n   Communes   : {Commune.objects.count()}'
            f'\n   ==========================================\n'
        ))

    # ──────────────────────────────────────────────
    # ÉTAPE 1 : NETTOYAGE
    # ──────────────────────────────────────────────

    def _clean_seed_data(self):
        """Supprimer les données de seed existantes."""
        self.stdout.write('[1/4] Nettoyage des donnees seed existantes...')
        seed_emails = ['vendeur1@akal.ma', 'vendeur2@akal.ma']

        # Récupérer les parcelles liées aux annonces des vendeurs de test
        seed_annonces = Annonce.objects.filter(proprietaire__email__in=seed_emails)
        parcelle_ids = list(seed_annonces.values_list('parcelle_id', flat=True))

        # Supprimer les parcelles (cascade → annonces → photos)
        if parcelle_ids:
            deleted = Parcelle.objects.filter(id__in=parcelle_ids).delete()
            self.stdout.write(f'   -> Supprime : {deleted[0]} objets (parcelles + annonces + photos)')
        else:
            self.stdout.write('   -> Aucune donnee seed a nettoyer')

        # Supprimer les utilisateurs de test
        deleted_users = User.objects.filter(email__in=seed_emails).delete()
        if deleted_users[0]:
            self.stdout.write(f'   -> Supprime : {deleted_users[0]} utilisateurs de test')

    # ──────────────────────────────────────────────
    # ÉTAPE 2 : DONNÉES GÉOGRAPHIQUES
    # ──────────────────────────────────────────────

    def _create_geo_data(self):
        """Créer les régions, provinces et communes si absentes."""
        self.stdout.write('\n[2/4] Donnees geographiques...')

        # Régions
        for r in GEO_REGIONS:
            Region.objects.get_or_create(id=r['id'], defaults={'nom': r['nom'], 'code': r['code']})
        self.stdout.write(f'   -> Regions   : {len(GEO_REGIONS)} (get_or_create)')

        # Provinces
        for p in GEO_PROVINCES:
            Province.objects.get_or_create(
                id=p['id'],
                defaults={
                    'region_id': p['region_id'],
                    'nom': p['nom'],
                    'code': p['code'],
                }
            )
        self.stdout.write(f'   -> Provinces : {len(GEO_PROVINCES)} (get_or_create)')

        # Communes — construire un mapping key → instance
        commune_map = {}
        for c in GEO_COMMUNES:
            commune, _ = Commune.objects.get_or_create(
                id=c['id'],
                defaults={
                    'province_id': c['province_id'],
                    'nom': c['nom'],
                }
            )
            commune_map[c['key']] = commune
        self.stdout.write(f'   -> Communes  : {len(GEO_COMMUNES)} (get_or_create)')

        return commune_map

    # ──────────────────────────────────────────────
    # ÉTAPE 3 : UTILISATEURS DE TEST
    # ──────────────────────────────────────────────

    def _create_test_users(self):
        """Créer les 2 utilisateurs vendeurs de test."""
        self.stdout.write('\n[3/4] Creation des utilisateurs de test...')
        users = []

        for u in SEED_USERS:
            user = User.objects.create_user(
                email=u['email'],
                password=u['password'],
                nom=u['nom'],
                prenom=u['prenom'],
                role=u['role'],
                telephone=u['telephone'],
                is_verified=u['is_verified'],
            )
            users.append(user)
            self.stdout.write(f'   -> Cree : {user.prenom} {user.nom} ({user.email})')

        return users

    # ──────────────────────────────────────────────
    # ÉTAPE 4 : PARCELLES + ANNONCES + PHOTOS + SCORES
    # ──────────────────────────────────────────────

    def _create_parcelles_and_annonces(self, commune_map, users):
        """Créer les 18 parcelles avec annonces et photos."""
        self.stdout.write('\n[4/4] Creation des parcelles et annonces...')

        # Préparer le répertoire de cache des images seed
        seed_img_dir = os.path.join(settings.MEDIA_ROOT, 'seed_images')
        os.makedirs(seed_img_dir, exist_ok=True)

        photo_counter = 0  # Index global pour les Picsum IDs

        for idx, data in enumerate(PARCELLES_DATA, start=1):
            # ── Créer la Parcelle ──
            parcelle = Parcelle.objects.create(
                commune=commune_map[data['commune_key']],
                surface_ha=Decimal(data['surface']),
                statut_foncier=data['statut_foncier'],
                acces_eau=data['acces_eau'],
                topographie=data['topographie'],
                acces_routier=data['acces_routier'],
                latitude=data['latitude'],
                longitude=data['longitude'],
                geom=Point(data['longitude'], data['latitude'], srid=4326),
                metadata={'culture': data['culture']},
            )

            # ── Créer l'Annonce ──
            annonce = Annonce(
                parcelle=parcelle,
                proprietaire=users[data['proprietaire_idx']],
                titre=data['titre'],
                description=data['description'],
                prix_mad=Decimal(data['prix']),
                statut='en_ligne',
                date_publication=timezone.now(),
                loc_confidentielle=data.get('loc_confidentielle', False),
            )
            annonce.save()  # Le save() génère le slug automatiquement

            # ── Créer les Photos ──
            image_type = PARCELLE_IMAGE_TYPE.get(idx - 1, 'ble')
            urls = UNSPLASH_IMAGES.get(image_type, UNSPLASH_IMAGES['ble'])

            for photo_idx in range(data['num_photos']):
                url = urls[photo_idx % len(urls)]
                image_data = self._get_image(
                    seed_img_dir,
                    url,
                    photo_counter,
                )
                photo_counter += 1

                photo = Photo(
                    annonce=annonce,
                    ordre=photo_idx,
                )
                filename = f'agricole_p{idx:02d}_img{photo_idx + 1}.jpg'
                photo.image.save(filename, ContentFile(image_data), save=True)

            self.stdout.write(
                f'   {idx:2d}/18 | {data["titre"][:40]:<40} | '
                f'{data["surface"]:>6} ha | {Decimal(data["prix"]):>12,.0f} MAD | '
                f'{data["num_photos"]} photos'
            )

    # ──────────────────────────────────────────────
    # TÉLÉCHARGEMENT / GÉNÉRATION D'IMAGES
    # ──────────────────────────────────────────────

    def _get_image(self, seed_dir, url, index):
        """
        Obtenir une image :
        1. Cache local (media/seed_images/)
        2. Téléchargement Unsplash
        3. Fallback : placeholder Pillow
        """
        import hashlib
        url_hash = hashlib.md5(url.encode('utf-8')).hexdigest()
        cached_path = os.path.join(seed_dir, f'unsplash_{url_hash}.jpg')

        # 1. Cache local
        if os.path.exists(cached_path):
            with open(cached_path, 'rb') as f:
                return f.read()

        # 2. Téléchargement Unsplash
        try:
            response = requests.get(url, timeout=15, allow_redirects=True)
            response.raise_for_status()

            # Sauvegarder en cache
            with open(cached_path, 'wb') as f:
                f.write(response.content)

            return response.content

        except Exception as e:
            self.stdout.write(self.style.WARNING(
                f'   [!] Image {url} : telechargement echoue ({e}). Placeholder genere.'
            ))
            return self._generate_placeholder(index)

    def _generate_placeholder(self, index):
        """Générer une image placeholder avec Pillow en cas d'échec réseau."""
        from PIL import Image, ImageDraw

        # Couleurs vertes / terre pour simuler un terrain
        colors = [
            (34, 139, 34),    # Forest green
            (85, 107, 47),    # Dark olive
            (107, 142, 35),   # Olive drab
            (139, 119, 42),   # Dark goldenrod
            (160, 82, 45),    # Sienna
            (46, 139, 87),    # Sea green
        ]
        bg_color = colors[index % len(colors)]

        img = Image.new('RGB', (800, 600), color=bg_color)
        draw = ImageDraw.Draw(img)

        # Bande de texte en bas
        draw.rectangle([(0, 520), (800, 600)], fill=(0, 0, 0, 128))
        draw.text(
            (20, 545),
            f'AKAL — Parcelle Seed #{index + 1}',
            fill='white',
        )

        buffer = BytesIO()
        img.save(buffer, format='JPEG', quality=85)
        return buffer.getvalue()
