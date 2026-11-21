import { Buffer } from "node:buffer";
import type {
	CallToolResult,
	McpServer,
	ToolAnnotations,
} from "@modelcontextprotocol/server";
import { z } from "zod";
import { OWNED_ITEM_LIMIT, QUANTITY_MAX } from "@/closet/owned-item";
import {
	COMBINATION_LIMIT,
	COMBINATION_TAGS_MAX,
	type Combination,
	combinationTitle,
} from "@/combinations/combination";
import { type Holdings, holdingsOf, markOf } from "@/combinations/marks";
import { LAYER_OF, TYPE_IDS, TYPE_NAMES } from "@/dress/clothing-types";
import { BRAND_LIMIT, BRAND_NAME_MAX } from "@/labels/brand";
import { COLOUR_LIMIT, COLOUR_NAME_MAX } from "@/labels/colour";
import { TAG_NAME_MAX, type Tag } from "@/tags/tag";
import { SHOP_LINK_LIMIT, WISH_LIMIT } from "@/wishlist/wish";
import { type ActionScope, serverError } from "./actions/action";
import { boughtActions } from "./actions/bought";
import { brandActions } from "./actions/brands";
import { colourActions } from "./actions/colours";
import { combinationActions } from "./actions/combinations";
import { ownedItemActions } from "./actions/owned-items";
import { tagActions } from "./actions/tags";
import { shopLinkActions, wishActions } from "./actions/wishes";
import { countAiAction } from "./ai-action-store";
import {
	noBrands,
	noColours,
	noCombinations,
	noCombinationsMatch,
	noOwnedItemMatch,
	noOwnedItems,
	noPicture,
	noTags,
	noWishes,
	noWishMatch,
	tooManyActions,
	uploadAddressText,
} from "./ai-messages";
import { listBrands } from "./brand-store";
import { listColours } from "./colour-store";
import type { Db } from "./db";
import { listOwnedPieces } from "./owned-item-store";
import { readPicture } from "./picture-store";
import { listTags } from "./tag-store";
import {
	giveUploadAddress,
	UPLOAD_ADDRESS_AGE_MS,
} from "./upload-address-store";
import { listWishedPieces } from "./wish-store";

type Account = {
	db: Db;
	pictures: R2Bucket;
	userId: string;
	baseURL: string;
};

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

const combinationView = (
	combination: Combination,
	tags: Tag[],
	holdings: Holdings,
) => ({
	id: combination.id,
	title: combinationTitle(combination),
	pieces: combination.pieces.map((p) => ({
		layer: p.layer,
		typeId: p.typeId,
		type: TYPE_NAMES[p.typeId],
		colour: p.colour,
		...markOf(holdings, p),
	})),
	tags: tags
		.filter((t) => combination.tags.includes(t.id))
		.map(({ id, name }) => ({ id, name })),
});

const holdingsFor = async (db: Db, userId: string) => {
	const [owned, wanted] = await Promise.all([
		listOwnedPieces(db, userId),
		listWishedPieces(db, userId),
	]);
	return holdingsOf(owned, wanted);
};

const noArgs = z.object({});

const filterRule =
	"Filters are optional. Inside one filter any pick matches; an item must fit every filter given.";

