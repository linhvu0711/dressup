import { getTableColumns } from "drizzle-orm";
import type { SQLiteTable } from "drizzle-orm/sqlite-core";
import type { Db } from "../db";

// D1 takes at most 100 bound values in one statement, and drizzle binds every
// column of the table for each row, given or default, so a table's column
// count is the most one row binds.
export async function insertInChunks<T extends SQLiteTable>(
	db: Db,
	table: T,
	rows: T["$inferInsert"][],
) {
	const size = Math.floor(100 / Object.keys(getTableColumns(table)).length);
	for (let i = 0; i < rows.length; i += size)
		await db.insert(table).values(rows.slice(i, i + size));
}
