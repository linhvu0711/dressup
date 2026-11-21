import type { Ids } from "./harness";

export const FIRST_ID = "11111111-1111-4111-8111-111111111111";
export const SECOND_ID = "22222222-2222-4222-8222-222222222222";
export const THIRD_ID = "33333333-3333-4333-8333-333333333333";

// Khaki Harrington jacket + Black long tee + Navy casual pants.
export const three = (ids: Ids) => ({
	id: FIRST_ID,
	pieces: [
		{ typeId: "harrington", colourId: ids.Khaki },
		{ typeId: "tee_l", colourId: ids.Black },
		{ typeId: "casual_p", colourId: ids.Navy },
	],
});

// White short tee + Grey training shorts.
export const two = (ids: Ids) => ({
	id: SECOND_ID,
	pieces: [
		{ typeId: "train_sh", colourId: ids.Grey },
		{ typeId: "tee_s", colourId: ids.White },
	],
});

// THREE with Grey casual pants in place of Navy.
export const greyPants = (ids: Ids) => ({
	...three(ids),
	pieces: [
		{ typeId: "harrington", colourId: ids.Khaki },
		{ typeId: "tee_l", colourId: ids.Black },
		{ typeId: "casual_p", colourId: ids.Grey },
	],
});

// Beige chino pants and a White long tee: the pieces the races change into.
export const beigeChinos = (ids: Ids) => [
	{ typeId: "chino_p", colourId: ids.Beige },
	{ typeId: "tee_l", colourId: ids.White },
];
