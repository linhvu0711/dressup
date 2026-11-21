import { and, eq } from "drizzle-orm";
import { sameLabelName } from "@/labels/name";
import { type Db, hitsIndex } from "./db";
import type { brand } from "./db/brand-schema";
import type { colour } from "./db/colour-schema";
import type { tag } from "./db/tag-schema";
import type { Result } from "./result";

type LabelTable = typeof colour | typeof brand | typeof tag;

type Values<T extends LabelTable> = Omit<
	T["$inferInsert"],
	"id" | "userId" | "createdAt"
> & { name: string };

type Row<T extends LabelTable> = T["$inferSelect"];

export type NameListError<L extends string = never> =
	| { code: "duplicate"; name: string }
	| { code: "not_found" }
	| { code: L };

type ChangeError = { code: "duplicate"; name: string } | { code: "not_found" };

export function nameList<T extends LabelTable, L extends string = never>(list: {
	table: T;
	index: string;
}) {
	// Drizzle does not follow a generic table, so the calls below see one of
	// the three, and each row is cast back to T's.
	const table: LabelTable = list.table;

	const taken = async (
		db: Db,
		userId: string,
		name: string,
		except?: string,
	) => {
		const rows = await db
			.select({ id: table.id, name: table.name })
			.from(table)
			.where(eq(table.userId, userId));
		return rows.some(
			(row) => row.id !== except && sameLabelName(row.name, name),
		);
	};

	return {
		// The server makes the id: an add sent again after a lost answer finds
		// its name taken, and the page reads the list again.
		async add(
			db: Db,
			userId: string,
			values: Values<T>,
		): Promise<Result<Row<T>, NameListError<L>>> {
			const duplicate = {
				ok: false,
				error: { code: "duplicate", name: values.name },
			} as const;
			if (await taken(db, userId, values.name)) return duplicate;
			try {
				const [row] = await db
					.insert(table)
					.values({ id: crypto.randomUUID(), userId, ...values })
					.returning();
				return { ok: true, value: row as Row<T> };
			} catch (error) {
				// The index folds only A to Z, so it catches another tab's same name;
				// the read above catches the rest.
				if (hitsIndex(error, list.index)) return duplicate;
				throw error;
			}
		},

		// Changes only a label the account has. A name the account's other
		// labels hold is refused, so a change of letter case alone is taken.
		async change(
			db: Db,
			userId: string,
			id: string,
			values: Values<T>,
		): Promise<Result<Row<T>, ChangeError>> {
			const duplicate = {
				ok: false,
				error: { code: "duplicate", name: values.name },
			} as const;
			if (await taken(db, userId, values.name, id)) return duplicate;
			try {
				const [row] = await db
					.update(table)
					.set(values)
					.where(and(eq(table.id, id), eq(table.userId, userId)))
					.returning();
				return row
					? { ok: true, value: row as Row<T> }
					: { ok: false, error: { code: "not_found" } };
			} catch (error) {
				if (hitsIndex(error, list.index)) return duplicate;
				throw error;
			}
		},
	};
}
