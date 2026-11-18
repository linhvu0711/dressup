import { requireMcpAuth } from "@better-auth/mcp";
import { createResourceServerChallenge } from "@better-auth/oauth-provider";
import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { APIError } from "better-auth/api";
import { registerAiActions } from "./ai-actions";
import { isAiAppAllowed } from "./ai-app-store";
import { type Auth, mcpResource } from "./auth";
import type { Db } from "./db";

function dressupServer(db: Db, pictures: R2Bucket, userId: string) {
	const server = new McpServer({ name: "dressup", version: "1.0.0" });
	registerAiActions(server, { db, pictures, userId });
	return server;
}

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
	pictures: R2Bucket,
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
			if (!(await isAiAppAllowed(db, sub, azp)))
				return refuse(req, baseURL, "this app is no longer allowed");
			const token =
				req.headers.get("authorization")?.replace(/^\S+\s+/, "") ?? "";
			return createMcpHandler(() => dressupServer(db, pictures, sub)).fetch(
				req,
				{
					authInfo: {
						token,
						clientId: azp,
						scopes: scope.split(" "),
						extra: { userId: sub },
					},
				},
			);
		},
		{ resource: mcpResource(baseURL) },
	)(request);
}
