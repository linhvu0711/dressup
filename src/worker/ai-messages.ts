import { UPLOAD_ADDRESS_AGE_MS } from "./upload-address-store";

// Every refusal an AI app gets names the value it sent and what is allowed,
// so the AI app can fix its call and try again.

export const tooManyActions = "Too many actions. Wait a minute and try again.";

export const uploadAddressText = (address: string) =>
	`Send the picture within ${UPLOAD_ADDRESS_AGE_MS / 60_000} minutes, once: curl -X POST --data-binary @photo.jpg ${address}. It answers with the picture's id.`;

export const noTags = "You have no tags yet.";

export const noColours = "You have no colours yet.";

export const noCombinations = "You have no combinations yet.";

export const noCombinationsMatch = "No combination matches these filters.";

export const noBrands = "You have no brands yet.";

export const noOwnedItems = "Nothing in your closet yet.";

export const noOwnedItemMatch = "No owned item matches the filter.";

export const noWishes = "Nothing on your wishlist yet.";

export const noWishMatch = "No wish matches the filter.";
