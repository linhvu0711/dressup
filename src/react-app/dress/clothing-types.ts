import type { Hex } from "@/colour/hex";

export type { Hex };

// The type list.
export const TYPE_IDS = [
	"tee_s",
	"tee_l",
	"polo_s",
	"polo_l",
	"shirt_s",
	"shirt_l",
	"sweater",
	"harrington",
	"wool",
	"ttee_s",
	"ttee_l",
	"chino_sh",
	"chino_p",
	"casual_sh",
	"casual_p",
	"train_sh",
	"train_p",
] as const;

export type TypeId = (typeof TYPE_IDS)[number];

export const TYPE_NAMES: Record<TypeId, string> = {
	tee_s: "Short tee",
	tee_l: "Long tee",
	polo_s: "Short polo",
	polo_l: "Long polo",
	shirt_s: "Short button-up",
	shirt_l: "Long button-up",
	sweater: "Sweater",
	harrington: "Harrington jacket",
	wool: "Wool jacket",
	ttee_s: "Short training tee",
	ttee_l: "Long training tee",
	chino_sh: "Chino shorts",
	chino_p: "Chino pants",
	casual_sh: "Casual shorts",
	casual_p: "Casual pants",
	train_sh: "Training shorts",
	train_p: "Training pants",
};

export const JACKET_IDS = ["harrington", "wool"] as const;

export type JacketId = (typeof JACKET_IDS)[number];

export const isJacket = (id: TypeId): id is JacketId =>
	(JACKET_IDS as readonly TypeId[]).includes(id);

export const LAYERS = ["bottom", "inner_top", "sweater", "jacket"] as const;

export type Layer = (typeof LAYERS)[number];

export const LAYER_NAMES: Record<Layer, string> = {
	bottom: "Bottom",
	inner_top: "Inner top",
	sweater: "Sweater",
	jacket: "Jacket",
};

// The chip of a whole layer in a filter, so the layer "Sweaters" never reads
// as the type "Sweater".
export const LAYER_GROUP_NAMES: Record<Layer, string> = {
	bottom: "Bottoms",
	inner_top: "Inner tops",
	sweater: "Sweaters",
	jacket: "Jackets",
};

export const LAYER_OF: Record<TypeId, Layer> = {
	tee_s: "inner_top",
	tee_l: "inner_top",
	polo_s: "inner_top",
	polo_l: "inner_top",
	shirt_s: "inner_top",
	shirt_l: "inner_top",
	sweater: "sweater",
	harrington: "jacket",
	wool: "jacket",
	ttee_s: "inner_top",
	ttee_l: "inner_top",
	chino_sh: "bottom",
	chino_p: "bottom",
	casual_sh: "bottom",
	casual_p: "bottom",
	train_sh: "bottom",
	train_p: "bottom",
};

export type FigureLayer = { typeId: TypeId; color: Hex };
