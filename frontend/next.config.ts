import type { NextConfig } from "next";

// Dev uniquement : le backend Django (MEDIA_URL) tourne en local sur un host
// loopback (localhost:8000). Next.js bloque par défaut toute image dont le
// host résout vers une IP privée/loopback (protection SSRF), même si le host
// est listé dans `remotePatterns` — les deux mécanismes sont indépendants.
// `dangerouslyAllowLocalIP` lève ce blocage ; on ne l'active donc jamais en
// production, où seul le CDN public (media.akal.ma) sert les images.
const isDev = process.env.NODE_ENV !== "production";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      // Mock data du catalogue (photos Unsplash) — à retirer avec les mocks.
      { protocol: "https", hostname: "images.unsplash.com" },
      // Bucket MinIO public en lecture (contrat v1.1 §4.7) — URLs absolues,
      // jamais de préfixe concaténé côté front. Domaine d'après l'exemple du
      // contrat (media.akal.ma) ; à ajuster si Ibrahim confirme un autre host/CDN.
      { protocol: "https", hostname: "media.akal.ma" },
      // Backend Django en dev local — sert MEDIA_URL sur ce host:port.
      // 8001 ajouté temporairement (port 8000 déjà pris par un autre process
      // sur cette machine pendant ce test) — à retirer avant de committer.
      ...(isDev
        ? [
            { protocol: "http" as const, hostname: "localhost", port: "8000", pathname: "/**" },
            { protocol: "http" as const, hostname: "localhost", port: "8001", pathname: "/**" },
          ]
        : []),
    ],
    ...(isDev ? { dangerouslyAllowLocalIP: true } : {}),
  },
};

export default nextConfig;
