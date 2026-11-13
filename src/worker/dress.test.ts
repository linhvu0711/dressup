import { describe, expect, test } from "bun:test";
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
