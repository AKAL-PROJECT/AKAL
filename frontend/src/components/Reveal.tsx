"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  children: React.ReactNode;
  className?: string;
  delayMs?: number;
  style?: React.CSSProperties;
};

// Révèle son contenu (akal-fade-in) au premier passage dans le viewport —
// seul mécanisme d'animation "au scroll" du site, volontairement en JS pur
// (IntersectionObserver) plutôt qu'une lib d'animation : cohérent avec le
// reste du système qui reste CSS-first (cf. globals.css). Se déclenche une
// seule fois (unobserve après reveal) et respecte prefers-reduced-motion via
// la classe akal-fade-in elle-même.
export function Reveal({ children, className = "", delayMs = 0, style }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.unobserve(el);
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -40px 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`${visible ? "akal-fade-in" : ""} ${className}`.trim()}
      style={{ ...style, opacity: visible ? undefined : 0, animationDelay: delayMs ? `${delayMs}ms` : undefined }}
    >
      {children}
    </div>
  );
}
