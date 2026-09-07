import logging
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.throttling import AnonRateThrottle, ScopedRateThrottle
from rest_framework_simplejwt.tokens import RefreshToken
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests
import firebase_admin
from firebase_admin import credentials, auth as firebase_auth
import os
from django.conf import settings
from django.db import IntegrityError
from .models import DOMAINE_EMAIL_TELEPHONE, User
from .serializers import UserSerializer
from .views import _set_auth_cookies

# Audit final du 20/08 (P3, nettoyage) : `from django.core.cache import
# cache` et `import random` n'étaient utilisés nulle part dans ce fichier —
# retirés (imports morts). logger applicatif (P8, même audit) : remplace les
# print() ci-dessous, qui ne remontaient jamais à Sentry (settings.LOGGING
# capture logger.warning()/exception(), jamais stdout, cf. akal/settings/
# base.py) — un échec de connexion Firebase/Google en prod passait donc
# inaperçu.
logger = logging.getLogger(__name__)

# Paresseux à dessein (audit d'intégration du 2026-08-15, bloquant #2) :
# initialiser Firebase Admin ici, au niveau module, faisait planter TOUT
# `manage.py` (check/test/runserver/migrate…) dès que
# firebase-service-account.json était absent — pas seulement les vues
# d'authentification Google/téléphone qui en ont réellement besoin. Le
# secret reste hors dépôt (.gitignore) ; pour le provisionner en local ou en
# déploiement (Render/Docker), voir backend/README.md, section Firebase.
_firebase_init_error: Exception | None = None


def _get_firebase_auth():
    """Initialise firebase_admin au premier besoin réel et renvoie le module
    `firebase_admin.auth` prêt à l'emploi. Lève la même erreur (mise en
    cache) à chaque appel tant que le secret n'est pas fourni, plutôt que de
    retenter — et surtout jamais à l'import de ce fichier."""
    global _firebase_init_error
    if firebase_admin._apps:
        return firebase_auth
    if _firebase_init_error is not None:
        raise _firebase_init_error
    try:
        cred = credentials.Certificate(os.path.join(settings.BASE_DIR, 'firebase-service-account.json'))
        firebase_admin.initialize_app(cred)
    except Exception as exc:
        _firebase_init_error = exc
        raise
    return firebase_auth


