// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import ScoreGauge from "./ScoreGauge";

describe("ScoreGauge", () => {
  it("affiche le score arrondi et un aria-label parlant", () => {
    render(<ScoreGauge score={68.9} />);
    expect(screen.getByText("69")).toBeInTheDocument();
    expect(screen.getByText("AgriScore / 100")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "AgriScore 69 sur 100" })).toBeInTheDocument();
  });

  it("score null => « — » + indisponible, pas d'arc", () => {
    const { container } = render(<ScoreGauge score={null} />);
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.getByText("indisponible")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "AgriScore indisponible" })).toBeInTheDocument();
    // Un seul cercle (le fond) quand le score est null.
    expect(container.querySelectorAll("circle")).toHaveLength(1);
  });

  it("borne les scores hors [0,100]", () => {
    const { container } = render(<ScoreGauge score={150} />);
    const arc = container.querySelectorAll("circle")[1];
    expect(arc.getAttribute("stroke-dashoffset")).toBe("0"); // 100 % → offset 0
  });
});
