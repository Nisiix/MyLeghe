// Abbinamento dei giocatori delle rose importate ai giocatori di Serie A della fonte dati (tabella `players`).

import { matchPlayer, type CandidatePlayer, type Role } from "@footballlite/core";

/** Pool dei giocatori di Serie A per l'abbinamento (dalla fonte dati, salvati in `players`). */
export async function playerPool(db: D1Database): Promise<CandidatePlayer[]> {
  const rows = await db.prepare("SELECT id, name, short_name, role, team_name FROM players").all<{ id: number; name: string; short_name: string | null; role: Role | null; team_name: string | null }>();
  return (rows.results ?? []).flatMap((p) => {
    const base = { id: p.id, role: p.role, teamName: p.team_name ?? undefined };
    return p.short_name && p.short_name !== p.name ? [{ ...base, name: p.name }, { ...base, name: p.short_name }] : [{ ...base, name: p.name }];
  });
}

export function bestOf(name: string, role: Role, pool: CandidatePlayer[]) {
  const m = matchPlayer(name, role, pool);
  // Lo stesso giocatore può comparire due volte nel pool (nome e nome breve): candidati unici.
  const seen = new Set<number>();
  const candidates = m.candidates.filter((x) => !seen.has(x.id) && seen.add(x.id)).slice(0, 4);
  return { ...m, candidates };
}

interface RosterKey { team_id: number; slot: number; name: string; role: Role }

/**
 * Rifà l'abbinamento automatico dei giocatori non abbinati (di una lega o di tutte): dopo l'import delle rose
 * con la fonte ancora vuota, oppure dopo l'aggiornamento giornaliero dei giocatori di Serie A.
 * Restituisce quanti sono stati controllati e quanti abbinati.
 */
export async function rematchUnmatched(db: D1Database, leagueId?: string): Promise<{ checked: number; matched: number }> {
  const pool = await playerPool(db);
  if (!pool.length) return { checked: 0, matched: 0 };
  const rows = leagueId
    ? await db.prepare("SELECT r.team_id, r.slot, r.name, r.role FROM roster r JOIN teams t ON t.id = r.team_id WHERE t.league_id = ? AND r.ext_id IS NULL").bind(leagueId).all<RosterKey>()
    : await db.prepare("SELECT r.team_id, r.slot, r.name, r.role FROM roster r WHERE r.ext_id IS NULL").all<RosterKey>();
  const list = rows.results ?? [];
  let matched = 0;
  const stmts = list.map((r) => {
    const m = bestOf(r.name, r.role, pool);
    if (m.id) matched++;
    return db.prepare("UPDATE roster SET ext_id = ?, confidence = ?, candidates = ? WHERE team_id = ? AND slot = ?")
      .bind(m.id, m.confidence, JSON.stringify(m.candidates), r.team_id, r.slot);
  });
  for (let i = 0; i < stmts.length; i += 50) await db.batch(stmts.slice(i, i + 50));
  return { checked: list.length, matched };
}
