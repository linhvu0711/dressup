import { describe, expect, test } from "bun:test";
import { applyChange, type DressChange } from "@/dress/state";
import { schema } from "./db";
import { loadDress, saveDress } from "./dress-store";
import { BOB, type Harness, withAccount } from "./test/harness";

type Dress = {
	modeId: string;
	swatches: Record<string, string[]>;
	picked: Record<string, string>;
	open: string[];
	mannequin: { skin: string; hair: string };
};

describe("GET /api/dress", () => {
	test("gives a new account the starter set", async () => {
		// Given: alice, signed in, with no dress rows
		const { h, headers } = await withAccount();
		const { app, env } = h;
		// When
		const res = await app.request("/api/dress", { headers }, env);
		// Then
		const s = (await res.json()) as Dress;
		expect({
			status: res.status,
			modeId: s.modeId,
			sweater: s.swatches.sweater,
			wool: s.swatches.wool,
			harrington: s.swatches.harrington,
			shirt_l: s.swatches.shirt_l,
			pickedSweater: s.picked.sweater,
			pickedShirt: s.picked.shirt_l,
			open: s.open,
		}).toEqual({
			status: 200,
			modeId: "polo-sweater",
			sweater: ["#1F3A5F", "#8C8A84", "#E6DFD0", "#7A2E2E"],
			wool: ["#A8865C", "#39424F", "#1F3A5F"],
			harrington: ["#C9B38C", "#1F3A5F", "#2F4A3A"],
			shirt_l: ["#BFD3EA", "#F3F1EC", "#1F3A5F"],
			pickedSweater: "#1F3A5F",
			pickedShirt: "#BFD3EA",
			open: [],
		});
	});

	test("gives a new account the starter skin and hair", async () => {
		// Given: alice, signed in, with no dress rows
		const { h, headers } = await withAccount();
		const { app, env } = h;
		// When
		const res = await app.request("/api/dress", { headers }, env);
		// Then
		const s = (await res.json()) as Dress;
		expect({ status: res.status, mannequin: s.mannequin }).toEqual({
			status: 200,
			mannequin: { skin: "#D6A27B", hair: "#141418" },
		});
	});

	test("writes the starter set once when asked twice", async () => {
		// Given: alice, signed in, with no dress rows
		const { h, headers } = await withAccount();
		const { app, env } = h;
		// When
		await app.request("/api/dress", { headers }, env);
		await app.request("/api/dress", { headers }, env);
		// Then
		const counts = [
			(await h.rows(schema.colourSquare, "alice-id")).length,
			(await h.rows(schema.outfitGarment, "alice-id")).length,
		];
		expect(counts).toEqual([58, 17]);
	});

	test("removes the colours and outfit with the user", async () => {
		// Given: alice after one GET /api/dress and one skin change
		const { h, headers } = await withAccount();
		await h.app.request("/api/dress", { headers }, h.env);
		await post(h, headers, { kind: "mannequin", part: "skin", hex: "#8D5524" });
		// When
		await h.helpers.deleteUser("alice-id");
		// Then
		const counts = [
			(await h.rows(schema.colourSquare, "alice-id")).length,
			(await h.rows(schema.outfit, "alice-id")).length,
			(await h.rows(schema.outfitGarment, "alice-id")).length,
			(await h.rows(schema.mannequin, "alice-id")).length,
		];
		expect(counts).toEqual([0, 0, 0, 0]);
	});

	test("refuses GET /api/dress without a session", async () => {
		// Given: alice saved, but no session headers
		const { app, env } = (await withAccount()).h;
		// When
		const res = await app.request("/api/dress", {}, env);
		// Then
		expect(res.status).toBe(401);
		expect(await res.json()).toEqual({ error: "unauthorized" });
	});
});

const post = ({ app, env }: Harness, headers: Headers, body: unknown) =>
	app.request(
		"/api/dress/changes",
		{
			method: "POST",
			headers: {
				...Object.fromEntries(headers),
				"content-type": "application/json",
			},
			body: JSON.stringify(body),
		},
		env,
	);

