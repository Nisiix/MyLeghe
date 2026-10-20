# FootballLite

App (PWA, anche come APK Android) per seguire la propria lega di fantacalcio. Rose, calendario e regolamento li inserisce l'admin della lega; i dati di Serie A arrivano da fonti con licenza.

**Landing page e APK:** [nisiix.github.io/MyLeghe](https://nisiix.github.io/MyLeghe)

- **Inviti.** L'admin condivide il link di invito (con il codice già inserito) o il codice su WhatsApp, Telegram o con la condivisione del telefono, dalla pagina «Lega creata» o da Gestione lega → Invita i partecipanti; può generare un nuovo codice quando vuole (il precedente smette di valere).
- **Accesso.** Si entra con il codice invito della lega e poi con il proprio profilo (username e password, creato al primo accesso). La prima volta si collega al profilo la propria squadra della rosa: da lì in poi il profilo entra direttamente con quella squadra, che si cambia solo con «Scollega utente da rosa» nelle impostazioni. L'accesso resta memorizzato sul dispositivo dell'ultimo login: entrando da un altro dispositivo, sul precedente serve di nuovo la password. L'admin può eliminare il profilo di chi dimentica la password. Sullo stesso dispositivo si possono avere più leghe; chi crea una lega ne diventa admin e il nome della lega deve essere unico.
- **Navigazione.** Barra blu in alto con lega e squadra, barra in basso con Home, Formazione, Live e Altro (impostazioni), colori di ruolo P/D/C/A come nelle app di lega.
- **Home.** Tabellone della giornata con la tua partita (avversario dal calendario), il conto alla rovescia al primo calcio d'inizio e il pulsante «Formazione». La giornata conclusa resta in evidenza con il finale fino a tutto il giorno successivo all'ultima partita di Serie A, mentre la formazione da inserire è già quella della giornata seguente (con avversario e scadenza); poi la Home passa alla nuova giornata «da giocare». Sotto: le partite della giornata di lega (a giornata iniziata con il risultato stimato), i giocatori a rischio (con motivo dell'infortunio e rientro previsto quando la fonte li fornisce, ricontrollati ogni giorno), le partite di Serie A. In basso le sezioni Home e Rose.
- **Formazione.** Schermata come in Leghe Fantacalcio: modulo, campo con le magliette nel colore del ruolo, panchina numerata e, sotto, le riserve (chi non è schierato). Un tocco su un giocatore apre la sua scheda con le due destinazioni diverse da dove si trova: una riserva va titolare in campo o in panchina, un titolare in panchina o tra le riserve, un panchinaro titolare in campo o tra le riserve; se il reparto o la panchina sono pieni si sceglie al posto di chi. Un tocco su uno slot vuoto del campo propone le riserve e i panchinari di quel ruolo, un posto libero in panchina le riserve e i titolari. I giocatori si possono anche trascinare (col dito dopo una breve pressione) sul posto di un altro, su uno slot libero o in panchina, dove si cambia anche l'ordine.
- **Live.** Dal pulsante «Live» in cima alla Formazione (prima del calcio d'inizio «Altre formazioni»): risultato di tutte le partite della giornata di lega come «Simula risultato» di Leghe Fantacalcio (chi deve giocare vale fantavoto 6, con «Modifica voti» per le ipotesi) e dettaglio della partita con i giocatori delle due squadre su due colonne, voti e titolarità. Si applicano sostituzioni, capitano e modificatori del regolamento.
- **Risultati ufficiali.** Reimportando il calendario esportato dalla lega, l'app mostra i risultati ufficiali con l'ora dell'ultimo import.
- **Regolamento completo**: soglie e regole dei gol, bonus/malus per ruolo, sostituzioni (per ruolo o libere), voto d'ufficio, capitano e vice, modificatori difesa/portiere/centrocampo/attacco, fair play, fattore campo, bonus per modulo, panchina per ruolo, regola per chi non schiera.
- **Rose.** Sezione della barra in basso con la propria rosa e quelle delle altre squadre: crediti, indisponibili, abbinamenti e per ogni giocatore squadra di Serie A, avversario, stato e titolarità stimata.
- **Menu della lega** (nome della lega in alto a sinistra): «Gestione lega» per l'admin (rose, calendario, regolamento, utenti, abbinamenti), cambio lega, ingresso in un'altra lega o creazione di una nuova.
- **Menu** (pulsante con le tre linee): impostazioni utente (dati del profilo, «Esci da questo dispositivo»), notifiche, informazioni (stato dei dati e fonti) e interruttore del tema chiaro/scuro (all'inizio segue il sistema).
- **Stato dei dati.** Se i dati non arrivano da Cloudflare l'app mostra il motivo: server non raggiungibile o offline, errori di Cloudflare, sincronizzazione delle fonti ferma o fallita, termini delle fonti non accettati, budget giornaliero esaurito.
- **Notifiche push** (disattivabili): formazione mancante, titolari a rischio, bonus e malus tuoi e dell'avversario.

> FootballLite non è affiliata a Leghe Fantacalcio® né a Fantacalcio S.r.l. «Fantacalcio» è un marchio registrato di Fantacalcio S.r.l. ed è citato solo per indicare da dove proviene il file esportato.

## Da dove arrivano i dati

| Dato | Fonte |
|---|---|
| Rose, calendario e risultati ufficiali della lega | File esportati dall'admin (es. «Gestione rose» e calendario di Leghe Fantacalcio), letti sul suo dispositivo. I giocatori vengono abbinati alla fonte dati in automatico per cognome e, tra omonimi, per iniziale del nome e ruolo (anche dopo l'aggiornamento giornaliero dei giocatori di Serie A); quelli su cui l'automatico non può decidere si abbinano a mano tra i candidati, dalla pagina Formazione («Abbina») o dalla pagina Admin |
| Calendario, orari e classifica di Serie A | [football-data.org](https://www.football-data.org), piano Free |
| Giocatori, indisponibili, formazioni probabili e ufficiali, statistiche per giocatore e cronaca | [BSD – Bzzoiro Sports Data](https://sports.bzzoiro.com), piano Free, secondo la sua licenza dati |
| Motivo delle assenze (infortunio, squalifica, in dubbio), in aggiunta a BSD | [API-Football](https://www.api-football.com), piano Free, **facoltativa**: solo se chi gestisce l'installazione imposta la propria chiave (`API_FOOTBALL_KEY`). Una richiesta al giorno; non fornisce il rientro previsto |
| Titolarità, formazione consigliata, voti live | **Stime calcolate da FootballLite**: non sono voti ufficiali |

**Voto statistico FootballLite** (`packages/core/src/vote.ts`): stima sulla scala del fantacalcio dalle statistiche BSD, non è il voto ufficiale.
- **Modello:** gradient boosting (70%) più un modello lineare per ruolo (30%), stimati confrontando le statistiche BSD con i voti statistici pubblicati delle giornate 1–7 della Serie A 2026/27. I voti sono stati usati solo in locale per l'analisi: nel repository ci sono solo i pesi.
- **Precisione in validazione** (ogni giornata stimata con un modello addestrato sulle altre sei): 55% di voti identici, 95% entro mezzo punto, scarto medio 0,25. Prima della ricalibrazione erano 39%, 81% e 0,44.
- **Cosa entra:** tutte le statistiche per giocatore (attacco, passaggi, cross, dribbling, duelli, difesa, portiere, errori, cartellini), il rating BSD, i minuti giocati e il risultato della partita.
- **Arrotondamento:** al mezzo punto più vicino, come per i voti statistici (che sono solo interi o mezzi punti).
- **Chi prende voto:** chi gioca almeno 12 minuti. Sotto i 12 il voto c'è solo con gol, assist, espulsione, autogol o rigore segnato, sbagliato o parato. Con la sola ammonizione decide un'opzione del regolamento; il portiere con i soli gol subiti prende il voto base con il malus. Sui voti pubblicati questa regola coincide nel 97% dei casi.
- **Live:** statistiche e risultati si aggiornano ogni 5 minuti durante le partite. Chi è in campo da meno di 12 minuti senza eventi decisivi resta senza voto provvisorio, come in Leghe Fantacalcio: non conta nel parziale e non fa scattare sostituzioni, che partono solo a partita finita.
- **Calibrazione sulla lega:** a ogni import del calendario, nelle giornate con punteggi ufficiali e formazioni inserite in FootballLite, l'app confronta i totali ufficiali delle squadre con quelli calcolati e corregge media e dispersione dei voti stimati (servono almeno 6 punteggi; con pochi dati la correzione resta prudente). Lo scarto prima e dopo è visibile nella pagina Admin.

Non si usano voti pubblicati da terzi (i termini di Fantacalcio ne vietano l'estrazione): la calibrazione si basa solo sui punteggi della propria lega.

In alternativa l'admin può usare il rating della fonte o il voto base.

Cosa FootballLite **non** fa: non accede alle API o all'app di Leghe Fantacalcio, non legge pagine di fantacalcio.it o di altri siti (pagelle comprese), non mostra foto di giocatori né loghi (al loro posto ci sono le iniziali), non riproduce articoli.

Chi gestisce l'installazione accetta i termini delle fonti dati (Gestione lega, con il codice di setup): fino ad allora la sincronizzazione non parte. Il cron distribuisce le richieste a BSD nella giornata, con un budget di 1.500 al giorno (il piano gratuito ne concede 7.500). Con la chiave API-Football impostata (segreto `API_FOOTBALL_KEY` su GitHub, copiato nel Worker dal deploy, oppure `npx wrangler secret put API_FOOTBALL_KEY`), una volta al giorno il cron legge gli indisponibili della stagione e aggiunge il motivo dell'assenza ai giocatori a cui BSD non lo fornisce, senza mai sovrascrivere i dati BSD; l'esito è nella diagnostica di Gestione lega.

## Struttura

| Cartella | Contenuto |
|---|---|
| `packages/core` | Logica in TypeScript, con test: regolamento, import di rose e calendario, abbinamento dei nomi, titolarità, formazione consigliata, calcolo live e simulazione, voto statistico, notifiche |
| `worker` | Backend Cloudflare Worker (Hono) con database D1: leghe e codici, rose, calendario, formazioni con storico, sincronizzazione delle fonti, notifiche Web Push |
| `web` | PWA React + Vite + Tailwind, servita dallo stesso Worker |
| `site` | Landing page (GitHub Pages) con l'APK |
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
API_FOOTBALL_KEY=<facoltativa: chiave API-Football>
VAPID_PUBLIC_KEY=<chiave pubblica VAPID, base64url>
VAPID_PRIVATE_KEY=<chiave privata VAPID (d), base64url>
```

```bash
npm run build
npm run db:migrate:local -w worker
npm run dev:worker
```

## Pubblicazione

- **Pulizia dei dati:** la migrazione `0009_users_reset.sql` svuota leghe, squadre, rose, formazioni, calendari e notifiche (i dati di Serie A restano). In seguito si può ripetere con `curl -X POST -H "x-setup-code: <SETUP_CODE>" https://<worker>/api/setup/reset`.
- **Cloudflare (piano gratuito):** `npx wrangler login`; `npx wrangler d1 create footballlite` e copia il `database_id` in `worker/wrangler.toml`; imposta i segreti con `npx wrangler secret put NOME --name footballlite`; `npm run db:migrate -w worker` e `npm run deploy`.
- **Landing (GitHub Pages):** Settings → Pages → Source «GitHub Actions»; il workflow `.github/workflows/pages.yml` pubblica la cartella `site/`.
- **APK Android:** lo compila, firma e pubblica sulla landing il workflow `.github/workflows/apk.yml` (GitHub Actions) quando cambiano la configurazione Android, le icone o il manifest, oppure a mano con «Run workflow»; il numero di versione cresce a ogni compilazione. Una tantum servono i secret `ANDROID_KEYSTORE_BASE64` (la chiave di firma in base64), `BUBBLEWRAP_KEYSTORE_PASSWORD` e `BUBBLEWRAP_KEY_PASSWORD`. La chiave non è nel repository; l'impronta SHA-256 è in `web/public/.well-known/assetlinks.json`. In locale: da `android/`, `npx @bubblewrap/cli build` con le stesse due variabili delle password.

## Licenze di terze parti

- Font [Archivo](https://github.com/Omnibus-Type/Archivo): SIL Open Font License 1.1 (`web/public/fonts/OFL.txt`).
- Dipendenze npm con licenze MIT, Apache-2.0, BSD e ISC (vedi `package-lock.json`); HyperFrames Apache-2.0; Bubblewrap Apache-2.0.
- [GSAP](https://gsap.com) 3.14.2 (video tutorial): Standard "no charge" license (`video/assets/GSAP-LICENSE.md`).
