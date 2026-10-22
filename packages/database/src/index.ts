import { drizzle } from "drizzle-orm/postgres-js";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";
export * from "./schema.js";
export * from "./india.js";
export type Database = PostgresJsDatabase<typeof schema>;
export function createDatabase(url: string) { const client = postgres(url, { max: 10 }); return { db: drizzle(client, { schema }), close: () => client.end() }; }
