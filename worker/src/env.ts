export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  /** Codice per creare leghe (solo per chi gestisce l'installazione). */
  SETUP_CODE: string;
  /** Chiave per firmare le sessioni. */
  SESSION_SECRET: string;
  FOOTBALL_DATA_TOKEN: string;
  BSD_TOKEN: string;
  VAPID_PUBLIC_KEY: string;
  VAPID_PRIVATE_KEY: string;
  VAPID_SUBJECT: string;
}
