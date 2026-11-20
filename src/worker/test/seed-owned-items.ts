import { TYPE_IDS } from "@/dress/clothing-types";
import { addBrand } from "../brand-store";
import { listColours } from "../colour-store";
import type { Db } from "../db";
import { ownedItem } from "../db/owned-item-schema";
import { insertInChunks } from "./insert-in-chunks";

// Writes n owned items for the account, so a test or the e2e setup can reach
// the limit without n requests. Each piece gets three items, one for each of
// the brands "Brand 1" to "Brand 3", and item i is one second older than item
// i - 1, so the list order is fixed.
export async function seedOwnedItems(db: Db, userId: string, n: number) {
	const colours = await listColours(db, userId);
	const brandIds: string[] = [];
	for (const name of ["Brand 1", "Brand 2", "Brand 3"]) {
		const added = await addBrand(db, userId, name);
		if (!added.ok) throw new Error(`seedOwnedItems: ${added.error.code}`);
		brandIds.push(added.value.id);
	}
	const all = Array.from({ length: n }, (_, i) => {
		const piece = Math.floor(i / 3);
		return {
			id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
			userId,
			typeId: TYPE_IDS[piece % TYPE_IDS.length],
			colourId:
				colours[Math.floor(piece / TYPE_IDS.length) % colours.length].id,
			brandId: brandIds[i % 3],
			quantity: 1,
			createdAt: new Date(Date.UTC(2026, 0, 1) - i * 1000),
		};
	});
	await insertInChunks(db, ownedItem, all);
}
