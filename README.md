# FootballLite

App (PWA) per seguire la propria lega di fantacalcio. Le rose e il calendario li importa l'admin della lega da file; i dati di Serie A arrivano da fonti con licenza.

- **Dashboard.** Tabellone della giornata con la tua partita, il conto alla rovescia al primo calcio d'inizio e il pulsante «Inserisci formazione», che a giornata iniziata diventa «Visualizza live». Sotto: le partite della giornata di lega, i giocatori della tua rosa a rischio e le partite di Serie A.
- **Formazione.** Campo con la **titolarità stimata** sotto ogni giocatore, **formazione consigliata** (fantamedia stimata × titolarità × avversario reale) sui moduli ammessi dalla lega, panchina ordinabile. A giornata iniziata è possibile una **modifica forzata**: chiede conferma, resta nello storico ed è visibile a tutta la lega (l'admin può disattivarla).
- **Live.** Punteggio parziale della tua partita e di tutte le altre della giornata di lega; **«Simula risultato»** proietta il finale con il voto base per chi deve ancora giocare.
- **Notifiche push** (disattivabili): promemoria se manca la formazione, avviso se un tuo titolare scende sotto il 70% di titolarità stimata, bonus e malus dei tuoi giocatori e di quelli schierati dall'avversario del calendario.
- **Regolamento configurabile** dall'admin: schema delle rose, moduli, panchina, soglie gol, bonus e malus, voto base, modifica forzata.

> FootballLite non è affiliata a Leghe Fantacalcio® né a Fantacalcio S.r.l. «Fantacalcio» è un marchio registrato di Fantacalcio S.r.l. ed è citato solo per indicare da dove proviene il file esportato.

## Da dove arrivano i dati

| Dato | Fonte |
|---|---|
| Rose, costi, calendario e risultati della lega | File esportati dall'admin (es. «Gestione rose» e calendario di Leghe Fantacalcio), letti sul suo dispositivo e salvati nel database della lega |
| Calendario, orari e classifica di Serie A | [football-data.org](https://www.football-data.org), piano Free |
| Giocatori di Serie A, indisponibili, formazioni probabili e ufficiali, statistiche e cronaca | [BSD – Bzzoiro Sports Data](https://sports.bzzoiro.com), piano Free, secondo la sua licenza dati |
| Titolarità, fantamedia, formazione consigliata, voti live | **Stime calcolate da FootballLite** su questi dati: non sono voti ufficiali |

Cosa FootballLite **non** fa: non accede alle API o all'app di Leghe Fantacalcio, non legge pagine di fantacalcio.it o di altri siti, non mostra foto di giocatori né loghi (al loro posto ci sono le iniziali), non riproduce articoli (per le notizie c'è solo un link a una ricerca esterna).

Il cron del Worker distribuisce le richieste a BSD nella giornata, con un budget di 1.500 richieste al giorno (il piano gratuito ne concede 7.500).

## Struttura

| Cartella | Contenuto |
|---|---|
| `packages/core` | Logica in TypeScript, con test: regolamento della lega, import di rose e calendario, abbinamento dei nomi, titolarità stimata, formazione consigliata, calcolo live, notifiche |
| `worker` | Backend Cloudflare Worker (Hono) con database D1: accesso con codici, rose, calendario, formazioni con storico, sincronizzazione delle fonti, notifiche Web Push |
| `web` | PWA React + Vite + Tailwind, servita dallo stesso Worker |
| `video` | Video tutorial realizzato con [HyperFrames](https://github.com/heygen-com/hyperframes) |

## Accesso

Non ci sono account: l'installazione ha un **codice di setup** per creare le leghe. Ogni lega ha un **codice lega** (lettura), un **codice admin** (import e regolamento) e un **codice per ogni squadra** (schierare la propria formazione). Nel database ci sono solo gli hash dei codici.

## Sviluppo in locale

Requisiti: Node 20 o superiore.

```bash
npm install
npm test
```

Crea `worker/.dev.vars` (escluso da git):

```
SETUP_CODE=<codice per creare leghe>
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

## Pubblicazione su Cloudflare (piano gratuito)

1. `npx wrangler login`, poi `npx wrangler d1 create footballlite` e copia il `database_id` in `worker/wrangler.toml`.
2. Imposta i segreti elencati sopra con `npx wrangler secret put NOME --name footballlite`.
3. `npm run db:migrate -w worker` e poi `npm run deploy`.

## Licenze di terze parti

- Font [Archivo](https://github.com/Omnibus-Type/Archivo): SIL Open Font License 1.1 (`web/public/fonts/OFL.txt`).
- Dipendenze npm con licenze MIT, Apache-2.0, BSD e ISC (vedi `package-lock.json`).
