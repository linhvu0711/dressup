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
import {
	GARMENT_IDS,
	GARMENT_NAMES,
	isJacket,
	JACKET_IDS,
	LAYER_OF,
} from "@/dress/garments";
import { MODES } from "@/dress/modes";
import {
	type DressState,
	dressChangeSchema,
	MANNEQUIN_PARTS,
} from "@/dress/state";
import { BRAND_LIMIT, BRAND_NAME_MAX } from "@/labels/brand";
import { COLOUR_LIMIT, COLOUR_NAME_MAX } from "@/labels/colour";
import { LOOK_LIMIT, LOOK_NAME_MAX, type Look } from "@/looks/look";
import { TAG_NAME_MAX, type Tag } from "@/tags/tag";
import { SHOP_LINK_LIMIT, WISH_LIMIT } from "@/wishlist/wish";
import { countAiAction } from "./ai-action-store";
import {
	brandRefusalText,
	colourRefusalText,
	combinationRefusalText,
	dressRefusalText,
	issueText,
	lookRefusalText,
	noBrands,
	noColours,
	noCombinations,
	noLooks,
	noOwnedItems,
	noTags,
	noWishes,
	ownedItemRefusalText,
	serverError,
	tagRefusalText,
	tagsLeftOffText,
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
	listCombinations,
	saveCombination,
} from "./combination-store";
import type { Db } from "./db";
import { changeDress, loadDress } from "./dress-store";
import { changeLook, deleteLook, listLooks, saveLook } from "./look-store";
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

