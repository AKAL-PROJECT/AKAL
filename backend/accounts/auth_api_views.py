from django.core.cache import cache
import random
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.throttling import AnonRateThrottle
from rest_framework_simplejwt.tokens import RefreshToken
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests
import firebase_admin
from firebase_admin import credentials, auth as firebase_auth
import os
from django.conf import settings

if not firebase_admin._apps:
    cred = credentials.Certificate(os.path.join(settings.BASE_DIR, 'firebase-service-account.json'))
    firebase_admin.initialize_app(cred)
from django.conf import settings
from .models import User
from .serializers import UserSerializer
from .views import _set_auth_cookies

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
            decoded_token = firebase_auth.verify_id_token(token)
            telephone = decoded_token.get('phone_number')

            if not telephone:
                return Response({'error': 'Numéro de téléphone non trouvé dans le jeton.'}, status=status.HTTP_400_BAD_REQUEST)

            user, created = User.objects.get_or_create(
                telephone=telephone,
                defaults={
                    'email': f"{telephone.replace('+', '').replace(' ', '')}@tel.akal.local",
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

        except Exception as e:
            print("Erreur Firebase:", e)
            return Response({'error': 'Jeton invalide.'}, status=status.HTTP_400_BAD_REQUEST)

class GoogleLoginView(APIView):
    """Vérifie le jeton Google et connecte l'utilisateur."""
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        token = request.data.get('token')
        if not token:
            return Response({'error': 'Le jeton est requis.'}, status=status.HTTP_400_BAD_REQUEST)
            
        try:
            # Verify token
            client_id = getattr(settings, 'GOOGLE_CLIENT_ID', '624927598987-bnta3tnqp5dpon11kug599hq9m198o02.apps.googleusercontent.com')
            idinfo = id_token.verify_oauth2_token(token, google_requests.Request(), client_id)
            
            email = idinfo.get('email')
            prenom = idinfo.get('given_name', 'Utilisateur')
            nom = idinfo.get('family_name', 'Google')
            
            if not email:
                return Response({'error': 'Email non trouvé dans le jeton.'}, status=status.HTTP_400_BAD_REQUEST)
            
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
            
        except ValueError as e:
            print("Erreur Google:", e)
            return Response({'error': 'Jeton invalide.'}, status=status.HTTP_400_BAD_REQUEST)