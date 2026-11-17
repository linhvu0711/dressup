import { z } from "zod";
import {
	GARMENT_IDS,
	type GarmentId,
	type Hex,
	isJacket,
	JACKET_IDS,
	type JacketId,
	STARTER_COLOURS,
} from "@/dress/garments";
import { DEFAULT_MODE_ID, MODES, type ModeId } from "@/dress/modes";

// What the Dress page keeps for a person. Colours are keyed by garment, not
// by mode, so a garment keeps its colour in every mode that has it.
export type DressState = {
	modeId: ModeId;
	swatches: Record<GarmentId, readonly Hex[]>;
	picked: Record<GarmentId, Hex>;
	open: readonly JacketId[];
	mannequin: MannequinColours;
};

export const MANNEQUIN_PARTS = ["skin", "hair"] as const;

export type MannequinPart = (typeof MANNEQUIN_PARTS)[number];

export type MannequinColours = Record<MannequinPart, Hex>;

export const STARTER_MANNEQUIN: MannequinColours = {
	skin: "#D6A27B",
	hair: "#141418",
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
	mannequin: { ...STARTER_MANNEQUIN },
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

export const setMannequinColour = (
	s: DressState,
	part: MannequinPart,
	hex: Hex,
): DressState => ({ ...s, mannequin: { ...s.mannequin, [part]: hex } });

// A colour the row has already gets no second square: that square goes on.
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
// first square goes on. A colour the row does not hold is not removed.
export function removeColour(
	s: DressState,
	garment: GarmentId,
	hex: Hex,
):
	| { state: DressState; removed: true }
	| { state: DressState; removed: false; why: "not_in_row" | "last_square" } {
	const row = s.swatches[garment];
	if (!row.includes(hex))
		return { state: s, removed: false, why: "not_in_row" };
	if (row.length <= 1) return { state: s, removed: false, why: "last_square" };
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

// What a look holds of an outfit: the mode, a colour for each garment it
// names, and which of its jackets are open.
export type Outfit = {
	modeId: ModeId;
	colours: Partial<Record<GarmentId, Hex>>;
	open: readonly JacketId[];
};

// Puts a whole outfit on at once. A jacket the outfit does not name
// keeps its state: the state holds both jackets for every mode, a look only
// its own mode's.
export function wearOutfit(s: DressState, outfit: Outfit): DressState {
	let next = pickMode(s, outfit.modeId);
	for (const garment of GARMENT_IDS) {
		const hex = outfit.colours[garment];
		if (!hex) continue;
		next = addColour(next, garment, hex).state;
		if (isJacket(garment))
			next = setJacket(next, garment, outfit.open.includes(garment));
	}
	return next;
}

// One thing a person does on the Dress page. The page and the server both
// apply it with applyChange, so they keep one set of rules.
export type DressChange =
	| { kind: "mode"; modeId: ModeId }
	| { kind: "pick"; garment: GarmentId; hex: Hex }
	| { kind: "add"; garment: GarmentId; hex: Hex }
	| { kind: "remove"; garment: GarmentId; hex: Hex }
	| { kind: "jacket"; jacket: JacketId; open: boolean }
	| { kind: "mannequin"; part: MannequinPart; hex: Hex }
	| ({ kind: "wear" } & Outfit);

export const hexSchema = z
	.string()
	.regex(/^#[0-9A-F]{6}$/)
	.transform((code) => code as Hex);
const garment = z.enum(GARMENT_IDS);

export const modeIdSchema = z.enum(
	MODES.map((m) => m.id) as [ModeId, ...ModeId[]],
);

export const dressStateSchema: z.ZodType<DressState> = z.object({
	modeId: modeIdSchema,
	swatches: z.record(garment, z.array(hexSchema)),
	picked: z.record(garment, hexSchema),
	open: z.array(z.enum(JACKET_IDS)),
	mannequin: z.object({ skin: hexSchema, hair: hexSchema }),
});

export const dressChangeSchema: z.ZodType<DressChange> = z.discriminatedUnion(
	"kind",
	[
		z.object({
			kind: z.literal("mode"),
			modeId: modeIdSchema,
		}),
		z.object({ kind: z.literal("pick"), garment, hex: hexSchema }),
		z.object({ kind: z.literal("add"), garment, hex: hexSchema }),
		z.object({ kind: z.literal("remove"), garment, hex: hexSchema }),
		z.object({
			kind: z.literal("jacket"),
			jacket: z.enum(JACKET_IDS),
			open: z.boolean(),
		}),
		z.object({
			kind: z.literal("mannequin"),
			part: z.enum(MANNEQUIN_PARTS),
			hex: hexSchema,
		}),
		z.object({
			kind: z.literal("wear"),
			modeId: modeIdSchema,
			colours: z.partialRecord(garment, hexSchema),
			open: z.array(z.enum(JACKET_IDS)),
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
			const removal = removeColour(s, change.garment, change.hex);
			return removal.removed
				? { ok: true, state: removal.state }
				: { ok: false, error: removal.why, field: "hex" };
		}
		case "jacket":
			return {
				ok: true,
				state: setJacket(s, change.jacket, change.open),
			};
		case "mannequin":
			return {
				ok: true,
				state: setMannequinColour(s, change.part, change.hex),
			};
		case "wear":
			return { ok: true, state: wearOutfit(s, change) };
	}
}