export function registerAiActions(server: McpServer, account: Account) {
	const { db, pictures, userId, baseURL } = account;
	const scope: ActionScope = { db, userId, pictures };

	async function combinationViews(list: Combination[]) {
		const [tags, holdings] = await Promise.all([
			listTags(db, userId),
			holdingsFor(db, userId),
		]);
		return list.map((c) => combinationView(c, tags, holdings));
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
			inputSchema: tagActions.add.input,
		},
		async (input) => {
			const added = await tagActions.add.run(scope, input);
			return added.ok
				? answer({ tag: added.value })
				: refusal(added.error.text);
		},
	);

	tool(
		"rename_tag",
		{
			title: "Rename a tag",
			description: "Renames a tag. Its combinations keep it.",
			annotations: WRITE,
			inputSchema: tagActions.rename.input,
		},
		async (input) => {
			const renamed = await tagActions.rename.run(scope, input);
			return renamed.ok
				? answer({ tag: renamed.value })
				: refusal(renamed.error.text);
		},
	);

	tool(
		"delete_tag",
		{
			title: "Delete a tag",
			description:
				"Deletes a tag and takes it off every combination. The combinations stay.",
			annotations: DELETE,
			inputSchema: tagActions.delete.input,
		},
		async (input) => {
			const deleted = await tagActions.delete.run(scope, input);
			return deleted.ok
				? answer({ deleted: deleted.value.id })
				: refusal(deleted.error.text);
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
			inputSchema: colourActions.add.input,
		},
		async (input) => {
			const added = await colourActions.add.run(scope, input);
			return added.ok
				? answer({ colour: added.value })
				: refusal(added.error.text);
		},
	);

	tool(
		"change_colour",
		{
			title: "Change a colour",
			description: `Changes a colour's name, code, or both. ${colourRules}`,
			annotations: WRITE,
			inputSchema: colourActions.change.input,
		},
		async (input) => {
			const changed = await colourActions.change.run(scope, input);
			return changed.ok
				? answer({ colour: changed.value })
				: refusal(changed.error.text);
		},
	);

	tool(
		"delete_colour",
		{
			title: "Delete a colour",
			description: "Deletes a colour for good.",
			annotations: DELETE,
			inputSchema: colourActions.delete.input,
		},
		async (input) => {
			const deleted = await colourActions.delete.run(scope, input);
			return deleted.ok
				? answer({ deleted: deleted.value.id })
				: refusal(deleted.error.text);
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
			inputSchema: brandActions.add.input,
		},
		async (input) => {
			const added = await brandActions.add.run(scope, input);
			return added.ok
				? answer({ brand: added.value })
				: refusal(added.error.text);
		},
	);

	tool(
		"rename_brand",
		{
			title: "Rename a brand",
			description: `Renames a brand. ${brandRules}`,
			annotations: WRITE,
			inputSchema: brandActions.rename.input,
		},
		async (input) => {
			const renamed = await brandActions.rename.run(scope, input);
			return renamed.ok
				? answer({ brand: renamed.value })
				: refusal(renamed.error.text);
		},
	);

	tool(
		"delete_brand",
		{
			title: "Delete a brand",
			description: "Deletes a brand for good.",
			annotations: DELETE,
			inputSchema: brandActions.delete.input,
		},
		async (input) => {
			const deleted = await brandActions.delete.run(scope, input);
			return deleted.ok
				? answer({ deleted: deleted.value.id })
				: refusal(deleted.error.text);
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
				"The account's saved combinations, newest first, each with its title, its pieces, and its tags. Each piece has own, true when the closet has an owned item of that type and colour, and want, true when the wishlist has a wish for it. pieces, tags, and own narrow the list: a combination must match every piece row, carry every tag, and pass own.",
			annotations: READ,
			inputSchema: combinationActions.list.input,
		},
		async (input) => {
			const listed = await combinationActions.list.run(scope, input);
			if (!listed.ok) return refusal(listed.error.text);
			const combinations = await combinationViews(listed.value);
			if (combinations.length > 0) return answer({ combinations });
			const { pieces = [], tags = [], own = "any" } = input;
			const filtered = pieces.length > 0 || tags.length > 0 || own !== "any";
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
			inputSchema: combinationActions.save.input.omit({ id: true }),
		},
		async ({ pieces, tags = [] }) => {
			// The server makes the id, so a save sent twice makes two combinations.
			const saved = await combinationActions.save.run(scope, {
				id: crypto.randomUUID(),
				pieces,
				tags,
			});
			if (!saved.ok) return refusal(saved.error.text);
			const [combination] = await combinationViews([saved.value.combination]);
			return answer({ combination });
		},
	);

	tool(
		"change_combination",
		{
			title: "Change a combination",
			description:
				"Changes a saved combination's pieces. The pieces given replace all of its pieces: 2 to 4, at most one for each layer. It keeps its id and its place in the list. tags given replace its tags; left out, they stay.",
			annotations: WRITE,
			inputSchema: combinationActions.change.input,
		},
		async (input) => {
			const changed = await combinationActions.change.run(scope, input);
			if (!changed.ok) return refusal(changed.error.text);
			const [combination] = await combinationViews([changed.value]);
			return answer({ combination });
		},
	);

	tool(
		"delete_combination",
		{
			title: "Delete a combination",
			description: "Deletes a saved combination for good.",
			annotations: DELETE,
			inputSchema: combinationActions.delete.input,
		},
		async (input) => {
			const deleted = await combinationActions.delete.run(scope, input);
			return deleted.ok
				? answer({ deleted: input.id })
				: refusal(deleted.error.text);
		},
	);

	tool(
		"list_owned_items",
		{
			title: "List the closet",
			description: `The account's owned items, newest first. An owned item is one brand of one piece (a type in a colour) with a quantity of 1 to ${QUANTITY_MAX}. An account holds at most ${OWNED_ITEM_LIMIT}. Each item has pictureIds, its pictures in upload order; show_picture shows one. ${filterRule}`,
			annotations: READ,
			inputSchema: ownedItemActions.list.input,
		},
		async (input) => {
			const listed = await ownedItemActions.list.run(scope, input);
			if (!listed.ok) return refusal(listed.error.text);
			const ownedItems = listed.value;
			if (ownedItems.length > 0) return answer({ ownedItems });
			const { types = [], colourIds = [], brandIds = [] } = input;
			const filtered =
				types.length > 0 || colourIds.length > 0 || brandIds.length > 0;
			return answer({ ownedItems }, filtered ? noOwnedItemMatch : noOwnedItems);
		},
	);

	tool(
		"add_owned_item",
		{
			title: "Add to the closet",
			description: `Adds one brand of one piece to the closet, with a quantity. The account has each piece and brand once, and at most ${OWNED_ITEM_LIMIT} items. Answers the owned item and created, true for a new item.`,
			annotations: WRITE,
			inputSchema: ownedItemActions.add.input.omit({ id: true }),
		},
		async (input) => {
			// The server makes the id, as save_combination does.
			const added = await ownedItemActions.add.run(scope, {
				...input,
				id: crypto.randomUUID(),
			});
			return added.ok ? answer(added.value) : refusal(added.error.text);
		},
	);

	tool(
		"change_owned_item",
		{
			title: "Change an owned item",
			description:
				"Changes the brand and the quantity of an owned item. Its piece stays. Leave brandId out for no brand.",
			annotations: WRITE,
			inputSchema: ownedItemActions.change.input,
		},
		async (input) => {
			const changed = await ownedItemActions.change.run(scope, input);
			return changed.ok
				? answer({ ownedItem: changed.value })
				: refusal(changed.error.text);
		},
	);

	tool(
		"delete_owned_item",
		{
			title: "Delete an owned item",
			description: "Deletes an owned item from the closet for good.",
			annotations: DELETE,
			inputSchema: ownedItemActions.delete.input,
		},
		async (input) => {
			const deleted = await ownedItemActions.delete.run(scope, input);
			return deleted.ok
				? answer({ deleted: deleted.value })
				: refusal(deleted.error.text);
		},
	);

	tool(
		"list_wishes",
		{
			title: "List the wishlist",
			description: `The account's wishes, newest first, each with its shop links. A wish is one piece (a type in a colour) the account wants to buy. An account holds at most ${WISH_LIMIT} wishes, and a wish at most ${SHOP_LINK_LIMIT} shop links. Each shop link has pictureIds, its pictures in upload order; show_picture shows one. ${filterRule} The brand of a wish is the brand of any of its shop links, so a wish with no link fits no brand filter.`,
			annotations: READ,
			inputSchema: wishActions.list.input,
		},
		async (input) => {
			const listed = await wishActions.list.run(scope, input);
			if (!listed.ok) return refusal(listed.error.text);
			const wishes = listed.value;
			if (wishes.length > 0) return answer({ wishes });
			const { types = [], colourIds = [], brandIds = [] } = input;
			const filtered =
				types.length > 0 || colourIds.length > 0 || brandIds.length > 0;
			return answer({ wishes }, filtered ? noWishMatch : noWishes);
		},
	);

	tool(
		"add_wish",
		{
			title: "Add to the wishlist",
			description: `Adds a wish for one piece. The account has each piece once on the wishlist, and at most ${WISH_LIMIT} wishes. Answers the wish and created, true for a new wish.`,
			annotations: WRITE,
			inputSchema: wishActions.add.input.omit({ id: true }),
		},
		async (input) => {
			// The server makes the id, as add_owned_item does.
			const added = await wishActions.add.run(scope, {
				...input,
				id: crypto.randomUUID(),
			});
			return added.ok ? answer(added.value) : refusal(added.error.text);
		},
	);

	tool(
		"delete_wish",
		{
			title: "Remove a wish",
			description: "Removes a wish and its shop links for good.",
			annotations: DELETE,
			inputSchema: wishActions.delete.input,
		},
		async (input) => {
			const deleted = await wishActions.delete.run(scope, input);
			return deleted.ok
				? answer({ deleted: deleted.value })
				: refusal(deleted.error.text);
		},
	);

	tool(
		"add_shop_link",
		{
			title: "Add a shop link",
			description: `Adds a shop that sells the piece of a wish, with its brand, name, and price in VND. A wish holds at most ${SHOP_LINK_LIMIT} shop links. Answers the whole wish and created, true for a new shop link.`,
			annotations: WRITE,
			inputSchema: shopLinkActions.add.input.omit({ id: true }),
		},
		async (input) => {
			const added = await shopLinkActions.add.run(scope, {
				...input,
				id: crypto.randomUUID(),
			});
			return added.ok ? answer(added.value) : refusal(added.error.text);
		},
	);

	tool(
		"change_shop_link",
		{
			title: "Change a shop link",
			description:
				"Writes the whole shop link: its address, brand, name, and price. Answers the whole wish.",
			annotations: WRITE,
			inputSchema: shopLinkActions.change.input,
		},
		async (input) => {
			const changed = await shopLinkActions.change.run(scope, input);
			return changed.ok
				? answer({ wish: changed.value })
				: refusal(changed.error.text);
		},
	);

	tool(
		"delete_shop_link",
		{
			title: "Delete a shop link",
			description: "Deletes a shop link from its wish for good.",
			annotations: DELETE,
			inputSchema: shopLinkActions.delete.input,
		},
		async (input) => {
			const deleted = await shopLinkActions.delete.run(scope, input);
			return deleted.ok
				? answer({ deleted: deleted.value })
				: refusal(deleted.error.text);
		},
	);

	tool(
		"mark_shop_link_bought",
		{
			title: "Mark a shop link as bought",
			description:
				"Moves a shop link to the closet as an owned item with its brand, quantity 1, and its pictures, and removes its wish with the other shop links and their pictures. When the closet holds this piece with this brand, adds 1 to that item. Answers the owned item and created: true for a new item, false when it added 1.",
			annotations: DELETE,
			inputSchema: boughtActions.buy.input,
		},
		async (input) => {
			const bought = await boughtActions.buy.run(scope, input);
			return bought.ok ? answer(bought.value) : refusal(bought.error.text);
		},
	);

	tool(
		"get_upload_address",
		{
			title: "Get an upload address",
			description: `Gives a one-time web address that takes one picture by HTTP POST, with no sign-in, for ${UPLOAD_ADDRESS_AGE_MS / 60_000} minutes. Send the bytes of a JPEG, PNG, or WebP of 1 MB or less from your code sandbox, then put the picture id it answers in pictureIds of add_owned_item, change_owned_item, add_shop_link, or change_shop_link. If the sandbox cannot reach the address, the user must let Claude reach this app's domain in Settings, Capabilities.`,
			annotations: WRITE,
			inputSchema: noArgs,
		},
		async () => {
			const { id, expiresAt } = await giveUploadAddress(db, userId);
			const address = `${baseURL}/api/uploads/${id}`;
			return answer(
				{ address, expiresAt: expiresAt.toISOString() },
				uploadAddressText(address),
			);
		},
	);

	tool(
		"show_picture",
		{
			title: "Show a picture",
			description:
				"Gives one picture of an owned item or a shop link as an image. list_owned_items and list_wishes give the picture ids.",
			annotations: READ,
			inputSchema: z.object({
				id: z
					.string()
					.describe("A picture id from list_owned_items or list_wishes."),
			}),
		},
		async ({ id }) => {
			const read = await readPicture(db, pictures, userId, id);
			if (!read.ok) return refusal(noPicture);
			const headers = new Headers();
			read.value.writeHttpMetadata(headers);
			const bytes = await new Response(read.value.body).arrayBuffer();
			return {
				content: [
					{
						type: "image",
						// A hand loop with btoa takes 16 to 34 ms for 1 MB, past the
						// 10 ms of CPU a free-plan request has (ADR 0011).
						data: Buffer.from(bytes).toString("base64"),
						mimeType: headers.get("content-type") ?? "",
					},
				],
			};
		},
	);
}
