import { afterEach, describe, expect, test } from "bun:test";
import {
	aiSession,
	makeHarness,
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
