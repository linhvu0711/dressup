import { and, eq, sql } from "drizzle-orm";
import {
	GARMENT_IDS,
	type GarmentId,
	type Hex,
	JACKET_IDS,
	STARTER_COLOURS,
} from "@/dress/garments";
import { DEFAULT_MODE_ID, type ModeId } from "@/dress/modes";
import {
	applyChange,
	type DressChange,
	type DressError,
	type DressState,
	MANNEQUIN_PARTS,
	STARTER_MANNEQUIN,
} from "@/dress/state";
import type { Db } from "./db";
import {
	colourSquare,
	mannequin,
	outfit,
	outfitGarment,
} from "./db/dress-schema";
import type { Result } from "./result";

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
	const outfitRow = db.select().from(outfit).where(eq(outfit.userId, userId));
	if ((await outfitRow).length === 0) await seed(db, userId);
	// One batch, so a save from another device cannot land between the reads
	// and leave a pick that is not in its row.
	const [[mode], garments, squares, [colours]] = await db.batch([
		outfitRow,
		db.select().from(outfitGarment).where(eq(outfitGarment.userId, userId)),
		db
			.select()
			.from(colourSquare)
			.where(eq(colourSquare.userId, userId))
			// Two devices that add at once give their squares the same position;
			// the hex keeps their order the same on each load.
			.orderBy(colourSquare.position, colourSquare.hex),
		db.select().from(mannequin).where(eq(mannequin.userId, userId)),
	]);
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
		state: {
			modeId: mode.modeId as ModeId,
			swatches,
			picked,
			open,
			mannequin: colours
				? { skin: colours.skin as Hex, hair: colours.hair as Hex }
				: { ...STARTER_MANNEQUIN },
		},
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
	// Sets only the parts that changed, so a skin from one device and a hair
	// from another, both read before either wrote, are both kept.
	const parts = MANNEQUIN_PARTS.filter(
		(part) => after.mannequin[part] !== old.mannequin[part],
	);
	if (parts.length > 0)
		writes.push(
			db
				.insert(mannequin)
				.values({ userId, ...after.mannequin })
				.onConflictDoUpdate({
					target: mannequin.userId,
					set: Object.fromEntries(
						parts.map((part) => [part, after.mannequin[part]]),
					),
				}),
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
		const picked = after.picked[garment] !== old.picked[garment];
		if (picked)
			writes.push(
				db
					.update(outfitGarment)
					.set({ hex: after.picked[garment] })
					.where(thisGarment),
			);
		// Another device may have changed the row since the read, so the pick
		// can name a square that is gone. Then it moves to the row's first
		// square, as removeColour in state.ts does.
		if (picked || was.some((h) => !now.includes(h)))
			writes.push(
				db
					.update(outfitGarment)
					.set({
						hex: sql`(select ${colourSquare.hex} from ${colourSquare} where ${colourSquare.userId} = ${userId} and ${colourSquare.garment} = ${garment} order by ${colourSquare.position} limit 1)`,
					})
					.where(
						and(
							thisGarment,
							sql`not exists (select 1 from ${colourSquare} where ${colourSquare.userId} = ${userId} and ${colourSquare.garment} = ${garment} and ${colourSquare.hex} = ${outfitGarment.hex})`,
						),
					),
			);
	}
	const [first, ...rest] = writes;
	if (first) await db.batch([first, ...rest]);
}

// One change as the Dress page makes it: read, apply the page's rules, and
// write the difference.
export async function changeDress(
	db: Db,
	userId: string,
	change: DressChange,
): Promise<Result<DressState, DressError>> {
	const stored = await loadDress(db, userId);
	const result = applyChange(stored.state, change);
	if (!result.ok) return result;
	await saveDress(db, userId, stored, result.state);
	return { ok: true, value: result.state };
}
