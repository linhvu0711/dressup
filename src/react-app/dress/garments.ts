export type Hex = `#${string}`;

// The garment list `G` of docs/prototype/dressup.html:705-707, in its order.
export const GARMENT_IDS = [
	"tee_s",
	"tee_l",
	"polo_s",
	"polo_l",
	"shirt_s",
	"shirt_l",
	"sweater",
	"chore",
	"padded",
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
	chore: "Chore jacket",
	padded: "Padded jacket",
	ttee_s: "Short training tee",
	ttee_l: "Long training tee",
	chino_sh: "Chino shorts",
	chino_p: "Chino pants",
	casual_sh: "Casual shorts",
	casual_p: "Casual pants",
	train_sh: "Training shorts",
	train_p: "Training pants",
};

export const JACKET_IDS = ["chore", "padded"] as const;

export type JacketId = (typeof JACKET_IDS)[number];

export const isJacket = (id: GarmentId): id is JacketId =>
	(JACKET_IDS as readonly GarmentId[]).includes(id);

export type GarmentLayer = { garment: GarmentId; color: Hex };
