import { addDatabaseChangeListener } from 'expo-sqlite';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import { getAppDatabase, type OpenedDatabase } from './client';

type DbState =
  | { status: 'opening' }
  | { status: 'ready'; db: OpenedDatabase['db']; raw: OpenedDatabase['raw'] }
  | { status: 'error'; error: Error };

const DbContext = createContext<OpenedDatabase | null>(null);

/** Membuka DB sekali saat app start; children baru dirender setelah migrasi selesai. */
export function DatabaseProvider({
  children,
  renderState,
}: {
  children: ReactNode;
  renderState: (state: Exclude<DbState, { status: 'ready' }>, retry: () => void) => ReactNode;
}) {
  const [state, setState] = useState<DbState>({ status: 'opening' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    getAppDatabase()
      .then((opened) => !cancelled && setState({ status: 'ready', ...opened }))
      .catch((e: unknown) => !cancelled && setState({ status: 'error', error: e instanceof Error ? e : new Error(String(e)) }));
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const retry = () => {
    setState({ status: 'opening' });
    setAttempt((n) => n + 1);
  };

  if (state.status !== 'ready') return renderState(state, retry);
  return <DbContext.Provider value={{ db: state.db, raw: state.raw }}>{children}</DbContext.Provider>;
}

export function useDb(): OpenedDatabase['db'] {
  const ctx = useContext(DbContext);
  if (!ctx) throw new Error('useDb dipakai di luar DatabaseProvider');
  return ctx.db;
}

/**
 * Hitung ulang nilai setiap kali salah satu tabel yang diawasi berubah.
 * Untuk query yang tidak bisa memakai useLiveQuery (agregat lintas tabel).
 * `tables` harus konstan selama komponen hidup.
 */
export function useTableQuery<T>(tables: readonly string[], compute: () => T): T {
  const [value, setValue] = useState(compute);
  useEffect(() => {
    const watched = new Set(tables);
    const sub = addDatabaseChangeListener((e) => {
      if (watched.has(e.tableName)) setValue(compute());
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tables.join(',')]);
  return value;
}
