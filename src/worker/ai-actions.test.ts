import { afterEach, describe, expect, setSystemTime, test } from "bun:test";
import { addBrand } from "./brand-store";
import { saveCombination } from "./combination-store";
import { schema } from "./db";
import {
	type aiSession,
	BOB,
	type Harness,
	send,
	withAiSession,
} from "./test/harness";

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

// A second account, bob, and a way to send as him.
async function asBob(h: Harness) {
	const headers = Object.fromEntries(await h.addAccount(BOB));
	return (method: string, path: string, body?: unknown) =>
		h.app.request(
			path,
			body === undefined
				? { method, headers }
				: {
						method,
						headers: { ...headers, "content-type": "application/json" },
						body: JSON.stringify(body),
					},
			h.env,
		);
}

const tags = async (h: Harness, ai: Session) =>
	(
		(await (await send(h, ai.jar, "/api/tags")).json()) as {
			tags: { id: string; name: string; combinations: number }[];
		}
	).tags;

const looks = async (h: Harness, ai: Session) =>
	(
		(await (await send(h, ai.jar, "/api/looks")).json()) as {
			looks: Record<string, unknown>[];
		}
	).looks;

const lookCount = async (h: Harness) => (await h.rows(schema.look)).length;

const NAVY = {
	id: "11111111-1111-4111-8111-111111111111",
	modeId: "polo-sweater-harrington",
	name: "Navy day",
	colours: {
		chino_p: "#C9B38C",
		polo_l: "#F3F1EC",
		sweater: "#1F3A5F",
		harrington: "#55633F",
	},
	open: ["harrington"],
	tags: [] as string[],
};

