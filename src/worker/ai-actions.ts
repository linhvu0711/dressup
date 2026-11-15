import type {
	CallToolResult,
	McpServer,
	ToolAnnotations,
} from "@modelcontextprotocol/server";
import { z } from "zod";
import {
	GARMENT_IDS,
	GARMENT_NAMES,
	type GarmentId,
	type Hex,
	isJacket,
	JACKET_IDS,
} from "@/dress/garments";
import { MODES } from "@/dress/modes";
import {
	type DressState,
	dressChangeSchema,
	MANNEQUIN_PARTS,
} from "@/dress/state";
import {
	LOOK_LIMIT,
	LOOK_NAME_MAX,
	type Look,
	lookInputSchema,
} from "@/looks/look";
import type { Tag } from "@/tags/tag";
import {
	issueText,
	lastSquare,
	lookIssueText,
	lookLimit,
	noLooks,
	noTag,
	notInRow,
	serverError,
} from "./ai-messages";
import type { Db } from "./db";
import { changeDress, loadDress } from "./dress-store";
import { listLooks, saveLook } from "./look-store";
import { listTags } from "./tag-store";

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
		if (result.ok) return answer(outfitView(result.state));
		const { garment, hex } = parsed.data as { garment: GarmentId; hex: Hex };
		return result.error === "not_in_row"
			? refusal(notInRow(garment, hex, result.state.swatches[garment]))
			: refusal(lastSquare(garment, hex));
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
			description: `Saves a new look with a mode, a colour for each garment of the mode, open jackets, a name, and tags. The outfit on the mannequin does not change. An account keeps at most ${LOOK_LIMIT} looks.`,
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
			const parsed = lookInputSchema.safeParse(input);
			if (!parsed.success)
				return refusal(lookIssueText(parsed.error.issues[0], input));
			const accountTags = await listTags(db, userId);
			if (!tags.every((id) => accountTags.some((t) => t.id === id)))
				return refusal(noTag);
			const saved = await saveLook(db, userId, parsed.data);
			if (saved.ok) return answer({ look: lookView(saved.look, accountTags) });
			if (saved.error === "look_limit") return refusal(lookLimit());
			throw new Error("a new look id is taken");
		},
	);
}
