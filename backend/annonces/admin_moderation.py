"""
Page intermédiaire « motif » des actions groupées de modération de l'admin
Django (rejeter / suspendre une annonce, suspendre un compte).

Ces actions passent par annonces/moderation_actions.py, comme le dashboard
/moderation : même journal (DecisionModeration), même notification au
vendeur, même motif obligatoire — d'où cette page, qui le demande avant
d'appliquer la décision (pattern Django des actions avec confirmation :
premier POST depuis la liste → formulaire ; second POST avec `appliquer`
→ exécution).
"""

from django import forms
from django.contrib import messages
from django.contrib.admin import helpers
from django.template.response import TemplateResponse

from .moderation_actions import MOTIFS, DecisionImpossible, valider_motif


class MotifModerationForm(forms.Form):
    motif = forms.ChoiceField(
        choices=[(code, libelle or "Autre (précisez dans le commentaire)") for code, libelle in MOTIFS.items()],
    )
    commentaire = forms.CharField(
        required=False, widget=forms.Textarea(attrs={'rows': 3, 'cols': 60}),
        help_text="Montré au vendeur avec le motif (pour une annonce).",
    )

    def clean(self):
        donnees = super().clean()
        try:
            valider_motif(donnees.get('motif'), donnees.get('commentaire'))
        except DecisionImpossible as exc:
            raise forms.ValidationError(str(exc))
        return donnees


def appliquer_avec_motif(modeladmin, request, queryset, titre, decision):
    """Affiche le formulaire de motif, puis applique `decision(objet, motif,
    commentaire)` à chaque objet sélectionné. DecisionImpossible → objet
    ignoré, raison remontée en avertissement."""
    if 'appliquer' in request.POST:
        form = MotifModerationForm(request.POST)
        if form.is_valid():
            appliquees, ignorees = 0, []
            for objet in queryset:
                try:
                    decision(objet, form.cleaned_data['motif'], form.cleaned_data['commentaire'])
                    appliquees += 1
                except DecisionImpossible as exc:
                    ignorees.append(f"{objet} : {exc}")
            rapporter(modeladmin, request, appliquees, ignorees)
            return None
    else:
        form = MotifModerationForm()

    return TemplateResponse(request, 'admin/moderation_motif.html', {
        **modeladmin.admin_site.each_context(request),
        'title': titre,
        'objets': queryset,
        'form': form,
        'action': request.POST.get('action', ''),
        'opts': modeladmin.model._meta,
        'action_checkbox_name': helpers.ACTION_CHECKBOX_NAME,
    })


def rapporter(modeladmin, request, appliquees, ignorees):
    if appliquees:
        modeladmin.message_user(request, f"{appliquees} décision(s) appliquée(s) et journalisée(s).", messages.SUCCESS)
    for raison in ignorees:
        modeladmin.message_user(request, f"Ignorée — {raison}", messages.WARNING)
