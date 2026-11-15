import { requireMcpAuth } from "@better-auth/mcp";
import { createResourceServerChallenge } from "@better-auth/oauth-provider";
import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { APIError } from "better-auth/api";
import { and, eq } from "drizzle-orm";
import { GARMENT_IDS, GARMENT_NAMES, isJacket } from "@/dress/garments";
import { MODES } from "@/dress/modes";
import { type createAuth, mcpResource } from "./auth";
import type { Db } from "./db";
import { oauthConsent } from "./db/auth-schema";

type Auth = ReturnType<typeof createAuth>;

const list = {
	garments: GARMENT_IDS.map((id) => ({
		id,
		name: GARMENT_NAMES[id],
		jacket: isJacket(id),
	})),
	modes: MODES.map((m) => ({
		id: m.id,
		name: m.name,
		weatherGroup: m.group,
		garments: [...m.garments],
	})),
};

function dressupServer() {
	const server = new McpServer({ name: "dressup", version: "1.0.0" });
	server.registerTool(
		"list_garments_and_modes",
		{
			title: "List garments and modes",
			description:
				"The 17 garments and the 23 modes dressup knows. A mode is a set of garments worn together.",
			annotations: { readOnlyHint: true },
		},
		() => ({
			content: [{ type: "text", text: JSON.stringify(list) }],
			structuredContent: list,
		}),
	);
	return server;
}

const mcpHandler = createMcpHandler(() => dressupServer());

// The same 401 requireMcpAuth gives, so an AI app reads every refusal one way.
function refuse(request: Request, baseURL: string, description: string) {
	const challenge = createResourceServerChallenge(
		new APIError("UNAUTHORIZED", {
			message: description,
			error: "invalid_token",
			error_description: description,
		}),
		mcpResource(baseURL),
		{ request },
	);
	const headers = new Headers(
		challenge?.headers as ConstructorParameters<typeof Headers>[0],
	);
	headers.set("content-type", "application/json");
	return new Response(
		JSON.stringify({
			jsonrpc: "2.0",
			error: { code: -32000, message: description },
			id: null,
		}),
		{ status: challenge?.statusCode ?? 401, headers },
	);
}

export function mcpRoute(
	auth: Auth,
	db: Db,
	baseURL: string,
	request: Request,
): Promise<Response> {
	return requireMcpAuth(
		auth,
		async (req, claims) => {
			const { sub, azp, scope } = claims;
			if (
				typeof sub !== "string" ||
				typeof azp !== "string" ||
				typeof scope !== "string"
			)
				return refuse(req, baseURL, "malformed pass");
			// Access tokens are JWTs that live an hour and cannot be revoked; the
			// allow row is what Disconnect removes.
			const [allow] = await db
				.select({ id: oauthConsent.id })
				.from(oauthConsent)
				.where(
					and(eq(oauthConsent.userId, sub), eq(oauthConsent.clientId, azp)),
				)
				.limit(1);
			if (!allow) return refuse(req, baseURL, "this app is no longer allowed");
			const token =
				req.headers.get("authorization")?.replace(/^\S+\s+/, "") ?? "";
			return mcpHandler.fetch(req, {
				authInfo: {
					token,
					clientId: azp,
					scopes: scope.split(" "),
					extra: { userId: sub },
				},
			});
		},
		{ resource: mcpResource(baseURL) },
	)(request);
}
