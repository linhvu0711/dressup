import { TYPE_IDS } from "@/dress/clothing-types";
import { listColours } from "../colour-store";
import type { Db } from "../db";
import { shopLink, wish } from "../db/wish-schema";
import { insertInChunks } from "./insert-in-chunks";

// Writes n wishes for the account, so a test or the e2e setup can reach the
// limit without n requests. Wish i is type i of the 17 in colour i / 17 of
// the 13 starter colours, so 221 pieces hold the 200 of the limit, and wish
// i is one second older than wish i - 1, so the list order is fixed.
export async function seedWishes(db: Db, userId: string, n: number) {
	const colours = await listColours(db, userId);
	const all = Array.from({ length: n }, (_, i) => ({
		id: `00000000-0000-4000-a000-${String(i + 1).padStart(12, "0")}`,
		userId,
		typeId: TYPE_IDS[i % TYPE_IDS.length],
		colourId: colours[Math.floor(i / TYPE_IDS.length)].id,
		createdAt: new Date(Date.UTC(2026, 0, 1) - i * 1000),
	}));
	await insertInChunks(db, wish, all);
}

// Writes n shop links on the wish, named "Link 1" to "Link n", link i one
// second newer than link i - 1, so the list order is fixed.
export async function seedShopLinks(
	db: Db,
	userId: string,
	wishId: string,
	n: number,
) {
	const all = Array.from({ length: n }, (_, i) => ({
		id: `00000000-0000-4000-b000-${String(i + 1).padStart(12, "0")}`,
		userId,
		wishId,
		url: `https://shop.example/${i + 1}`,
		name: `Link ${i + 1}`,
		price: (i + 1) * 100000,
		createdAt: new Date(Date.UTC(2026, 0, 1) + i * 1000),
	}));
	await insertInChunks(db, shopLink, all);
}
