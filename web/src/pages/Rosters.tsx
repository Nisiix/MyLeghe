import { ROLE_NAME, ROLES } from "@footballlite/core";
import { useSearchParams } from "react-router-dom";
import { AvailabilityIcon, Card, Empty, ErrorBox, RoleTag, Spinner, StarterPercent, TeamBadge } from "../components/ui";
import { Figurine } from "../components/Figurine";
import { useLeague, useOutlook } from "../lib/data";
import { useSession } from "../lib/session";
import { prettyTeam, rosterOf, scoredRoster } from "../lib/team";

/** Rose della lega: la propria e quelle degli altri, con titolarità stimata, stato e crediti. */
export function RostersPage() {
  const s = useSession();
  const league = useLeague();
  const outlook = useOutlook();
  const [params, setParams] = useSearchParams();

  if (league.isLoading) return <Spinner label="Carico le rose…" />;
  if (league.error) return <ErrorBox error={league.error} onRetry={() => league.refetch()} />;
  const data = league.data!;
  if (!data.teams.length) return <Card title="Rose"><Empty>L'admin non ha ancora importato le rose della lega.</Empty></Card>;

  const teams = [...data.teams].sort((a, b) => Number(b.id === s?.myTeamId) - Number(a.id === s?.myTeamId) || a.position - b.position);
  const selectedId = Number(params.get("squadra")) || s?.myTeamId || teams[0].id;
  const team = data.teams.find((t) => t.id === selectedId) ?? teams[0];
  const mine = team.id === s?.myTeamId;
  const players = scoredRoster(rosterOf(data, team.id), outlook.data?.players, data.league.config);
  const out = players.filter((p) => p.outlook?.unavailable).length;
  const unmatched = players.filter((p) => !p.info.ext_id).length;
  const cost = players.reduce((sum, p) => sum + (p.cost ?? 0), 0);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="px-1 text-2xl font-extrabold leading-none">Rose</h1>

      <div className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1" role="tablist" aria-label="Squadre della lega">
        {teams.map((t) => (
          <button key={t.id} role="tab" aria-selected={t.id === team.id} onClick={() => setParams({ squadra: String(t.id) }, { replace: true })}
            className={`flex shrink-0 items-center gap-2 rounded-full border py-1 pr-3 pl-1 text-sm font-bold transition ${t.id === team.id ? "border-brand bg-brand text-brand-ink dark:border-accent dark:bg-accent dark:text-accent-ink" : "border-line bg-surface text-ink"}`}>
            <TeamBadge id={t.id} name={t.name} size={26} />
            <span className="max-w-32 truncate">{t.id === s?.myTeamId ? "La tua rosa" : t.name}</span>
          </button>
        ))}
      </div>

      <Card>
        <div className="mb-3 flex items-center gap-3">
          <TeamBadge id={team.id} name={team.name} size={44} />
          <div className="min-w-0 flex-1">
            <h2 className="scoreboard truncate text-xl leading-tight">{team.name}</h2>
            <p className="text-xs text-muted">{mine ? "La tua squadra" : `${team.position}ª in classifica`}</p>
          </div>
        </div>
        <dl className="grid grid-cols-4 gap-2 text-center">
          {[
            ["Giocatori", players.length],
            ["Crediti", team.spent || cost],
            ["Indisponibili", out],
            ["Abbinati", `${players.length - unmatched}/${players.length}`],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl border border-line bg-surface-2 px-1 py-2">
              <dd className="scoreboard tabular text-lg leading-none">{value}</dd>
              <dt className="mt-1 text-[10px] font-semibold text-muted">{label}</dt>
            </div>
          ))}
        </dl>
      </Card>

      {!players.length ? <Card><Empty>Rosa non ancora importata.</Empty></Card> : ROLES.map((role) => {
        const list = players.filter((p) => p.role === role).sort((a, b) => (Number.isNaN(b.starterPercent) ? -1 : b.starterPercent) - (Number.isNaN(a.starterPercent) ? -1 : a.starterPercent) || (b.cost ?? 0) - (a.cost ?? 0));
        if (!list.length) return null;
        return (
          <Card key={role} title={<span className="flex items-center gap-2"><RoleTag role={role} size={20} />{ROLE_NAME[role]} <span className="text-sm font-semibold text-muted">{list.length}</span></span>}>
            <div className="-mt-2 mb-1 flex items-center justify-end gap-2 text-[10px] font-bold uppercase tracking-wide text-muted" aria-hidden>
              <span className="w-14 text-center">Crediti</span>
              <span className="w-16 border-l border-transparent pl-2 text-right">Titolarità</span>
            </div>
            <ul className="-my-1 flex flex-col divide-y divide-line">
              {list.map((p) => (
                <li key={p.id} className="flex items-center gap-2 py-2 text-sm">
                  <Figurine name={p.name} role={p.role} team={p.info.ext_team} size={40} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{p.name}</span>
                    <span className="block truncate text-xs text-muted">{p.outlook ? p.outlook.fixture ?? prettyTeam(p.info.ext_team) : "Non abbinato alla fonte dati"}</span>
                  </span>
                  <span className="tabular w-14 shrink-0 rounded-md border border-line bg-surface-2 px-1 py-0.5 text-center text-[11px] font-bold text-muted" title="Crediti pagati all'asta">{p.cost ?? "–"}</span>
                  <span className="inline-flex w-16 shrink-0 items-center justify-end gap-1 border-l border-line pl-2" title="Titolarità stimata">
                    {p.outlook?.unavailable ? <AvailabilityIcon unavailable={p.outlook.unavailable} size={18} /> : <><AvailabilityIcon doubtful={p.outlook?.doubtful} /><StarterPercent percent={p.starterPercent} /></>}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        );
      })}
      <p className="-mt-2 px-1 text-[11px] text-muted">Per ogni giocatore: squadra di Serie A, avversario, stato, crediti d'asta e titolarità stimata da FootballLite.</p>
    </div>
  );
}
