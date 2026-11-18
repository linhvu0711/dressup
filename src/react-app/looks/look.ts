import { z } from "zod";
import { hexSchema } from "@/colour/hex";
import { GARMENT_IDS, type GarmentId, JACKET_IDS } from "@/dress/garments";
import { MODES, type ModeId, modeById } from "@/dress/modes";
import { type DressState, modeIdSchema } from "@/dress/state";
import { type TagId, tagIdSchema } from "@/tags/tag";

export const LOOK_NAME_MAX = 60;

// Looks for each account (docs/adr/0008-open-sign-up-with-limits.md).
export const LOOK_LIMIT = 300;

// A look's tags go in one statement, and D1 takes at most 100 bound
// parameters (src/worker/dress-store.ts:30-31).
export const LOOK_TAGS_MAX = 50;

const lookIdSchema = z.uuid().brand<"LookId">();

export type LookId = z.infer<typeof lookIdSchema>;

// The one shape of a look, so the server's check and the page's parse are
// the same. A look keeps its own copy of the colours of its mode's garments.
export const lookInputSchema = z
	.object({
		id: lookIdSchema,
		modeId: modeIdSchema,
		name: z.string().trim().max(LOOK_NAME_MAX),
		colours: z.partialRecord(z.enum(GARMENT_IDS), hexSchema),
		open: z.array(z.enum(JACKET_IDS)),
		tags: z.array(tagIdSchema).max(LOOK_TAGS_MAX).default([]),
	})
	.superRefine((look, ctx) => {
		// Zod runs this after a failed modeId too, and modeById would throw.
		const mode = MODES.find((m) => m.id === look.modeId);
		if (!mode) return;
		const inMode = (id: GarmentId) => mode.garments.includes(id);
		for (const id of Object.keys(look.colours) as GarmentId[])
			if (!inMode(id))
				ctx.addIssue({
					code: "custom",
					path: ["colours", id],
					message: "not in the mode",
					params: { code: "not_in_mode", garment: id } satisfies RuleParams,
				});
		for (const id of mode.garments)
			if (!look.colours[id])
				ctx.addIssue({
					code: "custom",
					path: ["colours", id],
					message: "no colour",
					params: { code: "no_colour", garment: id } satisfies RuleParams,
				});
		const outside = look.open.find((id) => !inMode(id));
		if (outside)
			ctx.addIssue({
				code: "custom",
				path: ["open"],
				message: "not in the mode",
				params: { code: "not_in_mode", garment: outside } satisfies RuleParams,
			});
	});

export type LookInput = z.infer<typeof lookInputSchema>;

// What a look's own rules refuse, so the website and the AI apps each turn
// one code into their answer. path is the zod path of the refused value.
export type LookProblem =
	| {
			code: "not_in_mode" | "no_colour";
			path: PropertyKey[];
			garment: GarmentId;
			modeId: ModeId;
	  }
	| { code: "name_too_long" | "too_many_tags"; path: PropertyKey[] }
	| {
			code: "invalid";
			path: PropertyKey[];
			issue: z.core.$ZodIssue;
			input: unknown;
	  };

// zod types params as Record<string, any>, so each rule above writes its
// params to this shape and checkLook reads them back.
type RuleParams = { code: "not_in_mode" | "no_colour"; garment: GarmentId };

export function checkLook(
	input: unknown,
): { ok: true; look: LookInput } | { ok: false; problem: LookProblem } {
	const parsed = lookInputSchema.safeParse(input);
	if (parsed.success) return { ok: true, look: parsed.data };
	const issue = parsed.error.issues[0];
	const path = [...issue.path];
	if (issue.code === "custom") {
		const { code, garment } = issue.params as RuleParams;
		const { modeId } = input as { modeId: ModeId };
		return { ok: false, problem: { code, path, garment, modeId } };
	}
	if (issue.code === "too_big" && path.length === 1 && path[0] === "name")
		return { ok: false, problem: { code: "name_too_long", path } };
	if (issue.code === "too_big" && path.length === 1 && path[0] === "tags")
		return { ok: false, problem: { code: "too_many_tags", path } };
	return { ok: false, problem: { code: "invalid", path, issue, input } };
}

export const lookSchema = lookInputSchema;

export type Look = LookInput;

// The outfit on the mannequin as a look: only its mode's garments.
export function lookFromDress(
	state: DressState,
	id: LookId,
	name: string,
	tags: TagId[],
): LookInput {
	const mode = modeById(state.modeId);
	return {
		id,
		modeId: state.modeId,
		name,
		colours: Object.fromEntries(mode.garments.map((g) => [g, state.picked[g]])),
		open: state.open.filter((j) => mode.garments.includes(j)),
		tags,
	};
}

// A look with no name shows its mode's name.
export const lookName = (look: Look): string =>
	look.name || modeById(look.modeId).name;
