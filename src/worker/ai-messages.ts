import { OWNED_ITEM_LIMIT, QUANTITY_MAX } from "@/closet/owned-item";
import { ACCOUNT_PICTURE_LIMIT } from "@/pictures/picture";
import { serverError } from "./actions/action";
import type { BoughtError } from "./owned-item-store";
import { UPLOAD_ADDRESS_AGE_MS } from "./upload-address-store";

// Every refusal an AI app gets names the value it sent and what is allowed,
// so the AI app can fix its call and try again.

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

export const noOwnedItems = "Nothing in your closet yet.";

export const noOwnedItemMatch = "No owned item matches the filter.";

export const noWishes = "Nothing on your wishlist yet.";

export const noWishMatch = "No wish matches the filter.";
