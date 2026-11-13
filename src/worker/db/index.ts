import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import * as schema from "./auth-schema";

export { schema };

// Both the D1 database in the Worker and bun:sqlite in tests fit this type.
export type Db = BaseSQLiteDatabase<"sync" | "async", unknown, typeof schema>;
