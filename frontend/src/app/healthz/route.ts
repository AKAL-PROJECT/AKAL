// Sonde de santé pour le load balancer Render (`healthCheckPath: /healthz`,
// cf. render.yaml, service akal-frontend).
//
// Volontairement INERTE : répond 200 dès que le serveur Next écoute, sans
// toucher à l'API backend. Un déploiement du frontend ne doit pas échouer
// parce que le catalogue est momentanément injoignable — cold start du
// backend en offre gratuite Render (~50 s après mise en veille), ordre de
// déploiement, blip réseau. La santé du frontend = « le serveur Node répond »,
// pas « toute la pile est debout ».
//
// La page d'accueil (app/page.tsx) dégrade elle aussi proprement si l'API est
// absente, mais elle reste une page de contenu, pas une sonde : la pointer
// comme health check couplait à tort le succès du déploiement à l'état du
// backend (symptôme observé : `TypeError: fetch failed` / `ECONNREFUSED` en
// boucle puis `==> Timed Out` côté Render).
export const dynamic = "force-static";

export function GET() {
  return Response.json({ status: "ok" });
}
