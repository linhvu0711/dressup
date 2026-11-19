import { describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { schema } from "./db";
import {
	INITIALIZE,
	makeHarness,
	message,
	post,
	TEST_APP_ID,
	withAiApp,
} from "./test/harness";

describe("/api/mcp", () => {
	test("answers 401 without a pass and points to the resource metadata", async () => {
		// Given: no Authorization header
		const h = await makeHarness();
		// When
		const res = await post(h, INITIALIZE);
		// Then
		expect({
			status: res.status,
			wwwAuthenticate: res.headers.get("www-authenticate"),
		}).toEqual({
			status: 401,
			wwwAuthenticate:
				'Bearer resource_metadata="http://localhost:5173/.well-known/oauth-protected-resource/api/mcp"',
		});
	});

	test("answers an AI app that starts with initialize", async () => {
		// Given: a connected app's access token
		const { h, bearer } = await withAiApp();
		// When
		const res = await post(h, INITIALIZE, bearer);
		// Then
		const { result } = await message<{
			result: { protocolVersion: string; serverInfo: { name: string } };
		}>(res);
		expect({
			status: res.status,
			protocolVersion: result.protocolVersion,
			serverName: result.serverInfo.name,
		}).toEqual({
			status: 200,
			protocolVersion: "2025-11-25",
			serverName: "dressup",
		});
	});

	test("lists the types to a connected AI app", async () => {
		// Given: initialize and notifications/initialized sent
		const { h, bearer } = await withAiApp();
		await post(h, INITIALIZE, bearer);
		const session = { ...bearer, "mcp-protocol-version": "2025-11-25" };
		await post(
			h,
			{ jsonrpc: "2.0", method: "notifications/initialized" },
			session,
		);
		// When
		const listed = await message<{
			result: {
				tools: { name: string; annotations?: { readOnlyHint?: boolean } }[];
			};
		}>(await post(h, { jsonrpc: "2.0", id: 2, method: "tools/list" }, session));
		const called = await message<{
			result: {
				structuredContent: {
					types: { id: string; name: string; layer: string }[];
				};
			};
		}>(
			await post(
				h,
				{
					jsonrpc: "2.0",
					id: 3,
					method: "tools/call",
					params: { name: "list_types", arguments: {} },
				},
				session,
			),
		);
		// Then
		const { types } = called.result.structuredContent;
		const tool = listed.result.tools.find((t) => t.name === "list_types");
		expect({
			listed: tool !== undefined,
			readOnly: tool?.annotations?.readOnlyHint,
			types: types.length,
			firstType: types[0],
		}).toEqual({
			listed: true,
			readOnly: true,
			types: 17,
			firstType: { id: "tee_s", name: "Short tee", layer: "inner_top" },
		});
	});

	test("lists the combination tools with no open field", async () => {
		// Given: initialize and notifications/initialized sent
		const { h, bearer } = await withAiApp();
		await post(h, INITIALIZE, bearer);
		const session = { ...bearer, "mcp-protocol-version": "2025-11-25" };
		await post(
			h,
			{ jsonrpc: "2.0", method: "notifications/initialized" },
			session,
		);
		// When
		const listed = await message<{
			result: {
				tools: {
					name: string;
					inputSchema: { properties?: Record<string, unknown> };
				}[];
			};
		}>(await post(h, { jsonrpc: "2.0", id: 2, method: "tools/list" }, session));
		// Then
		const fields = (name: string) =>
			Object.keys(
				listed.result.tools.find((t) => t.name === name)?.inputSchema
					.properties ?? {},
			).sort();
		expect({
			save: fields("save_combination"),
			change: fields("change_combination"),
		}).toEqual({
			save: ["pieces", "tags"],
			change: ["id", "pieces", "tags"],
		});
	});

	test("refuses a pass whose allow was removed", async () => {
		// Given: a connected app whose allow row is gone; its token has 3600 s
		// left
		const { h, bearer } = await withAiApp();
		await h.db
			.delete(schema.oauthConsent)
			.where(eq(schema.oauthConsent.clientId, TEST_APP_ID));
		// When
		const res = await post(h, INITIALIZE, bearer);
		// Then
		expect({
			status: res.status,
			wwwAuthenticate: res.headers.get("www-authenticate"),
		}).toEqual({
			status: 401,
			wwwAuthenticate:
				'Bearer error="invalid_token", error_description="this app is no longer allowed", resource_metadata="http://localhost:5173/.well-known/oauth-protected-resource/api/mcp"',
		});
	});
});
