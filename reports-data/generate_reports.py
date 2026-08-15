#!/usr/bin/env python3
"""
AKAL — Générateur de rapports de potentiel simulés (P2-01)
============================================================

Script Python ISOLÉ (aucune dépendance à Django/PostGIS, aucun import du
front) : c'est voulu, cf. le PDF de répartition des tâches — "Génère 10-15
rapports de démo simulés (script Python isolé) : accès route, pédologie,
potentiel agricole/hydrique, cultures". Le rôle de ce script n'est PAS de
produire de vraies données scientifiques, mais des profils plausibles et
variés pour démontrer l'écran "Analyse de potentiel" (bouton sur la fiche
parcelle, cf. section "Fichiers-frontière" du PDF) sans attendre le pipeline
d'enrichissement réel (Phase 3, metadata.* sur Parcelle — hors scope ici).

Chaque rapport porte explicitement `"simule": true` et un texte
d'avertissement : à ne jamais retirer avant un vrai calcul back (règle du
sprint : on ne fait pas semblant que c'est réel).

Contrat de sortie (shape) — à respecter côté affichage (Mégane,
reports-view/) :
    id, annonce_ref, genere_le, simule, avertissement,
    localisation, acces, pedologie, hydrique,
    potentiel_agricole, cultures_suggerees, synthese

Usage :
    python3 generate_reports.py                  # 12 rapports (défaut)
    python3 generate_reports.py --count 15
    python3 generate_reports.py --seed 42         # reproductible
    python3 generate_reports.py --out ./output    # dossier de sortie

Aucune dépendance externe — stdlib uniquement (json, random, argparse,
uuid, datetime) pour que n'importe qui de l'équipe puisse le lancer sans
installer quoi que ce soit.
"""

from __future__ import annotations

import argparse
import json
import random
import uuid
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal

Niveau = Literal["eleve", "moyen", "faible"]

# Régions alignées sur REGIONS_MOCK (frontend/src/data/parcelles.ts) pour que
# les rapports générés puissent être rattachés aux annonces mock existantes
# sans divergence de code région.
REGIONS = [
    {"code": "casablanca-settat", "nom": "Casablanca-Settat"},
    {"code": "fes-meknes", "nom": "Fès-Meknès"},
    {"code": "souss-massa", "nom": "Souss-Massa"},
    {"code": "rabat-sale-kenitra", "nom": "Rabat-Salé-Kénitra"},
    {"code": "oriental", "nom": "Oriental"},
]

COMMUNES_PAR_REGION = {
    "casablanca-settat": ["Benslimane", "Berrechid", "Settat"],
    "fes-meknes": ["Meknès", "Aït Ourir", "El Hajeb"],
    "souss-massa": ["Agadir", "Taroudant", "Oulad Teima"],
    "rabat-sale-kenitra": ["Kénitra", "Sidi Slimane", "Sidi Kacem"],
    "oriental": ["Taourirt", "Oujda", "Berkane"],
}

TYPES_SOL = ["argilo-limoneux", "sablo-argileux", "limoneux", "argileux", "sableux"]
TYPES_ACCES = ["route goudronnée", "piste carrossable", "piste difficile en saison des pluies"]
CULTURES_PAR_ACCES_EAU = {
    "irriguee": ["agrumes", "maraîchage", "olivier irrigué", "cultures fourragères", "vigne"],
    "bour": ["blé tendre", "orge", "olivier en sec", "légumineuses"],
    "mixte": ["olivier", "amandier", "blé dur", "maraîchage de saison"],
}

# 6 annonces mock existantes (frontend/src/data/parcelles.ts) — une partie
# des rapports leur est explicitement rattachée (annonce_ref renseigné) pour
# que Mégane puisse brancher le bouton "Analyser le potentiel" sur une vraie
# fiche mock dès maintenant. Le reste (annonce_ref: null) couvre des profils
# additionnels pour varier la démo sans être limité à 6 annonces.
ANNONCES_MOCK = [
    {"id": "p-01", "slug": "oliveraie-certifiee-bio-meknes", "region": "fes-meknes"},
    {"id": "p-02", "slug": "terrain-irrigue-polyculture-souss", "region": "souss-massa"},
    {"id": "p-03", "slug": "parcelle-cerealiere-en-bour-meknes", "region": "fes-meknes"},
    {"id": "p-04", "slug": "vignoble-etabli-benslimane", "region": "casablanca-settat"},
    {"id": "p-05", "slug": "agrumes-vallee-du-gharb", "region": "rabat-sale-kenitra"},
    {"id": "p-06", "slug": "terrain-a-amenager-taourirt", "region": "oriental"},
]

NIVEAUX: list[Niveau] = ["eleve", "moyen", "faible"]

RESUMES = {
    "eleve": "Profil favorable : accès à l'eau stable et sol adapté aux cultures identifiées.",
    "moyen": "Profil correct avec au moins un facteur limitant (eau, accès ou sol) à surveiller.",
    "faible": "Profil contraint : plusieurs facteurs limitants, valorisation à étudier au cas par cas.",
}


def _niveau_pondere(rng: random.Random) -> Niveau:
    # Distribution volontairement réaliste plutôt qu'uniforme : plus de
    # profils "moyen" que d'extrêmes, pour une démo crédible.
    return rng.choices(NIVEAUX, weights=[3, 5, 2], k=1)[0]


