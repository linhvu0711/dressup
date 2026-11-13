import {
	GARMENT_IDS,
	type GarmentId,
	type GarmentLayer,
	type Hex,
	STARTER_COLOURS,
} from "@/dress/garments";

export type WeatherGroup = "Hot" | "Cool" | "Cold";

type Row = readonly [
	id: string,
	name: string,
	group: WeatherGroup,
	training: boolean,
	garments: readonly GarmentId[],
];

// The mode list `M` of docs/prototype/dressup.html:714-738, garments bottom
// layer first. Ids are names, not list positions, since later tickets store
// them and a list change must not move a stored look.
const ROWS = [
	[
		"tee-casual-shorts",
		"Tee + casual shorts",
		"Hot",
		false,
		["casual_sh", "tee_s"],
	],
	[
		"tee-casual-pants",
		"Tee + casual pants",
		"Hot",
		false,
		["casual_p", "tee_s"],
	],
	[
		"polo-chino-shorts",
		"Polo + chino shorts",
		"Hot",
		false,
		["chino_sh", "polo_s"],
	],
	[
		"polo-chino-pants",
		"Polo + chino pants",
		"Hot",
		false,
		["chino_p", "polo_s"],
	],
	[
		"shirt-chino-shorts",
		"Shirt + chino shorts",
		"Hot",
		false,
		["chino_sh", "shirt_s"],
	],
	[
		"shirt-chino-pants",
		"Shirt + chino pants",
		"Hot",
		false,
		["chino_p", "shirt_s"],
	],
	[
		"training-tee-shorts",
		"Training tee + shorts",
		"Hot",
		true,
		["train_sh", "ttee_s"],
	],
	[
		"long-tee-casual-pants",
		"Long tee + casual pants",
		"Cool",
		false,
		["casual_p", "tee_l"],
	],
	[
		"long-polo-chino-pants",
		"Long polo + chino pants",
		"Cool",
		false,
		["chino_p", "polo_l"],
	],
	[
		"long-shirt-chino-pants",
		"Long shirt + chino pants",
		"Cool",
		false,
		["chino_p", "shirt_l"],
	],
	[
		"tee-chore",
		"Tee + chore jacket",
		"Cool",
		false,
		["casual_p", "tee_l", "chore"],
	],
	[
		"polo-chore",
		"Polo + chore jacket",
		"Cool",
		false,
		["chino_p", "polo_l", "chore"],
	],
	[
		"shirt-chore",
		"Shirt + chore jacket",
		"Cool",
		false,
		["chino_p", "shirt_l", "chore"],
	],
	[
		"long-training-tee-pants",
		"Long training tee + pants",
		"Cool",
		true,
		["train_p", "ttee_l"],
	],
	[
		"tee-sweater",
		"Tee + sweater",
		"Cold",
		false,
		["casual_p", "tee_l", "sweater"],
	],
	[
		"polo-sweater",
		"Polo + sweater",
		"Cold",
		false,
		["chino_p", "polo_l", "sweater"],
	],
	[
		"shirt-sweater",
		"Shirt + sweater",
		"Cold",
		false,
		["chino_p", "shirt_l", "sweater"],
	],
	[
		"tee-sweater-chore",
		"Tee + sweater + chore",
		"Cold",
		false,
		["casual_p", "tee_l", "sweater", "chore"],
	],
	[
		"polo-sweater-chore",
		"Polo + sweater + chore",
		"Cold",
		false,
		["chino_p", "polo_l", "sweater", "chore"],
	],
	[
		"shirt-sweater-chore",
		"Shirt + sweater + chore",
		"Cold",
		false,
		["chino_p", "shirt_l", "sweater", "chore"],
	],
	[
		"tee-sweater-padded",
		"Tee + sweater + padded",
		"Cold",
		false,
		["casual_p", "tee_l", "sweater", "padded"],
	],
	[
		"polo-sweater-padded",
		"Polo + sweater + padded",
		"Cold",
		false,
		["chino_p", "polo_l", "sweater", "padded"],
	],
	[
		"shirt-sweater-padded",
		"Shirt + sweater + padded",
		"Cold",
		false,
		["chino_p", "shirt_l", "sweater", "padded"],
	],
] as const satisfies readonly Row[];

export type ModeId = (typeof ROWS)[number][0];

export type Mode = {
	id: ModeId;
	name: string;
	group: WeatherGroup;
	training: boolean;
	garments: readonly GarmentId[];
};

export const MODES: readonly Mode[] = ROWS.map(
	([id, name, group, training, garments]) => ({
		id,
		name,
		group,
		training,
		garments,
	}),
);

// The prototype's fresh page starts on mode 15 (dressup.html:747-750).
export const DEFAULT_MODE_ID: ModeId = "polo-sweater";

export function modeById(id: ModeId): Mode {
	const mode = MODES.find((m) => m.id === id);
	if (!mode) throw new Error(`no mode ${id}`);
	return mode;
}

const FIRST_COLOURS = Object.fromEntries(
	GARMENT_IDS.map((id) => [id, STARTER_COLOURS[id][0]]),
) as Record<GarmentId, Hex>;

export const outfitOf = (
	mode: Mode,
	colours: Record<GarmentId, Hex> = FIRST_COLOURS,
): GarmentLayer[] =>
	mode.garments.map((garment) => ({ garment, color: colours[garment] }));
