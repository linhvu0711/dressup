import type {
	CallToolResult,
	McpServer,
	ToolAnnotations,
} from "@modelcontextprotocol/server";
import { z } from "zod";
import {
	GARMENT_IDS,
	GARMENT_NAMES,
	isJacket,
	JACKET_IDS,
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
import { countAiAction } from "./ai-action-store";
import {
	brandRefusalText,
	colourRefusalText,
	dressRefusalText,
	issueText,
	lookRefusalText,
	noBrands,
	noColours,
	noLooks,
	noTags,
	serverError,
	tagRefusalText,
	tagsLeftOffText,
	tooManyActions,
} from "./ai-messages";
import { addBrand, deleteBrand, listBrands, renameBrand } from "./brand-store";
import {
	addColour,
	changeColour,
	deleteColour,
	listColours,
} from "./colour-store";
import type { Db } from "./db";
import { changeDress, loadDress } from "./dress-store";
import { changeLook, deleteLook, listLooks, saveLook } from "./look-store";
import { addTag, deleteTag, listTags, renameTag } from "./tag-store";

type Account = { db: Db; userId: string };

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
	tags: tags.filter((t) => look.tags.includes(t.id)),
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
};

export function registerAiActions(server: McpServer, account: Account) {
	const { db, userId } = account;

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
			description: "The tags, in the order they were made.",
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
			description: "Renames a tag. Its looks keep it.",
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
			description: "Deletes a tag and takes it off every look. The looks stay.",
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
				"The account's colours, in the order they were added. A new account starts with 13. A colour with inUse true is in a combination and cannot be deleted.",
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
}
