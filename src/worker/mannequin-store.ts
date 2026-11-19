import { eq } from "drizzle-orm";
import type { Hex } from "@/colour/hex";
import {
	type Mannequin,
	type MannequinPart,
	STARTER_MANNEQUIN,
} from "@/mannequin/mannequin";
import type { Db } from "./db";
import { mannequin } from "./db/mannequin-schema";

const read = (db: Db, userId: string) =>
	db.select().from(mannequin).where(eq(mannequin.userId, userId));

const toMannequin = (
	row: { skin: string; hair: string } | undefined,
): Mannequin =>
	row
		? { skin: row.skin as Hex, hair: row.hair as Hex }
		: { ...STARTER_MANNEQUIN };

// An account with no row has the starter colours; the row is written on the
// first change.
export async function loadMannequin(
	db: Db,
	userId: string,
): Promise<Mannequin> {
	const [row] = await read(db, userId);
	return toMannequin(row);
}

// Sets only this part, so a skin from one device and a hair from another,
// both picked before either was saved, are both kept.
export async function setMannequinColour(
	db: Db,
	userId: string,
	part: MannequinPart,
	hex: Hex,
): Promise<Mannequin> {
	const [, [row]] = await db.batch([
		db
			.insert(mannequin)
			.values({ userId, ...STARTER_MANNEQUIN, [part]: hex })
			.onConflictDoUpdate({ target: mannequin.userId, set: { [part]: hex } }),
		read(db, userId),
	]);
	return toMannequin(row);
}
