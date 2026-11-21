import {
	and,
	count,
	eq,
	exists,
	getTableColumns,
	type SQL,
	sql,
} from "drizzle-orm";
import type { SQLiteTable } from "drizzle-orm/sqlite-core";
import type { Db } from "./db";
import { user } from "./db/auth-schema";
import type { brand } from "./db/brand-schema";
import type { colour } from "./db/colour-schema";
import type { combination } from "./db/combination-schema";
import type { ownedItem } from "./db/owned-item-schema";
import type { tag } from "./db/tag-schema";
import type { shopLink, wish } from "./db/wish-schema";
import type { Result } from "./result";

type AccountTable =
	| typeof ownedItem
	| typeof wish
	| typeof shopLink
	| typeof combination
	| typeof colour
	| typeof brand
	| typeof tag;

type AddTable =
	| typeof ownedItem
	| typeof wish
	| typeof shopLink
	| typeof combination;

type Values<T extends AccountTable> = Omit<
	T["$inferInsert"],
	"id" | "userId" | "createdAt"
>;

// The row the new row hangs under, pinned to the account by its where.
type Parent = { table: SQLiteTable; where: SQL | undefined };

type Under<T extends AccountTable> = {
	userId: string;
	id: string;
	values: Values<T>;
	guards: (SQL | undefined)[];
	parent?: Parent;
	// The rows the cap counts; the account's rows when left out.
	limit: { max: number; of?: SQL };
};

const createdNow = () =>
	sql<number>`(cast(unixepoch('subsecond') * 1000 as integer))`;

const accountRow = (userId: string): Parent => ({
	table: user,
	where: eq(user.id, userId),
});

const belowLimit = (
	db: Db,
	table: AccountTable,
	where: SQL | undefined,
	max: number,
) => sql`(${db.select({ n: count() }).from(table).where(where)}) < ${max}`;

// One row, inserted only when its parent row, its guards, and the cap all
// hold. They sit in the insert itself, so two writes at once cannot both
// pass them. It has no conflict clause and no returning: each caller adds
// its own.
export function insertUnder<T extends AccountTable>(
	db: Db,
	into: T,
	{ userId, id, values, guards, parent, limit }: Under<T>,
) {
	// Drizzle does not follow a generic table, so the calls below see one of
	// the seven.
	const table: AccountTable = into;
	const given = values as Record<string, unknown>;
	// Drizzle takes an insert select only with every column, in table order;
	// its types cannot check fields built from the columns, hence the cast.
	const fields = Object.fromEntries(
		Object.entries(getTableColumns(table)).map(([key, column]) => [
			key,
			key === "id"
				? sql`${id}`.as("id")
				: key === "userId"
					? sql`${userId}`.as("user_id")
					: key === "createdAt"
						? createdNow().as("created_at")
						: sql`${given[key]}`.as(column.name),
		]),
	);
	const from = parent ?? accountRow(userId);
	return db.insert(table).select(
		db
			.select(fields)
			.from(from.table)
			.where(
				and(
					from.where,
					...guards,
					belowLimit(
						db,
						table,
						limit.of ?? eq(table.userId, userId),
						limit.max,
					),
				),
			) as never,
	);
}

const insertIds = <T extends AddTable>(db: Db, into: T, under: Under<T>) => {
	const table: AddTable = into;
	// No target: a unique index's lost race is no row too, and refused()
	// says why.
	return insertUnder(db, table, under as Under<AddTable>)
		.onConflictDoNothing()
		.returning({ id: table.id });
};

type InsertIds = ReturnType<typeof insertIds>;

type Add<
	T extends AddTable,
	V,
	E extends { code: string },
	L extends string,
> = {
	table: T;
	userId: string;
	id: string;
	// The stored row is this add's: the same account, and the same piece,
	// wish, or pieces.
	mine: SQL | undefined;
	parent?: Parent;
	values: Values<T>;
	guards: (SQL | undefined)[];
	limit: { max: number; code: L; of?: SQL };
	// Runs the insert, with the writes that go with it.
	write?: (insert: InsertIds) => Promise<Result<{ id: string }[], NoInfer<E>>>;
	// Runs when the same add comes again, after a lost answer.
	resend?: () => Promise<Result<unknown, NoInfer<E>>>;
	read: () => Promise<V | undefined>;
	// Why the guards stopped the insert; null leaves the cap. The add's error
	// type comes from here, so a write's narrower error does not set it.
	refused: () => Promise<E | null>;
};

// The page makes the id, so an add sent again after a lost answer gives back
// the same row rather than a second one; the same id on another row, or
// another account's id, is conflict.
export async function guardedAdd<
	T extends AddTable,
	V,
	E extends { code: string },
	L extends string,
>(
	db: Db,
	add: Add<T, V, E, L>,
): Promise<
	Result<{ value: V; created: boolean }, E | { code: L } | { code: "conflict" }>
> {
	const table: AddTable = add.table;
	const conflict = { ok: false, error: { code: "conflict" } } as const;
	const held = exists(
		db
			.select({ one: sql`1` })
			.from(table)
			.where(and(eq(table.id, add.id), add.mine)),
	);
	const storedRow = async () => {
		const [row] = await db
			.select({ mine: sql<number>`${held}` })
			.from(table)
			.where(eq(table.id, add.id));
		return row;
	};
	const replay = async () => {
		if (add.resend) {
			const resent = await add.resend();
			if (!resent.ok) return resent;
		}
		const value = await add.read();
		return value === undefined
			? conflict
			: { ok: true as const, value: { value, created: false } };
	};
	const stored = await storedRow();
	if (stored) return stored.mine ? replay() : conflict;
	const insert = insertIds(db, add.table, add);
	const written = add.write
		? await add.write(insert)
		: { ok: true as const, value: await insert };
	if (!written.ok) return written;
	if (written.value.length > 0) {
		const value = await add.read();
		if (value !== undefined)
			return { ok: true, value: { value, created: true } };
	}
	// The first send of this add may land between the read above and the
	// insert, as when a retry overtakes it; it is a replay too.
	const landed = await storedRow();
	if (landed) return landed.mine ? replay() : conflict;
	return {
		ok: false,
		error: (await add.refused()) ?? { code: add.limit.code },
	};
}
