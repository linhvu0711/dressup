import { and, asc, count, eq, exists, not, sql } from "drizzle-orm";
import type { Hex } from "@/colour/hex";
import {
	COLOUR_LIMIT,
	type Colour,
	type ColourId,
	colourInputSchema,
	type ListedColour,
} from "@/labels/colour";
import { sameLabelName } from "@/labels/name";
import { type Db, hitsIndex } from "./db";
import { user } from "./db/auth-schema";
import { colour, colourSeed } from "./db/colour-schema";
import { combinationPiece } from "./db/combination-schema";
import { ownedItem } from "./db/owned-item-schema";
import { wish } from "./db/wish-schema";
import type { Result } from "./result";

export type ColourError =
	| { code: "invalid"; field: "name" | "hex" }
	| { code: "duplicate"; name: string }
	| { code: "colour_limit" }
	| { code: "not_found" }
	| { code: "colour_in_use"; name: string };

// The account's colour with this id, as a subquery: a write puts it in its
// own WHERE, so a colour deleted at the same time stops the write.
export const colourOf = (db: Db, userId: string, colourId: string) =>
	db
		.select({ one: sql`1` })
		.from(colour)
		.where(and(eq(colour.id, colourId), eq(colour.userId, userId)));

export const STARTER_COLOURS: readonly { name: string; hex: Hex }[] = [
	{ name: "White", hex: "#F4F2ED" },
	{ name: "Black", hex: "#1B1B1F" },
	{ name: "Navy", hex: "#1F3A5F" },
	{ name: "Charcoal", hex: "#3A3F47" },
	{ name: "Grey", hex: "#8C8A84" },
	{ name: "Beige", hex: "#D9CBB0" },
	{ name: "Khaki", hex: "#B8A57C" },
	{ name: "Olive", hex: "#6A6B3C" },
	{ name: "Light blue", hex: "#BFD3EA" },
	{ name: "Brown", hex: "#7A5638" },
	{ name: "Cream", hex: "#EDE4CF" },
	{ name: "Burgundy", hex: "#6E1F2F" },
	{ name: "Mustard", hex: "#C9962B" },
];

const toColour = (row: { id: string; name: string; hex: string }): Colour => ({
	id: row.id as ColourId,
	name: row.name,
	hex: row.hex as Hex,
});

// The seed mark, not the colour rows, says an account was seeded, so a list
// the user emptied stays empty. One batch is one transaction, so a mark never
// stands without its colours; two first lists at once both seed, and the
// name index turns the second set into no rows.
async function seedOnce(db: Db, userId: string) {
	const [seeded] = await db
		.select({ userId: colourSeed.userId })
		.from(colourSeed)
		.where(eq(colourSeed.userId, userId));
	if (seeded) return;
	await db.batch([
		db
			.insert(colour)
			.values(
				STARTER_COLOURS.map(({ name, hex }) => ({
					id: crypto.randomUUID(),
					userId,
					name,
					hex,
				})),
			)
			.onConflictDoNothing(),
		db.insert(colourSeed).values({ userId }).onConflictDoNothing(),
	]);
}

// The account's colours in the order they were added. An account with no
// seed mark gets the starter set first, so accounts made before this table
// get it too.
export async function listColours(
	db: Db,
	userId: string,
): Promise<ListedColour[]> {
	await seedOnce(db, userId);
	const rows = await db
		.select({
			id: colour.id,
			name: colour.name,
			hex: colour.hex,
			inUse: sql<number>`${inUse(db)}`,
		})
		.from(colour)
		.where(eq(colour.userId, userId))
		// Two adds in one millisecond share created_at; rowid keeps their order.
		.orderBy(asc(colour.createdAt), asc(sql`${colour}.rowid`));
	return rows.map((row) => ({ ...toColour(row), inUse: row.inUse === 1 }));
}

// The one check of "a combination wears this colour, an owned item has it,
// or a wish is for it", for the list and the delete.
const inUse = (db: Db) =>
	sql`(${exists(
		db
			.select({ one: sql`1` })
			.from(combinationPiece)
			.where(eq(combinationPiece.colourId, colour.id)),
	)} or ${exists(
		db
			.select({ one: sql`1` })
			.from(ownedItem)
			.where(eq(ownedItem.colourId, colour.id)),
	)} or ${exists(
		db.select({ one: sql`1` }).from(wish).where(eq(wish.colourId, colour.id)),
	)})`;

