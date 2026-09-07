// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import DimensionBar from "./DimensionBar";

// Structure : <div grid> [ <span label>, <div barre> [ <div rempli>? ], <span valeur> ] </div>
function elements(container: HTMLElement) {
  const grid = container.firstElementChild as HTMLElement;
  const conteneurBarre = grid.children[1] as HTMLElement;
  return { conteneurBarre, rempli: conteneurBarre.firstElementChild as HTMLElement | null };
}

describe("DimensionBar", () => {
  it("affiche libellé, valeur et une barre proportionnelle au sous-score", () => {
    const { container } = render(<DimensionBar label="Relief" sousScore={100} valeur="Pente 2 %" />);
    expect(screen.getByText("Relief")).toBeInTheDocument();
    expect(screen.getByText("Pente 2 %")).toBeInTheDocument();
    expect(elements(container).rempli?.style.width).toBe("100%");
  });

  it("largeur = sous-score", () => {
    const { container } = render(<DimensionBar label="Sol" sousScore={42} valeur="Argileux" />);
    expect(elements(container).rempli?.style.width).toBe("42%");
  });

  it("indisponible => « indisponible », aucune barre remplie", () => {
    const { container } = render(
      <DimensionBar label="Végétation" sousScore={null} valeur="NDVI 0.34" indisponible />,
    );
    expect(screen.getByText("indisponible")).toBeInTheDocument();
    expect(screen.queryByText("NDVI 0.34")).not.toBeInTheDocument();
    expect(elements(container).rempli).toBeNull();
  });

  it("borne un sous-score > 100", () => {
    const { container } = render(<DimensionBar label="X" sousScore={150} valeur="v" />);
    expect(elements(container).rempli?.style.width).toBe("100%");
  });
});
