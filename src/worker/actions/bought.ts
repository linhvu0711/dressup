import { z } from "zod";
import { QUANTITY_MAX } from "@/closet/owned-item";
import { type BoughtError, buyShopLink } from "../owned-item-store";
import { action, type Refusals, serverError } from "./action";
import { ownedItemLimit } from "./owned-items";

const boughtRefusals: Refusals<BoughtError> = {
	not_found: () => ({
		status: 404,
		body: { error: "not_found" },
		text: "No shop link with this id.",
	}),
	owned_item_limit: ownedItemLimit,
	quantity_limit: () => ({
		status: 409,
		body: { error: "quantity_limit" },
		text: `You have ${QUANTITY_MAX} of this item. That is the limit.`,
	}),
	conflict: () => ({
		status: 409,
		body: { error: "conflict", field: "id" },
		text: serverError,
	}),
};

export const boughtActions = {
	buy: action(
		z.object({ id: z.string().describe("The shop link's id.") }),
		boughtRefusals,
		({ db, pictures, userId }, { id }) => buyShopLink(db, pictures, userId, id),
	),
};
