import { OWNED_ITEM_LIMIT, QUANTITY_MAX } from "@/closet/owned-item";
import { ACCOUNT_PICTURE_LIMIT, ITEM_PICTURE_LIMIT } from "@/pictures/picture";
import { PRICE_MAX, SHOP_LINK_LIMIT, WISH_LIMIT } from "@/wishlist/wish";
import { notAType, notYourColour, serverError } from "./actions/action";
import type { BoughtError, OwnedItemError } from "./owned-item-store";
import { UPLOAD_ADDRESS_AGE_MS } from "./upload-address-store";
import type { WishError } from "./wish-store";

// Every refusal an AI app gets names the value it sent and what is allowed,
// so the AI app can fix its call and try again.

// The sentence for one bad field of an owned item, with the value sent.
function ownedItemFieldText(
	error: Extract<OwnedItemError, { code: "invalid" }>,
): string {
	switch (error.field) {
		case "quantity":
			return `Quantity is a whole number from 1 to ${QUANTITY_MAX}.`;
		case "typeId":
			return notAType(error.value);
		case "colourId":
			return notYourColour(error.value);
		case "brandId":
			return notYourBrand(error.value);
		case "pictureIds":
			return "pictureIds holds an id that is not your upload or a picture of this item. list_owned_items names the item's pictures; get_upload_address gives a new upload.";
		case "id":
		case "body":
			return serverError;
	}
}

export function ownedItemRefusalText(error: OwnedItemError): string {
	switch (error.code) {
		case "invalid":
			return ownedItemFieldText(error);
		case "duplicate":
			return "You have this item already. Change its number.";
		case "owned_item_limit":
			return `You have ${OWNED_ITEM_LIMIT} items. That is the limit. Delete one to add a new one.`;
		case "picture_limit":
			return `An owned item has at most ${ITEM_PICTURE_LIMIT} pictures.`;
		case "not_found":
			return "No owned item with this id.";
		case "conflict":
			return serverError;
	}
}

export function boughtRefusalText(error: BoughtError): string {
	switch (error.code) {
		case "not_found":
			return "No shop link with this id.";
		case "owned_item_limit":
			return `You have ${OWNED_ITEM_LIMIT} items. That is the limit. Delete one to add a new one.`;
		case "quantity_limit":
			return `You have ${QUANTITY_MAX} of this item. That is the limit.`;
		case "conflict":
			return serverError;
	}
}

// The sentence for one bad field of a wish or a shop link, with the value
// sent.
function wishFieldText(error: Extract<WishError, { code: "invalid" }>): string {
	switch (error.field) {
		case "url":
			return "Enter a web address that starts with https://.";
		case "name":
			return "Enter a name.";
		case "price":
			return `Price is a whole number of VND from 1 to ${new Intl.NumberFormat("vi-VN").format(PRICE_MAX)}.`;
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

// One tool acts on a wish or on a shop link; `subject` says which an id that
// is not found names.
export function wishRefusalText(
	error: WishError,
	subject: "wish" | "shop link",
): string {
	switch (error.code) {
		case "invalid":
			return wishFieldText(error);
		case "duplicate":
			return "You have this wish already.";
		case "wish_limit":
			return `You have ${WISH_LIMIT} wishes. That is the limit. Delete one to add a new one.`;
		case "shop_link_limit":
			return `${SHOP_LINK_LIMIT} shop links is the limit for one wish.`;
		case "picture_limit":
			return `A shop link has at most ${ITEM_PICTURE_LIMIT} pictures.`;
		case "not_found":
			return `No ${subject} with this id.`;
		case "conflict":
			return serverError;
	}
}

export const tooManyActions = "Too many actions. Wait a minute and try again.";

export const addressGone =
	"This upload address was used or has expired. get_upload_address gives a new one.";

export const notAPicture =
	"This file is not a JPEG, PNG, or WebP picture. Send one of these to a new upload address.";

export const tooLargeUpload =
	"This picture is over 1 MB. Shrink it to 1 MB or less and send it to a new upload address.";

export const accountPictureLimit = `You have ${ACCOUNT_PICTURE_LIMIT.toLocaleString("en")} pictures. That is the limit. Take pictures off an owned item or a shop link to add new ones.`;

// The web app's words, src/react-app/pictures/PictureSlots.tsx.
export const storageFull = "Picture storage is full. No new pictures for now.";

export const notStored =
	"dressup could not store the picture and kept nothing. Try again with a new upload address.";

export const uploadAddressText = (address: string) =>
	`Send the picture within ${UPLOAD_ADDRESS_AGE_MS / 60_000} minutes, once: curl -X POST --data-binary @photo.jpg ${address}. It answers with the picture's id.`;

export const noPicture = "No picture with this id.";

export const noTags = "You have no tags yet.";

export const noColours = "You have no colours yet.";

export const noCombinations = "You have no combinations yet.";

export const noCombinationsMatch = "No combination matches these filters.";

export const noBrands = "You have no brands yet.";

export const notYourBrand = (value: unknown) =>
	`${value} is not one of your brands. list_brands names them.`;

export const noOwnedItems = "Nothing in your closet yet.";

export const noOwnedItemMatch = "No owned item matches the filter.";

export const noWishes = "Nothing on your wishlist yet.";

export const noWishMatch = "No wish matches the filter.";
