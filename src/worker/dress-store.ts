import { eq } from "drizzle-orm";
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

// The account's dress state. An account with no outfit yet gets the starter
// set first, so accounts made before these tables get it too.
export async function loadDress(db: Db, userId: string): Promise<DressState> {
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
	for (const s of squares) swatches[s.garment as GarmentId].push(s.hex as Hex);
	const picked = Object.fromEntries(
		garments.map((g) => [g.garment, g.hex]),
	) as Record<GarmentId, Hex>;
	const open = JACKET_IDS.filter((id) =>
		garments.some((g) => g.garment === id && g.open),
	);
	return { modeId: mode.modeId as ModeId, swatches, picked, open };
}
