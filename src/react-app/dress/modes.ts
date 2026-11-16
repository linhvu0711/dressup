import {
	GARMENT_IDS,
	type GarmentId,
	type GarmentLayer,
	type Hex,
	STARTER_COLOURS,
} from "@/dress/garments";

export const WEATHER_GROUPS = ["Hot", "Cool", "Cold"] as const;

export type WeatherGroup = (typeof WEATHER_GROUPS)[number];

type Row = readonly [
	id: string,
	name: string,
	group: WeatherGroup,
	training: boolean,
	garments: readonly GarmentId[],
];

// The mode list, garments bottom
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
		"tee-harrington",
		"Tee + Harrington jacket",
		"Cool",
		false,
		["casual_p", "tee_l", "harrington"],
	],
	[
		"polo-harrington",
		"Polo + Harrington jacket",
		"Cool",
		false,
		["chino_p", "polo_l", "harrington"],
	],
	[
		"shirt-harrington",
		"Shirt + Harrington jacket",
		"Cool",
		false,
		["chino_p", "shirt_l", "harrington"],
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
		"tee-sweater-harrington",
		"Tee + sweater + Harrington",
		"Cold",
		false,
		["casual_p", "tee_l", "sweater", "harrington"],
	],
	[
		"polo-sweater-harrington",
		"Polo + sweater + Harrington",
		"Cold",
		false,
		["chino_p", "polo_l", "sweater", "harrington"],
	],
	[
		"shirt-sweater-harrington",
		"Shirt + sweater + Harrington",
		"Cold",
		false,
		["chino_p", "shirt_l", "sweater", "harrington"],
	],
	[
		"tee-sweater-wool",
		"Tee + sweater + wool",
		"Cold",
		false,
		["casual_p", "tee_l", "sweater", "wool"],
	],
	[
		"polo-sweater-wool",
		"Polo + sweater + wool",
		"Cold",
		false,
		["chino_p", "polo_l", "sweater", "wool"],
	],
	[
		"shirt-sweater-wool",
		"Shirt + sweater + wool",
		"Cold",
		false,
		["chino_p", "shirt_l", "sweater", "wool"],
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

// A fresh Dress page starts on this mode.
export const DEFAULT_MODE_ID: ModeId = "polo-sweater";

export function modeById(id: ModeId): Mode {
	const mode = MODES.find((m) => m.id === id);
	if (!mode) throw new Error(`no mode ${id}`);
	return mode;
}

const FIRST_COLOURS = Object.fromEntries(
	GARMENT_IDS.map((id) => [id, STARTER_COLOURS[id][0]]),
) as Record<GarmentId, Hex>;

// A look holds only its mode's garments, so the colours may be partial.
export const outfitOf = (
	mode: Mode,
	colours: Partial<Record<GarmentId, Hex>> = FIRST_COLOURS,
): GarmentLayer[] =>
	mode.garments.map((garment) => ({
		garment,
		color: colours[garment] ?? FIRST_COLOURS[garment],
	}));
