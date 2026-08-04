# pyrefly: ignore [missing-import]
from django.contrib.auth import authenticate
from django.contrib.auth.password_validation import validate_password
from django.contrib.auth.tokens import default_token_generator
from django.utils.encoding import force_str
from django.utils.http import urlsafe_base64_decode
from rest_framework import serializers
from rest_framework.validators import UniqueValidator

from .models import User


class UserSerializer(serializers.ModelSerializer):
    """Représentation publique de l'utilisateur courant (GET /auth/me)."""

    class Meta:
        model = User
        fields = ['id', 'email', 'nom', 'prenom', 'telephone', 'role', 'is_verified', 'date_inscription']
        read_only_fields = fields


class SignupSerializer(serializers.ModelSerializer):
    """Inscription publique — pas de rôle à l'inscription : acheteur/vendeur
    n'est pas une identité figée sur AKAL (cf. docs/plans/2026-07-24-auth-
    module-design.md, addendum du même jour). ADMIN reste réservé au staff
    (createsuperuser) ; ce champ n'est même pas exposé ici, donc un éventuel
    "role" envoyé dans le payload est silencieusement ignoré par DRF."""

    # LANGUAGE_CODE du projet est 'en-us' (cf. base.py) : le message par
    # défaut de UniqueValidator ("User with this ... already exists.")
    # sortirait en anglais au milieu d'un formulaire francophone.
    email = serializers.EmailField(
        validators=[UniqueValidator(queryset=User.objects.all(), message='Un compte existe déjà avec cet email.')]
    )
    password = serializers.CharField(write_only=True, validators=[validate_password])

    class Meta:
        model = User
        fields = ['email', 'password', 'nom', 'prenom', 'telephone']

    def create(self, validated_data):
        return User.objects.create_user(**validated_data)


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, trim_whitespace=False)

    def validate(self, attrs):
        user = authenticate(
            self.context['request'],
            username=attrs['email'],
            password=attrs['password'],
        )
        if user is None:
            raise serializers.ValidationError('Email ou mot de passe incorrect.')
        attrs['user'] = user
        return attrs


class PasswordResetRequestSerializer(serializers.Serializer):
    """Demande de réinitialisation — juste une adresse email, aucune erreur
    de champ sur "compte inexistant" (la vue répond identiquement dans les
    deux cas, cf. accounts/views.py, pour ne pas permettre l'énumération)."""

    email = serializers.EmailField()


class PasswordResetConfirmSerializer(serializers.Serializer):
    """Confirmation — {uid, token} identifient et authentifient la demande
    (jeton signé Django, cf. default_token_generator), remplace l'auth par
    mot de passe habituelle pour cette seule opération."""

    uid = serializers.CharField()
    token = serializers.CharField()
    password = serializers.CharField(write_only=True, validators=[validate_password])

    def validate(self, attrs):
        try:
            user = User.objects.get(pk=force_str(urlsafe_base64_decode(attrs['uid'])))
        except (TypeError, ValueError, OverflowError, User.DoesNotExist):
            raise serializers.ValidationError({'token': ['Lien de réinitialisation invalide.']})

        if not default_token_generator.check_token(user, attrs['token']):
            raise serializers.ValidationError({'token': ['Ce lien de réinitialisation est invalide ou a expiré.']})

        attrs['user'] = user
        return attrs

    def save(self):
        user = self.validated_data['user']
        user.set_password(self.validated_data['password'])
        user.save(update_fields=['password'])
        return user
