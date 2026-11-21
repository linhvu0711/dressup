import { expect, test } from "bun:test";
import type { BrandId } from "@/labels/brand";
import type { ColourId } from "@/labels/colour";
import {
	isWebAddress,
	linksLine,
	removeWishText,
	type ShopLink,
	type ShopLinkId,
	shopLinkHost,
	shopName,
	type Wish,
	type WishId,
} from "./wish";

const link = (
	price: number | null,
	url = "https://cos.com/a",
	brand: string | null = null,
): ShopLink => ({
	id: crypto.randomUUID() as ShopLinkId,
	url,
	brand:
		brand === null ? null : { id: crypto.randomUUID() as BrandId, name: brand },
	name: "Wool jacket",
	price,
	pictureIds: [],
});

const wishWith = (shopLinks: ShopLink[]): Wish => ({
	id: crypto.randomUUID() as WishId,
	typeId: "wool",
	colour: { id: "navy" as ColourId, name: "Navy", hex: "#1F3A5F" },
	shopLinks,
});

test("says the links and the lowest price of a wish", () => {
	// Given
	const wishes = [
		wishWith([]),
		wishWith([link(490000)]),
		wishWith([link(4290000), link(2990000)]),
		wishWith([link(null), link(null)]),
	];
	// When
	const lines = wishes.map(linksLine);
	// Then
	expect(lines).toEqual([
		"No link yet",
		"1 link · from 490.000 ₫",
		"2 links · from 2.990.000 ₫",
		"2 links",
	]);
});

test("takes only http and https addresses as web addresses", () => {
	// Given
	const addresses = [
		"https://cos.com/a",
		"HTTP://zara.com",
		"javascript:alert(1)",
		"zara.com",
		"https://",
		"https://[",
		"http://:80",
	];
	// When
	const taken = addresses.map(isWebAddress);
	// Then
	expect(taken).toEqual([true, true, false, false, false, false, false]);
});

test("takes the host of an address without www", () => {
	// Given
	const addresses = ["https://www.zara.com/vn/en/a.html", "https://cos.com/a"];
	// When
	const hosts = addresses.map(shopLinkHost);
	// Then
	expect(hosts).toEqual(["zara.com", "cos.com"]);
});

test("names a shop link by its brand, else its host, else its address", () => {
	// Given
	const links = [
		link(null, "https://cos.com/a", "COS"),
		link(null, "https://www.zara.com/b"),
		link(null, "javascript:alert(1)"),
	];
	// When
	const names = links.map(shopName);
	// Then
	expect(names).toEqual(["COS", "zara.com", "javascript:alert(1)"]);
});

test("says how many shop links go with a wish", () => {
	// Given
	const counts = [0, 1, 2];
	// When
	const texts = counts.map(removeWishText);
	// Then
	expect(texts).toEqual([
		"It has no shop link.",
		"Its 1 shop link goes with it.",
		"Its 2 shop links go with it.",
	]);
});