class PhoneLoginVerifyView(APIView):
    """Vérifie le jeton Firebase (SMS) et connecte l'utilisateur."""
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [AnonRateThrottle]

    def post(self, request):
        token = request.data.get('token')
        # prenom/nom fournis par le front uniquement pour les NOUVEAUX comptes
        prenom = (request.data.get('prenom') or '').strip()
        nom = (request.data.get('nom') or '').strip()

        if not token:
            return Response({'error': 'Le jeton est requis.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            firebase_auth_module = _get_firebase_auth()
        except Exception:
            # error (pas warning) : panne de service (secret manquant/
            # invalide) — rare, actionnable, doit remonter à Sentry
            # (LoggingIntegration ne capture que ERROR+, cf. base.py). À la
            # différence des jetons individuels invalides/expirés plus bas
            # (logger.warning) : ceux-là sont un bruit attendu côté client,
            # pas un incident serveur.
            logger.error("Firebase indisponible (secret non provisionné ?)", exc_info=True)
            return Response(
                {'error': "Connexion par téléphone temporairement indisponible."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        try:
            decoded_token = firebase_auth_module.verify_id_token(token)
            telephone = decoded_token.get('phone_number')

            if not telephone:
                return Response({'error': 'Numéro de téléphone non trouvé dans le jeton.'}, status=status.HTTP_400_BAD_REQUEST)

            user, created = User.objects.get_or_create(
                telephone=telephone,
                defaults={
                    'email': f"{telephone.replace('+', '').replace(' ', '')}@{DOMAINE_EMAIL_TELEPHONE}",
                    'nom': nom or 'Utilisateur',
                    'prenom': prenom or telephone,
                }
            )

            # Si l'utilisateur existait mais n'avait pas de nom/prénom corrects,
            # on les met à jour si le front en envoie de nouveaux (sans écraser
            # un profil déjà rempli).
            updated = False
            if not created and prenom and (not user.prenom or user.prenom == user.telephone):
                user.prenom = prenom
                updated = True
            if not created and nom and (not user.nom or user.nom == 'Utilisateur'):
                user.nom = nom
                updated = True
            if updated:
                user.save(update_fields=['prenom', 'nom'])

            refresh = RefreshToken.for_user(user)
            response = Response(UserSerializer(user).data, status=status.HTTP_200_OK)
            _set_auth_cookies(response, refresh.access_token, refresh)
            return response

        except IntegrityError:
            # Audit final du 20/08 (P3) : filet de sécurité pour une
            # collision déjà existante en base (créée avant ce correctif, ou
            # migrée depuis un autre environnement) — SignupSerializer.
            # validate_email empêche désormais toute NOUVELLE collision,
            # mais ce cas reste distingué du "Jeton invalide." générique
            # ci-dessous : c'est une incohérence de données, pas un problème
            # côté client, donc error (Sentry) plutôt que warning.
            logger.error(
                "Collision sur l'email synthétique de connexion téléphone (numéro déjà préempté)",
                exc_info=True,
            )
            return Response(
                {'error': "Connexion par téléphone impossible pour ce numéro. Contactez le support AKAL."},
                status=status.HTTP_409_CONFLICT,
            )
        except Exception:
            # warning : jeton Firebase invalide/expiré est un aléa client
            # attendu à un rythme non nul (OTP expiré, jeton rejoué...), pas
            # un incident serveur — volontairement sous le seuil Sentry
            # (ERROR+, cf. plus haut) pour ne pas noyer les vraies pannes
            # sous du bruit. exc_info=True garde la trace complète dans les
            # logs (console/Render) pour un diagnostic manuel si besoin.
            logger.warning("Échec de vérification du jeton Firebase (téléphone)", exc_info=True)
            return Response({'error': 'Jeton invalide.'}, status=status.HTTP_400_BAD_REQUEST)

class GoogleLoginView(APIView):
    """Vérifie le jeton Google et connecte l'utilisateur."""
    permission_classes = [AllowAny]
    authentication_classes = []
    # Chaque appel déclenche un aller-retour de vérification vers Google
    # (id_token.verify_oauth2_token) et peut créer un compte : scope dédié
    # 'google' en plus du plancher anonyme, même logique que 'login'/'signup'
    # (cf. akal/settings/base.py). PhoneLoginVerifyView a déjà AnonRateThrottle ;
    # ici on ajoute la limite serrée qui manquait.
    throttle_classes = [AnonRateThrottle, ScopedRateThrottle]
    throttle_scope = 'google'

    def post(self, request):
        token = request.data.get('token')
        if not token:
            return Response({'error': 'Le jeton est requis.'}, status=status.HTTP_400_BAD_REQUEST)
            
        client_id = settings.GOOGLE_CLIENT_ID
        if not client_id:
            # error : même raisonnement que le cas Firebase ci-dessus —
            # panne de service actionnable, pas un aléa client.
            logger.error("GOOGLE_CLIENT_ID absent — connexion Google non configurée.")
            return Response(
                {'error': "Connexion Google temporairement indisponible."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        try:
            # Verify token
            idinfo = id_token.verify_oauth2_token(token, google_requests.Request(), client_id)
            
            email = idinfo.get('email')
            prenom = idinfo.get('given_name', 'Utilisateur')
            nom = idinfo.get('family_name', 'Google')

            if not email:
                return Response({'error': 'Email non trouvé dans le jeton.'}, status=status.HTTP_400_BAD_REQUEST)

            # Audit final du 20/08 (P2) : Google peut émettre un jeton valide
            # (signature vérifiée ci-dessus) avec email_verified=False — cas
            # marginal de certains domaines Google Workspace mal configurés.
            # Sans ce refus, get_or_create(email=...) juste en dessous
            # rattacherait la connexion à un compte AKAL existant (créé par
            # mot de passe) sur la seule foi d'un email non prouvé —
            # contournement du mot de passe. Comportement inchangé pour le
            # cas normal (jeton invalide, GOOGLE_CLIENT_ID absent).
            if not idinfo.get('email_verified'):
                return Response(
                    {'error': "Cette adresse email Google n'est pas vérifiée."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            user, created = User.objects.get_or_create(
                email=email,
                defaults={
                    'nom': nom,
                    'prenom': prenom,
                    'telephone': '',
                }
            )
            
            refresh = RefreshToken.for_user(user)
            response = Response(UserSerializer(user).data, status=status.HTTP_200_OK)
            _set_auth_cookies(response, refresh.access_token, refresh)
            return response
            
        except ValueError:
            # warning : même raisonnement que le jeton Firebase invalide
            # ci-dessus (bruit client attendu, pas un incident serveur).
            logger.warning("Échec de vérification du jeton Google", exc_info=True)
            return Response({'error': 'Jeton invalide.'}, status=status.HTTP_400_BAD_REQUEST)