const NAVY_SAVE = {
	modeId: "polo-sweater-harrington",
	name: "Navy day",
	colours: NAVY.colours,
	open: ["harrington"],
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
		const { ai } = await withAiSession();
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
		const { h, ai } = await withAiSession();
		// When
		const { isError, data } = await ai.call("set_mode", {
			modeId: "tee-harrington",
		});
		// Then
		expect({
			isError,
			answered: (data as Outfit).modeId,
			stored: (await dress(h, ai)).modeId,
		}).toEqual({
			isError: false,
			answered: "tee-harrington",
			stored: "tee-harrington",
		});
	});

	test("picks a colour", async () => {
		// Given
		const { h, ai } = await withAiSession();
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
		const { h, ai } = await withAiSession();
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
		const { h, ai } = await withAiSession();
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
		const { h, ai } = await withAiSession();
		// When
		const { isError } = await ai.call("set_jacket", {
			jacket: "harrington",
			open: true,
		});
		// Then
		expect({ isError, open: (await dress(h, ai)).open }).toEqual({
			isError: false,
			open: ["harrington"],
		});
	});

	test("refuses the old chore jacket", async () => {
		// Given
		const { h, ai } = await withAiSession();
		// When
		const { isError, text } = await ai.call("set_jacket", {
			jacket: "chore",
			open: true,
		});
		// Then
		expect({ isError, text, open: (await dress(h, ai)).open }).toEqual({
			isError: true,
			text: "chore is not a jacket. Jackets: harrington, wool.",
			open: [],
		});
	});

	test("sets the skin colour", async () => {
		// Given
		const { h, ai } = await withAiSession();
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

	test("refuses an unknown mannequin part", async () => {
		// Given: the passing skin case with the part changed to eyes
		const { h, ai } = await withAiSession();
		// When
		const { isError, text } = await ai.call("set_mannequin_colour", {
			part: "eyes",
			colour: "#141418",
		});
		// Then
		expect({
			isError,
			text,
			skin: (await dress(h, ai)).mannequin.skin,
		}).toEqual({
			isError: true,
			text: "eyes is not a mannequin part. Parts: skin, hair.",
			skin: "#D6A27B",
		});
	});

	test("refuses an unknown mode", async () => {
		// Given
		const { h, ai } = await withAiSession();
		// When
		const { isError, text } = await ai.call("set_mode", { modeId: "banana" });
		// Then
		expect({ isError, text, stored: (await dress(h, ai)).modeId }).toEqual({
			isError: true,
			text: "banana is not a mode. Modes: tee-casual-shorts, tee-casual-pants, polo-chino-shorts, polo-chino-pants, shirt-chino-shorts, shirt-chino-pants, training-tee-shorts, long-tee-casual-pants, long-polo-chino-pants, long-shirt-chino-pants, tee-harrington, polo-harrington, shirt-harrington, long-training-tee-pants, tee-sweater, polo-sweater, shirt-sweater, tee-sweater-harrington, polo-sweater-harrington, shirt-sweater-harrington, tee-sweater-wool, polo-sweater-wool, shirt-sweater-wool.",
			stored: "polo-sweater",
		});
	});

	test("refuses a colour not written as #RRGGBB", async () => {
		// Given
		const { h, ai } = await withAiSession();
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

	test("refuses an unknown garment", async () => {
		// Given: the passing pick with the garment changed to hat
		const { ai } = await withAiSession();
		// When
		const { isError, text } = await ai.call("pick_colour", {
			garment: "hat",
			colour: "#1F3A5F",
		});
		// Then
		expect({ isError, text }).toEqual({
			isError: true,
			text: "hat is not a garment. Garments: tee_s, tee_l, polo_s, polo_l, shirt_s, shirt_l, sweater, harrington, wool, ttee_s, ttee_l, chino_sh, chino_p, casual_sh, casual_p, train_sh, train_p.",
		});
	});

	test("refuses to pick a colour that is not in the row", async () => {
		// Given
		const { h, ai } = await withAiSession();
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

	test("refuses to remove a colour square that is not in the row", async () => {
		// Given: the starter sweater row
		const { h, ai } = await withAiSession();
		// When
		const { isError, text } = await ai.call("remove_colour_square", {
			garment: "sweater",
			colour: "#2E5E4E",
		});
		// Then
		expect({
			isError,
			text,
			row: (await dress(h, ai)).swatches.sweater,
		}).toEqual({
			isError: true,
			text: "#2E5E4E is not in the sweater row. This row has: #1F3A5F, #8C8A84, #E6DFD0, #7A2E2E.",
			row: ["#1F3A5F", "#8C8A84", "#E6DFD0", "#7A2E2E"],
		});
	});

	test("refuses to remove the last colour square", async () => {
		// Given: three of the sweater's four squares removed
		const { h, ai } = await withAiSession();
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
		const { h, ai } = await withAiSession();
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
		const { ai } = await withAiSession();
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
		const { h, ai } = await withAiSession();
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
					modeId: "polo-sweater-harrington",
					colours: {
						chino_p: "#C9B38C",
						polo_l: "#F3F1EC",
						sweater: "#1F3A5F",
						harrington: "#55633F",
					},
					open: ["harrington"],
					tags: [{ id: work, name: "Work" }],
				},
			],
		});
	});

	test("refuses a look garment that is not in the mode", async () => {
		// Given
		const { h, ai } = await withAiSession();
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

	test("refuses a mode garment with no colour", async () => {
		// Given
		const { h, ai } = await withAiSession();
		// When
		const { isError, text } = await ai.call("save_look", {
			modeId: "polo-sweater",
			colours: { chino_p: "#C9B38C", polo_l: "#F3F1EC" },
		});
		// Then
		expect({ isError, text, looks: (await looks(h, ai)).length }).toEqual({
			isError: true,
			text: "sweater needs a colour. Mode polo-sweater has: chino pants, long polo, sweater.",
			looks: 0,
		});
	});

	test("refuses an open jacket that is not in the mode", async () => {
		// Given
		const { h, ai } = await withAiSession();
		// When
		const { isError, text } = await ai.call("save_look", {
			modeId: "polo-sweater",
			colours: { chino_p: "#C9B38C", polo_l: "#F3F1EC", sweater: "#1F3A5F" },
			open: ["wool"],
		});
		// Then
		expect({ isError, text, looks: (await looks(h, ai)).length }).toEqual({
			isError: true,
			text: "wool is not in mode polo-sweater. This mode has: chino pants, long polo, sweater.",
			looks: 0,
		});
	});

	test("refuses a look name of 61 characters", async () => {
		// Given
		const { h, ai } = await withAiSession();
		// When
		const { isError, text } = await ai.call("save_look", {
			...NAVY_SAVE,
			name: "a".repeat(61),
		});
		// Then
		expect({ isError, text, looks: (await looks(h, ai)).length }).toEqual({
			isError: true,
			text: "A look name has at most 60 characters.",
			looks: 0,
		});
	});

	test("refuses a look with 51 tags", async () => {
		// Given
		const { h, ai } = await withAiSession();
		const tags = Array.from(
			{ length: 51 },
			(_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
		);
		// When
		const { isError, text } = await ai.call("save_look", {
			...NAVY_SAVE,
			tags,
		});
		// Then
		expect({ isError, text, looks: (await looks(h, ai)).length }).toEqual({
			isError: true,
			text: "A look has at most 50 tags.",
			looks: 0,
		});
	});

	test("saves a look without a gone tag and another account's tag and names them", async () => {
		// Given: alice has tag "Work" and deleted tag "Old"; bob posted tag "Trip"
		const { h, ai } = await withAiSession();
		const work = await addTag(h, ai, "Work");
		const old = await addTag(h, ai, "Old");
		await send(h, ai.jar, `/api/tags/${old}`, { method: "DELETE" });
		const bob = await asBob(h);
		const bobTrip = (
			(await (await bob("POST", "/api/tags", { name: "Trip" })).json()) as {
				tag: { id: string };
			}
		).tag.id;
		// When
		const { isError, text, data } = await ai.call("save_look", {
			...NAVY_SAVE,
			tags: [work, old, bobTrip],
		});
		// Then
		expect({
			isError,
			said: text.split("\n")[0],
			leftOff: (data as { tagsLeftOff: string[] }).tagsLeftOff,
			tags: (await looks(h, ai))[0]?.tags,
		}).toEqual({
			isError: false,
			said: `Left off tag ${old}: no tag with this id. Left off tag ${bobTrip}: no tag with this id.`,
			leftOff: [old, bobTrip],
			tags: [work],
		});
	});

	test("refuses a save at 300 looks", async () => {
		// Given: alice has 300 looks
		const { h, ai, userId } = await withAiSession();
		await h.seedLooks(userId, 300);
		// When
		const { isError, text } = await ai.call("save_look", NAVY_SAVE);
		// Then
		expect({ isError, text, count: await lookCount(h) }).toEqual({
			isError: true,
			text: "You have 300 looks, the limit. Delete one first.",
			count: 300,
		});
	});

	test("answers a failed save with the server error text and keeps no look", async () => {
		// Given: the look row goes in, then the batch fails at its tag row
		const { h, ai } = await withAiSession();
		const work = await addTag(h, ai, "Work");
		h.addTrigger(
			"CREATE TRIGGER fail_tag BEFORE INSERT ON look_tag BEGIN SELECT RAISE(ABORT, 'disk full'); END",
		);
		// When
		const { isError, text } = await ai.call("save_look", {
			...NAVY_SAVE,
			tags: [work],
		});
		// Then
		expect({ isError, text, count: await lookCount(h) }).toEqual({
			isError: true,
			text: "dressup could not do this. Try again.",
			count: 0,
		});
	});
});

describe("look changes", () => {
	async function withNavy() {
		const { h, ai } = await withAiSession();
		const saved = await sendJson(h, ai, "POST", "/api/looks", NAVY);
		expect(saved.status).toBe(201);
		return { h, ai };
	}

	test("changes a look's name, a colour, and its tags", async () => {
		// Given
		const { h, ai } = await withNavy();
		const work = await addTag(h, ai, "Work");
		// When
		const { isError } = await ai.call("change_look", {
			id: NAVY.id,
			name: "Navy night",
			colours: { sweater: "#7A2E2E" },
			tags: [work],
		});
		// Then
		expect({ isError, stored: (await looks(h, ai))[0] }).toEqual({
			isError: false,
			stored: {
				...NAVY,
				name: "Navy night",
				colours: {
					chino_p: "#C9B38C",
					polo_l: "#F3F1EC",
					sweater: "#7A2E2E",
					harrington: "#55633F",
				},
				open: ["harrington"],
				tags: [work],
			},
		});
	});

	test("keeps a colour the page saved while a look change ran", async () => {
		// Given: the page saves a new harrington colour after change_look read the
		// look and before it writes. change_look's first batch is its read of
		// the looks, its second its write.
		const { h, ai } = await withNavy();
		const { db } = h;
		const batch = db.batch.bind(db);
		let batches = 0;
		const writeAfterPage: typeof batch = async (items) => {
			if (++batches === 1) return batch(items);
			db.batch = batch;
			const put = await sendJson(h, ai, "PUT", `/api/looks/${NAVY.id}`, {
				...NAVY,
				colours: { ...NAVY.colours, harrington: "#1F3A5F" },
			});
			expect(put.status).toBe(200);
			return batch(items);
		};
		db.batch = writeAfterPage;
		// When
		const { isError } = await ai.call("change_look", {
			id: NAVY.id,
			colours: { sweater: "#7A2E2E" },
		});
		// Then
		expect({ isError, colours: (await looks(h, ai))[0]?.colours }).toEqual({
			isError: false,
			colours: {
				chino_p: "#C9B38C",
				polo_l: "#F3F1EC",
				sweater: "#7A2E2E",
				harrington: "#1F3A5F",
			},
		});
	});

	test("refuses a colour change when the page moved the look to another mode", async () => {
		// Given: the page moves NAVY to polo-sweater-wool after change_look read
		// the look and before it writes.
		const { h, ai } = await withNavy();
		const { db } = h;
		const batch = db.batch.bind(db);
		let batches = 0;
		const WOOL = {
			...NAVY,
			modeId: "polo-sweater-wool",
			colours: {
				chino_p: "#C9B38C",
				polo_l: "#F3F1EC",
				sweater: "#1F3A5F",
				wool: "#55633F",
			},
			open: [],
		};
		const writeAfterPage: typeof batch = async (items) => {
			if (++batches === 1) return batch(items);
			db.batch = batch;
			const put = await sendJson(h, ai, "PUT", `/api/looks/${NAVY.id}`, WOOL);
			expect(put.status).toBe(200);
			return batch(items);
		};
		db.batch = writeAfterPage;
		// When
		const { isError, text } = await ai.call("change_look", {
			id: NAVY.id,
			colours: { sweater: "#7A2E2E" },
		});
		// Then
		expect({ isError, text, stored: (await looks(h, ai))[0] }).toEqual({
			isError: true,
			text: "dressup could not do this. Try again.",
			stored: WOOL,
		});
	});

	test("changes only a look's tags", async () => {
		// Given
		const { h, ai } = await withNavy();
		const work = await addTag(h, ai, "Work");
		// When
		const { isError } = await ai.call("change_look", {
			id: NAVY.id,
			tags: [work],
		});
		// Then
		expect({ isError, stored: (await looks(h, ai))[0] }).toEqual({
			isError: false,
			stored: { ...NAVY, tags: [work] },
		});
	});

	test("changes a look without a gone tag and names it", async () => {
		// Given: tag "Work", and tag "Old" added and deleted
		const { h, ai } = await withNavy();
		const work = await addTag(h, ai, "Work");
		const old = await addTag(h, ai, "Old");
		await send(h, ai.jar, `/api/tags/${old}`, { method: "DELETE" });
		// When
		const { isError, text, data } = await ai.call("change_look", {
			id: NAVY.id,
			tags: [work, old],
		});
		// Then
		expect({
			isError,
			said: text.split("\n")[0],
			leftOff: (data as { tagsLeftOff: string[] }).tagsLeftOff,
			stored: (await looks(h, ai))[0],
		}).toEqual({
			isError: false,
			said: `Left off tag ${old}: no tag with this id.`,
			leftOff: [old],
			stored: { ...NAVY, tags: [work] },
		});
	});

	test("refuses a change with a garment not in the look's mode", async () => {
		// Given
		const { h, ai } = await withNavy();
		// When
		const { isError, text } = await ai.call("change_look", {
			id: NAVY.id,
			colours: { train_p: "#1B1B1F" },
		});
		// Then
		expect({
			isError,
			text,
			colours: (await looks(h, ai))[0]?.colours,
		}).toEqual({
			isError: true,
			text: "train_p is not in mode polo-sweater-harrington. This mode has: chino pants, long polo, sweater, harrington jacket.",
			colours: NAVY.colours,
		});
	});

	test("refuses a change to a look that is gone", async () => {
		// Given
		const { h, ai } = await withNavy();
		expect(
			(await send(h, ai.jar, `/api/looks/${NAVY.id}`, { method: "DELETE" }))
				.status,
		).toBe(204);
		// When
		const { isError, text } = await ai.call("change_look", {
			id: NAVY.id,
			name: "Navy night",
		});
		// Then
		expect({ isError, text, looks: (await looks(h, ai)).length }).toEqual({
			isError: true,
			text: "No look with this id.",
			looks: 0,
		});
	});

	test("deletes a look", async () => {
		// Given
		const { h, ai } = await withNavy();
		// When
		const { isError } = await ai.call("delete_look", { id: NAVY.id });
		// Then
		expect({ isError, looks: (await looks(h, ai)).length }).toEqual({
			isError: false,
			looks: 0,
		});
	});

	test("refuses to delete another account's look", async () => {
		// Given: bob saved NAVY
		const { h, ai } = await withAiSession();
		const bob = await asBob(h);
		expect((await bob("POST", "/api/looks", NAVY)).status).toBe(201);
		// When
		const { isError, text } = await ai.call("delete_look", { id: NAVY.id });
		// Then
		const bobLooks = (await (await bob("GET", "/api/looks")).json()) as {
			looks: unknown[];
		};
		expect({ isError, text, bobLooks: bobLooks.looks.length }).toEqual({
			isError: true,
			text: "No look with this id.",
			bobLooks: 1,
		});
	});
});

describe("tags", () => {
	const R = { readOnlyHint: true };
	const W = { readOnlyHint: false, destructiveHint: false };
	const D = { readOnlyHint: false, destructiveHint: true };

	test("lists every AI action with its marks", async () => {
		// Given
		const { ai } = await withAiSession();
		// When
		const listed = await ai.list();
		// Then
		expect(listed.map((t) => [t.name, t.annotations])).toEqual([
			["list_garments_and_modes", R],
			["get_outfit", R],
			["set_mode", W],
			["pick_colour", W],
			["add_colour_square", W],
			["remove_colour_square", D],
			["set_jacket", W],
			["set_mannequin_colour", W],
			["list_looks", R],
			["save_look", W],
			["change_look", W],
			["delete_look", D],
			["list_tags", R],
			["add_tag", W],
			["rename_tag", W],
			["delete_tag", D],
			["list_colours", R],
			["add_colour", W],
			["change_colour", W],
			["delete_colour", D],
			["list_brands", R],
			["add_brand", W],
			["rename_brand", W],
			["delete_brand", D],
			["list_types", R],
			["list_combinations", R],
			["save_combination", W],
			["change_combination", W],
			["delete_combination", D],
			["list_owned_items", R],
			["add_owned_item", W],
			["change_owned_item", W],
			["delete_owned_item", D],
			["list_wishes", R],
			["add_wish", W],
			["delete_wish", D],
			["add_shop_link", W],
			["change_shop_link", W],
			["delete_shop_link", D],
		]);
		expect(listed.every((t) => typeof t.title === "string")).toBe(true);
	});

	test("lists no tags with its own text", async () => {
		// Given
		const { ai } = await withAiSession();
		// When
		const result = await ai.call("list_tags");
		// Then
		expect(result).toEqual({
			isError: false,
			text: "You have no tags yet.",
			data: { tags: [] },
		});
	});

	test("lists the tags", async () => {
		// Given
		const { h, ai } = await withAiSession();
		const work = await addTag(h, ai, "Work");
		// When
		const { data } = await ai.call("list_tags");
		// Then
		expect(data).toEqual({
			tags: [{ id: work, name: "Work", combinations: 0 }],
		});
	});

	test("adds a tag", async () => {
		// Given
		const { h, ai } = await withAiSession();
		// When
		const { isError, data } = await ai.call("add_tag", { name: "Work" });
		// Then
		const stored = await tags(h, ai);
		expect({
			isError,
			names: stored.map((t) => t.name),
			sameId: stored[0]?.id === (data as { tag: { id: string } }).tag.id,
		}).toEqual({ isError: false, names: ["Work"], sameId: true });
	});

	test("refuses a tag name already used", async () => {
		// Given
		const { h, ai } = await withAiSession();
		await addTag(h, ai, "Work");
		// When
		const { isError, text } = await ai.call("add_tag", { name: "work" });
		// Then
		expect({
			isError,
			text,
			names: (await tags(h, ai)).map((t) => t.name),
		}).toEqual({
			isError: true,
			text: "You already have a tag called work.",
			names: ["Work"],
		});
	});

	test("refuses a tag name of 25 characters", async () => {
		// Given
		const { h, ai } = await withAiSession();
		// When
		const { isError, text } = await ai.call("add_tag", {
			name: "a".repeat(25),
		});
		// Then
		expect({
			isError,
			text,
			names: (await tags(h, ai)).map((t) => t.name),
		}).toEqual({
			isError: true,
			text: "A tag name has 1 to 24 characters.",
			names: [],
		});
	});

	test("renames a tag", async () => {
		// Given
		const { h, ai } = await withAiSession();
		const work = await addTag(h, ai, "Work");
		// When
		const { isError } = await ai.call("rename_tag", {
			id: work,
			name: "Office",
		});
		// Then
		expect({ isError, tags: await tags(h, ai) }).toEqual({
			isError: false,
			tags: [{ id: work, name: "Office", combinations: 0 }],
		});
	});

	test("refuses to rename a tag to a name already used", async () => {
		// Given
		const { h, ai } = await withAiSession();
		await addTag(h, ai, "Work");
		const trip = await addTag(h, ai, "Trip");
		// When
		const { isError, text } = await ai.call("rename_tag", {
			id: trip,
			name: "work",
		});
		// Then
		expect({
			isError,
			text,
			names: (await tags(h, ai)).map((t) => t.name),
		}).toEqual({
			isError: true,
			text: "You already have a tag called work.",
			names: ["Work", "Trip"],
		});
	});

	test("refuses to rename a tag to an empty name", async () => {
		// Given
		const { h, ai } = await withAiSession();
		const work = await addTag(h, ai, "Work");
		// When
		const { isError, text } = await ai.call("rename_tag", {
			id: work,
			name: "  ",
		});
		// Then
		expect({
			isError,
			text,
			names: (await tags(h, ai)).map((t) => t.name),
		}).toEqual({
			isError: true,
			text: "A tag name has 1 to 24 characters.",
			names: ["Work"],
		});
	});

	test("refuses to rename a tag that is gone", async () => {
		// Given
		const { h, ai } = await withAiSession();
		const work = await addTag(h, ai, "Work");
		expect(
			(await send(h, ai.jar, `/api/tags/${work}`, { method: "DELETE" })).status,
		).toBe(204);
		// When
		const { isError, text } = await ai.call("rename_tag", {
			id: work,
			name: "Office",
		});
		// Then
		expect({ isError, text, tags: await tags(h, ai) }).toEqual({
			isError: true,
			text: "No tag with this id.",
			tags: [],
		});
	});

	test("deletes a tag", async () => {
		// Given
		const { h, ai } = await withAiSession();
		const work = await addTag(h, ai, "Work");
		// When
		const { isError } = await ai.call("delete_tag", { id: work });
		// Then
		expect({ isError, tags: await tags(h, ai) }).toEqual({
			isError: false,
			tags: [],
		});
	});

	test("refuses to delete another account's tag", async () => {
		// Given
		const { h, ai } = await withAiSession();
		const bob = await asBob(h);
		const posted = await bob("POST", "/api/tags", { name: "Work" });
		expect(posted.status).toBe(201);
		const bobWork = ((await posted.json()) as { tag: { id: string } }).tag.id;
		// When
		const { isError, text } = await ai.call("delete_tag", { id: bobWork });
		// Then
		const bobTags = (await (await bob("GET", "/api/tags")).json()) as {
			tags: unknown[];
		};
		expect({ isError, text, bobTags: bobTags.tags.length }).toEqual({
			isError: true,
			text: "No tag with this id.",
			bobTags: 1,
		});
	});
});

type Colour = { id: string; name: string; hex: string; inUse?: boolean };

const colours = async (h: Harness, ai: Session) =>
	(
		(await (await send(h, ai.jar, "/api/colours")).json()) as {
			colours: Colour[];
		}
	).colours;

describe("colours", () => {
	// The colour the AI app added; its id is the answer's.
	async function withTeal() {
		const { h, ai } = await withAiSession();
		const { data } = await ai.call("add_colour", {
			name: "Teal",
			hex: "#2A7F7F",
		});
		return { h, ai, id: (data as { colour: Colour }).colour.id };
	}

	test("lists the starter colours", async () => {
		// Given
		const { ai } = await withAiSession();
		// When
		const { isError, data } = await ai.call("list_colours");
		// Then
		const listed = (data as { colours: Colour[] }).colours;
		expect({
			isError,
			count: listed.length,
			first: { name: listed[0]?.name, hex: listed[0]?.hex },
		}).toEqual({
			isError: false,
			count: 13,
			first: { name: "White", hex: "#F4F2ED" },
		});
	});

	test("adds a colour", async () => {
		// Given
		const { h, ai } = await withAiSession();
		// When
		const { isError, data } = await ai.call("add_colour", {
			name: "Teal",
			hex: "#2A7F7F",
		});
		// Then
		const last = (await colours(h, ai)).at(-1);
		expect({
			isError,
			last: last?.name,
			sameId: last?.id === (data as { colour: Colour }).colour.id,
		}).toEqual({ isError: false, last: "Teal", sameId: true });
	});

	test("refuses a colour name already used", async () => {
		// Given
		const { h, ai } = await withAiSession();
		// When
		const { isError, text } = await ai.call("add_colour", {
			name: "navy",
			hex: "#2A7F7F",
		});
		// Then
		expect({ isError, text, count: (await colours(h, ai)).length }).toEqual({
			isError: true,
			text: "You already have a colour called navy.",
			count: 13,
		});
	});

	test("refuses a colour code in small letters", async () => {
		// Given
		const { ai } = await withAiSession();
		// When
		const { isError, text } = await ai.call("add_colour", {
			name: "Teal",
			hex: "#2a7f7f",
		});
		// Then
		expect({ isError, text }).toEqual({
			isError: true,
			text: "That is not a colour written as #RRGGBB with capital letters, such as #1F3A5F.",
		});
	});

	test("changes a colour", async () => {
		// Given
		const { h, ai, id } = await withTeal();
		// When
		const { isError } = await ai.call("change_colour", {
			id,
			name: "Sea",
			hex: "#2A6F7F",
		});
		// Then
		expect({ isError, stored: (await colours(h, ai)).at(-1) }).toEqual({
			isError: false,
			stored: { id, name: "Sea", hex: "#2A6F7F", inUse: false },
		});
	});

	test("deletes a colour", async () => {
		// Given
		const { h, ai, id } = await withTeal();
		// When
		const { isError } = await ai.call("delete_colour", { id });
		// Then
		const names = (await colours(h, ai)).map((c) => c.name);
		expect({
			isError,
			count: names.length,
			teal: names.includes("Teal"),
		}).toEqual({ isError: false, count: 13, teal: false });
	});

	test("refuses to delete a colour a combination uses", async () => {
		// Given: the account saved Navy casual pants and a White long tee
		const { h, ai, userId } = await withAiSession();
		const listed = await colours(h, ai);
		const idOf = (name: string) =>
			listed.find((c) => c.name === name)?.id ?? "";
		await saveCombination(h.db, userId, {
			id: "11111111-1111-4111-8111-111111111111",
			pieces: [
				{ typeId: "casual_p", colourId: idOf("Navy") },
				{ typeId: "tee_l", colourId: idOf("White") },
			],
			open: false,
		});
		// When
		const { isError, text } = await ai.call("delete_colour", {
			id: idOf("Navy"),
		});
		// Then
		expect({ isError, text }).toEqual({
			isError: true,
			text: "A combination, an owned item, or a wish uses Navy, so it stays. A colour in use cannot be deleted.",
		});
	});

	test("refuses to delete a colour that is gone", async () => {
		// Given
		const { ai } = await withTeal();
		// When
		const { isError, text } = await ai.call("delete_colour", {
			id: "11111111-1111-4111-8111-111111111111",
		});
		// Then
		expect({ isError, text }).toEqual({
			isError: true,
			text: "No colour with this id.",
		});
	});
});

type Brand = { id: string; name: string };

const brandNames = async (ai: Session) =>
	((await ai.call("list_brands")).data as { brands: Brand[] }).brands.map(
		(b) => b.name,
	);

describe("brands", () => {
	// The brand the AI app added; its id is the answer's.
	async function withZara() {
		const { h, ai } = await withAiSession();
		const { data } = await ai.call("add_brand", { name: "Zara" });
		return { h, ai, id: (data as { brand: Brand }).brand.id };
	}

	test("lists no brands for a new account", async () => {
		// Given
		const { ai } = await withAiSession();
		// When
		const result = await ai.call("list_brands");
		// Then
		expect(result).toEqual({
			isError: false,
			text: "You have no brands yet.",
			data: { brands: [] },
		});
	});

	test("adds a brand and lists it", async () => {
		// Given
		const { ai } = await withAiSession();
		// When
		const { isError } = await ai.call("add_brand", { name: "Uniqlo" });
		// Then
		expect({ isError, names: await brandNames(ai) }).toEqual({
			isError: false,
			names: ["Uniqlo"],
		});
	});

	test("refuses a brand name already used", async () => {
		// Given
		const { ai } = await withZara();
		// When
		const { isError, text } = await ai.call("add_brand", { name: "zara" });
		// Then
		expect({ isError, text }).toEqual({
			isError: true,
			text: "You already have a brand called zara.",
		});
	});

	test("refuses an empty brand name", async () => {
		// Given
		const { ai } = await withAiSession();
		// When
		const { isError, text } = await ai.call("add_brand", { name: " " });
		// Then
		expect({ isError, text }).toEqual({
			isError: true,
			text: "A brand name has 1 to 24 characters.",
		});
	});

	test("refuses brand number 101", async () => {
		// Given: 100 brands, added through the store
		const { h, ai, userId } = await withAiSession();
		for (let i = 1; i <= 100; i++) await addBrand(h.db, userId, `Brand ${i}`);
		// When
		const { isError, text } = await ai.call("add_brand", { name: "Uniqlo" });
		// Then
		expect({ isError, text }).toEqual({
			isError: true,
			text: "You have 100 brands. That is the limit. Delete one to add a new one.",
		});
	});

	test("renames a brand", async () => {
		// Given
		const { ai, id } = await withZara();
		// When
		const { isError, data } = await ai.call("rename_brand", {
			id,
			name: "Zara Home",
		});
		// Then
		expect({ isError, data }).toEqual({
			isError: false,
			data: { brand: { id, name: "Zara Home" } },
		});
	});

	test("deletes a brand", async () => {
		// Given
		const { ai, id } = await withZara();
		// When
		const { data } = await ai.call("delete_brand", { id });
		// Then
		expect({
			deleted: (data as { deleted: string }).deleted,
			names: await brandNames(ai),
		}).toEqual({ deleted: id, names: [] });
	});

	test("refuses to delete a brand that is gone", async () => {
		// Given
		const { ai } = await withAiSession();
		// When
		const { isError, text } = await ai.call("delete_brand", {
			id: "6f1c2b9e-1d2a-4c3b-9e8f-0a1b2c3d4e5f",
		});
		// Then
		expect({ isError, text }).toEqual({
			isError: true,
			text: "No brand with this id.",
		});
	});
});

describe("AI action limit", () => {
	afterEach(() => setSystemTime());

	// Starts a clock minute so the 61 calls cannot cross into the next one.
	async function sixtyActions() {
		const { h, ai } = await withAiSession();
		const start = Math.ceil(Date.now() / 60_000) * 60_000 + 1000;
		setSystemTime(start);
		for (let i = 0; i < 60; i++)
			expect((await ai.call("list_tags")).isError).toBe(false);
		return { h, ai, start };
	}

	test("refuses the 61st AI action in one minute", async () => {
		// Given
		const { ai } = await sixtyActions();
		// When
		const { isError, text } = await ai.call("list_tags");
		// Then
		expect({ isError, text }).toEqual({
			isError: true,
			text: "Too many actions. Wait a minute and try again.",
		});
	});

	test("takes AI actions again in the next minute", async () => {
		// Given
		const { ai, start } = await sixtyActions();
		expect((await ai.call("list_tags")).isError).toBe(true);
		setSystemTime(start + 60_000);
		// When
		const { isError, text } = await ai.call("list_tags");
		// Then
		expect({ isError, text }).toEqual({
			isError: false,
			text: "You have no tags yet.",
		});
	});

	test("counts a late call from the minute before in the new minute", async () => {
		// Given: 60 actions in this minute, then a call that read the clock in
		// the minute before lands late
		const { ai, start } = await sixtyActions();
		setSystemTime(start - 60_000);
		// When
		const { isError, text } = await ai.call("list_tags");
		// Then
		expect({ isError, text }).toEqual({
			isError: true,
			text: "Too many actions. Wait a minute and try again.",
		});
	});

	test("refuses add_colour as the 61st AI action", async () => {
		// Given
		const { h, ai } = await sixtyActions();
		// When
		const { isError, text } = await ai.call("add_colour", {
			name: "Teal",
			hex: "#2A7F7F",
		});
		// Then
		expect({ isError, text, rows: await h.rows(schema.colour) }).toEqual({
			isError: true,
			text: "Too many actions. Wait a minute and try again.",
			rows: [],
		});
	});

	test("leaves the app's own routes without a new limit", async () => {
		// Given
		const { h, ai } = await sixtyActions();
		expect((await ai.call("list_tags")).isError).toBe(true);
		// When
		const statuses: number[] = [];
		for (let i = 0; i < 61; i++)
			statuses.push((await send(h, ai.jar, "/api/tags")).status);
		// Then
		expect({
			count: statuses.length,
			statuses: [...new Set(statuses)],
		}).toEqual({ count: 61, statuses: [200] });
	});
});

describe("combinations", () => {
	type Listed = { title: string; id: string };

	// The colour ids of the account by name, from list_colours.
	async function colourIds(ai: Session) {
		const { data } = await ai.call("list_colours");
		return Object.fromEntries(
			(data as { colours: Colour[] }).colours.map((c) => [c.name, c.id]),
		);
	}

	// Khaki Harrington jacket (open) + Black long tee + Navy casual pants.
	const three = (ids: Record<string, string>) => ({
		pieces: [
			{ typeId: "harrington", colourId: ids.Khaki },
			{ typeId: "tee_l", colourId: ids.Black },
			{ typeId: "casual_p", colourId: ids.Navy },
		],
		open: true,
	});

	// White short tee + Grey training shorts.
	const two = (ids: Record<string, string>) => ({
		pieces: [
			{ typeId: "train_sh", colourId: ids.Grey },
			{ typeId: "tee_s", colourId: ids.White },
		],
	});

	// The id of a combination save_combination saved.
	const savedId = async (ai: Session, body: Record<string, unknown>) =>
		(
			(await ai.call("save_combination", body)).data as {
				combination: Listed;
			}
		).combination.id;

	// THREE's pieces with Grey casual pants in place of Navy.
	const greyPants = (ids: Record<string, string>) => [
		{ typeId: "harrington", colourId: ids.Khaki },
		{ typeId: "tee_l", colourId: ids.Black },
		{ typeId: "casual_p", colourId: ids.Grey },
	];

	test("changes a combination's pieces", async () => {
		// Given: THREE saved
		const { ai } = await withAiSession();
		const ids = await colourIds(ai);
		const id = await savedId(ai, three(ids));
		// When
		const { isError, data } = await ai.call("change_combination", {
			id,
			pieces: greyPants(ids),
		});
		// Then
		const changed = (data as { combination: Listed }).combination;
		expect({ isError, id: changed.id, title: changed.title }).toEqual({
			isError: false,
			id,
			title:
				"Khaki Harrington jacket (open) + Black long tee + Grey casual pants",
		});
	});

	test("keeps the jacket state when a change leaves open out", async () => {
		// Given: THREE saved with its jacket open
		const { ai } = await withAiSession();
		const ids = await colourIds(ai);
		const id = await savedId(ai, three(ids));
		// When
		const { data } = await ai.call("change_combination", {
			id,
			pieces: greyPants(ids),
		});
		// Then
		expect(
			(data as { combination: Listed & { open: boolean } }).combination.open,
		).toBe(true);
	});

	test("refuses a change into a combination the account has", async () => {
		// Given: THREE and TWO saved
		const { ai } = await withAiSession();
		const ids = await colourIds(ai);
		const threeId = await savedId(ai, three(ids));
		const twoId = await savedId(ai, two(ids));
		// When
		const { isError, text } = await ai.call("change_combination", {
			id: threeId,
			pieces: two(ids).pieces,
		});
		// Then
		expect({ isError, text }).toEqual({
			isError: true,
			text: `You have this combination already, with id ${twoId}.`,
		});
	});

	test("refuses a change to a combination that is gone", async () => {
		// Given: THREE saved, then deleted
		const { ai } = await withAiSession();
		const ids = await colourIds(ai);
		const id = await savedId(ai, three(ids));
		await ai.call("delete_combination", { id });
		// When
		const { isError, text } = await ai.call("change_combination", {
			id,
			pieces: two(ids).pieces,
		});
		// Then
		expect({ isError, text }).toEqual({
			isError: true,
			text: "No combination with this id.",
		});
	});

	test("deletes a combination", async () => {
		// Given: THREE saved
		const { ai } = await withAiSession();
		const id = await savedId(ai, three(await colourIds(ai)));
		// When
		const { isError } = await ai.call("delete_combination", { id });
		// Then
		const listed = await ai.call("list_combinations");
		expect({ isError, text: listed.text }).toEqual({
			isError: false,
			text: "You have no combinations yet.",
		});
	});

	test("refuses to delete a combination that is gone", async () => {
		// Given: THREE saved and deleted
		const { ai } = await withAiSession();
		const id = await savedId(ai, three(await colourIds(ai)));
		await ai.call("delete_combination", { id });
		// When
		const { isError, text } = await ai.call("delete_combination", { id });
		// Then
		expect({ isError, text }).toEqual({
			isError: true,
			text: "No combination with this id.",
		});
	});

	test("lists the types with their layers", async () => {
		// Given
		const { ai } = await withAiSession();
		// When
		const { data } = await ai.call("list_types");
		// Then
		const types = (
			data as { types: { id: string; name: string; layer: string }[] }
		).types;
		const byLayer: Record<string, string[]> = {};
		for (const t of types)
			byLayer[t.layer] = [...(byLayer[t.layer] ?? []), t.id];
		expect({ byLayer, first: types[0] }).toEqual({
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
			first: { id: "tee_s", name: "Short tee", layer: "inner_top" },
		});
	});

	test("lists no combinations with its own text", async () => {
		// Given
		const { ai } = await withAiSession();
		// When
		const { isError, text } = await ai.call("list_combinations");
		// Then
		expect({ isError, text }).toEqual({
			isError: false,
			text: "You have no combinations yet.",
		});
	});

	test("saves a combination and lists it with its title", async () => {
		// Given
		const { ai } = await withAiSession();
		const ids = await colourIds(ai);
		// When
		const saved = await ai.call("save_combination", three(ids));
		const { data } = await ai.call("list_combinations");
		// Then
		expect({
			isError: saved.isError,
			titles: (data as { combinations: Listed[] }).combinations.map(
				(c) => c.title,
			),
		}).toEqual({
			isError: false,
			titles: [
				"Khaki Harrington jacket (open) + Black long tee + Navy casual pants",
			],
		});
	});

	test("refuses a combination the account has", async () => {
		// Given: the combination saved once
		const { ai } = await withAiSession();
		const ids = await colourIds(ai);
		const first = await ai.call("save_combination", three(ids));
		const id = (first.data as { combination: Listed }).combination.id;
		// When
		const { isError, text } = await ai.call("save_combination", three(ids));
		// Then
		expect({ isError, text }).toEqual({
			isError: true,
			text: `You have this combination already, with id ${id}.`,
		});
	});

	test("refuses a save at 300 combinations", async () => {
		// Given
		const { h, ai, userId } = await withAiSession();
		const ids = await colourIds(ai);
		await h.seedCombinations(userId, 300);
		// When
		const { isError, text } = await ai.call("save_combination", three(ids));
		// Then
		expect({ isError, text }).toEqual({
			isError: true,
			text: "You have 300 combinations. That is the limit.",
		});
	});

	test("refuses one piece", async () => {
		// Given
		const { ai } = await withAiSession();
		const ids = await colourIds(ai);
		// When
		const { isError, text } = await ai.call("save_combination", {
			pieces: [{ typeId: "casual_p", colourId: ids.Navy }],
		});
		// Then
		expect({ isError, text }).toEqual({
			isError: true,
			text: "A combination has 2 to 4 pieces.",
		});
	});

	test("refuses two pieces in one layer", async () => {
		// Given
		const { ai } = await withAiSession();
		const ids = await colourIds(ai);
		// When
		const { isError, text } = await ai.call("save_combination", {
			pieces: [
				{ typeId: "casual_p", colourId: ids.Navy },
				{ typeId: "chino_sh", colourId: ids.Black },
			],
		});
		// Then
		expect({ isError, text }).toEqual({
			isError: true,
			text: "Casual pants and Chino shorts are both in the bottom layer. A combination has at most one piece for each layer.",
		});
	});

	test("refuses a type that is not in the list", async () => {
		// Given
		const { ai } = await withAiSession();
		const ids = await colourIds(ai);
		// When
		const { isError, text } = await ai.call("save_combination", {
			pieces: [
				{ typeId: "jeans", colourId: ids.Navy },
				{ typeId: "tee_l", colourId: ids.Black },
			],
		});
		// Then
		expect({ isError, text }).toEqual({
			isError: true,
			text: "jeans is not a type. list_types names the types.",
		});
	});

	test("refuses a colour that is not the account's", async () => {
		// Given
		const { ai } = await withAiSession();
		const ids = await colourIds(ai);
		// When
		const { isError, text } = await ai.call("save_combination", {
			pieces: [
				{ typeId: "casual_p", colourId: "not-a-colour" },
				{ typeId: "tee_l", colourId: ids.Black },
			],
		});
		// Then
		expect({ isError, text }).toEqual({
			isError: true,
			text: "not-a-colour is not one of your colours. list_colours names them.",
		});
	});
});

describe("owned items", () => {
	type Listed = {
		id: string;
		typeId: string;
		colour: { name: string };
		brand: { name: string } | null;
		quantity: number;
	};

	async function navyId(ai: Session) {
		const { data } = await ai.call("list_colours");
		return (data as { colours: Colour[] }).colours.find(
			(c) => c.name === "Navy",
		)?.id;
	}

	// A Navy long button-up, no brand, two of them.
	const shirt = async (ai: Session) => ({
		typeId: "shirt_l",
		colourId: await navyId(ai),
		quantity: 2,
	});

	test("adds an owned item and lists it", async () => {
		// Given
		const { ai } = await withAiSession();
		const args = await shirt(ai);
		// When
		await ai.call("add_owned_item", args);
		const { data } = await ai.call("list_owned_items");
		// Then
		expect(
			(data as { ownedItems: Listed[] }).ownedItems.map((i) => [
				i.typeId,
				i.colour.name,
				i.brand,
				i.quantity,
			]),
		).toEqual([["shirt_l", "Navy", null, 2]]);
	});

	test("refuses the same piece and brand a second time as a sentence", async () => {
		// Given
		const { ai } = await withAiSession();
		const args = await shirt(ai);
		await ai.call("add_owned_item", args);
		// When
		const { isError, text } = await ai.call("add_owned_item", args);
		// Then
		expect({ isError, text }).toEqual({
			isError: true,
			text: "You have this item already. Change its number.",
		});
	});

	test("refuses a quantity of 0 as a sentence", async () => {
		// Given
		const { ai } = await withAiSession();
		const args = await shirt(ai);
		// When
		const { isError, text } = await ai.call("add_owned_item", {
			...args,
			quantity: 0,
		});
		// Then
		expect({ isError, text }).toEqual({
			isError: true,
			text: "Quantity is a whole number from 1 to 99.",
		});
	});

	test("refuses item number 501 as a sentence", async () => {
		// Given
		const { h, ai, userId } = await withAiSession();
		const args = await shirt(ai);
		await h.seedOwnedItems(userId, 500);
		// When
		const { isError, text } = await ai.call("add_owned_item", args);
		// Then
		expect({ isError, text }).toEqual({
			isError: true,
			text: "You have 500 items. That is the limit. Delete one to add a new one.",
		});
	});

	test("changes an owned item", async () => {
		// Given
		const { ai } = await withAiSession();
		const added = await ai.call("add_owned_item", await shirt(ai));
		const { id } = (added.data as { ownedItem: Listed }).ownedItem;
		// When
		const { data } = await ai.call("change_owned_item", {
			id,
			brandId: null,
			quantity: 5,
		});
		// Then
		expect((data as { ownedItem: Listed }).ownedItem.quantity).toBe(5);
	});

	test("deletes an owned item", async () => {
		// Given
		const { ai } = await withAiSession();
		const added = await ai.call("add_owned_item", await shirt(ai));
		const { id } = (added.data as { ownedItem: Listed }).ownedItem;
		// When
		await ai.call("delete_owned_item", { id });
		const { isError, text } = await ai.call("list_owned_items");
		// Then
		expect({ isError, text }).toEqual({
			isError: false,
			text: "Nothing in your closet yet.",
		});
	});

	test("says there is no such owned item", async () => {
		// Given
		const { ai } = await withAiSession();
		// When
		const { isError, text } = await ai.call("delete_owned_item", {
			id: "00000000-0000-4000-8000-000000000000",
		});
		// Then
		expect({ isError, text }).toEqual({
			isError: true,
			text: "No owned item with this id.",
		});
	});
});

describe("wishes", () => {
	type Link = {
		id: string;
		url: string;
		brand: { name: string } | null;
		name: string;
		price: number | null;
	};
	type Listed = { id: string; typeId: string; shopLinks: Link[] };

	async function colourId(ai: Session, name: string) {
		const { data } = await ai.call("list_colours");
		return (data as { colours: Colour[] }).colours.find((c) => c.name === name)
			?.id;
	}

	// A Navy wool jacket, as a wish.
	async function addJacket(ai: Session) {
		const added = await ai.call("add_wish", {
			typeId: "wool",
			colourId: await colourId(ai, "Navy"),
		});
		return (added.data as { wish: Listed }).wish.id;
	}

	const cos = (wishId: string) => ({
		wishId,
		url: "https://cos.com/jacket",
		name: "Wool jacket",
		price: 4290000,
	});

	test("adds a wish and lists it with its shop links", async () => {
		// Given
		const { ai } = await withAiSession();
		// When
		const wishId = await addJacket(ai);
		await ai.call("add_shop_link", cos(wishId));
		const { data } = await ai.call("list_wishes");
		// Then
		const { wishes } = data as { wishes: Listed[] };
		expect(
			wishes.map((w) => ({
				typeId: w.typeId,
				shopLinks: w.shopLinks.map(({ id, ...link }) => ({
					hasId: typeof id === "string",
					...link,
				})),
			})),
		).toEqual([
			{
				typeId: "wool",
				shopLinks: [
					{
						hasId: true,
						url: "https://cos.com/jacket",
						brand: null,
						name: "Wool jacket",
						price: 4290000,
					},
				],
			},
		]);
	});

	test("refuses a second wish for one piece as a sentence", async () => {
		// Given
		const { ai } = await withAiSession();
		await addJacket(ai);
		// When
		const { isError, text } = await ai.call("add_wish", {
			typeId: "wool",
			colourId: await colourId(ai, "Navy"),
		});
		// Then
		expect({ isError, text }).toEqual({
			isError: true,
			text: "You have this wish already.",
		});
	});

	test("refuses wish number 201 as a sentence", async () => {
		// Given
		const { h, ai, userId } = await withAiSession();
		await h.seedWishes(userId, 200);
		// When
		const { isError, text } = await ai.call("add_wish", {
			typeId: "train_p",
			colourId: await colourId(ai, "Mustard"),
		});
		// Then
		expect({ isError, text }).toEqual({
			isError: true,
			text: "You have 200 wishes. That is the limit. Delete one to add a new one.",
		});
	});

	test("adds, changes, and deletes a shop link", async () => {
		// Given
		const { ai } = await withAiSession();
		const wishId = await addJacket(ai);
		const added = await ai.call("add_shop_link", cos(wishId));
		const [link] = (added.data as { wish: Listed }).wish.shopLinks;
		// When
		const changed = await ai.call("change_shop_link", {
			id: link?.id,
			url: "https://cos.com/jacket",
			brandId: null,
			name: "Wool jacket",
			price: 3990000,
		});
		await ai.call("delete_shop_link", { id: link?.id });
		const { data } = await ai.call("list_wishes");
		// Then
		expect({
			price: (changed.data as { wish: Listed }).wish.shopLinks[0]?.price,
			after: (data as { wishes: Listed[] }).wishes[0]?.shopLinks,
		}).toEqual({ price: 3990000, after: [] });
	});

	test("refuses an address that is not http as a sentence", async () => {
		// Given
		const { ai } = await withAiSession();
		const wishId = await addJacket(ai);
		// When
		const { isError, text } = await ai.call("add_shop_link", {
			...cos(wishId),
			url: "ftp://cos.com/jacket",
		});
		// Then
		expect({ isError, text }).toEqual({
			isError: true,
			text: "Enter a web address that starts with https://.",
		});
	});

	test("refuses shop link number 11 as a sentence", async () => {
		// Given
		const { h, ai, userId } = await withAiSession();
		const wishId = await addJacket(ai);
		await h.seedShopLinks(userId, wishId, 10);
		// When
		const { isError, text } = await ai.call("add_shop_link", cos(wishId));
		// Then
		expect({ isError, text }).toEqual({
			isError: true,
			text: "10 shop links is the limit for one wish.",
		});
	});

	test("deletes a wish", async () => {
		// Given
		const { ai } = await withAiSession();
		const wishId = await addJacket(ai);
		await ai.call("add_shop_link", cos(wishId));
		// When
		await ai.call("delete_wish", { id: wishId });
		const { data } = await ai.call("list_wishes");
		// Then
		expect((data as { wishes: Listed[] }).wishes).toEqual([]);
	});

	test("refuses a wish id that is not the account's as a sentence", async () => {
		// Given
		const { ai } = await withAiSession();
		// When
		const { isError, text } = await ai.call("delete_wish", {
			id: "99999999-9999-4999-8999-999999999999",
		});
		// Then
		expect({ isError, text }).toEqual({
			isError: true,
			text: "No wish with this id.",
		});
	});

	test("refuses to delete a colour a wish uses as a sentence", async () => {
		// Given
		const { ai } = await withAiSession();
		await addJacket(ai);
		// When
		const { isError, text } = await ai.call("delete_colour", {
			id: await colourId(ai, "Navy"),
		});
		// Then
		expect({ isError, text }).toEqual({
			isError: true,
			text: "A combination, an owned item, or a wish uses Navy, so it stays. A colour in use cannot be deleted.",
		});
	});
});
