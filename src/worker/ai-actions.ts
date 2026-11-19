import type {
	CallToolResult,
	McpServer,
	ToolAnnotations,
} from "@modelcontextprotocol/server";
import { z } from "zod";
import {
	OWNED_ITEM_LIMIT,
	type OwnedItem,
	QUANTITY_MAX,
} from "@/closet/owned-item";
import {
	COMBINATION_LIMIT,
	COMBINATION_TAGS_MAX,
	type Combination,
	combinationTitle,
} from "@/combinations/combination";
import { LAYER_OF, TYPE_IDS, TYPE_NAMES } from "@/dress/clothing-types";
import { BRAND_LIMIT, BRAND_NAME_MAX, type BrandId } from "@/labels/brand";
import { COLOUR_LIMIT, COLOUR_NAME_MAX, type ColourId } from "@/labels/colour";
import {
	filterSize,
	matchesPieceFilter,
	NO_FILTER,
	ownedItemPiece,
	type PieceFilter,
	wishPiece,
} from "@/piece-filter/piece-filter";
import { TAG_NAME_MAX, type Tag } from "@/tags/tag";
import { SHOP_LINK_LIMIT, WISH_LIMIT } from "@/wishlist/wish";
import { countAiAction } from "./ai-action-store";
import {
	brandRefusalText,
	colourRefusalText,
	combinationRefusalText,
	noBrands,
	noColours,
	noCombinations,
	noCombinationsMatch,
	noOwnedItemMatch,
	noOwnedItems,
	noTags,
	notAType,
	notYourBrand,
	notYourColour,
	noWishes,
	noWishMatch,
	ownedItemRefusalText,
	serverError,
	tagRefusalText,
	tooManyActions,
	wishRefusalText,
} from "./ai-messages";
import { addBrand, deleteBrand, listBrands, renameBrand } from "./brand-store";
import {
	addColour,
	changeColour,
	deleteColour,
	listColours,
} from "./colour-store";
import {
	changeCombination,
	deleteCombination,
	findCombinations,
	saveCombination,
} from "./combination-store";
import type { Db } from "./db";
import {
	addOwnedItem,
	changeOwnedItem,
	deleteOwnedItem,
	listOwnedItems,
} from "./owned-item-store";
import { addTag, deleteTag, listTags, renameTag } from "./tag-store";
import {
	addShopLink,
	addWish,
	changeShopLink,
	deleteShopLink,
	deleteWish,
	listWishes,
} from "./wish-store";

type Account = { db: Db; pictures: R2Bucket; userId: string };

const READ: ToolAnnotations = { readOnlyHint: true };
const WRITE: ToolAnnotations = { readOnlyHint: false, destructiveHint: false };
const DELETE: ToolAnnotations = { readOnlyHint: false, destructiveHint: true };

const refusal = (text: string): CallToolResult => ({
	content: [{ type: "text", text }],
	isError: true,
});

const answer = (
	data: Record<string, unknown>,
	text = JSON.stringify(data),
): CallToolResult => ({
	content: [{ type: "text", text }],
	structuredContent: data,
});

// AI apps cannot add or read pictures, so an item shows only how many it has.
const ownedItemView = ({ pictureIds, ...item }: OwnedItem) => ({
	...item,
	pictureCount: pictureIds.length,
});

const combinationView = (combination: Combination, tags: Tag[]) => ({
	id: combination.id,
	title: combinationTitle(combination),
	open: combination.open,
	pieces: combination.pieces.map((p) => ({
		layer: p.layer,
		typeId: p.typeId,
		type: TYPE_NAMES[p.typeId],
		colour: p.colour,
	})),
	tags: tags
		.filter((t) => combination.tags.includes(t.id))
		.map(({ id, name }) => ({ id, name })),
});

const noArgs = z.object({});

const field = {
	tags: z.array(z.string()).describe("Tag ids."),
	types: z
		.array(z.string())
		.optional()
		.describe("Type ids from list_types. A piece of any of them matches."),
	colourIds: z
		.array(z.string())
		.optional()
		.describe("Colour ids from list_colours. A piece in any of them matches."),
	brandIds: z
		.array(z.string().nullable())
		.optional()
		.describe(
			"Brand ids from list_brands, and null for no brand. Any of them matches.",
		),
	pieces: z.array(
		z.object({
			typeId: z.string().describe("A type id from list_types, such as tee_l."),
			colourId: z.string().describe("A colour id from list_colours."),
		}),
	),
};

