// Termini d'uso delle fonti dati: li accetta chi gestisce l'installazione (titolare degli account delle API).

import type { Env } from "./env";
import { kvRead } from "./schedule";

export const SOURCE_TERMS = {
  version: "2026-10",
  sources: [
    { name: "football-data.org", url: "https://www.football-data.org", note: "Piano Free: calendario, orari e classifica di Serie A." },
    {
      name: "BSD – Bzzoiro Sports Data",
      url: "https://sports.bzzoiro.com/terms/",
      note: "Piano Free: giocatori, indisponibili, formazioni, statistiche. Dati usati solo nella propria app, senza ridistribuire i dati grezzi; età minima 16 anni.",
    },
  ],
};

export async function sourcesAccepted(env: Env): Promise<boolean> {
  const t = await kvRead<{ version: string }>(env, "terms:sources");
  return t?.value.version === SOURCE_TERMS.version;
}
