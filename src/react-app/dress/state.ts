import { z } from "zod";
import {
	GARMENT_IDS,
	type GarmentId,
	type Hex,
	JACKET_IDS,
	type JacketId,
	STARTER_COLOURS,
} from "@/dress/garments";
import { DEFAULT_MODE_ID, MODES, type ModeId } from "@/dress/modes";

// What the Dress page keeps for a person. Colours are keyed by garment, not
// by mode, so a garment keeps its colour in every mode that has it
// (docs/prototype/dressup.html:748-749, 1027).
export type DressState = {
	modeId: ModeId;
	swatches: Record<GarmentId, readonly Hex[]>;
	picked: Record<GarmentId, Hex>;
	open: readonly JacketId[];
};

const perGarment = <T>(value: (id: GarmentId) => T) =>
	Object.fromEntries(GARMENT_IDS.map((id) => [id, value(id)])) as Record<
		GarmentId,
		T
	>;

export const startDressState = (): DressState => ({
	modeId: DEFAULT_MODE_ID,
	swatches: perGarment((id) => [...STARTER_COLOURS[id]]),
	picked: perGarment((id) => STARTER_COLOURS[id][0]),
	open: [],
});

export const pickMode = (s: DressState, modeId: ModeId): DressState => ({
	...s,
	modeId,
});

export const pickColour = (
	s: DressState,
	garment: GarmentId,
	hex: Hex,
): DressState => ({ ...s, picked: { ...s.picked, [garment]: hex } });

// A colour the row has already gets no second square: that square goes on
// (docs/prototype/dressup.html:1035-1036).
export function addColour(
	s: DressState,
	garment: GarmentId,
	hex: Hex,
): { state: DressState; added: boolean } {
	const row = s.swatches[garment];
	const added = !row.includes(hex);
	const swatches = added
		? { ...s.swatches, [garment]: [hex, ...row] }
		: s.swatches;
	return { state: pickColour({ ...s, swatches }, garment, hex), added };
}

// A row keeps at least one square. When the picked one goes, the row's new
// first square goes on (docs/prototype/dressup.html:1025-1026).
export function removeColour(
	s: DressState,
	garment: GarmentId,
	hex: Hex,
): { state: DressState; removed: boolean } {
	const row = s.swatches[garment];
	if (row.length <= 1) return { state: s, removed: false };
	const rest = row.filter((c) => c !== hex);
	const swatches = { ...s.swatches, [garment]: rest };
	const picked =
		s.picked[garment] === hex ? { ...s.picked, [garment]: rest[0] } : s.picked;
	return { state: { ...s, swatches, picked }, removed: true };
}

export function setJacket(
	s: DressState,
	jacket: JacketId,
	open: boolean,
): DressState {
	const rest = s.open.filter((id) => id !== jacket);
	return { ...s, open: open ? [...rest, jacket] : rest };
}

// One thing a person does on the Dress page. The page and the server both
// apply it with applyChange, so they keep one set of rules.
export type DressChange =
	| { kind: "mode"; modeId: ModeId }
	| { kind: "pick"; garment: GarmentId; hex: Hex }
	| { kind: "add"; garment: GarmentId; hex: Hex }
	| { kind: "remove"; garment: GarmentId; hex: Hex }
	| { kind: "jacket"; jacket: JacketId; open: boolean };

const hex = z
	.string()
	.regex(/^#[0-9A-F]{6}$/)
	.transform((code) => code as Hex);
const garment = z.enum(GARMENT_IDS);

const modeId = z.enum(MODES.map((m) => m.id) as [ModeId, ...ModeId[]]);

export const dressStateSchema: z.ZodType<DressState> = z.object({
	modeId,
	swatches: z.record(garment, z.array(hex)),
	picked: z.record(garment, hex),
	open: z.array(z.enum(JACKET_IDS)),
});

export const dressChangeSchema: z.ZodType<DressChange> = z.discriminatedUnion(
	"kind",
	[
		z.object({
			kind: z.literal("mode"),
			modeId,
		}),
		z.object({ kind: z.literal("pick"), garment, hex }),
		z.object({ kind: z.literal("add"), garment, hex }),
		z.object({ kind: z.literal("remove"), garment, hex }),
		z.object({
			kind: z.literal("jacket"),
			jacket: z.enum(JACKET_IDS),
			open: z.boolean(),
		}),
	],
);

export type ChangeResult =
	| { ok: true; state: DressState }
	| { ok: false; error: "not_in_row" | "last_square"; field: "hex" };

export function applyChange(s: DressState, change: DressChange): ChangeResult {
	switch (change.kind) {
		case "mode":
			return { ok: true, state: pickMode(s, change.modeId) };
		case "pick":
			if (!s.swatches[change.garment].includes(change.hex))
				return { ok: false, error: "not_in_row", field: "hex" };
			return {
				ok: true,
				state: pickColour(s, change.garment, change.hex),
			};
		case "add":
			return {
				ok: true,
				state: addColour(s, change.garment, change.hex).state,
			};
		case "remove": {
			const { state, removed } = removeColour(s, change.garment, change.hex);
			return removed
				? { ok: true, state }
				: { ok: false, error: "last_square", field: "hex" };
		}
		case "jacket":
			return {
				ok: true,
				state: setJacket(s, change.jacket, change.open),
			};
	}
}
