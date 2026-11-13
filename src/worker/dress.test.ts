import { describe, expect, test } from "bun:test";
import { applyChange, type DressChange } from "@/dress/state";
import { loadDress, saveDress } from "./dress-store";
import { makeHarness } from "./test/harness";

type Dress = {
	modeId: string;
	swatches: Record<string, string[]>;
	picked: Record<string, string>;
	open: string[];
};

async function withUser(id: string, email: string, name: string) {
	const h = await makeHarness();
	await h.helpers.saveUser(h.helpers.createUser({ id, email, name }));
	return h;
}

const withAlice = () => withUser("alice-id", "alice@example.com", "Alice");

describe("GET /api/dress", () => {
	test("gives a new account the starter set", async () => {
		// Given: alice, signed in, with no dress rows
		const { app, env, helpers } = await withAlice();
		const headers = await helpers.getAuthHeaders({ userId: "alice-id" });
		// When
		const res = await app.request("/api/dress", { headers }, env);
		// Then
		const s = (await res.json()) as Dress;
		expect({
			status: res.status,
			modeId: s.modeId,
			sweater: s.swatches.sweater,
			padded: s.swatches.padded,
			shirt_l: s.swatches.shirt_l,
			pickedSweater: s.picked.sweater,
			pickedShirt: s.picked.shirt_l,
			open: s.open,
		}).toEqual({
			status: 200,
			modeId: "polo-sweater",
			sweater: ["#1F3A5F", "#8C8A84", "#E6DFD0", "#7A2E2E"],
			padded: ["#1B1B1F", "#1F3A5F", "#55633F"],
			shirt_l: ["#BFD3EA", "#F3F1EC", "#1F3A5F"],
			pickedSweater: "#1F3A5F",
			pickedShirt: "#BFD3EA",
			open: [],
		});
	});

	test("writes the starter set once when asked twice", async () => {
		// Given: alice, signed in, with no dress rows
		const { app, env, helpers, sqlite } = await withAlice();
		const headers = await helpers.getAuthHeaders({ userId: "alice-id" });
		// When
		await app.request("/api/dress", { headers }, env);
		await app.request("/api/dress", { headers }, env);
		// Then
		const count = (table: string) =>
			sqlite
				.query<{ n: number }, []>(
					`select count(*) as n from ${table} where user_id = 'alice-id'`,
				)
				.get()?.n;
		expect([count("colour_square"), count("outfit_garment")]).toEqual([58, 17]);
	});

	test("removes the colours and outfit with the user", async () => {
		// Given: alice after one GET /api/dress
		const { app, env, helpers, sqlite } = await withAlice();
		const headers = await helpers.getAuthHeaders({ userId: "alice-id" });
		await app.request("/api/dress", { headers }, env);
		// When
		sqlite.run("delete from user where id = 'alice-id'");
		// Then
		const counts = ["colour_square", "outfit", "outfit_garment"].map(
			(table) =>
				sqlite
					.query<{ n: number }, []>(
						`select count(*) as n from ${table} where user_id = 'alice-id'`,
					)
					.get()?.n,
		);
		expect(counts).toEqual([0, 0, 0]);
	});

	test("refuses GET /api/dress without a session", async () => {
		// Given: alice saved, but no session headers
		const { app, env } = await withAlice();
		// When
		const res = await app.request("/api/dress", {}, env);
		// Then
		expect(res.status).toBe(401);
		expect(await res.json()).toEqual({ error: "unauthorized" });
	});
});

type Harness = Awaited<ReturnType<typeof makeHarness>>;

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
	const h = await withAlice();
	const headers = await h.helpers.getAuthHeaders({ userId: "alice-id" });
	await get(h, headers);
	return { h, headers };
}

describe("POST /api/dress/changes", () => {
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
			{ kind: "jacket", jacket: "chore", open: true },
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
			open: ["chore"],
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

	test("refuses POST /api/dress/changes without a session", async () => {
		// Given: alice saved, but no session headers
		const h = await withAlice();
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
		const h = await withAlice();
		await h.helpers.saveUser(
			h.helpers.createUser({
				id: "bob-id",
				email: "bob@example.com",
				name: "Bob",
			}),
		);
		const alice = await h.helpers.getAuthHeaders({ userId: "alice-id" });
		const bob = await h.helpers.getAuthHeaders({ userId: "bob-id" });
		// When
		await post(h, alice, { kind: "pick", garment: "sweater", hex: "#7A2E2E" });
		await post(h, alice, { kind: "mode", modeId: "tee-sweater" });
		await post(h, bob, { kind: "add", garment: "padded", hex: "#C0392B" });
		const seen = await Promise.all(
			[alice, bob].map(async (headers) => {
				const s = await get(h, headers);
				return {
					modeId: s.modeId,
					pickedSweater: s.picked.sweater,
					padded: s.swatches.padded,
				};
			}),
		);
		// Then
		expect(seen).toEqual([
			{
				modeId: "tee-sweater",
				pickedSweater: "#7A2E2E",
				padded: ["#1B1B1F", "#1F3A5F", "#55633F"],
			},
			{
				modeId: "polo-sweater",
				pickedSweater: "#1F3A5F",
				padded: ["#C0392B", "#1B1B1F", "#1F3A5F", "#55633F"],
			},
		]);
	});
});

// Two requests that each read the stored state before either writes.
async function atOnce(h: Harness, changes: DressChange[]) {
	const db = h.settings.db;
	const reads = await Promise.all(changes.map(() => loadDress(db, "alice-id")));
	for (const [i, stored] of reads.entries()) {
		const result = applyChange(stored.state, changes[i]);
		if (result.ok) await saveDress(db, "alice-id", stored, result.state);
	}
	return (await loadDress(db, "alice-id")).state;
}

describe("two devices at the same moment", () => {
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
		// Given: alice with the padded row cut to #1B1B1F and #1F3A5F, and
		// #1B1B1F picked
		const { h, headers } = await aliceAfterGet();
		await post(h, headers, {
			kind: "remove",
			garment: "padded",
			hex: "#55633F",
		});
		// When: one device removes #1B1B1F while the other opens the jacket
		const s = await atOnce(h, [
			{ kind: "remove", garment: "padded", hex: "#1B1B1F" },
			{ kind: "jacket", jacket: "padded", open: true },
		]);
		// Then
		expect({
			row: s.swatches.padded,
			picked: s.picked.padded,
			open: s.open,
		}).toEqual({ row: ["#1F3A5F"], picked: "#1F3A5F", open: ["padded"] });
	});
});
