import { asc, eq, sql } from "drizzle-orm";
import type { Hex } from "@/colour/hex";
import type { Colour, ColourId } from "@/labels/colour";
import type { Db } from "./db";
import { colour, colourSeed } from "./db/colour-schema";

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
export async function listColours(db: Db, userId: string): Promise<Colour[]> {
	await seedOnce(db, userId);
	const rows = await db
		.select({ id: colour.id, name: colour.name, hex: colour.hex })
		.from(colour)
		.where(eq(colour.userId, userId))
		// Two adds in one millisecond share created_at; rowid keeps their order.
		.orderBy(asc(colour.createdAt), asc(sql`rowid`));
	return rows.map(toColour);
}