const get = async ({ app, env }: Harness, headers: Headers) =>
	(await (await app.request("/api/dress", { headers }, env)).json()) as Dress;

async function aliceAfterGet() {
	const { h, headers } = await withAccount();
	await get(h, headers);
	return { h, headers };
}

describe("POST /api/dress/changes", () => {
	test("stores a wear change once when it comes twice", async () => {
		// Given: alice after one GET /api/dress
		const { h, headers } = await aliceAfterGet();
		const wear = {
			kind: "wear",
			modeId: "polo-sweater-harrington",
			colours: {
				chino_p: "#C9B38C",
				polo_l: "#F3F1EC",
				sweater: "#C0392B",
				harrington: "#55633F",
			},
			open: ["harrington"],
		};
		// When
		const first = await post(h, headers, wear);
		const second = await post(h, headers, wear);
		const s = await get(h, headers);
		// Then
		expect({
			statuses: [first.status, second.status],
			modeId: s.modeId,
			sweater: s.swatches.sweater,
			pickedSweater: s.picked.sweater,
			open: s.open,
		}).toEqual({
			statuses: [204, 204],
			modeId: "polo-sweater-harrington",
			sweater: ["#C0392B", "#1F3A5F", "#8C8A84", "#E6DFD0", "#7A2E2E"],
			pickedSweater: "#C0392B",
			open: ["harrington"],
		});
	});

	test("stores a change of each kind", async () => {
		// Given: alice after one GET /api/dress
		const { h, headers } = await aliceAfterGet();
		// When
		const statuses = [];
		for (const change of [
			{ kind: "mode", modeId: "tee-sweater" },
			{ kind: "add", garment: "sweater", hex: "#C0392B" },
			{ kind: "pick", garment: "sweater", hex: "#8C8A84" },
			{ kind: "remove", garment: "sweater", hex: "#7A2E2E" },
			{ kind: "jacket", jacket: "harrington", open: true },
		])
			statuses.push((await post(h, headers, change)).status);
		const s = await get(h, headers);
		// Then
		expect({
			statuses,
			modeId: s.modeId,
			sweater: s.swatches.sweater,
			pickedSweater: s.picked.sweater,
			open: s.open,
		}).toEqual({
			statuses: [204, 204, 204, 204, 204],
			modeId: "tee-sweater",
			sweater: ["#C0392B", "#1F3A5F", "#8C8A84", "#E6DFD0"],
			pickedSweater: "#8C8A84",
			open: ["harrington"],
		});
	});

	test("adds a square once when the same change comes twice", async () => {
		// Given: alice after one GET /api/dress
		const { h, headers } = await aliceAfterGet();
		const add = { kind: "add", garment: "sweater", hex: "#C0392B" };
		// When
		const first = await post(h, headers, add);
		const second = await post(h, headers, add);
		const s = await get(h, headers);
		// Then
		expect({
			statuses: [first.status, second.status],
			sweater: s.swatches.sweater,
		}).toEqual({
			statuses: [204, 204],
			sweater: ["#C0392B", "#1F3A5F", "#8C8A84", "#E6DFD0", "#7A2E2E"],
		});
	});

	test("keeps the last change from two devices", async () => {
		// Given: alice with two sessions, after one GET
		const { h, headers: one } = await aliceAfterGet();
		const two = await h.helpers.getAuthHeaders({ userId: "alice-id" });
		// When
		await post(h, one, { kind: "pick", garment: "sweater", hex: "#7A2E2E" });
		await post(h, two, { kind: "pick", garment: "sweater", hex: "#8C8A84" });
		const s = await get(h, one);
		// Then
		expect(s.picked.sweater).toBe("#8C8A84");
	});

	test("stores a skin and a hair colour", async () => {
		// Given: alice after one GET /api/dress
		const { h, headers } = await aliceAfterGet();
		// When
		const statuses = [];
		for (const change of [
			{ kind: "mannequin", part: "skin", hex: "#8D5524" },
			{ kind: "mannequin", part: "hair", hex: "#B55239" },
		])
			statuses.push((await post(h, headers, change)).status);
		const s = await get(h, headers);
		// Then
		expect({ statuses, mannequin: s.mannequin }).toEqual({
			statuses: [204, 204],
			mannequin: { skin: "#8D5524", hair: "#B55239" },
		});
	});

	test("keeps one mannequin row when the same change comes twice", async () => {
		// Given: alice after one GET /api/dress
		const { h, headers } = await aliceAfterGet();
		const skin = { kind: "mannequin", part: "skin", hex: "#8D5524" };
		// When
		const first = await post(h, headers, skin);
		const second = await post(h, headers, skin);
		const s = await get(h, headers);
		// Then
		const rows = (await h.rows(schema.mannequin, "alice-id")).length;
		expect({
			statuses: [first.status, second.status],
			mannequin: s.mannequin,
			rows,
		}).toEqual({
			statuses: [204, 204],
			mannequin: { skin: "#8D5524", hair: "#141418" },
			rows: 1,
		});
	});

	test("refuses a skin code that is not a hex colour", async () => {
		// Given: alice after one GET; the passing skin change with its hex changed
		const { h, headers } = await aliceAfterGet();
		// When
		const res = await post(h, headers, {
			kind: "mannequin",
			part: "skin",
			hex: "#zz1234",
		});
		// Then
		expect({ status: res.status, body: await res.json() }).toEqual({
			status: 400,
			body: { error: "invalid", field: "hex" },
		});
	});

	test("refuses an unknown mannequin part", async () => {
		// Given: alice after one GET; the passing skin change with its part changed
		const { h, headers } = await aliceAfterGet();
		// When
		const res = await post(h, headers, {
			kind: "mannequin",
			part: "eyes",
			hex: "#8D5524",
		});
		// Then
		expect({ status: res.status, body: await res.json() }).toEqual({
			status: 400,
			body: { error: "invalid", field: "part" },
		});
	});

	test("refuses a code that is not a hex colour", async () => {
		// Given: alice after one GET; the passing add with its hex changed
		const { h, headers } = await aliceAfterGet();
		// When
		const res = await post(h, headers, {
			kind: "add",
			garment: "sweater",
			hex: "#zz1234",
		});
		// Then
		expect({ status: res.status, body: await res.json() }).toEqual({
			status: 400,
			body: { error: "invalid", field: "hex" },
		});
	});

	test("refuses a body that is not an object", async () => {
		// Given: alice after one GET; the passing add with its whole body changed
		const { h, headers } = await aliceAfterGet();
		// When
		const res = await post(h, headers, []);
		// Then
		expect({ status: res.status, body: await res.json() }).toEqual({
			status: 400,
			body: { error: "invalid", field: "body" },
		});
	});

	test("refuses an unknown garment", async () => {
		// Given: alice after one GET; the passing add with its garment changed
		const { h, headers } = await aliceAfterGet();
		// When
		const res = await post(h, headers, {
			kind: "add",
			garment: "cape",
			hex: "#C0392B",
		});
		// Then
		expect({ status: res.status, body: await res.json() }).toEqual({
			status: 400,
			body: { error: "invalid", field: "garment" },
		});
	});

	test("refuses an unknown mode", async () => {
		// Given: alice after one GET; the passing mode change with its id changed
		const { h, headers } = await aliceAfterGet();
		// When
		const res = await post(h, headers, { kind: "mode", modeId: "beach" });
		// Then
		expect({ status: res.status, body: await res.json() }).toEqual({
			status: 400,
			body: { error: "invalid", field: "modeId" },
		});
	});

	test("refuses to remove the last square of a row", async () => {
		// Given: alice with the sweater row cut to #1F3A5F
		const { h, headers } = await aliceAfterGet();
		for (const hex of ["#8C8A84", "#E6DFD0", "#7A2E2E"])
			await post(h, headers, { kind: "remove", garment: "sweater", hex });
		// When
		const res = await post(h, headers, {
			kind: "remove",
			garment: "sweater",
			hex: "#1F3A5F",
		});
		// Then
		const body = await res.json();
		const s = await get(h, headers);
		expect({ status: res.status, body, sweater: s.swatches.sweater }).toEqual({
			status: 400,
			body: { error: "last_square", field: "hex" },
			sweater: ["#1F3A5F"],
		});
	});

	test("refuses to remove a colour that is not in the row", async () => {
		// Given: alice with the starter sweater row
		const { h, headers } = await aliceAfterGet();
		// When
		const res = await post(h, headers, {
			kind: "remove",
			garment: "sweater",
			hex: "#2E5E4E",
		});
		// Then
		const body = await res.text();
		const s = await get(h, headers);
		expect({ status: res.status, body, sweater: s.swatches.sweater }).toEqual({
			status: 400,
			body: '{"error":"not_in_row","field":"hex"}',
			sweater: ["#1F3A5F", "#8C8A84", "#E6DFD0", "#7A2E2E"],
		});
	});

	test("refuses to remove an absent colour from a row of one as not in the row", async () => {
		// Given: alice with the sweater row cut to #1F3A5F
		const { h, headers } = await aliceAfterGet();
		for (const hex of ["#8C8A84", "#E6DFD0", "#7A2E2E"])
			await post(h, headers, { kind: "remove", garment: "sweater", hex });
		// When
		const res = await post(h, headers, {
			kind: "remove",
			garment: "sweater",
			hex: "#2E5E4E",
		});
		// Then
		const body = await res.text();
		const s = await get(h, headers);
		expect({ status: res.status, body, sweater: s.swatches.sweater }).toEqual({
			status: 400,
			body: '{"error":"not_in_row","field":"hex"}',
			sweater: ["#1F3A5F"],
		});
	});

	test("refuses POST /api/dress/changes without a session", async () => {
		// Given: alice saved, but no session headers
		const { h } = await withAccount();
		// When
		const res = await post(h, new Headers(), {
			kind: "pick",
			garment: "sweater",
			hex: "#7A2E2E",
		});
		// Then
		expect({ status: res.status, body: await res.json() }).toEqual({
			status: 401,
			body: { error: "unauthorized" },
		});
	});

	test("keeps each account's colours apart", async () => {
		// Given: alice and bob, each signed in
		const { h, headers: alice } = await withAccount();
		const bob = await h.addAccount(BOB);
		// When
		await post(h, alice, { kind: "pick", garment: "sweater", hex: "#7A2E2E" });
		await post(h, alice, { kind: "mode", modeId: "tee-sweater" });
		await post(h, bob, { kind: "add", garment: "wool", hex: "#C0392B" });
		const seen = await Promise.all(
			[alice, bob].map(async (headers) => {
				const s = await get(h, headers);
				return {
					modeId: s.modeId,
					pickedSweater: s.picked.sweater,
					wool: s.swatches.wool,
				};
			}),
		);
		// Then
		expect(seen).toEqual([
			{
				modeId: "tee-sweater",
				pickedSweater: "#7A2E2E",
				wool: ["#A8865C", "#39424F", "#1F3A5F"],
			},
			{
				modeId: "polo-sweater",
				pickedSweater: "#1F3A5F",
				wool: ["#C0392B", "#A8865C", "#39424F", "#1F3A5F"],
			},
		]);
	});
});

