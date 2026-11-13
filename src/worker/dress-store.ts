import { and, eq, sql } from "drizzle-orm";
import {
	GARMENT_IDS,
	type GarmentId,
	type Hex,
	JACKET_IDS,
	STARTER_COLOURS,
} from "@/dress/garments";
import { DEFAULT_MODE_ID, type ModeId } from "@/dress/modes";
import type { DressState } from "@/dress/state";
import type { Db } from "./db";
import { colourSquare, outfit, outfitGarment } from "./db/dress-schema";

function seed(db: Db, userId: string) {
	const garmentRows = GARMENT_IDS.map((garment) =>
		db
			.insert(outfitGarment)
			.values({ userId, garment, hex: STARTER_COLOURS[garment][0] })
			.onConflictDoNothing(),
	);
	// One statement per square: D1 takes at most 100 bound parameters per
	// statement, also inside a batch, and the whole set has 58 x 4.
	const squareRows = GARMENT_IDS.flatMap((garment) =>
		STARTER_COLOURS[garment].map((hex, position) =>
			db
				.insert(colourSquare)
				.values({ userId, garment, hex, position })
				.onConflictDoNothing(),
		),
	);
	return db.batch([
		db
			.insert(outfit)
			.values({ userId, modeId: DEFAULT_MODE_ID })
			.onConflictDoNothing(),
		...garmentRows,
		...squareRows,
	]);
}

export type StoredDress = {
	state: DressState;
	// The smallest position of each row, so a new square can sort first.
	firstPosition: Record<GarmentId, number>;
};

// The account's dress state. An account with no outfit yet gets the starter
// set first, so accounts made before these tables get it too.
export async function loadDress(db: Db, userId: string): Promise<StoredDress> {
	let [mode] = await db.select().from(outfit).where(eq(outfit.userId, userId));
	if (!mode) {
		await seed(db, userId);
		[mode] = await db.select().from(outfit).where(eq(outfit.userId, userId));
	}
	const garments = await db
		.select()
		.from(outfitGarment)
		.where(eq(outfitGarment.userId, userId));
	const squares = await db
		.select()
		.from(colourSquare)
		.where(eq(colourSquare.userId, userId))
		.orderBy(colourSquare.position);
	const swatches = Object.fromEntries(
		GARMENT_IDS.map((id) => [id, [] as Hex[]]),
	) as Record<GarmentId, Hex[]>;
	const firstPosition = Object.fromEntries(
		GARMENT_IDS.map((id) => [id, 0]),
	) as Record<GarmentId, number>;
	for (const s of squares) {
		const row = swatches[s.garment as GarmentId];
		if (row.length === 0) firstPosition[s.garment as GarmentId] = s.position;
		row.push(s.hex as Hex);
	}
	const picked = Object.fromEntries(
		garments.map((g) => [g.garment, g.hex]),
	) as Record<GarmentId, Hex>;
	const open = JACKET_IDS.filter((id) =>
		garments.some((g) => g.garment === id && g.open),
	);
	return {
		state: { modeId: mode.modeId as ModeId, swatches, picked, open },
		firstPosition,
	};
}

// Writes only what differs between the stored state and the next one, all
// in one batch, so a change is kept whole or not at all.
export async function saveDress(
	db: Db,
	userId: string,
	before: StoredDress,
	after: DressState,
) {
	const old = before.state;
	const writes = [];
	if (after.modeId !== old.modeId)
		writes.push(
			db
				.update(outfit)
				.set({ modeId: after.modeId })
				.where(eq(outfit.userId, userId)),
		);
	for (const garment of GARMENT_IDS) {
		const wasOpen = (old.open as readonly GarmentId[]).includes(garment);
		const isOpen = (after.open as readonly GarmentId[]).includes(garment);
		const thisGarment = and(
			eq(outfitGarment.userId, userId),
			eq(outfitGarment.garment, garment),
		);
		if (wasOpen !== isOpen)
			writes.push(
				db.update(outfitGarment).set({ open: isOpen }).where(thisGarment),
			);
		const was = old.swatches[garment];
		const now = after.swatches[garment];
		// The count runs in the batch, not on the state read before it: two
		// devices removing two squares of a row of two at once keep one.
		for (const hex of was.filter((h) => !now.includes(h)))
			writes.push(
				db
					.delete(colourSquare)
					.where(
						and(
							eq(colourSquare.userId, userId),
							eq(colourSquare.garment, garment),
							eq(colourSquare.hex, hex),
							sql`(select count(*) from ${colourSquare} where ${colourSquare.userId} = ${userId} and ${colourSquare.garment} = ${garment}) > 1`,
						),
					),
			);
		// A new square goes first in its row (state.ts addColour), so it
		// takes a position below the smallest. Another device may have added
		// the same colour since the read; then the square is already there.
		const added = now.filter((h) => !was.includes(h));
		added.forEach((hex, i) => {
			writes.push(
				db
					.insert(colourSquare)
					.values({
						userId,
						garment,
						hex,
						position: before.firstPosition[garment] - added.length + i,
					})
					.onConflictDoNothing(),
			);
		});
		// After the squares, and only while the square is still in the row:
		// another device may have removed it since the read.
		const hex = after.picked[garment];
		if (hex !== old.picked[garment])
			writes.push(
				db
					.update(outfitGarment)
					.set({ hex })
					.where(
						and(
							thisGarment,
							sql`exists (select 1 from ${colourSquare} where ${colourSquare.userId} = ${userId} and ${colourSquare.garment} = ${garment} and ${colourSquare.hex} = ${hex})`,
						),
					),
			);
	}
	const [first, ...rest] = writes;
	if (first) await db.batch([first, ...rest]);
}
