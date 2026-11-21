import { expect, test } from "bun:test";
import { closetPieces, itemCard, type OwnedItem } from "./owned-item";

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

test("gives a named item its name, brand line, price, and badge", () => {
	// Given: shirt_l Navy Uniqlo 3, named Oxford shirt, bought for 784000
	const named = {
		...item("a", "shirt_l", NAVY, "Uniqlo", 3),
		name: "Oxford shirt",
		price: 784000,
	};
	// When
	const card = itemCard(named);
	// Then
	expect(card).toEqual({
		title: "Oxford shirt",
		line: "Uniqlo · Navy long button-up",
		price: "784.000 ₫",
		badge: "×3",
		label: "Oxford shirt, Uniqlo · Navy long button-up, 784.000 ₫, ×3",
	});
});

test("gives an item with no name, brand, or price its piece name only", () => {
	// Given: tee_s White, no brand, quantity 1, no name, no price
	const plain = {
		...item("b", "tee_s", WHITE, null, 1),
		name: null,
		price: null,
	};
	// When
	const card = itemCard(plain);
	// Then
	expect(card).toEqual({
		title: "White short tee",
		line: "White short tee",
		price: null,
		badge: null,
		label: "White short tee, White short tee",
	});
});
