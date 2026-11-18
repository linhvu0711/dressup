import { expect, test } from "bun:test";
import { GARMENT_IDS, type GarmentId, LAYER_OF, type Layer } from "./garments";

test("puts each type in one layer", () => {
	// Given: LAYER_OF and GARMENT_IDS
	// When
	const byLayer: Partial<Record<Layer, GarmentId[]>> = {};
	for (const id of GARMENT_IDS) {
		const layer = LAYER_OF[id];
		byLayer[layer] = [...(byLayer[layer] ?? []), id];
	}
	// Then
	expect({ byLayer, count: GARMENT_IDS.length }).toEqual({
		byLayer: {
			inner_top: [
				"tee_s",
				"tee_l",
				"polo_s",
				"polo_l",
				"shirt_s",
				"shirt_l",
				"ttee_s",
				"ttee_l",
			],
			sweater: ["sweater"],
			jacket: ["harrington", "wool"],
			bottom: [
				"chino_sh",
				"chino_p",
				"casual_sh",
				"casual_p",
				"train_sh",
				"train_p",
			],
		},
		count: 17,
	});
});
