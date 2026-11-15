import { afterEach, describe, expect, test } from "bun:test";
import {
	connectAiApp,
	makeHarness,
	stubOutside,
	TEST_APP_ID,
	testAppDocument,
} from "./test/harness";

type Harness = Awaited<ReturnType<typeof makeHarness>>;

const INITIALIZE = {
	jsonrpc: "2.0",
	id: 1,
	method: "initialize",
	params: {
		protocolVersion: "2025-11-25",
		capabilities: {},
		clientInfo: { name: "test", version: "1" },
	},
};

const post = (
	h: Harness,
	body: unknown,
	headers: Record<string, string> = {},
) =>
	h.app.request(
		"/api/mcp",
		{
			method: "POST",
			headers: {
				"content-type": "application/json",
				accept: "application/json, text/event-stream",
				...headers,
			},
			body: JSON.stringify(body),
		},
		h.env,
	);

// The answer comes as one server-sent event; its data line is the JSON-RPC
// message.
async function message<T>(res: Response): Promise<T> {
	const text = await res.text();
	const data = text.split("\n").find((line) => line.startsWith("data: "));
	return JSON.parse(data?.slice("data: ".length) ?? text) as T;
}

describe("/api/mcp", () => {
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
		const { token } = await connectAiApp(h, { accept: true });
		const bearer = { authorization: `Bearer ${token?.body.access_token}` };
		return { h, bearer };
	}

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
		const { h, bearer } = await connected();
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

	test("lists the garments and modes to a connected AI app", async () => {
		// Given: initialize and notifications/initialized sent
		const { h, bearer } = await connected();
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
					garments: { id: string; name: string; jacket: boolean }[];
					modes: {
						id: string;
						name: string;
						weatherGroup: string;
						garments: string[];
					}[];
				};
			};
		}>(
			await post(
				h,
				{
					jsonrpc: "2.0",
					id: 3,
					method: "tools/call",
					params: { name: "list_garments_and_modes", arguments: {} },
				},
				session,
			),
		);
		// Then
		const { garments, modes } = called.result.structuredContent;
		expect({
			tools: listed.result.tools.map((t) => t.name),
			readOnly: listed.result.tools[0]?.annotations?.readOnlyHint,
			garments: garments.length,
			modes: modes.length,
			firstGarment: garments[0],
			jackets: garments.filter((g) => g.jacket).map((g) => g.id),
			firstMode: modes[0],
		}).toEqual({
			tools: ["list_garments_and_modes"],
			readOnly: true,
			garments: 17,
			modes: 23,
			firstGarment: { id: "tee_s", name: "Short tee", jacket: false },
			jackets: ["chore", "padded"],
			firstMode: {
				id: "tee-casual-shorts",
				name: "Tee + casual shorts",
				weatherGroup: "Hot",
				garments: ["casual_sh", "tee_s"],
			},
		});
	});

	test("refuses a pass whose allow was removed", async () => {
		// Given: a connected app whose allow row is gone; its token has 3600 s
		// left
		const { h, bearer } = await connected();
		h.sqlite.run("delete from oauth_consent where client_id = ?", [
			TEST_APP_ID,
		]);
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
