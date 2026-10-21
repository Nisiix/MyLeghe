// Conferme con il dialogo dell'app al posto di `confirm()` del browser (che mostra l'indirizzo del sito e lo stile di sistema).

import { useEffect, useState } from "react";
import { Button, Sheet } from "./ui";

export interface ConfirmOptions {
  title?: string;
  /** Etichetta del pulsante di conferma (default «Conferma»). */
  ok?: string;
  /** Etichetta del pulsante di annullamento (default «Annulla»). */
  cancel?: string;
  /** Azione distruttiva: pulsante rosso. */
  danger?: boolean;
}

interface Pending extends ConfirmOptions { message: string; resolve: (ok: boolean) => void }

let setPending: ((p: Pending | null) => void) | null = null;

/** Chiede conferma con un dialogo in stile app; risolve true se l'utente conferma. Senza host montato risolve false. */
export function confirmDialog(message: string, options: ConfirmOptions = {}): Promise<boolean> {
  return new Promise((resolve) => {
    if (!setPending) { resolve(false); return; }
    setPending({ ...options, message, resolve });
  });
}

/** Da montare una volta alla radice dell'app: mostra il dialogo delle conferme. */
export function ConfirmHost() {
  const [pending, set] = useState<Pending | null>(null);
  useEffect(() => { setPending = set; return () => { setPending = null; }; }, []);
  const close = (ok: boolean) => { pending?.resolve(ok); set(null); };
  return (
    <Sheet open={!!pending} onClose={() => close(false)} title={pending?.title ?? "Conferma"}>
      <p className="mb-4 text-sm">{pending?.message}</p>
      <div className="flex gap-2">
        <Button variant="ghost" className="flex-1" onClick={() => close(false)}>{pending?.cancel ?? "Annulla"}</Button>
        <Button variant={pending?.danger ? "danger" : "primary"} className="flex-1" autoFocus onClick={() => close(true)}>{pending?.ok ?? "Conferma"}</Button>
      </div>
    </Sheet>
  );
}
