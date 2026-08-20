# pyrefly: ignore [missing-import]
import uuid

from django.contrib.auth.models import AbstractUser, BaseUserManager
from django.db import models

# Domaine synthétique utilisé par PhoneLoginVerifyView (auth_api_views.py)
# pour donner un email aux comptes créés par connexion SMS, qui n'en
# fournissent jamais un réel : f"{telephone}@{DOMAINE_EMAIL_TELEPHONE}".
# Constante partagée (pas seulement une chaîne dupliquée) parce que
# SignupSerializer.validate_email (serializers.py) doit refuser ce même
# domaine à l'inscription classique — audit final du 20/08 (P3) : sans ce
# refus, s'inscrire avec l'email exact d'un numéro de téléphone connu/deviné
# préempte le compte que la connexion SMS de son vrai propriétaire créerait
# plus tard, cassant sa connexion avec une erreur générique (get_or_create
# échoue sur l'email déjà pris).
DOMAINE_EMAIL_TELEPHONE = 'tel.akal.local'


class UserManager(BaseUserManager):
    """Manager custom pour un User sans champ username."""

    def create_user(self, email, password=None, **extra_fields):
        if not email:
            raise ValueError("L'adresse email est obligatoire")
        email = self.normalize_email(email)
        user = self.model(email=email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault('is_staff', True)
        extra_fields.setdefault('is_superuser', True)
        extra_fields.setdefault('is_verified', True)
        extra_fields.setdefault('role', 'ADMIN')
        return self.create_user(email, password, **extra_fields)


class User(AbstractUser):
    """Utilisateur custom du projet AKAL."""

    class Role(models.TextChoices):
        VENDEUR = 'VENDEUR', 'Vendeur'
        ACHETEUR = 'ACHETEUR', 'Acheteur'
        ADMIN = 'ADMIN', 'Administrateur'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    email = models.EmailField('adresse email', unique=True)
    # Pas de rôle figé à l'inscription (une même personne peut chercher et
    # vendre une terre) : vide par défaut, ADMIN réservé au staff. Peut être
    # dérivé du comportement plus tard (dépôt d'annonce -> VENDEUR, etc.).
    role = models.CharField(max_length=20, choices=Role.choices, blank=True, default='')
    nom = models.CharField(max_length=150)
    prenom = models.CharField(max_length=150)
    telephone = models.CharField(max_length=20, blank=True, null=True)
    avatar = models.ImageField(upload_to='avatars/', blank=True, null=True)
    is_verified = models.BooleanField(default=False)
    date_inscription = models.DateTimeField(auto_now_add=True)

    # On utilise l'email comme identifiant de connexion
    username = None
    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = ['nom', 'prenom']

    objects = UserManager()

    class Meta:
        db_table = 'user'
        verbose_name = 'Utilisateur'
        verbose_name_plural = 'Utilisateurs'

    def __str__(self):
        return f"{self.prenom} {self.nom}"
