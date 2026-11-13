import {
	GARMENT_IDS,
	type GarmentId,
	type Hex,
	type JacketId,
	STARTER_COLOURS,
} from "@/dress/garments";
import { DEFAULT_MODE_ID, type ModeId } from "@/dress/modes";

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
