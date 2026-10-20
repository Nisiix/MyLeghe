import { Card } from "../components/ui";
import { DataStatusDetails } from "../components/DataStatus";

/** Informazioni: stato dei dati, fonti e note legali. */
export function InfoPage() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="px-1 text-2xl font-extrabold leading-none">Informazioni</h1>

      <Card title="Stato dei dati">
        <DataStatusDetails />
      </Card>

      <Card title="Fonti dei dati">
        <ul className="flex flex-col gap-1.5 text-sm">
          <li>Rose e calendario: file importati dall'admin della lega.</li>
          <li>Calendario, orari e classifica di Serie A: <a href="https://www.football-data.org" target="_blank" rel="noreferrer" className="text-accent underline">football-data.org</a>.</li>
          <li>Giocatori, indisponibili, formazioni probabili e ufficiali, statistiche e cronaca: <a href="https://sports.bzzoiro.com" target="_blank" rel="noreferrer" className="text-accent underline">BSD, sports.bzzoiro.com</a>.</li>
          <li>Titolarità, formazione consigliata e voti live sono stime calcolate da FootballLite: non sono i voti ufficiali.</li>
        </ul>
      </Card>

      <Card title="Note">
        <ul className="flex flex-col gap-1.5 text-xs text-muted">
          <li>Font Archivo, SIL Open Font License 1.1.</li>
          <li>FootballLite non è affiliata a Leghe Fantacalcio® né a Fantacalcio S.r.l.</li>
        </ul>
      </Card>
    </div>
  );
}