const garmentsAndModes = {
	garments: GARMENT_IDS.map((id) => ({
		id,
		name: GARMENT_NAMES[id],
		jacket: isJacket(id),
	})),
	modes: MODES.map((m) => ({
		id: m.id,
		name: m.name,
		weatherGroup: m.group,
		garments: [...m.garments],
	})),
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

const outfitView = (state: DressState) => ({
	modeId: state.modeId,
	picked: state.picked,
	open: state.open,
	colourSquares: state.swatches,
	skin: state.mannequin.skin,
	hair: state.mannequin.hair,
});

const lookView = (look: Look, tags: Tag[]) => ({
	id: look.id,
	name: look.name,
	modeId: look.modeId,
	colours: look.colours,
	open: look.open,
	tags: tags
		.filter((t) => look.tags.includes(t.id))
		.map(({ id, name }) => ({ id, name })),
});

const combinationView = (combination: Combination, tags: Tag[]) => ({
	id: combination.id,
	title: combinationTitle(combination),
	open: combination.open,
	pieces: combination.pieces.map((p) => ({
		layer: p.layer,
		typeId: p.typeId,
		type: GARMENT_NAMES[p.typeId],
		colour: p.colour,
	})),
	tags: tags
		.filter((t) => combination.tags.includes(t.id))
		.map(({ id, name }) => ({ id, name })),
});

const noArgs = z.object({});

const field = {
	modeId: z.string().describe("A mode id, such as polo-sweater."),
	garment: z.string().describe("A garment id, such as sweater."),
	jacket: z.string().describe(`${JACKET_IDS.join(" or ")}.`),
	part: z.string().describe(`${MANNEQUIN_PARTS.join(" or ")}.`),
	colour: z
		.string()
		.describe("A colour as #RRGGBB with capital letters, such as #1F3A5F."),
	colours: z
		.record(z.string(), z.string())
		.describe(
			"A colour as #RRGGBB for each garment of the mode, keyed by garment id.",
		),
	open: z
		.array(z.string())
		.describe(`The open jackets of the mode: ${JACKET_IDS.join(" or ")}.`),
	lookName: z.string().describe(`At most ${LOOK_NAME_MAX} characters.`),
	tags: z.array(z.string()).describe("Tag ids."),
	pieces: z.array(
		z.object({
			typeId: z.string().describe("A type id from list_types, such as tee_l."),
			colourId: z.string().describe("A colour id from list_colours."),
		}),
	),
};

export function registerAiActions(server: McpServer, account: Account) {
	const { db, pictures, userId } = account;

	// The look with its tags named, and a sentence first for each tag left off.
	async function lookAnswer(changed: { look: Look; tagsLeftOff: string[] }) {
		const { tagsLeftOff } = changed;
		const data = {
			look: lookView(changed.look, await listTags(db, userId)),
			tagsLeftOff,
		};
		const json = JSON.stringify(data);
		return answer(
			data,
			tagsLeftOff.length === 0
				? json
				: `${tagsLeftOffText(tagsLeftOff)}\n${json}`,
		);
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
		"list_garments_and_modes",
		{
			title: "List garments and modes",
			description:
				"The 17 garments and the 23 modes dressup knows. A mode is a set of garments worn together.",
			annotations: READ,
			inputSchema: noArgs,
		},
		async () => answer(garmentsAndModes),
	);

	tool(
		"get_outfit",
		{
			title: "See the outfit",
			description:
				"The outfit on the mannequin now: the mode, the picked colour of each garment, the open jackets, each garment's colour squares, and the skin and hair colours.",
			annotations: READ,
			inputSchema: noArgs,
		},
		async () => answer(outfitView((await loadDress(db, userId)).state)),
	);

	// Checks the change with the Dress page's rules before it reaches the
	// store, so a refusal names the value the AI app sent.
	async function changeOutfit(change: Record<string, unknown>) {
		const parsed = dressChangeSchema.safeParse(change);
		if (!parsed.success)
			return refusal(issueText(parsed.error.issues[0], change));
		const result = await changeDress(db, userId, parsed.data);
		return result.ok
			? answer(outfitView(result.value))
			: refusal(dressRefusalText(result.error));
	}

	tool(
		"set_mode",
		{
			title: "Change the mode",
			description:
				"Puts the mannequin in another mode, a set of garments worn together.",
			annotations: WRITE,
			inputSchema: z.object({ modeId: field.modeId }),
		},
		({ modeId }) => changeOutfit({ kind: "mode", modeId }),
	);

	tool(
		"pick_colour",
		{
			title: "Pick a colour",
			description:
				"Picks one of a garment's colour squares for the outfit. The colour must already be a square in that garment's row.",
			annotations: WRITE,
			inputSchema: z.object({ garment: field.garment, colour: field.colour }),
		},
		({ garment, colour }) =>
			changeOutfit({ kind: "pick", garment, hex: colour }),
	);

	tool(
		"add_colour_square",
		{
			title: "Add a colour square",
			description:
				"Adds a colour square to a garment's row and picks it. A colour the row already has is picked, not added twice.",
			annotations: WRITE,
			inputSchema: z.object({ garment: field.garment, colour: field.colour }),
		},
		({ garment, colour }) =>
			changeOutfit({ kind: "add", garment, hex: colour }),
	);

	tool(
		"remove_colour_square",
		{
			title: "Remove a colour square",
			description:
				"Removes a colour square from a garment's row. A row keeps at least one square. Saved looks keep their colours.",
			annotations: DELETE,
			inputSchema: z.object({ garment: field.garment, colour: field.colour }),
		},
		({ garment, colour }) =>
			changeOutfit({ kind: "remove", garment, hex: colour }),
	);

	tool(
		"set_jacket",
		{
			title: "Open or close a jacket",
			description: `Opens or closes the ${JACKET_IDS.join(" or ")} jacket.`,
			annotations: WRITE,
			inputSchema: z.object({
				jacket: field.jacket,
				open: z.boolean().describe("true opens the jacket, false closes it."),
			}),
		},
		({ jacket, open }) => changeOutfit({ kind: "jacket", jacket, open }),
	);

	tool(
		"set_mannequin_colour",
		{
			title: "Set skin or hair colour",
			description: "Sets the mannequin's skin or hair colour.",
			annotations: WRITE,
			inputSchema: z.object({ part: field.part, colour: field.colour }),
		},
		({ part, colour }) =>
			changeOutfit({ kind: "mannequin", part, hex: colour }),
	);

	tool(
		"list_looks",
		{
			title: "List looks",
			description:
				"The saved looks, newest first, each with its mode, colours, open jackets, name, and tags.",
			annotations: READ,
			inputSchema: noArgs,
		},
		async () => {
			const [all, tags] = await Promise.all([
				listLooks(db, userId),
				listTags(db, userId),
			]);
			if (all.length === 0) return answer({ looks: [] }, noLooks);
			return answer({ looks: all.map((look) => lookView(look, tags)) });
		},
	);

	tool(
		"save_look",
		{
			title: "Save a look",
			description: `Saves a new look with a mode, a colour for each garment of the mode, open jackets, a name, and tags. The outfit on the mannequin does not change. An account keeps at most ${LOOK_LIMIT} looks. A tag id that is not one of your tags is left off, and the answer names it.`,
			annotations: WRITE,
			inputSchema: z.object({
				modeId: field.modeId,
				colours: field.colours,
				open: field.open.optional(),
				name: field.lookName.optional(),
				tags: field.tags.optional(),
			}),
		},
		async ({ modeId, colours, open = [], name = "", tags = [] }) => {
			// The server makes the id, so a save sent twice makes two looks.
			const input = {
				id: crypto.randomUUID(),
				modeId,
				name,
				colours,
				open,
				tags,
			};
			const saved = await saveLook(db, userId, input);
			if (!saved.ok) return refusal(lookRefusalText(saved.error));
			return lookAnswer(saved.value);
		},
	);

	tool(
		"change_look",
		{
			title: "Change a look",
			description:
				"Changes a saved look's name, colours, open jackets, or tags. Colours given replace those garments' colours and the others stay. Open jackets and tags given replace the look's. A tag id that is not one of your tags is left off, and the answer names it.",
			annotations: WRITE,
			inputSchema: z.object({
				id: z.string().describe("The look's id."),
				name: field.lookName.optional(),
				colours: field.colours.optional(),
				open: field.open.optional(),
				tags: field.tags.optional(),
			}),
		},
		async ({ id, ...patch }) => {
			const changed = await changeLook(db, userId, id, patch);
			if (!changed.ok) return refusal(lookRefusalText(changed.error));
			return lookAnswer(changed.value);
		},
	);

	tool(
		"delete_look",
		{
			title: "Delete a look",
			description: "Deletes a saved look for good.",
			annotations: DELETE,
			inputSchema: z.object({ id: z.string().describe("The look's id.") }),
		},
		async ({ id }) => {
			const deleted = await deleteLook(db, userId, id);
			return deleted.ok
				? answer({ deleted: id })
				: refusal(lookRefusalText(deleted.error));
		},
	);

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
			description: "Renames a tag. Its looks and combinations keep it.",
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
				"Deletes a tag and takes it off every look and combination. The looks and combinations stay.",
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
				types: GARMENT_IDS.map((id) => ({
					id,
					name: GARMENT_NAMES[id],
					layer: LAYER_OF[id],
				})),
			}),
	);

	tool(
		"list_combinations",
		{
			title: "List the combinations",
			description:
				"The account's saved combinations, newest first, each with its title, its pieces, whether its jacket is open, and its tags.",
			annotations: READ,
			inputSchema: noArgs,
		},
		async () => {
			const [all, tags] = await Promise.all([
				listCombinations(db, userId),
				listTags(db, userId),
			]);
			const combinations = all.map((c) => combinationView(c, tags));
			return combinations.length === 0
				? answer({ combinations }, noCombinations)
				: answer({ combinations });
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
			// The server makes the id, as save_look does.
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
			description: `The account's owned items, newest first. An owned item is one brand of one piece (a type in a colour) with a quantity of 1 to ${QUANTITY_MAX}. An account holds at most ${OWNED_ITEM_LIMIT}.`,
			annotations: READ,
			inputSchema: noArgs,
		},
		async () => {
			const ownedItems = await listOwnedItems(db, userId);
			return ownedItems.length === 0
				? answer({ ownedItems }, noOwnedItems)
				: answer({ ownedItems });
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
				? answer({ ownedItem: added.value.ownedItem })
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
				? answer({ ownedItem: changed.value })
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
			description: `The account's wishes, newest first, each with its shop links. A wish is one piece (a type in a colour) the account wants to buy. An account holds at most ${WISH_LIMIT} wishes, and a wish at most ${SHOP_LINK_LIMIT} shop links.`,
			annotations: READ,
			inputSchema: noArgs,
		},
		async () => {
			const wishes = await listWishes(db, userId);
			return wishes.length === 0
				? answer({ wishes }, noWishes)
				: answer({ wishes });
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
