# Déploiement — stockage des photos (bucket S3-compatible)

Render ne fournit pas d'object storage, et le disque d'un Web Service Render
est **éphémère** (remis à zéro à chaque redéploiement). Les photos d'annonces
et les avatars **doivent** vivre dans un bucket externe S3-compatible, sinon
elles disparaissent au premier redeploy.

L'architecture est déjà en place côté code (`django-storages` + `S3Storage`,
cf. `backend/akal/settings/base.py`, bloc *STOCKAGE MÉDIA*). Il ne reste qu'à
créer le bucket et renseigner ~6 variables. Ce doc prend **Cloudflare R2**
(offre gratuite : 10 Go de stockage, 0 frais de sortie) ; Backblaze B2 ou un
MinIO auto-hébergé marchent pareil, seules les valeurs changent.

Compte de la démarche : **~10 minutes**, une seule fois.

---

## 1. Créer le bucket R2

1. [dash.cloudflare.com](https://dash.cloudflare.com) → **R2** → *Create bucket*.
2. Nom : `akal-media` (doit correspondre à `AWS_STORAGE_BUCKET_NAME` dans
   `render.yaml` — déjà fixé à cette valeur).
3. Location : *Automatic* (ou EU si tu veux la garantie de résidence UE).

## 2. Rendre le bucket public **en lecture**

Le contrat §4.7 : URLs de photos absolues et stables, accessibles sans
signature. Deux options R2 :

- **Public Development URL** (le plus simple) : bucket → *Settings* →
  *Public Development URL* → **Enable**. Cloudflare donne une URL du type
  `https://pub-<hash>.r2.dev`. Le hostname (`pub-<hash>.r2.dev`) est ce qui
  ira dans `AWS_S3_CUSTOM_DOMAIN` et `NEXT_PUBLIC_MEDIA_HOSTNAME`.
- **Domaine custom** (`media.akal.ma`) : bucket → *Settings* → *Custom Domains*
  → ajouter le sous-domaine (nécessite que le domaine soit géré par
  Cloudflare). Le hostname devient `media.akal.ma`.

> ⚠️ Ne **jamais** rendre le bucket public en écriture. L'écriture passe
> uniquement par le backend, authentifié par les clés API de l'étape 3.

## 3. Créer un token API R2 (accès en écriture, pour le backend)

R2 → *Manage R2 API Tokens* → *Create API token* :

- Permissions : **Object Read & Write**
- Scope : limité au bucket `akal-media`
- Récupérer : **Access Key ID**, **Secret Access Key**, et l'**endpoint S3**
  (`https://<account_id>.r2.cloudflarestorage.com`).

Ces trois valeurs sont de **vrais secrets** → gestionnaire de mots de passe
partagé, jamais un chat en clair (cf. `ONBOARDING_SECRETS.md`).

## 4. Renseigner les variables sur Render

### Service `akal-backend` → *Environment*

| Variable | Valeur |
|---|---|
| `AWS_ACCESS_KEY_ID` | *Access Key ID* de l'étape 3 |
| `AWS_SECRET_ACCESS_KEY` | *Secret Access Key* de l'étape 3 |
| `AWS_S3_ENDPOINT_URL` | `https://<account_id>.r2.cloudflarestorage.com` |
| `AWS_S3_CUSTOM_DOMAIN` | le **hostname** public de l'étape 2, sans `https://` ni `/` — ex. `pub-abc123.r2.dev` ou `media.akal.ma` |
| `AWS_STORAGE_BUCKET_NAME` | `akal-media` *(déjà dans `render.yaml`)* |
| `AWS_S3_REGION_NAME` | `auto` *(déjà dans `render.yaml`)* |

`AWS_S3_URL_PROTOCOL` reste à son défaut `https:` (base.py) — R2 est toujours
en TLS.

### Service `akal-frontend` → *Environment*

| Variable | Valeur |
|---|---|
| `NEXT_PUBLIC_MEDIA_HOSTNAME` | **exactement** la même valeur que `AWS_S3_CUSTOM_DOMAIN` ci-dessus |

`next/image` refuse toute image d'un hôte non listé dans
`next.config.ts::images.remotePatterns`. Cette variable y injecte le bon
hostname **au build** — un changement de valeur impose un *Manual Deploy →
Clear build cache & deploy* du frontend.

## 5. Redéployer et vérifier

1. *akal-backend* → *Manual Deploy* (prend les nouvelles variables).
2. *akal-frontend* → *Manual Deploy* → **Clear build cache & deploy**
   (la variable est inlinée au build).
3. Test de bout en bout, sur le site déployé :
   1. créer un compte, *Déposer une annonce*,
   2. renseigner localisation + **uploader une photo**, publier,
   3. ouvrir la fiche → la photo s'affiche,
   4. **recharger la page** (Ctrl-Shift-R) → toujours là,
   5. *akal-backend* → *Manual Deploy* (simule un redeploy) → recharger la
      fiche → **toujours là**. C'est la preuve que le stockage est bien
      externe et pas sur le disque éphémère du conteneur.

### Vérif rapide sans passer par l'UI

```bash
# hostname public du bucket (doit répondre à un objet connu en 200, image/*)
curl -sI "https://<AWS_S3_CUSTOM_DOMAIN>/photos/<une-clé-existante>.jpg" | head -3
```

---

## Ce qui casse si on saute une étape

| Symptôme | Cause probable |
|---|---|
| `500` / `NoCredentialsError` au dépôt de photo | `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` absents côté backend |
| Upload OK mais URL de photo en `403` / `404` | bucket pas public en lecture (étape 2), **ou** `AWS_S3_CUSTOM_DOMAIN` contient le bucket / un `/` en trop |
| Upload OK, URL joignable, mais **image cassée** sur le site | `NEXT_PUBLIC_MEDIA_HOSTNAME` ≠ `AWS_S3_CUSTOM_DOMAIN`, ou frontend pas rebuild après changement |
| Photos présentes puis disparues après un redeploy | stockage encore sur disque local — `DEFAULT_FILE_STORAGE` / `STORAGES['default']` pas sur `S3Storage` (ne devrait pas arriver, c'est le défaut) |

## Migrer un bucket (R2 → autre, ou renommer)

Les URLs de photos sont **absolues** et stockées telles quelles nulle part
(reconstruites par `S3Storage.url()` depuis `AWS_S3_CUSTOM_DOMAIN` + la clé).
Changer de domaine public = recopier les objets (`rclone`, `aws s3 sync`)
puis mettre à jour `AWS_S3_CUSTOM_DOMAIN` + `NEXT_PUBLIC_MEDIA_HOSTNAME`.
Aucune migration Django, aucune donnée à réécrire.
