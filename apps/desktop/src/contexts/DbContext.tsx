/**
 * Database Context — provides DbAdapter to the desktop app.
 *
 * Currently uses in-memory SqliteAdapter stub.
 * Will be swapped for real Tauri SQLite adapter once Rust backend is ready.
 */

import { createContext, useContext } from "react";
import type { DbAdapter } from "@smartspec/db";
import { SqliteAdapter } from "../services/sqliteAdapter";

const adapter = new SqliteAdapter();

const DbContext = createContext<DbAdapter>(adapter);

export function DbProvider({ children }: { children: React.ReactNode }) {
  return <DbContext.Provider value={adapter}>{children}</DbContext.Provider>;
}

export function useDb(): DbAdapter {
  return useContext(DbContext);
}
