import { expect, test } from "bun:test";
import type { BrandId } from "@/labels/brand";
import type { ColourId } from "@/labels/colour";
import {
	isWebAddress,
	pageAfterAdd,
	removeLinkText,
	removeWishText,
	type ShopLink,
	type ShopLinkId,
	shopLinkHost,
	shopName,
	type Wish,
	type WishId,
	wishlistCards,
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

test("makes one card for each shop link and one for each wish with no link", () => {
	// Given
	const withId = (l: ShopLink, id: string): ShopLink => ({
		...l,
		id: id as ShopLinkId,
	});
	const wishes = [
		{ ...wishWith([]), id: "wish-a" as WishId },
		{
			...wishWith([withId(link(null), "link-1"), withId(link(null), "link-2")]),
			id: "wish-b" as WishId,
		},
	];
	// When
	const cards = wishlistCards(wishes).map(
		(card) => `${card.wish.id}:${card.link?.id ?? "none"}`,
	);
	// Then
	expect(cards).toEqual(["wish-a:none", "wish-b:link-1", "wish-b:link-2"]);
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

test("says what goes with a removed shop link", () => {
	// Given: a last link and a link with others
	// When
	const texts = [removeLinkText(true), removeLinkText(false)];
	// Then
	expect(texts).toEqual([
		"This is the last shop link, so the wish goes too.",
		"Only this shop link goes. The wish keeps its other shop links.",
	]);
});

test("opens the sent link's page, else the wish's newest link, else the wish", () => {
	// Given
	const withId = (l: ShopLink, id: string): ShopLink => ({
		...l,
		id: id as ShopLinkId,
	});
	const a = {
		...wishWith([withId(link(null), "link-1"), withId(link(null), "link-2")]),
		id: "wish-a" as WishId,
	};
	const b = { ...wishWith([]), id: "wish-b" as WishId };
	// When
	const pages = [
		pageAfterAdd(a, "link-9" as ShopLinkId),
		pageAfterAdd(a, null),
		pageAfterAdd(b, null),
	];
	// Then
	expect(pages).toEqual([
		"/wishlist/link/link-9",
		"/wishlist/link/link-2",
		"/wishlist/wish/wish-b",
	]);
});