// Loose strings on purpose, as the add tools: a type or an id that is not one
// must reach filterOf to get a sentence.
const pieceFilterArgs = z.object({
	types: field.types,
	colourIds: field.colourIds,
	brandIds: field.brandIds,
});

const filterRule =
	"Filters are optional. Inside one filter any pick matches; an item must fit every filter given.";

export function registerAiActions(server: McpServer, account: Account) {
	const { db, pictures, userId } = account;

	// An unknown value is refused, not left out: a list from a wrong id would
	// read as a true answer.
	async function filterOf(
		args: z.output<typeof pieceFilterArgs>,
	): Promise<{ ok: true; filter: PieceFilter } | { ok: false; text: string }> {
		const { types = [], colourIds = [], brandIds = [] } = args;
		const badType = types.find(
			(t) => !(TYPE_IDS as readonly string[]).includes(t),
		);
		if (badType !== undefined) return { ok: false, text: notAType(badType) };
		if (colourIds.length > 0) {
			const colours = await listColours(db, userId);
			const bad = colourIds.find((id) => !colours.some((c) => c.id === id));
			if (bad !== undefined) return { ok: false, text: notYourColour(bad) };
		}
		if (brandIds.some((id) => id !== null)) {
			const brands = await listBrands(db, userId);
			const bad = brandIds.find(
				(id) => id !== null && !brands.some((b) => b.id === id),
			);
			if (bad !== undefined && bad !== null)
				return { ok: false, text: notYourBrand(bad) };
		}
		return {
			ok: true,
			filter: {
				...NO_FILTER,
				types: types as PieceFilter["types"],
				colours: colourIds as ColourId[],
				brands: brandIds as (BrandId | null)[],
			},
		};
	}

	function tool<S extends z.ZodObject>(
		name: string,
		config: {
			title: string;
			description: string;
			annotations: ToolAnnotations;
			inputSchema: S;
		},
		run: (args: z.output<S>) => Promise<CallToolResult>,
	) {
		const inputSchema: z.ZodObject = config.inputSchema;
		server.registerTool(name, { ...config, inputSchema }, async (args) => {
			try {
				if (!(await countAiAction(db, userId))) return refusal(tooManyActions);
				return await run(args as z.output<S>);
			} catch {
				// The SDK would send the error's own message to the AI app
				// (@modelcontextprotocol/server mcp-oHn3ureC.mjs:1617-1621).
				return refusal(serverError);
			}
		});
	}

	tool(
		"list_tags",
		{
			title: "List tags",
			description:
				"The tags, in the order they were made, each with combinations, the number of combinations that carry it.",
			annotations: READ,
			inputSchema: noArgs,
		},
		async () => {
			const tags = await listTags(db, userId);
			return tags.length === 0 ? answer({ tags }, noTags) : answer({ tags });
		},
	);

	tool(
		"add_tag",
		{
			title: "Add a tag",
			description: `Adds a tag. A name has 1 to ${TAG_NAME_MAX} characters, and each name is used once.`,
			annotations: WRITE,
			inputSchema: z.object({ name: z.string().describe("The tag's name.") }),
		},
		async ({ name }) => {
			const added = await addTag(db, userId, name);
			return added.ok
				? answer({ tag: added.value })
				: refusal(tagRefusalText(added.error));
		},
	);

	tool(
		"rename_tag",
		{
			title: "Rename a tag",
			description: "Renames a tag. Its combinations keep it.",
			annotations: WRITE,
			inputSchema: z.object({
				id: z.string().describe("The tag's id."),
				name: z.string().describe("The tag's new name."),
			}),
		},
		async ({ id, name }) => {
			const renamed = await renameTag(db, userId, id, name);
			return renamed.ok
				? answer({ tag: renamed.value })
				: refusal(tagRefusalText(renamed.error));
		},
	);

	tool(
		"delete_tag",
		{
			title: "Delete a tag",
			description:
				"Deletes a tag and takes it off every combination. The combinations stay.",
			annotations: DELETE,
			inputSchema: z.object({ id: z.string().describe("The tag's id.") }),
		},
		async ({ id }) => {
			const deleted = await deleteTag(db, userId, id);
			return deleted.ok
				? answer({ deleted: deleted.value.id })
				: refusal(tagRefusalText(deleted.error));
		},
	);

	const colourRules = `A name has 1 to ${COLOUR_NAME_MAX} characters, and each name is used once in any letter case. A code is #RRGGBB in capital letters, such as #1F3A5F. An account has at most ${COLOUR_LIMIT} colours.`;

	tool(
		"list_colours",
		{
			title: "List the colours",
			description:
				"The account's colours, in the order they were added. A new account starts with 13. A colour with inUse true is in a combination or the closet and cannot be deleted.",
			annotations: READ,
			inputSchema: noArgs,
		},
		async () => {
			const colours = await listColours(db, userId);
			return colours.length === 0
				? answer({ colours }, noColours)
				: answer({ colours });
		},
	);

	tool(
		"add_colour",
		{
			title: "Add a colour",
			description: `Adds a colour. ${colourRules}`,
			annotations: WRITE,
			inputSchema: z.object({
				name: z.string().describe("The colour's name."),
				hex: z.string().describe("The colour code, as #1F3A5F."),
			}),
		},
		async (input) => {
			const added = await addColour(db, userId, input);
			return added.ok
				? answer({ colour: added.value })
				: refusal(colourRefusalText(added.error));
		},
	);

	tool(
		"change_colour",
		{
			title: "Change a colour",
			description: `Changes a colour's name, code, or both. ${colourRules}`,
			annotations: WRITE,
			inputSchema: z.object({
				id: z.string().describe("The colour's id."),
				name: z.string().describe("The colour's new name."),
				hex: z.string().describe("The colour's new code, as #1F3A5F."),
			}),
		},
		async ({ id, ...input }) => {
			const changed = await changeColour(db, userId, id, input);
			return changed.ok
				? answer({ colour: changed.value })
				: refusal(colourRefusalText(changed.error));
		},
	);

	tool(
		"delete_colour",
		{
			title: "Delete a colour",
			description: "Deletes a colour for good.",
			annotations: DELETE,
			inputSchema: z.object({ id: z.string().describe("The colour's id.") }),
		},
		async ({ id }) => {
			const deleted = await deleteColour(db, userId, id);
			return deleted.ok
				? answer({ deleted: deleted.value.id })
				: refusal(colourRefusalText(deleted.error));
		},
	);

	const brandRules = `A name has 1 to ${BRAND_NAME_MAX} characters, and each name is used once in any letter case. An account has at most ${BRAND_LIMIT} brands.`;

	tool(
		"list_brands",
		{
			title: "List the brands",
			description: "The account's brands, A to Z. A new account has none.",
			annotations: READ,
			inputSchema: noArgs,
		},
		async () => {
			const brands = await listBrands(db, userId);
			return brands.length === 0
				? answer({ brands }, noBrands)
				: answer({ brands });
		},
	);

	tool(
		"add_brand",
		{
			title: "Add a brand",
			description: `Adds a brand. ${brandRules}`,
			annotations: WRITE,
			inputSchema: z.object({
				name: z.string().describe("The brand's name."),
			}),
		},
		async ({ name }) => {
			const added = await addBrand(db, userId, name);
			return added.ok
				? answer({ brand: added.value })
				: refusal(brandRefusalText(added.error));
		},
	);

	tool(
		"rename_brand",
		{
			title: "Rename a brand",
			description: `Renames a brand. ${brandRules}`,
			annotations: WRITE,
			inputSchema: z.object({
				id: z.string().describe("The brand's id."),
				name: z.string().describe("The brand's new name."),
			}),
		},
		async ({ id, name }) => {
			const renamed = await renameBrand(db, userId, id, name);
			return renamed.ok
				? answer({ brand: renamed.value })
				: refusal(brandRefusalText(renamed.error));
		},
	);

	tool(
		"delete_brand",
		{
			title: "Delete a brand",
			description: "Deletes a brand for good.",
			annotations: DELETE,
			inputSchema: z.object({ id: z.string().describe("The brand's id.") }),
		},
		async ({ id }) => {
			const deleted = await deleteBrand(db, userId, id);
			return deleted.ok
				? answer({ deleted: deleted.value.id })
				: refusal(brandRefusalText(deleted.error));
		},
	);

	tool(
		"list_types",
		{
			title: "List the types",
			description:
				"The 17 types of clothing a combination picks from, each with its layer: bottom, inner_top, sweater, or jacket. A combination has at most one piece for each layer.",
			annotations: READ,
			inputSchema: noArgs,
		},
		async () =>
			answer({
				types: TYPE_IDS.map((id) => ({
					id,
					name: TYPE_NAMES[id],
					layer: LAYER_OF[id],
				})),
			}),
	);

	tool(
		"list_combinations",
		{
			title: "List the combinations",
			description:
				"The account's saved combinations, newest first, each with its title, its pieces, whether its jacket is open, and its tags. pieces and tags narrow the list: a combination must match every piece row and carry every tag.",
			annotations: READ,
			inputSchema: z.object({
				pieces: z
					.array(
						z.object({
							typeId: z
								.string()
								.optional()
								.describe("A type id from list_types, such as tee_s."),
							colourId: z
								.string()
								.optional()
								.describe("A colour id from list_colours."),
						}),
					)
					.optional()
					.describe(
						"Piece rows. A combination is listed when, for each row, one of its pieces has the row's type and colour; a row may give only one of the two.",
					),
				tags: field.tags
					.optional()
					.describe(
						"Tag ids from list_tags. A combination is listed when it carries every one.",
					),
			}),
		},
		async ({ pieces = [], tags: tagIds = [] }) => {
			const [found, tags] = await Promise.all([
				findCombinations(db, userId, { pieces, tags: tagIds }),
				listTags(db, userId),
			]);
			if (!found.ok) return refusal(combinationRefusalText(found.error));
			const combinations = found.value.map((c) => combinationView(c, tags));
			if (combinations.length > 0) return answer({ combinations });
			const filtered = pieces.length > 0 || tagIds.length > 0;
			return answer(
				{ combinations },
				filtered ? noCombinationsMatch : noCombinations,
			);
		},
	);

	tool(
		"save_combination",
		{
			title: "Save a combination",
			description: `Saves a combination of 2 to 4 pieces, at most one for each layer. A piece is a type id from list_types and a colour id from list_colours. An account keeps each combination once and at most ${COMBINATION_LIMIT} combinations. tags is a list of tag ids from list_tags; each must be one of your tags, at most ${COMBINATION_TAGS_MAX}.`,
			annotations: WRITE,
			inputSchema: z.object({
				pieces: field.pieces,
				open: z
					.boolean()
					.optional()
					.describe(
						"The jacket is open. Only for a combination with a jacket.",
					),
				tags: field.tags.optional(),
			}),
		},
		async ({ pieces, open = false, tags = [] }) => {
			// The server makes the id, so a save sent twice makes two combinations.
			const saved = await saveCombination(db, userId, {
				id: crypto.randomUUID(),
				pieces,
				open,
				tags,
			});
			if (!saved.ok) return refusal(combinationRefusalText(saved.error));
			return answer({
				combination: combinationView(
					saved.value.combination,
					await listTags(db, userId),
				),
			});
		},
	);

	tool(
		"change_combination",
		{
			title: "Change a combination",
			description:
				"Changes a saved combination's pieces. The pieces given replace all of its pieces: 2 to 4, at most one for each layer. It keeps its id and its place in the list. open sets the jacket state; left out, it stays. tags given replace its tags; left out, they stay.",
			annotations: WRITE,
			inputSchema: z.object({
				id: z.string().describe("The combination's id."),
				pieces: field.pieces,
				open: z
					.boolean()
					.optional()
					.describe(
						"The jacket is open. Only for a combination with a jacket. Left out, the jacket state stays.",
					),
				tags: field.tags.optional(),
			}),
		},
		async ({ id, pieces, open, tags }) => {
			const changed = await changeCombination(db, userId, id, {
				pieces,
				open,
				tags,
			});
			if (!changed.ok) return refusal(combinationRefusalText(changed.error));
			return answer({
				combination: combinationView(changed.value, await listTags(db, userId)),
			});
		},
	);

	tool(
		"delete_combination",
		{
			title: "Delete a combination",
			description: "Deletes a saved combination for good.",
			annotations: DELETE,
			inputSchema: z.object({
				id: z.string().describe("The combination's id."),
			}),
		},
		async ({ id }) => {
			const deleted = await deleteCombination(db, userId, id);
			return deleted.ok
				? answer({ deleted: id })
				: refusal(combinationRefusalText(deleted.error));
		},
	);

	tool(
		"list_owned_items",
		{
			title: "List the closet",
			description: `The account's owned items, newest first. An owned item is one brand of one piece (a type in a colour) with a quantity of 1 to ${QUANTITY_MAX}. An account holds at most ${OWNED_ITEM_LIMIT}. Each item has pictureCount, the number of its pictures. AI apps cannot add or read pictures. ${filterRule}`,
			annotations: READ,
			inputSchema: pieceFilterArgs,
		},
		async (args) => {
			const picked = await filterOf(args);
			if (!picked.ok) return refusal(picked.text);
			const ownedItems = (await listOwnedItems(db, userId)).filter((item) =>
				matchesPieceFilter(picked.filter, ownedItemPiece(item)),
			);
			if (ownedItems.length > 0)
				return answer({ ownedItems: ownedItems.map(ownedItemView) });
			return answer(
				{ ownedItems },
				filterSize(picked.filter) > 0 ? noOwnedItemMatch : noOwnedItems,
			);
		},
	);

	// Loose types on purpose: a quantity of 0 must reach the store to get a
	// sentence, since the SDK's own schema error is not one.
	tool(
		"add_owned_item",
		{
			title: "Add to the closet",
			description: `Adds one brand of one piece to the closet, with a quantity. The account has each piece and brand once, and at most ${OWNED_ITEM_LIMIT} items.`,
			annotations: WRITE,
			inputSchema: z.object({
				typeId: z
					.string()
					.describe("A type id from list_types, such as shirt_l."),
				colourId: z.string().describe("A colour id from list_colours."),
				brandId: z
					.string()
					.nullable()
					.optional()
					.describe("A brand id from list_brands. Leave it out for no brand."),
				quantity: z
					.number()
					.describe(`How many the account owns, 1 to ${QUANTITY_MAX}.`),
			}),
		},
		async ({ typeId, colourId, brandId = null, quantity }) => {
			// The server makes the id, as save_combination does.
			const added = await addOwnedItem(db, pictures, userId, {
				id: crypto.randomUUID(),
				typeId,
				colourId,
				brandId,
				quantity,
			});
			return added.ok
				? answer({ ownedItem: ownedItemView(added.value.ownedItem) })
				: refusal(ownedItemRefusalText(added.error));
		},
	);

	tool(
		"change_owned_item",
		{
			title: "Change an owned item",
			description:
				"Changes the brand and the quantity of an owned item. Its piece stays.",
			annotations: WRITE,
			inputSchema: z.object({
				id: z.string().describe("The owned item's id."),
				brandId: z
					.string()
					.nullable()
					.describe("A brand id from list_brands, or null for no brand."),
				quantity: z
					.number()
					.describe(`How many the account owns, 1 to ${QUANTITY_MAX}.`),
			}),
		},
		async ({ id, brandId, quantity }) => {
			const changed = await changeOwnedItem(db, pictures, userId, id, {
				brandId,
				quantity,
			});
			return changed.ok
				? answer({ ownedItem: ownedItemView(changed.value) })
				: refusal(ownedItemRefusalText(changed.error));
		},
	);

	tool(
		"delete_owned_item",
		{
			title: "Delete an owned item",
			description: "Deletes an owned item from the closet for good.",
			annotations: DELETE,
			inputSchema: z.object({
				id: z.string().describe("The owned item's id."),
			}),
		},
		async ({ id }) => {
			const deleted = await deleteOwnedItem(db, pictures, userId, id);
			return deleted.ok
				? answer({ deleted: deleted.value })
				: refusal(ownedItemRefusalText(deleted.error));
		},
	);

	tool(
		"list_wishes",
		{
			title: "List the wishlist",
			description: `The account's wishes, newest first, each with its shop links. A wish is one piece (a type in a colour) the account wants to buy. An account holds at most ${WISH_LIMIT} wishes, and a wish at most ${SHOP_LINK_LIMIT} shop links. ${filterRule} The brand of a wish is the brand of any of its shop links, so a wish with no link fits no brand filter.`,
			annotations: READ,
			inputSchema: pieceFilterArgs,
		},
		async (args) => {
			const picked = await filterOf(args);
			if (!picked.ok) return refusal(picked.text);
			const wishes = (await listWishes(db, userId)).filter((wish) =>
				matchesPieceFilter(picked.filter, wishPiece(wish)),
			);
			if (wishes.length > 0) return answer({ wishes });
			return answer(
				{ wishes },
				filterSize(picked.filter) > 0 ? noWishMatch : noWishes,
			);
		},
	);

	tool(
		"add_wish",
		{
			title: "Add to the wishlist",
			description: `Adds a wish for one piece. The account has each piece once on the wishlist, and at most ${WISH_LIMIT} wishes.`,
			annotations: WRITE,
			inputSchema: z.object({
				typeId: z.string().describe("A type id from list_types, such as wool."),
				colourId: z.string().describe("A colour id from list_colours."),
			}),
		},
		async ({ typeId, colourId }) => {
			// The server makes the id, as add_owned_item does.
			const added = await addWish(db, userId, {
				id: crypto.randomUUID(),
				typeId,
				colourId,
			});
			return added.ok
				? answer({ wish: added.value.wish })
				: refusal(wishRefusalText(added.error, "wish"));
		},
	);

	tool(
		"delete_wish",
		{
			title: "Remove a wish",
			description: "Removes a wish and its shop links for good.",
			annotations: DELETE,
			inputSchema: z.object({ id: z.string().describe("The wish's id.") }),
		},
		async ({ id }) => {
			const deleted = await deleteWish(db, userId, id);
			return deleted.ok
				? answer({ deleted: deleted.value })
				: refusal(wishRefusalText(deleted.error, "wish"));
		},
	);

	// Loose types on purpose, as add_owned_item: a bad price must reach the
	// store to get a sentence.
	const shopLinkFields = {
		url: z.string().describe("The shop's web address, starting with https://."),
		brandId: z
			.string()
			.nullable()
			.optional()
			.describe("A brand id from list_brands. Leave it out for no brand."),
		name: z.string().describe("The shop's name for the piece."),
		price: z
			.number()
			.nullable()
			.optional()
			.describe("The price in whole VND. Leave it out for no price."),
	};

	tool(
		"add_shop_link",
		{
			title: "Add a shop link",
			description: `Adds a shop that sells the piece of a wish, with its brand, name, and price in VND. A wish holds at most ${SHOP_LINK_LIMIT} shop links. Answers the whole wish.`,
			annotations: WRITE,
			inputSchema: z.object({
				wishId: z.string().describe("The wish's id."),
				...shopLinkFields,
			}),
		},
		async ({ wishId, url, brandId = null, name, price = null }) => {
			const added = await addShopLink(db, userId, wishId, {
				id: crypto.randomUUID(),
				url,
				brandId,
				name,
				price,
			});
			return added.ok
				? answer({ wish: added.value.wish })
				: refusal(wishRefusalText(added.error, "wish"));
		},
	);

	tool(
		"change_shop_link",
		{
			title: "Change a shop link",
			description:
				"Writes the whole shop link: its address, brand, name, and price. Answers the whole wish.",
			annotations: WRITE,
			inputSchema: z.object({
				id: z.string().describe("The shop link's id."),
				...shopLinkFields,
			}),
		},
		async ({ id, url, brandId = null, name, price = null }) => {
			const changed = await changeShopLink(db, userId, id, {
				url,
				brandId,
				name,
				price,
			});
			return changed.ok
				? answer({ wish: changed.value })
				: refusal(wishRefusalText(changed.error, "shop link"));
		},
	);

	tool(
		"delete_shop_link",
		{
			title: "Delete a shop link",
			description: "Deletes a shop link from its wish for good.",
			annotations: DELETE,
			inputSchema: z.object({
				id: z.string().describe("The shop link's id."),
			}),
		},
		async ({ id }) => {
			const deleted = await deleteShopLink(db, userId, id);
			return deleted.ok
				? answer({ deleted: deleted.value })
				: refusal(wishRefusalText(deleted.error, "shop link"));
		},
	);
}
