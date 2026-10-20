import {
  BONUS_NOT_COMPUTABLE, DEFAULT_CONFIG, normalizeConfig, ROLE_LABEL,
  type Band, type BonusTable, type LeagueConfig,
} from "@footballlite/core";
import { useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { Button, Card } from "./ui";

const BONUS_LABEL: Record<keyof BonusTable, string> = {
  goal: "Gol segnato", assist: "Assist", assistSoft: "Assist soft", assistGold: "Assist gold", yellow: "Ammonizione", red: "Espulsione",
  penaltyScored: "Rigore segnato", penaltyMissed: "Rigore sbagliato", penaltySaved: "Rigore parato", ownGoal: "Autogol",
  goalConceded: "Gol subito", cleanSheet: "Porta inviolata", decisiveGoalWin: "Gol vittoria", decisiveGoalDraw: "Gol pareggio",
  playerOfTheMatch: "Migliore in campo",
};

const numIn = "w-16 rounded-lg border border-line bg-surface px-2 py-1 text-right tabular";
const box = "size-5 accent-[var(--color-accent)]";

function Section({ title, children, note }: { title: string; children: ReactNode; note?: string }) {
  return (
    <details className="rounded-xl border border-line p-3" open={false}>
      <summary className="cursor-pointer font-semibold">{title}</summary>
      <div className="mt-3 flex flex-col gap-3">{children}</div>
      {note && <p className="mt-2 text-[11px] text-muted">{note}</p>}
    </details>
  );
}

function Num({ label, value, onChange, step = 0.5, min }: { label: string; value: number; onChange: (v: number) => void; step?: number; min?: number }) {
  return (
    <label className="flex items-center justify-between gap-3">
      <span>{label}</span>
      <input type="number" step={step} min={min} className={numIn} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-3">
      <span>{label}</span>
      <input type="checkbox" className={box} checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

/** Tabella a fasce: "da" (soglia minima) → valore. */
function Bands({ label, from, value, bands, onChange }: { label: string; from: string; value: string; bands: Band[]; onChange: (b: Band[]) => void }) {
  return (
    <div>
      <div className="mb-1 text-xs text-muted">{label}</div>
      <table className="w-full text-xs tabular">
        <thead><tr><th className="text-left font-normal text-muted">{from}</th><th className="text-left font-normal text-muted">{value}</th><th /></tr></thead>
        <tbody>
          {bands.map((b, i) => (
            <tr key={i}>
              <td className="py-0.5"><input type="number" step={0.25} className={numIn} value={b.from} onChange={(e) => onChange(bands.map((x, j) => (j === i ? { ...x, from: Number(e.target.value) } : x)))} /></td>
              <td className="py-0.5"><input type="number" step={0.5} className={numIn} value={b.value} onChange={(e) => onChange(bands.map((x, j) => (j === i ? { ...x, value: Number(e.target.value) } : x)))} /></td>
              <td><button type="button" className="text-muted" aria-label="Rimuovi fascia" onClick={() => onChange(bands.filter((_, j) => j !== i))}>✕</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <button type="button" className="mt-1 text-xs font-semibold text-accent" onClick={() => onChange([...bands, { from: (bands.at(-1)?.from ?? 6) + 0.5, value: (bands.at(-1)?.value ?? 0) + 1 }])}>Aggiungi fascia</button>
    </div>
  );
}

/** Regolamento completo della lega, con le stesse voci di Leghe Fantacalcio. */
export function RulesEditor({ config }: { config: LeagueConfig }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [c, setC] = useState<LeagueConfig>(config);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const mods = c.modifiers;
  const setMods = (patch: Partial<LeagueConfig["modifiers"]>) => setC({ ...c, modifiers: { ...mods, ...patch } });
  const setBonus = (k: keyof BonusTable, i: number, v: number) => setC({ ...c, bonus: { ...c.bonus, [k]: c.bonus[k].map((x, j) => (j === i ? v : x)) } });
  const allModules = [...new Set([...DEFAULT_CONFIG.modules, "334", "424", "433", ...c.modules])].filter((m) => m.length === 3).sort();

  async function save() {
    setMsg(null);
    try {
      await api("/league/admin/settings", { method: "PUT", body: normalizeConfig(c) });
      await qc.invalidateQueries({ queryKey: ["league"] });
      // Impostazioni salvate: si passa al profilo e alla scelta della rosa da collegare (se non già collegata).
      navigate("/accesso?rosa");
    } catch (e) { setMsg({ ok: false, text: (e as Error).message }); }
  }

  return (
    <Card title="Regolamento">
      <p className="mb-3 text-sm text-muted">Inserisci le stesse regole impostate su Leghe Fantacalcio: valgono per la validazione delle formazioni, il live e «Simula risultato».</p>
      <div className="flex flex-col gap-2 text-sm">
        <Section title="Rose e formazione">
          <div className="flex flex-wrap gap-3">
            <span className="w-full text-xs text-muted">Giocatori per ruolo nel file delle rose</span>
            {c.rosterScheme.map((n, i) => (
              <label key={i} className="flex items-center gap-1">{ROLE_LABEL[i + 1]}
                <input type="number" min={0} max={15} className={numIn} value={n} onChange={(e) => setC({ ...c, rosterScheme: c.rosterScheme.map((x, j) => (j === i ? Number(e.target.value) : x)) as LeagueConfig["rosterScheme"] })} />
              </label>
            ))}
          </div>
          <div>
            <div className="mb-1 text-xs text-muted">Moduli ammessi</div>
            <div className="flex flex-wrap gap-2">
              {allModules.map((m) => (
                <label key={m} className="flex items-center gap-1 tabular">
                  <input type="checkbox" className="accent-[var(--color-accent)]" checked={c.modules.includes(m)} onChange={(e) => setC({ ...c, modules: e.target.checked ? [...c.modules, m] : c.modules.filter((x) => x !== m) })} />
                  {m.split("").join("-")}
                </label>
              ))}
            </div>
          </div>
          <Num label="Panchinari" value={c.benchCount} step={1} min={0} onChange={(v) => setC({ ...c, benchCount: v })} />
          <Check label="Panchinari fissi per ruolo" checked={!!c.benchPerRole} onChange={(v) => setC({ ...c, benchPerRole: v ? [1, 2, 2, 2] : null })} />
          {c.benchPerRole && (
            <div className="flex flex-wrap gap-3">
              {c.benchPerRole.map((n, i) => (
                <label key={i} className="flex items-center gap-1">{ROLE_LABEL[i + 1]}
                  <input type="number" min={0} max={10} className={numIn} value={n} onChange={(e) => setC({ ...c, benchPerRole: c.benchPerRole!.map((x, j) => (j === i ? Number(e.target.value) : x)) as LeagueConfig["benchPerRole"] })} />
                </label>
              ))}
            </div>
          )}
          <Check label="Consenti la modifica della propria formazione a giornata iniziata" checked={c.allowForcedEdit} onChange={(v) => setC({ ...c, allowForcedEdit: v })} />
        </Section>

        <Section title="Gol e risultato">
          <Num label="Prima soglia gol" value={c.goalFirst} onChange={(v) => setC({ ...c, goalFirst: v })} />
          <label className="flex items-center justify-between gap-3">
            <span>Ampiezza delle soglie successive (separate da virgola, l'ultima si ripete)</span>
            <input className="w-28 rounded-lg border border-line bg-surface px-2 py-1 text-right" defaultValue={c.goalSteps.join(", ")}
              onBlur={(e) => setC({ ...c, goalSteps: e.target.value.split(/[,\s]+/).map(Number).filter((x) => x > 0) })} />
          </label>
          <Num label="Vittoria per scarto minimo (punti, 0 = no)" value={c.goalRules.winByMargin} onChange={(v) => setC({ ...c, goalRules: { ...c.goalRules, winByMargin: v } })} />
          <Check label="…anche sotto la prima soglia" checked={c.goalRules.winByMarginUnderFirst} onChange={(v) => setC({ ...c, goalRules: { ...c.goalRules, winByMarginUnderFirst: v } })} />
          <Num label="Pareggio se lo scarto è inferiore a (punti, 0 = no)" value={c.goalRules.drawWithin} onChange={(v) => setC({ ...c, goalRules: { ...c.goalRules, drawWithin: v } })} />
          <Check label="…anche sotto la prima soglia" checked={c.goalRules.drawWithinUnderFirst} onChange={(v) => setC({ ...c, goalRules: { ...c.goalRules, drawWithinUnderFirst: v } })} />
          <Num label="Autogol: gol all'avversario sotto questo punteggio (0 = no)" value={c.goalRules.ownGoalBelow} onChange={(v) => setC({ ...c, goalRules: { ...c.goalRules, ownGoalBelow: v } })} />
        </Section>

        <Section title="Bonus e malus" note="Le voci in grigio sono nel regolamento ma non possono essere calcolate: le fonti dati gratuite non distinguono assist soft/gold, gol decisivi e migliore in campo.">
          <table className="w-full text-xs tabular">
            <thead><tr><th className="text-left font-normal text-muted" />{[1, 2, 3, 4].map((r) => <th key={r} className="font-normal text-muted">{ROLE_LABEL[r]}</th>)}</tr></thead>
            <tbody>
              {(Object.keys(BONUS_LABEL) as (keyof BonusTable)[]).map((k) => {
                const off = BONUS_NOT_COMPUTABLE.includes(k);
                return (
                  <tr key={k} className={off ? "text-muted" : ""}>
                    <td className="py-0.5 pr-2">{BONUS_LABEL[k]}</td>
                    {c.bonus[k].map((v, i) => <td key={i} className="py-0.5"><input type="number" step={0.5} className="w-14 rounded border border-line bg-surface px-1 text-right" value={v} onChange={(e) => setBonus(k, i, Number(e.target.value))} /></td>)}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Section>

        <Section title="Sostituzioni">
          <Num label="Sostituzioni massime" value={c.substitutions.max} step={1} min={0} onChange={(v) => setC({ ...c, substitutions: { ...c.substitutions, max: v } })} />
          <label className="flex items-center justify-between gap-3">
            <span>Tipo di sostituzione</span>
            <select className="rounded-lg border border-line bg-surface px-2 py-1" value={c.substitutions.mode} onChange={(e) => setC({ ...c, substitutions: { ...c.substitutions, mode: e.target.value as "role" | "free" } })}>
              <option value="role">Stesso ruolo</option>
              <option value="free">Libera, con cambio modulo se ammesso</option>
            </select>
          </label>
          <OptionalNum label="Voto d'ufficio al portiere senza sostituto" value={c.substitutions.officeVoteGoalkeeper} onChange={(v) => setC({ ...c, substitutions: { ...c.substitutions, officeVoteGoalkeeper: v } })} />
          <OptionalNum label="Voto d'ufficio al giocatore di movimento senza sostituto" value={c.substitutions.officeVoteField} onChange={(v) => setC({ ...c, substitutions: { ...c.substitutions, officeVoteField: v } })} />
        </Section>

        <Section title="Capitano">
          <Check label="Capitano e vice" checked={mods.captain.enabled} onChange={(v) => setMods({ captain: { ...mods.captain, enabled: v } })} />
          {mods.captain.enabled && <>
            <Check label="Bonus del capitano raddoppiati" checked={mods.captain.doubleBonus} onChange={(v) => setMods({ captain: { ...mods.captain, doubleBonus: v } })} />
            <Check label="Malus del capitano raddoppiati" checked={mods.captain.doubleMalus} onChange={(v) => setMods({ captain: { ...mods.captain, doubleMalus: v } })} />
            <Bands label="Bonus in base al voto del capitano (facoltativo)" from="Voto da" value="Bonus" bands={mods.captain.bands} onChange={(b) => setMods({ captain: { ...mods.captain, bands: b } })} />
          </>}
        </Section>

        <Section title="Modificatori">
          <Check label="Modificatore difesa" checked={mods.defense.enabled} onChange={(v) => setMods({ defense: { ...mods.defense, enabled: v } })} />
          {mods.defense.enabled && <div className="ml-3 flex flex-col gap-2 border-l border-line pl-3">
            <Check label="Media con il portiere" checked={mods.defense.includeGoalkeeper} onChange={(v) => setMods({ defense: { ...mods.defense, includeGoalkeeper: v } })} />
            <Num label="Difensori minimi in campo" value={mods.defense.minDefenders} step={1} min={0} onChange={(v) => setMods({ defense: { ...mods.defense, minDefenders: v } })} />
            <Num label="Difensori nella media (i migliori)" value={mods.defense.defendersCounted} step={1} min={1} onChange={(v) => setMods({ defense: { ...mods.defense, defendersCounted: v } })} />
            <label className="flex items-center justify-between gap-3">
              <span>Si applica</span>
              <select className="rounded-lg border border-line bg-surface px-2 py-1" value={mods.defense.applyTo} onChange={(e) => setMods({ defense: { ...mods.defense, applyTo: e.target.value as "own" | "opponent" } })}>
                <option value="own">come bonus alla propria squadra</option>
                <option value="opponent">come malus all'avversario</option>
              </select>
            </label>
            <Bands label="Fasce sulla media voto" from="Media da" value="Valore" bands={mods.defense.bands} onChange={(b) => setMods({ defense: { ...mods.defense, bands: b } })} />
          </div>}
          <Check label="Modificatore portiere" checked={mods.goalkeeper.enabled} onChange={(v) => setMods({ goalkeeper: { ...mods.goalkeeper, enabled: v } })} />
          {mods.goalkeeper.enabled && <div className="ml-3 border-l border-line pl-3"><Bands label="Fasce sul voto del portiere" from="Voto da" value="Bonus" bands={mods.goalkeeper.bands} onChange={(b) => setMods({ goalkeeper: { ...mods.goalkeeper, bands: b } })} /></div>}
          <Check label="Modificatore centrocampo" checked={mods.midfield.enabled} onChange={(v) => setMods({ midfield: { ...mods.midfield, enabled: v } })} />
          {mods.midfield.enabled && <div className="ml-3 border-l border-line pl-3"><Bands label="Fasce sulla differenza tra le somme dei voti dei centrocampisti (bonus a chi vince, malus a chi perde)" from="Differenza da" value="Valore" bands={mods.midfield.bands} onChange={(b) => setMods({ midfield: { ...mods.midfield, bands: b } })} /></div>}
          <Check label="Modificatore attacco" checked={mods.attack.enabled} onChange={(v) => setMods({ attack: { ...mods.attack, enabled: v } })} />
          {mods.attack.enabled && <div className="ml-3 flex flex-col gap-2 border-l border-line pl-3">
            <Check label="Escludi gli attaccanti con assist" checked={mods.attack.excludeWithAssist} onChange={(v) => setMods({ attack: { ...mods.attack, excludeWithAssist: v } })} />
            <Bands label="Fasce sul voto di ogni attaccante senza gol" from="Voto da" value="Bonus" bands={mods.attack.bands} onChange={(b) => setMods({ attack: { ...mods.attack, bands: b } })} />
          </div>}
          <Check label="Fair play (nessun ammonito o espulso)" checked={mods.fairPlay.enabled} onChange={(v) => setMods({ fairPlay: { ...mods.fairPlay, enabled: v } })} />
          {mods.fairPlay.enabled && <Num label="Bonus fair play" value={mods.fairPlay.value} onChange={(v) => setMods({ fairPlay: { ...mods.fairPlay, value: v } })} />}
          <Check label="Fattore campo" checked={mods.homeAdvantage.enabled} onChange={(v) => setMods({ homeAdvantage: { ...mods.homeAdvantage, enabled: v } })} />
          {mods.homeAdvantage.enabled && <Num label="Punti alla squadra di casa" value={mods.homeAdvantage.value} onChange={(v) => setMods({ homeAdvantage: { ...mods.homeAdvantage, value: v } })} />}
          <div>
            <div className="mb-1 text-xs text-muted">Bonus/malus per modulo (0 = nessuno)</div>
            <div className="flex flex-wrap gap-2">
              {c.modules.map((m) => (
                <label key={m} className="flex items-center gap-1 tabular">{m.split("").join("-")}
                  <input type="number" step={0.5} className="w-14 rounded border border-line bg-surface px-1 text-right" value={mods.module[m] ?? 0}
                    onChange={(e) => setMods({ module: { ...mods.module, [m]: Number(e.target.value) } })} />
                </label>
              ))}
            </div>
          </div>
        </Section>

        <Section title="Formazione non inserita">
          <label className="flex items-center justify-between gap-3">
            <span>Se un utente non schiera</span>
            <select className="rounded-lg border border-line bg-surface px-2 py-1" value={c.noLineup.mode} onChange={(e) => setC({ ...c, noLineup: { ...c.noLineup, mode: e.target.value as LeagueConfig["noLineup"]["mode"] } })}>
              <option value="none">nessun risultato (un altro utente può inserirla)</option>
              <option value="last">si usa l'ultima formazione inserita</option>
              <option value="fixed">punteggio fisso</option>
            </select>
          </label>
          {c.noLineup.mode === "fixed" && <Num label="Punteggio assegnato" value={c.noLineup.points} onChange={(v) => setC({ ...c, noLineup: { ...c.noLineup, points: v } })} />}
        </Section>

        <Section title="Voti stimati" note="I voti ufficiali non sono disponibili. Il voto statistico FootballLite è un modello indipendente, nello spirito dei voti statistici (non è Alvin482): valuta ogni giocatore per la sua posizione in campo (terzino, centrale, esterno, punta…) su attacco, costruzione, difesa, cross, gioco aereo, portiere ed errori dalle statistiche BSD, tiene conto di casa/trasferta e forza dell'avversario, poi lo confronta con quelli dello stesso ruolo nella giornata (media 6). Sotto i 12 minuti prende voto solo con gol, assist, espulsione, autogol o rigore.">
          <label className="flex items-center justify-between gap-3">
            <span>Come stimare il voto</span>
            <select className="rounded-lg border border-line bg-surface px-2 py-1" value={c.voteModel} onChange={(e) => setC({ ...c, voteModel: e.target.value as LeagueConfig["voteModel"] })}>
              <option value="stats">Voto statistico FootballLite</option>
              <option value="rating">Rating della fonte dati</option>
              <option value="base">Voto base a tutti</option>
            </select>
          </label>
          <Num label="Voto base (se mancano i dati)" value={c.baseVote} onChange={(v) => setC({ ...c, baseVote: v })} />
          <label className="flex items-center justify-between gap-3">
            <span>Meno di 12 minuti con la sola ammonizione</span>
            <select className="rounded-lg border border-line bg-surface px-2 py-1" value={c.yellowShortVote} onChange={(e) => setC({ ...c, yellowShortVote: e.target.value as LeagueConfig["yellowShortVote"] })}>
              <option value="none">Senza voto</option>
              <option value="base">Voto base con il malus</option>
            </select>
          </label>
        </Section>

        <Button onClick={save}>Salva regolamento</Button>
        {msg && <p className={`text-xs ${msg.ok ? "text-accent" : "text-danger"}`}>{msg.text}</p>}
      </div>
    </Card>
  );
}

function OptionalNum({ label, value, onChange }: { label: string; value: number | null; onChange: (v: number | null) => void }) {
  return (
    <label className="flex items-center justify-between gap-3">
      <span>{label}</span>
      <span className="flex items-center gap-2">
        <input type="checkbox" className={box} checked={value !== null} onChange={(e) => onChange(e.target.checked ? 4 : null)} />
        <input type="number" step={0.5} className={numIn} disabled={value === null} value={value ?? ""} onChange={(e) => onChange(Number(e.target.value))} />
      </span>
    </label>
  );
}
