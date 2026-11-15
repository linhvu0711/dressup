import { afterEach, describe, expect, test } from "bun:test";
import {
	aiSession,
	makeHarness,
	seedLooks,
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

const sendJson = (
	h: Harness,
	ai: Session,
	method: string,
	path: string,
	body: unknown,
) =>
	send(h, ai.jar, path, {
		method,
		headers: { "content-type": "application/json" },
		body: JSON.stringify(body),
	});

const addTag = async (h: Harness, ai: Session, name: string) => {
	const res = await sendJson(h, ai, "POST", "/api/tags", { name });
	expect(res.status).toBe(201);
	return ((await res.json()) as { tag: { id: string } }).tag.id;
};

const looks = async (h: Harness, ai: Session) =>
	(
		(await (await send(h, ai.jar, "/api/looks")).json()) as {
			looks: Record<string, unknown>[];
		}
	).looks;

const lookCount = (h: Harness) =>
	h.sqlite.query("select count(*) as n from look").get();

const NAVY = {
	id: "11111111-1111-4111-8111-111111111111",
	modeId: "polo-sweater-chore",
	name: "Navy day",
	colours: {
		chino_p: "#C9B38C",
		polo_l: "#F3F1EC",
		sweater: "#1F3A5F",
		chore: "#55633F",
	},
	open: ["chore"],
	tags: [] as string[],
};

const NAVY_SAVE = {
	modeId: "polo-sweater-chore",
	name: "Navy day",
	colours: NAVY.colours,
	open: ["chore"],
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

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

describe("looks", () => {
	test("saves a new look and leaves the outfit", async () => {
		// Given
		const { h, ai } = await connected();
		const dressBefore = await dress(h, ai);
		// When
		const { isError, data } = await ai.call("save_look", NAVY_SAVE);
		// Then
		const id = (data as { look: { id: string } }).look.id;
		expect({
			isError,
			uuid: UUID.test(id),
			listed: await looks(h, ai),
			dressUnchanged: Bun.deepEquals(await dress(h, ai), dressBefore),
		}).toEqual({
			isError: false,
			uuid: true,
			listed: [{ ...NAVY, id }],
			dressUnchanged: true,
		});
	});

	test("lists no looks with its own text", async () => {
		// Given
		const { ai } = await connected();
		// When
		const { isError, text, data } = await ai.call("list_looks");
		// Then
		expect({ isError, text, data }).toEqual({
			isError: false,
			text: "You have no saved looks yet.",
			data: { looks: [] },
		});
	});

	test("lists the looks with their tags", async () => {
		// Given: a look saved on the Looks page with the tag Work
		const { h, ai } = await connected();
		const work = await addTag(h, ai, "Work");
		const saved = await sendJson(h, ai, "POST", "/api/looks", {
			...NAVY,
			tags: [work],
		});
		expect(saved.status).toBe(201);
		// When
		const { data } = await ai.call("list_looks");
		// Then
		expect(data).toEqual({
			looks: [
				{
					id: "11111111-1111-4111-8111-111111111111",
					name: "Navy day",
					modeId: "polo-sweater-chore",
					colours: {
						chino_p: "#C9B38C",
						polo_l: "#F3F1EC",
						sweater: "#1F3A5F",
						chore: "#55633F",
					},
					open: ["chore"],
					tags: [{ id: work, name: "Work" }],
				},
			],
		});
	});

	test("refuses a look garment that is not in the mode", async () => {
		// Given
		const { h, ai } = await connected();
		// When
		const { isError, text } = await ai.call("save_look", {
			modeId: "polo-sweater",
			colours: {
				chino_p: "#C9B38C",
				polo_l: "#F3F1EC",
				sweater: "#1F3A5F",
				train_p: "#1B1B1F",
			},
		});
		// Then
		expect({ isError, text, looks: (await looks(h, ai)).length }).toEqual({
			isError: true,
			text: "train_p is not in mode polo-sweater. This mode has: chino pants, long polo, sweater.",
			looks: 0,
		});
	});

	test("refuses a save at 300 looks", async () => {
		// Given: alice has 300 looks
		const { h, ai } = await connected();
		const me = (await (await send(h, ai.jar, "/api/me")).json()) as {
			id: string;
		};
		seedLooks(h, me.id, 300);
		// When
		const { isError, text } = await ai.call("save_look", NAVY_SAVE);
		// Then
		expect({ isError, text, count: lookCount(h) }).toEqual({
			isError: true,
			text: "You have 300 looks, the limit. Delete one first.",
			count: { n: 300 },
		});
	});

	test("answers a failed save with the server error text and keeps no look", async () => {
		// Given: the look row goes in, then the batch fails at its tag row
		const { h, ai } = await connected();
		const work = await addTag(h, ai, "Work");
		h.sqlite.run(
			"CREATE TRIGGER fail_tag BEFORE INSERT ON look_tag BEGIN SELECT RAISE(ABORT, 'disk full'); END",
		);
		// When
		const { isError, text } = await ai.call("save_look", {
			...NAVY_SAVE,
			tags: [work],
		});
		// Then
		expect({ isError, text, count: lookCount(h) }).toEqual({
			isError: true,
			text: "dressup could not do this. Try again.",
			count: { n: 0 },
		});
	});
});