def _score_pour_niveau(rng: random.Random, niveau: Niveau) -> int:
    plage = {"eleve": (72, 95), "moyen": (45, 71), "faible": (15, 44)}[niveau]
    return rng.randint(*plage)


def _pire_niveau(a: Niveau, b: Niveau) -> Niveau:
    ordre = {"faible": 0, "moyen": 1, "eleve": 2}
    return a if ordre[a] <= ordre[b] else b


@dataclass
class RapportPotentiel:
    id: str
    annonce_ref: dict | None
    genere_le: str
    simule: bool
    avertissement: str
    localisation: dict
    acces: dict
    pedologie: dict
    hydrique: dict
    potentiel_agricole: dict
    cultures_suggerees: list[str]
    synthese: dict


def generer_rapport(rng: random.Random, annonce: dict | None) -> RapportPotentiel:
    code_region = annonce["region"] if annonce else rng.choice(REGIONS)["code"]
    region = next(r for r in REGIONS if r["code"] == code_region)
    commune = rng.choice(COMMUNES_PAR_REGION[region["code"]])
    acces_eau = rng.choice(["irriguee", "bour", "mixte"])
    niveau_hydrique: Niveau = _niveau_pondere(rng)
    niveau_agricole: Niveau = _niveau_pondere(rng)

    return RapportPotentiel(
        id=str(uuid.uuid4()),
        annonce_ref={"id": annonce["id"], "slug": annonce["slug"]} if annonce else None,
        genere_le=datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        simule=True,
        avertissement=(
            "Rapport généré à partir de données SIMULÉES à des fins de démonstration. "
            "Ne reflète aucune mesure réelle du terrain."
        ),
        localisation={
            "region": region,
            "commune": commune,
            "latitude": round(rng.uniform(27.5, 35.5), 4),
            "longitude": round(rng.uniform(-11.5, -1.0), 4),
        },
        acces={
            "type_route": rng.choice(TYPES_ACCES),
            "distance_ville_km": rng.randint(2, 45),
            "acces_eau": acces_eau,
        },
        pedologie={
            "type_sol": rng.choice(TYPES_SOL),
            "ph_estime": round(rng.uniform(6.0, 8.2), 1),
            "profondeur_sol_cm": rng.randint(30, 120),
        },
        hydrique={
            "niveau": niveau_hydrique,
            "pluviometrie_moyenne_mm_an": rng.randint(180, 650),
            "nappe_estimee_m": rng.randint(8, 90) if acces_eau != "irriguee" else None,
        },
        potentiel_agricole={
            "niveau": niveau_agricole,
            "score_indicatif": _score_pour_niveau(rng, niveau_agricole),
        },
        cultures_suggerees=rng.sample(
            CULTURES_PAR_ACCES_EAU[acces_eau],
            k=min(3, len(CULTURES_PAR_ACCES_EAU[acces_eau])),
        ),
        synthese={
            # Niveau global = le plus contraignant des deux facteurs (jamais
            # plus optimiste que le pire d'entre eux) — logique volontairement
            # prudente pour un prototype affiché à des utilisateurs.
            "niveau_global": _pire_niveau(niveau_hydrique, niveau_agricole),
            "resume": RESUMES[_pire_niveau(niveau_hydrique, niveau_agricole)],
        },
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Génère des rapports de potentiel simulés AKAL (P2-01).")
    parser.add_argument("--count", type=int, default=12, help="Nombre de rapports à générer (10-15 recommandé). Défaut : 12.")
    parser.add_argument("--seed", type=int, default=None, help="Graine aléatoire pour une génération reproductible.")
    parser.add_argument("--out", type=str, default="output", help="Dossier de sortie (relatif à ce script). Défaut : output/")
    args = parser.parse_args()

    if not (1 <= args.count <= 50):
        raise SystemExit("--count doit être compris entre 1 et 50.")

    rng = random.Random(args.seed)
    out_dir = Path(__file__).parent / args.out
    out_dir.mkdir(parents=True, exist_ok=True)

    # On rattache d'abord chaque annonce mock à un rapport (couverture
    # complète du catalogue de démo), puis on complète avec des profils
    # additionnels non rattachés si --count dépasse le nombre d'annonces mock.
    annonces_a_traiter: list[dict | None] = list(ANNONCES_MOCK)
    while len(annonces_a_traiter) < args.count:
        annonces_a_traiter.append(None)
    annonces_a_traiter = annonces_a_traiter[: args.count]

    rapports = [generer_rapport(rng, annonce) for annonce in annonces_a_traiter]

    index = []
    for rapport in rapports:
        nom_fichier = f"rapport-{rapport.id[:8]}.json"
        chemin = out_dir / nom_fichier
        chemin.write_text(json.dumps(asdict(rapport), ensure_ascii=False, indent=2), encoding="utf-8")
        index.append({
            "fichier": nom_fichier,
            "annonce_ref": rapport.annonce_ref,
            "niveau_global": rapport.synthese["niveau_global"],
        })

    (out_dir / "_index.json").write_text(json.dumps(index, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"{len(rapports)} rapports générés dans {out_dir}/")
    print(f"Index : {out_dir}/_index.json")


if __name__ == "__main__":
    main()