type ColourInput = { name: string; hex: string };

type Checked =
	| { ok: true; name: string; hex: Hex }
	| { ok: false; error: ColourError };

function check(input: ColourInput): Checked {
	const parsed = colourInputSchema.safeParse(input);
	if (parsed.success) return { ok: true, ...parsed.data };
	const field = parsed.error.issues[0]?.path[0] === "hex" ? "hex" : "name";
	return { ok: false, error: { code: "invalid", field } };
}

// The server makes the id. The names are read through listColours, so an
// account's first add, as from an AI app, gets the starter set before the
// limit is counted. The count sits in the insert, so two adds at once cannot
// both pass it.
export async function addColour(
	db: Db,
	userId: string,
	input: ColourInput,
): Promise<Result<Colour, ColourError>> {
	const checked = check(input);
	if (!checked.ok) return checked;
	const { name, hex } = checked;
	const duplicate = { ok: false, error: { code: "duplicate", name } } as const;
	const colours = await listColours(db, userId);
	if (colours.some((c) => sameLabelName(c.name, name))) return duplicate;
	try {
		const [row] = await db
			.insert(colour)
			.select(
				db
					.select({
						id: sql<string>`${crypto.randomUUID()}`.as("id"),
						userId: user.id,
						name: sql<string>`${name}`.as("name"),
						hex: sql<string>`${hex}`.as("hex"),
						createdAt:
							sql<number>`(cast(unixepoch('subsecond') * 1000 as integer))`.as(
								"created_at",
							),
					})
					.from(user)
					.where(
						and(
							eq(user.id, userId),
							sql`(${db
								.select({ n: count() })
								.from(colour)
								.where(eq(colour.userId, userId))}) < ${COLOUR_LIMIT}`,
						),
					),
			)
			.returning({ id: colour.id, name: colour.name, hex: colour.hex });
		return row
			? { ok: true, value: toColour(row) }
			: { ok: false, error: { code: "colour_limit" } };
	} catch (error) {
		if (hitsIndex(error, "colour_userId_name_uq")) return duplicate;
		throw error;
	}
}

// Changes only a colour the account has. A name the account's other colours
// hold is refused, so a change of letter case alone is taken.
export async function changeColour(
	db: Db,
	userId: string,
	id: string,
	input: ColourInput,
): Promise<Result<Colour, ColourError>> {
	const checked = check(input);
	if (!checked.ok) return checked;
	const { name, hex } = checked;
	const duplicate = { ok: false, error: { code: "duplicate", name } } as const;
	const colours = await listColours(db, userId);
	if (colours.some((c) => c.id !== id && sameLabelName(c.name, name)))
		return duplicate;
	try {
		const [row] = await db
			.update(colour)
			.set({ name, hex })
			.where(and(eq(colour.id, id), eq(colour.userId, userId)))
			.returning({ id: colour.id, name: colour.name, hex: colour.hex });
		return row
			? { ok: true, value: toColour(row) }
			: { ok: false, error: { code: "not_found" } };
	} catch (error) {
		if (hitsIndex(error, "colour_userId_name_uq")) return duplicate;
		throw error;
	}
}

// Only the account's own colour goes, and only while no combination wears it
// (docs/adr/0013-colour-belongs-to-the-account.md); the check sits in the
// delete, and the piece's key to colour refuses it too.
export async function deleteColour(
	db: Db,
	userId: string,
	id: string,
): Promise<Result<Colour, ColourError>> {
	const ours = and(eq(colour.id, id), eq(colour.userId, userId));
	const [row] = await db
		.delete(colour)
		.where(and(ours, not(inUse(db))))
		.returning({ id: colour.id, name: colour.name, hex: colour.hex });
	if (row) return { ok: true, value: toColour(row) };
	const [kept] = await db
		.select({ name: colour.name })
		.from(colour)
		.where(ours);
	return {
		ok: false,
		error: kept
			? { code: "colour_in_use", name: kept.name }
			: { code: "not_found" },
	};
}
