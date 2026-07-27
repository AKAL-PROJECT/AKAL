"use client";

import { useEffect, useState } from "react";

type Side = "above" | "below" | "left" | "right";

type Region = {
  name: string;
  x: string;
  y: string;
  side: Side;
};

const REGIONS: Region[] = [
  { name: "Tanger-Tétouan-Al Hoceïma", x: "60%", y: "18%", side: "above" },
  { name: "l'Oriental", x: "73%", y: "24%", side: "right" },
  { name: "Rabat-Salé-Kénitra", x: "54%", y: "23%", side: "left" },
  { name: "Fès-Meknès", x: "63%", y: "27%", side: "above" },
  { name: "Béni Mellal-Khénifra", x: "61%", y: "34%", side: "right" },
  { name: "Casablanca-Settat", x: "49%", y: "33%", side: "left" },
  { name: "Marrakech-Safi", x: "49%", y: "41%", side: "left" },
  { name: "Drâa-Tafilalet", x: "65%", y: "42%", side: "right" },
  { name: "Souss-Massa", x: "46%", y: "50%", side: "left" },
  { name: "Guelmim-Oued Noun", x: "41%", y: "55%", side: "below" },
  { name: "Laâyoune-Sakia El Hamra", x: "29%", y: "67%", side: "below" },
  { name: "Dakhla-Oued Ed-Dahab", x: "17%", y: "82%", side: "below" },
];

const LABEL_STYLE: Record<Side, React.CSSProperties> = {
  above: { position: "absolute", left: 0, top: "-11px", transform: "translate(-50%,-100%)", textAlign: "center", whiteSpace: "nowrap" },
  below: { position: "absolute", left: 0, top: "11px", transform: "translateX(-50%)", textAlign: "center", whiteSpace: "nowrap" },
  left: { position: "absolute", left: "-12px", top: 0, transform: "translate(-100%,-50%)", textAlign: "right", whiteSpace: "nowrap" },
  right: { position: "absolute", left: "12px", top: 0, transform: "translateY(-50%)", textAlign: "left", whiteSpace: "nowrap" },
};

const CYCLE_SECONDS = 4;

export default function MoroccoMap() {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setActive((i) => (i + 1) % REGIONS.length);
    }, CYCLE_SECONDS * 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div style={{ position: "relative", width: "100%", maxWidth: "480px", aspectRatio: "1282 / 1299" }}>
      <div
        className="akal-drift"
        style={{
          position: "absolute",
          left: "52%",
          top: "38%",
          width: "60%",
          height: "52%",
          transform: "translate(-50%,-50%)",
          background: "radial-gradient(circle, rgba(82,183,136,0.22) 0%, rgba(82,183,136,0) 70%)",
          filter: "blur(4px)",
          pointerEvents: "none",
        }}
      />

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/uploads/akal-maroc-regions.svg"
        alt="Carte des régions agricoles du Maroc"
        className="akal-drift"
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
      />

      {REGIONS.map((r, i) => {
        const isActive = i === active;
        return (
          <div key={r.name} style={{ position: "absolute", left: r.x, top: r.y, width: 0, height: 0 }}>
            <div
              className="akal-pulse"
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                width: "9px",
                height: "9px",
                borderRadius: "50%",
                background: "#C4622D",
                opacity: 0.5,
                transform: "translate(-50%,-50%)",
              }}
            />
            {isActive && (
              <>
                <div
                  className="akal-spin"
                  style={{
                    position: "absolute",
                    left: 0,
                    top: 0,
                    width: "28px",
                    height: "28px",
                    borderRadius: "50%",
                    border: "1.5px dashed rgba(196,98,45,0.55)",
                    transform: "translate(-50%,-50%)",
                  }}
                />
                <div
                  className="akal-ring-out"
                  style={{
                    position: "absolute",
                    left: 0,
                    top: 0,
                    width: "16px",
                    height: "16px",
                    borderRadius: "50%",
                    border: "1px solid #C4622D",
                  }}
                />
              </>
            )}
            <div
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                width: isActive ? "13px" : "8px",
                height: isActive ? "13px" : "8px",
                borderRadius: "50%",
                background: "#C4622D",
                opacity: isActive ? 1 : 0.55,
                transform: "translate(-50%,-50%)",
                transition: "width 0.4s ease-out, height 0.4s ease-out, opacity 0.4s ease-out",
              }}
            />
            <div style={LABEL_STYLE[r.side]}>
              <div
                style={{
                  display: "inline-block",
                  background: "rgba(248,245,240,0.92)",
                  borderRadius: "5px",
                  padding: "1px 6px",
                  fontSize: "11px",
                  fontWeight: 600,
                  letterSpacing: "0.3px",
                  color: "#1B3A2D",
                  opacity: isActive ? 1 : 0.72,
                  transition: "opacity 0.4s ease-out",
                }}
              >
                {r.name}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
