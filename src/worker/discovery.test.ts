import { describe, expect, test } from "bun:test";
import { makeHarness } from "./test/harness";

describe("discovery at the site root", () => {
	test("serves the sign-in server metadata for client metadata apps", async () => {
		// Given
		const h = await makeHarness();
		// When
		const res = await h.app.request(
			"/.well-known/oauth-authorization-server/api/auth",
			{},
			h.env,
		);
		// Then
		const body = (await res.json()) as {
			issuer: string;
			client_id_metadata_document_supported: boolean;
			token_endpoint_auth_methods_supported: string[];
			scopes_supported: string[];
			registration_endpoint?: string;
		};
		expect({
			status: res.status,
			issuer: body.issuer,
			cimd: body.client_id_metadata_document_supported,
			authMethods: body.token_endpoint_auth_methods_supported,
			scopes: body.scopes_supported,
			registration: body.registration_endpoint,
		}).toEqual({
			status: 200,
			issuer: "http://localhost:5173/api/auth",
			cimd: true,
			authMethods: [
				"none",
				"client_secret_basic",
				"client_secret_post",
				"private_key_jwt",
			],
			scopes: ["openid", "offline_access"],
			registration: undefined,
		});
	});

	test("serves the protected resource metadata for /api/mcp", async () => {
		// Given
		const h = await makeHarness();
		// When
		const res = await h.app.request(
			"/.well-known/oauth-protected-resource/api/mcp",
			{},
			h.env,
		);
		// Then
		expect({ status: res.status, body: await res.json() }).toEqual({
			status: 200,
			body: {
				resource: "http://localhost:5173/api/mcp",
				authorization_servers: ["http://localhost:5173/api/auth"],
				bearer_methods_supported: ["header"],
				dpop_signing_alg_values_supported: [
					"EdDSA",
					"ES256",
					"ES512",
					"PS256",
					"RS256",
				],
			},
		});
	});
});
