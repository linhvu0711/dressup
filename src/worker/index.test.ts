import { describe, expect, test } from "bun:test";
import app from "./index";

describe("api", () => {
	test("answers ok on GET /api/health", async () => {
		// Given: the Worker app, no server, no bindings
		// When
		const res = await app.request("/api/health");
		// Then
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ ok: true });
	});

	test("answers not_found on an unknown api path", async () => {
		// Given: the same app, with the path /api/nope
		// When
		const res = await app.request("/api/nope");
		// Then
		expect(res.status).toBe(404);
		expect(await res.json()).toEqual({ error: "not_found" });
	});
});
