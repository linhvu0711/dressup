import { z } from "zod";
import { BRAND_LIMIT, BRAND_NAME_MAX } from "@/labels/brand";
import {
	addBrand,
	type BrandError,
	deleteBrand,
	renameBrand,
} from "../brand-store";
import { action, type Refusals } from "./action";

// A taken name is 409, as for colours.
const brandRefusals: Refusals<BrandError> = {
	invalid: () => ({
		status: 400,
		body: { error: "invalid", field: "name" },
		text: `A brand name has 1 to ${BRAND_NAME_MAX} characters.`,
	}),
	duplicate: (error) => ({
		status: 409,
		body: { error: "duplicate", field: "name" },
		text: `You already have a brand called ${error.name}.`,
	}),
	brand_limit: () => ({
		status: 409,
		body: { error: "brand_limit" },
		text: `You have ${BRAND_LIMIT} brands. That is the limit. Delete one to add a new one.`,
	}),
	not_found: () => ({
		status: 404,
		body: { error: "not_found" },
		text: "No brand with this id.",
	}),
};

export const brandActions = {
	add: action(
		z.object({ name: z.string().describe("The brand's name.") }),
		brandRefusals,
		({ db, userId }, { name }) => addBrand(db, userId, name),
	),
	rename: action(
		z.object({
			id: z.string().describe("The brand's id."),
			name: z.string().describe("The brand's new name."),
		}),
		brandRefusals,
		({ db, userId }, { id, name }) => renameBrand(db, userId, id, name),
	),
	delete: action(
		z.object({ id: z.string().describe("The brand's id.") }),
		brandRefusals,
		({ db, userId }, { id }) => deleteBrand(db, userId, id),
	),
};
