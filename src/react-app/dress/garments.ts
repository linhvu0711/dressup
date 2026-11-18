import type { Hex } from "@/colour/hex";

export type { Hex };

// The garment list.
export const GARMENT_IDS = [
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

export type GarmentId = (typeof GARMENT_IDS)[number];

export const GARMENT_NAMES: Record<GarmentId, string> = {
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

export const isJacket = (id: GarmentId): id is JacketId =>
	(JACKET_IDS as readonly GarmentId[]).includes(id);

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

export const LAYER_OF: Record<GarmentId, Layer> = {
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

export type GarmentLayer = { garment: GarmentId; color: Hex };

const W = "#F3F1EC";
const BK = "#1B1B1F";
const NV = "#1F3A5F";
const GY = "#8C8A84";
const KH = "#C9B38C";
const CH = "#39424F";
const LB = "#BFD3EA";
const CR = "#E6DFD0";
const BG = "#7A2E2E";
const ST = "#9C9A98";
const FO = "#2F5D50";
const GR = "#2F4A3A";
const CA = "#A8865C";

// A garment starts in the first colour of its set.
export const STARTER_COLOURS: Record<GarmentId, readonly Hex[]> = {
	tee_s: [W, BK, GY, NV],
	tee_l: [W, BK, GY, NV],
	polo_s: [W, NV, BK, FO],
	polo_l: [W, NV, BK, FO],
	shirt_s: [W, LB, NV],
	shirt_l: [LB, W, NV],
	sweater: [NV, GY, CR, BG],
	harrington: [KH, NV, GR],
	wool: [CA, CH, NV],
	ttee_s: [BK, GY, W],
	ttee_l: [BK, GY, W],
	chino_sh: [KH, CH, ST],
	chino_p: [KH, CH, ST, BK],
	casual_sh: [GY, BK, CH],
	casual_p: [GY, BK, CH, KH],
	train_sh: [BK, CH, GY],
	train_p: [BK, CH, GY],
};
