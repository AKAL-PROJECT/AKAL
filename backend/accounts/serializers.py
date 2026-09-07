# pyrefly: ignore [missing-import]
from django.contrib.auth import authenticate
from django.contrib.auth.password_validation import validate_password
from django.contrib.auth.tokens import default_token_generator
from django.utils.encoding import force_str
from django.utils.http import urlsafe_base64_decode
from rest_framework import serializers
from rest_framework.validators import UniqueValidator

from .models import DOMAINE_EMAIL_TELEPHONE, User


class UserSerializer(serializers.ModelSerializer):
    """Représentation publique de l'utilisateur courant (GET /auth/me, et
    forme des réponses signup/login/PATCH — cf. MeView.update()).

    `avatar` en SerializerMethodField (URL absolue) suit le même motif que
    PhotoSerializer.get_url (annonces/serializers.py) — géré en écriture par
    UserUpdateSerializer ci-dessous (page /compte), jamais par celui-ci (un
    SerializerMethodField est structurellement read-only côté DRF)."""

    avatar = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ['id', 'email', 'nom', 'prenom', 'telephone', 'avatar', 'role', 'is_verified', 'date_inscription']
        read_only_fields = fields

    def get_avatar(self, obj):
        request = self.context.get('request')
        if obj.avatar and request:
            return request.build_absolute_uri(obj.avatar.url)
        elif obj.avatar:
            return obj.avatar.url
        return None


# Plafond de taille pour l'avatar — même valeur que MAX_PHOTO_OCTETS
# (annonces/api_views.py) : pas de constante partagée entre les deux apps
# pour éviter un couplage accounts -> annonces, mais la même convention
# produit (2 Mo par image) pour rester cohérent pour l'utilisateur.
MAX_AVATAR_OCTETS = 2 * 1024 * 1024


class UserUpdateSerializer(serializers.ModelSerializer):
    """Édition du profil (PATCH /auth/me, cf. MeView.update()) — page /compte
    (mission « avatar + téléphone »). Ajout de prenom et nom pour permettre
    à la ProfilCompletionGate de remplir les informations manquantes."""

    class Meta:
        model = User
        fields = ['telephone', 'avatar', 'prenom', 'nom']

    def validate_avatar(self, value):
        if value and value.size > MAX_AVATAR_OCTETS:
            raise serializers.ValidationError("L'image dépasse la taille maximale de 2 Mo.")
        return value


class SignupSerializer(serializers.ModelSerializer):
    """Inscription publique — pas de rôle à l'inscription : acheteur/vendeur
    n'est pas une identité figée sur AKAL (cf. docs/plans/2026-07-24-auth-
    module-design.md, addendum du même jour). ADMIN reste réservé au staff
    (createsuperuser) ; ce champ n'est même pas exposé ici, donc un éventuel
    "role" envoyé dans le payload est silencieusement ignoré par DRF."""

    # Le message par défaut de UniqueValidator ("User with this ... already
    # exists.") sort en anglais quelle que soit la locale négociée : on le
    # force en français au milieu d'un formulaire francophone.
    email = serializers.EmailField(
        validators=[UniqueValidator(queryset=User.objects.all(), message='Un compte existe déjà avec cet email.')]
    )
    password = serializers.CharField(write_only=True, validators=[validate_password])

    class Meta:
        model = User
        fields = ['email', 'password', 'nom', 'prenom', 'telephone']

    def validate_email(self, value):
        # Audit final du 20/08 (P3) : @tel.akal.local est réservé aux
        # comptes créés par PhoneLoginVerifyView (auth_api_views.py) — un
        # email choisi librement ici dans ce même domaine préempterait le
        # compte que la connexion SMS du vrai propriétaire du numéro
        # correspondant créerait plus tard (cf. DOMAINE_EMAIL_TELEPHONE,
        # accounts/models.py, pour le détail du scénario). Comparaison
        # insensible à la casse : un email est déjà normalisé en minuscules
        # par EmailField/normalize_email, mais on ne fait pas reposer une
        # règle de sécurité sur cet ordre d'exécution implicite.
        if value.lower().endswith(f'@{DOMAINE_EMAIL_TELEPHONE}'):
            raise serializers.ValidationError(
                "Ce domaine d'adresse email est réservé et ne peut pas être utilisé pour un compte."
            )
        return value

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
