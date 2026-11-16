import { describe, expect, test } from "bun:test";
import { GARMENT_IDS, STARTER_COLOURS } from "@/dress/garments";
import { MODES, modeById, outfitOf } from "@/dress/modes";

describe("modes", () => {
	test("lists the 23 modes", () => {
		// Given: the mode list
		// When
		const rows = MODES.map(({ id, name, group, training, garments }) => [
			id,
			name,
			group,
			training,
			garments.join(" "),
		]);
		// Then
		expect(rows).toEqual([
			[
				"tee-casual-shorts",
				"Tee + casual shorts",
				"Hot",
				false,
				"casual_sh tee_s",
			],
			[
				"tee-casual-pants",
				"Tee + casual pants",
				"Hot",
				false,
				"casual_p tee_s",
			],
			[
				"polo-chino-shorts",
				"Polo + chino shorts",
				"Hot",
				false,
				"chino_sh polo_s",
			],
			[
				"polo-chino-pants",
				"Polo + chino pants",
				"Hot",
				false,
				"chino_p polo_s",
			],
			[
				"shirt-chino-shorts",
				"Shirt + chino shorts",
				"Hot",
				false,
				"chino_sh shirt_s",
			],
			[
				"shirt-chino-pants",
				"Shirt + chino pants",
				"Hot",
				false,
				"chino_p shirt_s",
			],
			[
				"training-tee-shorts",
				"Training tee + shorts",
				"Hot",
				true,
				"train_sh ttee_s",
			],
			[
				"long-tee-casual-pants",
				"Long tee + casual pants",
				"Cool",
				false,
				"casual_p tee_l",
			],
			[
				"long-polo-chino-pants",
				"Long polo + chino pants",
				"Cool",
				false,
				"chino_p polo_l",
			],
			[
				"long-shirt-chino-pants",
				"Long shirt + chino pants",
				"Cool",
				false,
				"chino_p shirt_l",
			],
			[
				"tee-harrington",
				"Tee + Harrington jacket",
				"Cool",
				false,
				"casual_p tee_l harrington",
			],
			[
				"polo-harrington",
				"Polo + Harrington jacket",
				"Cool",
				false,
				"chino_p polo_l harrington",
			],
			[
				"shirt-harrington",
				"Shirt + Harrington jacket",
				"Cool",
				false,
				"chino_p shirt_l harrington",
			],
			[
				"long-training-tee-pants",
				"Long training tee + pants",
				"Cool",
				true,
				"train_p ttee_l",
			],
			["tee-sweater", "Tee + sweater", "Cold", false, "casual_p tee_l sweater"],
			[
				"polo-sweater",
				"Polo + sweater",
				"Cold",
				false,
				"chino_p polo_l sweater",
			],
			[
				"shirt-sweater",
				"Shirt + sweater",
				"Cold",
				false,
				"chino_p shirt_l sweater",
			],
			[
				"tee-sweater-harrington",
				"Tee + sweater + Harrington",
				"Cold",
				false,
				"casual_p tee_l sweater harrington",
			],
			[
				"polo-sweater-harrington",
				"Polo + sweater + Harrington",
				"Cold",
				false,
				"chino_p polo_l sweater harrington",
			],
			[
				"shirt-sweater-harrington",
				"Shirt + sweater + Harrington",
				"Cold",
				false,
				"chino_p shirt_l sweater harrington",
			],
			[
				"tee-sweater-wool",
				"Tee + sweater + wool",
				"Cold",
				false,
				"casual_p tee_l sweater wool",
			],
			[
				"polo-sweater-wool",
				"Polo + sweater + wool",
				"Cold",
				false,
				"chino_p polo_l sweater wool",
			],
			[
				"shirt-sweater-wool",
				"Shirt + sweater + wool",
				"Cold",
				false,
				"chino_p shirt_l sweater wool",
			],
		]);
	});

	test("puts 7 in Hot, 7 in Cool, 9 in Cold", () => {
		// Given: the mode list
		// When
		const counts: Record<string, number> = {};
		for (const { group } of MODES) counts[group] = (counts[group] ?? 0) + 1;
		// Then
		expect(counts).toEqual({ Hot: 7, Cool: 7, Cold: 9 });
	});

	test("marks two training modes", () => {
		// Given: the mode list
		// When
		const names = MODES.filter((m) => m.training).map((m) => m.name);
		// Then
		expect(names).toEqual([
			"Training tee + shorts",
			"Long training tee + pants",
		]);
	});

	test("names only the 17 garments", () => {
		// Given: the mode list and the garment list
		// When
		const known: readonly string[] = GARMENT_IDS;
		const unknown = MODES.flatMap((m) => m.garments).filter(
			(g) => !known.includes(g),
		);
		// Then
		expect([GARMENT_IDS.length, unknown]).toEqual([17, []]);
	});

	test("dresses layered modes in the long top", () => {
		// Given: the mode list
		// When
		const layered = ["sweater", "harrington", "wool"];
		const short = ["tee_s", "polo_s", "shirt_s", "ttee_s"];
		const wrong = MODES.filter(
			(m) =>
				m.garments.some((g) => layered.includes(g)) &&
				m.garments.some((g) => short.includes(g)),
		).map((m) => m.id);
		// Then
		expect(wrong).toEqual([]);
	});

	test("starts each garment in its first starter colour", () => {
		// Given: the garment list and the starter colours
		// When
		const first = Object.fromEntries(
			GARMENT_IDS.map((g) => [g, STARTER_COLOURS[g][0]]),
		);
		const outfit = outfitOf(modeById("tee-sweater-wool"));
		// Then
		expect([first, outfit]).toEqual([
			{
				tee_s: "#F3F1EC",
				tee_l: "#F3F1EC",
				polo_s: "#F3F1EC",
				polo_l: "#F3F1EC",
				shirt_s: "#F3F1EC",
				shirt_l: "#BFD3EA",
				sweater: "#1F3A5F",
				harrington: "#C9B38C",
				wool: "#A8865C",
				ttee_s: "#1B1B1F",
				ttee_l: "#1B1B1F",
				chino_sh: "#C9B38C",
				chino_p: "#C9B38C",
				casual_sh: "#8C8A84",
				casual_p: "#8C8A84",
				train_sh: "#1B1B1F",
				train_p: "#1B1B1F",
			},
			[
				{ garment: "casual_p", color: "#8C8A84" },
				{ garment: "tee_l", color: "#F3F1EC" },
				{ garment: "sweater", color: "#1F3A5F" },
				{ garment: "wool", color: "#A8865C" },
			],
		]);
	});
});
