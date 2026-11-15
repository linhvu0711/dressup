import type {
	CallToolResult,
	McpServer,
	ToolAnnotations,
} from "@modelcontextprotocol/server";
import { z } from "zod";
import { GARMENT_IDS, GARMENT_NAMES, isJacket } from "@/dress/garments";
import { MODES } from "@/dress/modes";
import type { DressState } from "@/dress/state";
import type { Db } from "./db";
import { loadDress } from "./dress-store";

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

const noArgs = z.object({});

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
		server.registerTool(name, { ...config, inputSchema }, (args) =>
			run(args as z.output<S>),
		);
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
}
