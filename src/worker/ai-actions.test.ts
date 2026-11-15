import { afterEach, describe, expect, test } from "bun:test";
import {
	aiSession,
	makeHarness,
	send,
	stubOutside,
	TEST_APP_ID,
	testAppDocument,
} from "./test/harness";

let outside: ReturnType<typeof stubOutside> | undefined;
afterEach(() => outside?.restore());

async function connected() {
	const h = await makeHarness();
	outside = stubOutside({
		google: {
			sub: "g-alice",
			email: "alice@example.com",
			name: "Alice",
			picture: "https://example.com/a.png",
		},
		documents: { [TEST_APP_ID]: testAppDocument },
	});
	const ai = await aiSession(h);
	return { h, ai };
}

type Harness = Awaited<ReturnType<typeof makeHarness>>;
type Session = Awaited<ReturnType<typeof aiSession>>;

type Dress = {
	modeId: string;
	swatches: Record<string, string[]>;
	picked: Record<string, string>;
	open: string[];
	mannequin: { skin: string; hair: string };
};

const dress = async (h: Harness, ai: Session) =>
	(await (await send(h, ai.jar, "/api/dress")).json()) as Dress;

type Outfit = {
	modeId: string;
	picked: Record<string, string>;
	open: string[];
	colourSquares: Record<string, string[]>;
	skin: string;
	hair: string;
};

describe("get_outfit", () => {
	test("shows the outfit on the mannequin", async () => {
		// Given: a connected AI app on a new account
		const { ai } = await connected();
		// When
		const { isError, data } = await ai.call("get_outfit");
		// Then
		const outfit = data as Outfit;
		expect({
			isError,
			modeId: outfit.modeId,
			sweaterPicked: outfit.picked.sweater,
			sweaterSquares: outfit.colourSquares.sweater,
			open: outfit.open,
			skin: outfit.skin,
			hair: outfit.hair,
		}).toEqual({
			isError: false,
			modeId: "polo-sweater",
			sweaterPicked: "#1F3A5F",
			sweaterSquares: ["#1F3A5F", "#8C8A84", "#E6DFD0", "#7A2E2E"],
			open: [],
			skin: "#D6A27B",
			hair: "#141418",
		});
	});
});

describe("outfit changes", () => {
	test("changes the mode", async () => {
		// Given
		const { h, ai } = await connected();
		// When
		const { isError, data } = await ai.call("set_mode", {
			modeId: "tee-chore",
		});
		// Then
		expect({
			isError,
			answered: (data as Outfit).modeId,
			stored: (await dress(h, ai)).modeId,
		}).toEqual({ isError: false, answered: "tee-chore", stored: "tee-chore" });
	});

	test("picks a colour", async () => {
		// Given
		const { h, ai } = await connected();
		// When
		const { isError } = await ai.call("pick_colour", {
			garment: "sweater",
			colour: "#7A2E2E",
		});
		// Then
		expect({ isError, stored: (await dress(h, ai)).picked.sweater }).toEqual({
			isError: false,
			stored: "#7A2E2E",
		});
	});

	test("adds a colour square and picks it", async () => {
		// Given
		const { h, ai } = await connected();
		// When
		const { isError } = await ai.call("add_colour_square", {
			garment: "sweater",
			colour: "#2E5E4E",
		});
		// Then
		const stored = await dress(h, ai);
		expect({
			isError,
			row: stored.swatches.sweater,
			picked: stored.picked.sweater,
		}).toEqual({
			isError: false,
			row: ["#2E5E4E", "#1F3A5F", "#8C8A84", "#E6DFD0", "#7A2E2E"],
			picked: "#2E5E4E",
		});
	});

	test("removes a colour square", async () => {
		// Given
		const { h, ai } = await connected();
		// When
		const { isError } = await ai.call("remove_colour_square", {
			garment: "sweater",
			colour: "#7A2E2E",
		});
		// Then
		expect({ isError, row: (await dress(h, ai)).swatches.sweater }).toEqual({
			isError: false,
			row: ["#1F3A5F", "#8C8A84", "#E6DFD0"],
		});
	});

	test("opens a jacket", async () => {
		// Given
		const { h, ai } = await connected();
		// When
		const { isError } = await ai.call("set_jacket", {
			jacket: "chore",
			open: true,
		});
		// Then
		expect({ isError, open: (await dress(h, ai)).open }).toEqual({
			isError: false,
			open: ["chore"],
		});
	});

	test("sets the skin colour", async () => {
		// Given
		const { h, ai } = await connected();
		// When
		const { isError } = await ai.call("set_mannequin_colour", {
			part: "skin",
			colour: "#8D5524",
		});
		// Then
		expect({ isError, mannequin: (await dress(h, ai)).mannequin }).toEqual({
			isError: false,
			mannequin: { skin: "#8D5524", hair: "#141418" },
		});
	});

	test("refuses an unknown mode", async () => {
		// Given
		const { h, ai } = await connected();
		// When
		const { isError, text } = await ai.call("set_mode", { modeId: "banana" });
		// Then
		expect({ isError, text, stored: (await dress(h, ai)).modeId }).toEqual({
			isError: true,
			text: "banana is not a mode. Modes: tee-casual-shorts, tee-casual-pants, polo-chino-shorts, polo-chino-pants, shirt-chino-shorts, shirt-chino-pants, training-tee-shorts, long-tee-casual-pants, long-polo-chino-pants, long-shirt-chino-pants, tee-chore, polo-chore, shirt-chore, long-training-tee-pants, tee-sweater, polo-sweater, shirt-sweater, tee-sweater-chore, polo-sweater-chore, shirt-sweater-chore, tee-sweater-padded, polo-sweater-padded, shirt-sweater-padded.",
			stored: "polo-sweater",
		});
	});

	test("refuses a colour not written as #RRGGBB", async () => {
		// Given
		const { h, ai } = await connected();
		// When
		const { isError, text } = await ai.call("pick_colour", {
			garment: "sweater",
			colour: "navy",
		});
		// Then
		expect({
			isError,
			text,
			stored: (await dress(h, ai)).picked.sweater,
		}).toEqual({
			isError: true,
			text: "navy is not a colour written as #RRGGBB with capital letters, such as #1F3A5F.",
			stored: "#1F3A5F",
		});
	});

	test("refuses to pick a colour that is not in the row", async () => {
		// Given
		const { h, ai } = await connected();
		// When
		const { isError, text } = await ai.call("pick_colour", {
			garment: "sweater",
			colour: "#2E5E4E",
		});
		// Then
		expect({
			isError,
			text,
			stored: (await dress(h, ai)).picked.sweater,
		}).toEqual({
			isError: true,
			text: "#2E5E4E is not in the sweater row. This row has: #1F3A5F, #8C8A84, #E6DFD0, #7A2E2E.",
			stored: "#1F3A5F",
		});
	});

	test("refuses to remove the last colour square", async () => {
		// Given: three of the sweater's four squares removed
		const { h, ai } = await connected();
		for (const colour of ["#8C8A84", "#E6DFD0", "#7A2E2E"])
			expect(
				(await ai.call("remove_colour_square", { garment: "sweater", colour }))
					.isError,
			).toBe(false);
		// When
		const { isError, text } = await ai.call("remove_colour_square", {
			garment: "sweater",
			colour: "#1F3A5F",
		});
		// Then
		expect({
			isError,
			text,
			row: (await dress(h, ai)).swatches.sweater,
		}).toEqual({
			isError: true,
			text: "#1F3A5F is the last colour square of sweater. A row keeps at least one.",
			row: ["#1F3A5F"],
		});
	});
});
