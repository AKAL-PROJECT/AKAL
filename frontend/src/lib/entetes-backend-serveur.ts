// Variante serveur de lib/entetes-backend.ts pour Server Actions et Server
// Components : transmet l'IP du visiteur lue dans la requête entrante.
import { headers } from "next/headers";
import { entetesBackend } from "./entetes-backend";

export async function entetesBackendRequete(): Promise<Record<string, string>> {
  try {
    return entetesBackend(await headers());
  } catch {
    // Hors contexte de requête (build, script) : pas d'IP visiteur.
    return entetesBackend(null);
  }
}
