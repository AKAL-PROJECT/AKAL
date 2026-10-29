// @vitest-environment jsdom
//
// Modale de décision : motif obligatoire, précision exigée pour « autre »,
// erreur serveur affichée sans fermer la modale.
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ModaleDecision } from "./ModaleDecision";

const MOTIFS = [
  { code: "doublon", libelle: "Annonce en double" },
  { code: "autre", libelle: "Autre (préciser)" },
];

function rendre(onConfirmer = vi.fn().mockResolvedValue(null)) {
  render(
    <ModaleDecision titre="Rejeter ?" message="m" labelConfirmer="Rejeter" motifs={MOTIFS} onConfirmer={onConfirmer} onFermer={vi.fn()} />,
  );
  return onConfirmer;
}

describe("ModaleDecision", () => {
  it("bloque la confirmation tant qu'aucun motif n'est choisi", async () => {
    rendre();
    expect(screen.getByRole("button", { name: "Rejeter" })).toBeDisabled();
    await userEvent.selectOptions(screen.getByRole("combobox"), "doublon");
    expect(screen.getByRole("button", { name: "Rejeter" })).toBeEnabled();
  });

  it("exige une précision pour le motif « autre »", async () => {
    const onConfirmer = rendre();
    await userEvent.selectOptions(screen.getByRole("combobox"), "autre");
    expect(screen.getByRole("button", { name: "Rejeter" })).toBeDisabled();
    await userEvent.type(screen.getByRole("textbox"), "Photos d'un autre terrain");
    await userEvent.click(screen.getByRole("button", { name: "Rejeter" }));
    expect(onConfirmer).toHaveBeenCalledWith("autre", "Photos d'un autre terrain");
  });

  it("affiche l'erreur renvoyée par le serveur", async () => {
    rendre(vi.fn().mockResolvedValue("Seule une annonce en attente peut être rejetée."));
    await userEvent.selectOptions(screen.getByRole("combobox"), "doublon");
    await userEvent.click(screen.getByRole("button", { name: "Rejeter" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Seule une annonce en attente");
  });
});
