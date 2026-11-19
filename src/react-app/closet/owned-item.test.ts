import { expect, test } from "bun:test";
import { closetPieces, type OwnedItem } from "./owned-item";

const NAVY = { id: "navy", name: "Navy", hex: "#1F3A5F" };
const WHITE = { id: "white", name: "White", hex: "#F4F2EE" };

const item = (
	id: string,
	typeId: OwnedItem["typeId"],
	colour: typeof NAVY,
	brand: string | null,
	quantity: number,
) =>
	({
		id,
		typeId,
		colour,
		brand: brand === null ? null : { id: brand, name: brand },
		quantity,
		pictureIds: [] as OwnedItem["pictureIds"],
	}) as OwnedItem;

test("puts the items of one piece on one tile with their total", () => {
	// Given: items, newest first: shirt_l Navy Zara 2; tee_s White no brand 1;
	// shirt_l Navy COS 3
	const items = [
		item("a", "shirt_l", NAVY, "Zara", 2),
		item("b", "tee_s", WHITE, null, 1),
		item("c", "shirt_l", NAVY, "COS", 3),
	];
	// When
	const pieces = closetPieces(items).map((p) => [
		p.typeId,
		p.colour.name,
		p.quantity,
	]);
	// Then
	expect(pieces).toEqual([
		["shirt_l", "Navy", 5],
		["tee_s", "White", 1],
	]);
});
