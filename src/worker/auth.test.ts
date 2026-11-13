import { describe, expect, test } from "bun:test";
import { makeHarness } from "./test/harness";

async function withUser(id: string, email: string, name: string) {
	const h = await makeHarness();
	await h.helpers.saveUser(h.helpers.createUser({ id, email, name }));
	return h;
}

describe("GET /api/me", () => {
	test("returns the signed-in user on GET /api/me", async () => {
		// Given: alice, signed in
		const { app, env, helpers } = await withUser(
			"alice-id",
			"alice@example.com",
			"Alice",
		);
		const headers = await helpers.getAuthHeaders({ userId: "alice-id" });
		// When
		const res = await app.request("/api/me", { headers }, env);
		// Then
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({
			id: "alice-id",
			name: "Alice",
			email: "alice@example.com",
			image: null,
		});
	});

	test("refuses GET /api/me without a session", async () => {
		// Given: alice saved, but no session headers
		const { app, env } = await withUser(
			"alice-id",
			"alice@example.com",
			"Alice",
		);
		// When
		const res = await app.request("/api/me", {}, env);
		// Then
		expect(res.status).toBe(401);
		expect(await res.json()).toEqual({ error: "unauthorized" });
	});

	test("gives each session only its own user", async () => {
		// Given: alice and bob, each signed in
		const { app, env, helpers } = await withUser(
			"alice-id",
			"alice@example.com",
			"Alice",
		);
		await helpers.saveUser(
			helpers.createUser({
				id: "bob-id",
				email: "bob@example.com",
				name: "Bob",
			}),
		);
		const aliceHeaders = await helpers.getAuthHeaders({ userId: "alice-id" });
		const bobHeaders = await helpers.getAuthHeaders({ userId: "bob-id" });
		// When
		const alice = await app.request("/api/me", { headers: aliceHeaders }, env);
		const bob = await app.request("/api/me", { headers: bobHeaders }, env);
		// Then
		type Me = { id: string; email: string };
		const bodies = [(await alice.json()) as Me, (await bob.json()) as Me];
		const seen = bodies.map((u) => ({
			id: u.id,
			email: u.email,
		}));
		expect(seen).toEqual([
			{ id: "alice-id", email: "alice@example.com" },
			{ id: "bob-id", email: "bob@example.com" },
		]);
	});
});

describe("migrations", () => {
	test("makes the four auth tables from the migrations", async () => {
		// Given
		const { sqlite } = await makeHarness();
		// When
		const rows = sqlite
			.query<{ name: string }, []>(
				"select name from sqlite_master where type = 'table' order by name",
			)
			.all();
		// Then
		expect(rows.map((r) => r.name)).toEqual([
			"__drizzle_migrations",
			"account",
			"session",
			"user",
			"verification",
		]);
	});
});
