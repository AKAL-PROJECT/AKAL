# pyrefly: ignore [missing-import]
from django.contrib.auth import authenticate
from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers

from .models import User


class UserSerializer(serializers.ModelSerializer):
    """Représentation publique de l'utilisateur courant (GET /auth/me)."""

    class Meta:
        model = User
        fields = ['id', 'email', 'nom', 'prenom', 'telephone', 'role', 'is_verified', 'date_inscription']
        read_only_fields = fields


class SignupSerializer(serializers.ModelSerializer):
    """Inscription publique — rôle limité à VENDEUR/ACHETEUR (ADMIN exclu,
    cf. docs/plans/2026-07-24-auth-module-design.md)."""

    password = serializers.CharField(write_only=True, validators=[validate_password])
    role = serializers.ChoiceField(choices=[User.Role.VENDEUR, User.Role.ACHETEUR])

    class Meta:
        model = User
        fields = ['email', 'password', 'nom', 'prenom', 'telephone', 'role']

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
