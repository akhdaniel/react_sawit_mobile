import { getMeta, META_KEYS, setMeta } from '@/db/repositories/meta';
import type { AppDatabase } from '@/db/types';
import { t } from '@/i18n/id';
import { printBytes, type PrinterInfo } from '@/lib/printer';

export class PrinterNotConfiguredError extends Error {
  constructor() {
    super(t('printer.notConfigured'));
  }
}

export function savedPrinter(db: AppDatabase): PrinterInfo | null {
  const raw = getMeta(db, META_KEYS.printer);
  return raw ? (JSON.parse(raw) as PrinterInfo) : null;
}

export function savePrinter(db: AppDatabase, p: PrinterInfo): void {
  setMeta(db, META_KEYS.printer, JSON.stringify(p));
}

export async function printWithSavedPrinter(db: AppDatabase, data: Uint8Array): Promise<void> {
  const p = savedPrinter(db);
  if (!p) throw new PrinterNotConfiguredError();
  await printBytes(p.id, data);
}
