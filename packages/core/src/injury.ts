// Motivo dell'assenza in italiano: le fonti lo scrivono in inglese ("Knee Injury", "Hamstring", "Suspended"…).

/** Regole in ordine: la prima che corrisponde vince. */
const RULES: [RegExp, string][] = [
  [/cruciate|\bacl\b/, "rottura del legamento crociato"],
  [/meniscus/, "lesione al menisco"],
  [/achilles/, "infortunio al tendine d'Achille"],
  [/hamstring/, "lesione al bicipite femorale"],
  [/adductor|groin/, "infortunio all'adduttore"],
  [/calf/, "infortunio al polpaccio"],
  [/thigh|quadriceps/, "infortunio alla coscia"],
  [/knee/, "infortunio al ginocchio"],
  [/ankle/, "infortunio alla caviglia"],
  [/foot|toe|metatars/, "infortunio al piede"],
  [/hip/, "infortunio all'anca"],
  [/back|spine|lumbar/, "infortunio alla schiena"],
  [/shoulder|collarbone|clavicle/, "infortunio alla spalla"],
  [/elbow|arm|wrist|hand|finger/, "infortunio al braccio"],
  [/rib|chest|abdominal/, "infortunio al costato"],
  [/nose/, "frattura al naso"],
  [/head|face|cheek|jaw|eye/, "infortunio al volto"],
  [/concussion/, "trauma cranico"],
  [/fractur|broken/, "frattura"],
  [/ligament/, "lesione ai legamenti"],
  [/tendon/, "infortunio al tendine"],
  [/muscle|muscular|strain|tear/, "infortunio muscolare"],
  [/knock|bruise|contusion/, "botta"],
  [/illness|ill\b|sick|flu|fever|virus|covid|gastro/, "malattia"],
  [/yellow/, "squalificato per somma di ammonizioni"],
  [/red card|sent off/, "squalificato per espulsione"],
  [/suspend|suspension|ban/, "squalificato"],
  [/national|international/, "impegno con la nazionale"],
  [/coach|technical|tactical/, "scelta tecnica"],
  [/fitness|condition/, "non al meglio della condizione"],
  [/personal|family/, "motivi personali"],
  [/surgery|operation/, "operazione chirurgica"],
  [/rest/, "a riposo"],
  [/unknown|undisclosed/, "infortunio non specificato"],
  [/injur/, "infortunio"],
];

/** Traduce il motivo; se nessuna regola corrisponde lo restituisce com'è (potrebbe già essere in italiano). */
export function injuryReasonIt(reason: string | null | undefined): string | null {
  const r = (reason ?? "").trim();
  if (!r) return null;
  const key = r.toLowerCase();
  for (const [re, it] of RULES) if (re.test(key)) return it;
  return r;
}
