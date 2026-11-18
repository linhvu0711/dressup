import { GARMENT_IDS } from "@/dress/garments";
import { listColours } from "../colour-store";
import type { Db } from "../db";
import { wish } from "../db/wish-schema";

// D1 takes at most 100 bound values in one statement; a wish binds 5.
const CHUNK = 20;

// Writes n wishes for the account, so a test or the e2e setup can reach the
// limit without n requests. Wish i is type i of the 17 in colour i / 17 of
// the 13 starter colours, so 221 pieces hold the 200 of the limit, and wish
// i is one second older than wish i - 1, so the list order is fixed.
export async function seedWishes(db: Db, userId: string, n: number) {
	const colours = await listColours(db, userId);
	const all = Array.from({ length: n }, (_, i) => ({
		id: `00000000-0000-4000-a000-${String(i + 1).padStart(12, "0")}`,
		userId,
		typeId: GARMENT_IDS[i % GARMENT_IDS.length],
		colourId: colours[Math.floor(i / GARMENT_IDS.length)].id,
		createdAt: new Date(Date.UTC(2026, 0, 1) - i * 1000),
	}));
	for (let i = 0; i < all.length; i += CHUNK)
		await db.insert(wish).values(all.slice(i, i + CHUNK));
}
