// Lettura dei file importati dall'admin, solo sul dispositivo: i file non vengono caricati così come sono.

import { parseCsv, type Cell } from "@footballlite/core";
import { readSheet } from "read-excel-file/browser";

export async function readGrid(file: File): Promise<Cell[][]> {
  if (/\.csv$/i.test(file.name) || file.type === "text/csv") return parseCsv(await file.text());
  const rows = await readSheet(file);
  return rows.map((r) => r.map((c) => (c instanceof Date ? c.toISOString() : (c as Cell))));
}
