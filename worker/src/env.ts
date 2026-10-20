export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  /** Codice per creare leghe (solo per chi gestisce l'installazione). */
  SETUP_CODE: string;
  /** Chiave per firmare le sessioni. */
  SESSION_SECRET: string;
  FOOTBALL_DATA_TOKEN: string;
  BSD_TOKEN: string;
  /** Facoltativa: chiave API-Football (api-sports.io) per il motivo delle assenze. */
  API_FOOTBALL_KEY?: string;
  VAPID_PUBLIC_KEY: string;
  VAPID_PRIVATE_KEY: string;
  VAPID_SUBJECT: string;
  /** Richieste esterne fatte nell'esecuzione corrente (solo durante la sincronizzazione). */
  calls?: { n: number; cap: number };
}
