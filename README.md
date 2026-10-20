# FootballLite

App (PWA, anche come APK Android) per seguire la propria lega di fantacalcio. Rose, calendario e regolamento li inserisce l'admin della lega; i dati di Serie A arrivano da fonti con licenza.

**Landing page, video e APK:** [nisiix.github.io/MyLeghe](https://nisiix.github.io/MyLeghe)

- **Accesso senza account.** Si entra con il codice invito della lega e si sceglie il proprio utente. Sullo stesso dispositivo si possono avere più leghe; chi crea una lega ne diventa admin.
- **Dashboard.** Tabellone della giornata con la tua partita (avversario dal calendario), il conto alla rovescia al primo calcio d'inizio e il pulsante «Inserisci formazione», che a giornata iniziata diventa «Visualizza live». Sotto: le partite della giornata di lega, i giocatori a rischio, le partite di Serie A.
- **Formazione.** Campo con la **titolarità stimata** sotto ogni giocatore, **formazione consigliata** (modulo, undici, panchina, capitano) sui moduli ammessi dalla lega. A giornata iniziata è possibile una **modifica forzata**, segnalata a tutta la lega; chi non ha schierato può avere la formazione inserita da un altro utente («inserita da»).
- **Live e simulazione.** Punteggio parziale di tutte le partite della giornata di lega e **«Simula risultato»** come in Leghe Fantacalcio: chi deve giocare vale fantavoto 6, con «Modifica voti» per cambiare presenza, voto e bonus/malus. Si applicano sostituzioni, capitano e modificatori del regolamento.
- **Risultati ufficiali.** Reimportando il calendario esportato dalla lega, l'app mostra i risultati ufficiali con l'ora dell'ultimo import.
- **Regolamento completo**: soglie e regole dei gol, bonus/malus per ruolo, sostituzioni (per ruolo o libere), voto d'ufficio, capitano e vice, modificatori difesa/portiere/centrocampo/attacco, fair play, fattore campo, bonus per modulo, panchina per ruolo, regola per chi non schiera.
- **Notifiche push** (disattivabili): formazione mancante, titolari a rischio, bonus e malus tuoi e dell'avversario.

> FootballLite non è affiliata a Leghe Fantacalcio® né a Fantacalcio S.r.l. «Fantacalcio» è un marchio registrato di Fantacalcio S.r.l. ed è citato solo per indicare da dove proviene il file esportato.

## Da dove arrivano i dati

| Dato | Fonte |
|---|---|
| Rose, calendario e risultati ufficiali della lega | File esportati dall'admin (es. «Gestione rose» e calendario di Leghe Fantacalcio), letti sul suo dispositivo |
| Calendario, orari e classifica di Serie A | [football-data.org](https://www.football-data.org), piano Free |
| Giocatori, indisponibili, formazioni probabili e ufficiali, statistiche per giocatore e cronaca | [BSD – Bzzoiro Sports Data](https://sports.bzzoiro.com), piano Free, secondo la sua licenza dati |
| Titolarità, formazione consigliata, voti live | **Stime calcolate da FootballLite**: non sono voti ufficiali |

**Voto statistico FootballLite** (`packages/core/src/vote.ts`): modello indipendente, nello spirito dei voti statistici ma non è Alvin482 (i cui pesi non sono pubblici). Pesa attacco, costruzione, difesa, portiere ed errori sulle statistiche BSD di ogni giocatore e lo confronta con i giocatori dello stesso ruolo nella stessa giornata (media 6). Sotto i 20 minuti senza eventi il giocatore è senza voto. In alternativa l'admin può usare il rating della fonte o il voto base.

Cosa FootballLite **non** fa: non accede alle API o all'app di Leghe Fantacalcio, non legge pagine di fantacalcio.it o di altri siti (pagelle comprese), non mostra foto di giocatori né loghi (al loro posto ci sono le iniziali), non riproduce articoli.

Chi gestisce l'installazione accetta i termini delle fonti dati (pagina Admin, con il codice di setup): fino ad allora la sincronizzazione non parte. Il cron distribuisce le richieste a BSD nella giornata, con un budget di 1.500 al giorno (il piano gratuito ne concede 7.500).

## Struttura

| Cartella | Contenuto |
|---|---|
| `packages/core` | Logica in TypeScript, con test: regolamento, import di rose e calendario, abbinamento dei nomi, titolarità, formazione consigliata, calcolo live e simulazione, voto statistico, notifiche |
| `worker` | Backend Cloudflare Worker (Hono) con database D1: leghe e codici, rose, calendario, formazioni con storico, sincronizzazione delle fonti, notifiche Web Push |
| `web` | PWA React + Vite + Tailwind, servita dallo stesso Worker |
| `site` | Landing page (GitHub Pages) con video e APK |
| `video` | Video tutorial realizzato con [HyperFrames](https://github.com/heygen-com/hyperframes) |
| `android` | Configurazione dell'app Android (Trusted Web Activity, [Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap)) |

## Sviluppo in locale

Requisiti: Node 20 o superiore.

```bash
npm install
npm test
```

Crea `worker/.dev.vars` (escluso da git):

```
SETUP_CODE=<codice di chi gestisce l'installazione>
SESSION_SECRET=<stringa casuale lunga>
FOOTBALL_DATA_TOKEN=<token football-data.org>
BSD_TOKEN=<token BSD>
VAPID_PUBLIC_KEY=<chiave pubblica VAPID, base64url>
VAPID_PRIVATE_KEY=<chiave privata VAPID (d), base64url>
```

```bash
npm run build
npm run db:migrate:local -w worker
npm run dev:worker
```

## Pubblicazione

- **Cloudflare (piano gratuito):** `npx wrangler login`; `npx wrangler d1 create footballlite` e copia il `database_id` in `worker/wrangler.toml`; imposta i segreti con `npx wrangler secret put NOME --name footballlite`; `npm run db:migrate -w worker` e `npm run deploy`.
- **Landing (GitHub Pages):** Settings → Pages → Source «GitHub Actions»; il workflow `.github/workflows/pages.yml` pubblica la cartella `site/`.
- **APK Android:** da `android/`, `npx @bubblewrap/cli build` con le variabili `BUBBLEWRAP_KEYSTORE_PASSWORD` e `BUBBLEWRAP_KEY_PASSWORD`. La chiave di firma non è nel repository; l'impronta SHA-256 è in `web/public/.well-known/assetlinks.json`.

## Licenze di terze parti

- Font [Archivo](https://github.com/Omnibus-Type/Archivo): SIL Open Font License 1.1 (`web/public/fonts/OFL.txt`).
- Dipendenze npm con licenze MIT, Apache-2.0, BSD e ISC (vedi `package-lock.json`); HyperFrames Apache-2.0; Bubblewrap Apache-2.0.
