import { z } from "zod";
import { ITEM_PICTURE_LIMIT } from "@/pictures/picture";
import { matchesPieceFilter, wishPiece } from "@/piece-filter/piece-filter";
import { SHOP_LINK_LIMIT, WISH_LIMIT } from "@/wishlist/wish";
import {
	addShopLink,
	addToWishlist,
	addWish,
	changeShopLink,
	deleteShopLink,
	deleteWish,
	listWishes,
	type WishError,
} from "../wish-store";
import {
	action,
	notAPrice,
	notAType,
	notYourBrand,
	notYourColour,
	type Refusals,
	serverError,
} from "./action";
import { pictureIdsInput } from "./pictures";
import {
	pieceFilterInput,
	pieceFilterOf,
	pieceFilterRefusals,
} from "./piece-filter";

// The sentence for one bad field of a wish or a shop link, with the value
// sent.
function fieldText(error: Extract<WishError, { code: "invalid" }>): string {
	switch (error.field) {
		case "url":
			return "Enter a web address that starts with https://.";
		case "name":
			return "Enter a name.";
		case "price":
			return notAPrice;
		case "typeId":
			return notAType(error.value);
		case "colourId":
			return notYourColour(error.value);
		case "brandId":
			return notYourBrand(error.value);
		case "pictureIds":
			return "pictureIds holds an id that is not your upload or a picture of this shop link. list_wishes names the link's pictures; get_upload_address gives a new upload.";
		case "id":
		case "body":
			return serverError;
	}
}

// A shop link add names the wish, so its not_found is the wish's.
const wishRefusals: Refusals<WishError> = {
	invalid: (error) => ({
		status: 400,
		body: { error: "invalid", field: error.field },
		text: fieldText(error),
	}),
	duplicate: (error) => ({
		status: 409,
		body: { error: "duplicate", id: error.id },
		text: "You have this wish already.",
	}),
	wish_limit: () => ({
		status: 409,
		body: { error: "wish_limit" },
		text: `You have ${WISH_LIMIT} wishes. That is the limit. Delete one to add a new one.`,
	}),
	shop_link_limit: () => ({
		status: 409,
		body: { error: "shop_link_limit" },
		text: `${SHOP_LINK_LIMIT} shop links is the limit for one wish.`,
	}),
	picture_limit: () => ({
		status: 409,
		body: { error: "picture_limit" },
		text: `A shop link has at most ${ITEM_PICTURE_LIMIT} pictures.`,
	}),
	conflict: () => ({
		status: 409,
		body: { error: "conflict", field: "id" },
		text: serverError,
	}),
	not_found: () => ({
		status: 404,
		body: { error: "not_found" },
		text: "No wish with this id.",
	}),
};

const shopLinkRefusals: Refusals<WishError> = {
	...wishRefusals,
	not_found: () => ({
		status: 404,
		body: { error: "not_found" },
		text: "No shop link with this id.",
	}),
};

const wishId = z.string().describe("The wish's id.");

const shopLinkId = z.string().describe("The shop link's id.");

// Loose types on purpose, as add_owned_item: a bad price must reach the
// store to get a sentence.
const shopLinkFields = {
	url: z.string().describe("The shop's web address, starting with https://."),
	brandId: z
		.string()
		.nullable()
		.optional()
		.describe(
			"A brand id from list_brands. Leave it out or send null for no brand.",
		),
	name: z.string().describe("The shop's name for the piece."),
	price: z
		.number()
		.nullable()
		.optional()
		.describe("The price in whole VND. Leave it out for no price."),
	pictureIds: pictureIdsInput,
};

const pieceFields = {
	id: wishId,
	typeId: z.string().describe("A type id from list_types, such as wool."),
	colourId: z.string().describe("A colour id from list_colours."),
};

export const wishActions = {
	list: action(pieceFilterInput, pieceFilterRefusals, async (scope, input) => {
		const picked = await pieceFilterOf(scope, input);
		if (!picked.ok) return picked;
		const wishes = await listWishes(scope.db, scope.userId);
		return {
			ok: true,
			value: wishes.filter((wish) =>
				matchesPieceFilter(picked.value, wishPiece(wish)),
			),
		};
	}),
	add: action(z.object(pieceFields), wishRefusals, ({ db, userId }, input) =>
		addWish(db, userId, input),
	),
	addToWishlist: action(
		z.object({
			...pieceFields,
			shopLink: z.object({ id: shopLinkId, ...shopLinkFields }).optional(),
		}),
		wishRefusals,
		({ db, pictures, userId }, { shopLink, ...piece }) =>
			addToWishlist(db, pictures, userId, {
				...piece,
				shopLink: shopLink && {
					...shopLink,
					brandId: shopLink.brandId ?? null,
					price: shopLink.price ?? null,
				},
			}),
	),
	delete: action(
		z.object({ id: wishId }),
		wishRefusals,
		({ db, pictures, userId }, { id }) => deleteWish(db, pictures, userId, id),
	),
};

export const shopLinkActions = {
	add: action(
		z.object({ wishId, id: shopLinkId, ...shopLinkFields }),
		wishRefusals,
		(
			{ db, pictures, userId },
			{ wishId, brandId = null, price = null, ...link },
		) => addShopLink(db, pictures, userId, wishId, { ...link, brandId, price }),
	),
	change: action(
		z.object({ id: shopLinkId, ...shopLinkFields }),
		shopLinkRefusals,
		({ db, pictures, userId }, { id, brandId = null, price = null, ...link }) =>
			changeShopLink(db, pictures, userId, id, { ...link, brandId, price }),
	),
	delete: action(
		z.object({ id: shopLinkId }),
		shopLinkRefusals,
		({ db, pictures, userId }, { id }) =>
			deleteShopLink(db, pictures, userId, id),
	),
};