// Two requests that each read the stored state before either writes.
async function atOnce(h: Harness, changes: DressChange[]) {
	const { db } = h;
	const reads = await Promise.all(changes.map(() => loadDress(db, "alice-id")));
	for (const [i, stored] of reads.entries()) {
		const result = applyChange(stored.state, changes[i]);
		if (result.ok) await saveDress(db, "alice-id", stored, result.state);
	}
	return (await loadDress(db, "alice-id")).state;
}

describe("two devices at the same moment", () => {
	test("keeps a skin from one device and a hair from another", async () => {
		// Given: alice after one GET, with no mannequin row
		const { h } = await aliceAfterGet();
		// When
		const s = await atOnce(h, [
			{ kind: "mannequin", part: "skin", hex: "#8D5524" },
			{ kind: "mannequin", part: "hair", hex: "#B55239" },
		]);
		// Then
		expect(s.mannequin).toEqual({ skin: "#8D5524", hair: "#B55239" });
	});

	test("stores the same new colour from both", async () => {
		// Given: alice after one GET
		const { h } = await aliceAfterGet();
		// When
		const s = await atOnce(h, [
			{ kind: "add", garment: "sweater", hex: "#C0392B" },
			{ kind: "add", garment: "sweater", hex: "#C0392B" },
		]);
		// Then
		expect(s.swatches.sweater).toEqual([
			"#C0392B",
			"#1F3A5F",
			"#8C8A84",
			"#E6DFD0",
			"#7A2E2E",
		]);
	});

	test("keeps one square when both remove from a row of two", async () => {
		// Given: alice with the sweater row cut to #1F3A5F and #8C8A84
		const { h, headers } = await aliceAfterGet();
		for (const hex of ["#E6DFD0", "#7A2E2E"])
			await post(h, headers, { kind: "remove", garment: "sweater", hex });
		// When
		const s = await atOnce(h, [
			{ kind: "remove", garment: "sweater", hex: "#1F3A5F" },
			{ kind: "remove", garment: "sweater", hex: "#8C8A84" },
		]);
		// Then
		expect(s.swatches.sweater).toHaveLength(1);
	});

	test("keeps the pick on the square that is left", async () => {
		// Given: alice with the sweater row cut to #1F3A5F and #8C8A84, and
		// #1F3A5F picked
		const { h, headers } = await aliceAfterGet();
		for (const hex of ["#E6DFD0", "#7A2E2E"])
			await post(h, headers, { kind: "remove", garment: "sweater", hex });
		// When: the remove of #8C8A84 is stored first
		const s = await atOnce(h, [
			{ kind: "remove", garment: "sweater", hex: "#8C8A84" },
			{ kind: "remove", garment: "sweater", hex: "#1F3A5F" },
		]);
		// Then
		expect({ row: s.swatches.sweater, picked: s.picked.sweater }).toEqual({
			row: ["#1F3A5F"],
			picked: "#1F3A5F",
		});
	});

	test("moves the pick to the row when the other device removes it", async () => {
		// Given: alice after one GET, with #1F3A5F picked
		const { h } = await aliceAfterGet();
		// When: the pick of #7A2E2E is stored first
		const s = await atOnce(h, [
			{ kind: "pick", garment: "sweater", hex: "#7A2E2E" },
			{ kind: "remove", garment: "sweater", hex: "#7A2E2E" },
		]);
		// Then
		expect({ row: s.swatches.sweater, picked: s.picked.sweater }).toEqual({
			row: ["#1F3A5F", "#8C8A84", "#E6DFD0"],
			picked: "#1F3A5F",
		});
	});

	test("keeps a jacket toggle and the new pick together", async () => {
		// Given: alice with the wool row cut to #A8865C and #1F3A5F, and
		// #A8865C picked
		const { h, headers } = await aliceAfterGet();
		await post(h, headers, {
			kind: "remove",
			garment: "wool",
			hex: "#39424F",
		});
		// When: one device removes #A8865C while the other opens the jacket
		const s = await atOnce(h, [
			{ kind: "remove", garment: "wool", hex: "#A8865C" },
			{ kind: "jacket", jacket: "wool", open: true },
		]);
		// Then
		expect({
			row: s.swatches.wool,
			picked: s.picked.wool,
			open: s.open,
		}).toEqual({ row: ["#1F3A5F"], picked: "#1F3A5F", open: ["wool"] });
	});
});
