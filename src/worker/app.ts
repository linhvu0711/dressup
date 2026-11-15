import { eq } from "drizzle-orm";
import { type Context, Hono } from "hono";
import { createMiddleware } from "hono/factory";
import type { z } from "zod";
import { applyChange, dressChangeSchema } from "@/dress/state";
import { lookInputSchema } from "@/looks/look";
import { newTagSchema, tagSchema } from "@/tags/tag";
import { createAuth, createClientDiscovery } from "./auth";
import type { Db } from "./db";
import { user } from "./db/auth-schema";
import { loadDress, saveDress } from "./dress-store";
import { deleteLook, listLooks, saveLook, updateLook } from "./look-store";
import { mcpRoute } from "./mcp";
import { addTag, deleteTag, listTags, renameTag } from "./tag-store";

type Auth = ReturnType<typeof createAuth>;
type User = Auth["$Infer"]["Session"]["user"];
type AppEnv = { Bindings: Env; Variables: { auth: Auth; user: User } };

// The parsed body, or the 400 that names the field: the whole zod path, as
// `colours.sweater`. A body that is not JSON, or JSON but not an object
// (an empty path), names "body".
async function readBody<T extends z.ZodType>(
	c: Context<AppEnv>,
	schema: T,
): Promise<{ data: z.output<T> } | { refused: Response }> {
	let body: unknown;
	try {
		body = await c.req.json();
	} catch {
		return { refused: c.json({ error: "invalid", field: "body" }, 400) };
	}
	const parsed = schema.safeParse(body);
	if (parsed.success) return { data: parsed.data };
	const path = parsed.error.issues[0]?.path ?? [];
	const field = path.length === 0 ? "body" : path.map(String).join(".");
	return { refused: c.json({ error: "invalid", field }, 400) };
}

export function createApp(getDb: (env: Env) => Db) {
	const root = new Hono<AppEnv>();
	const app = root.basePath("/api");
	// One per isolate: the plugin keeps its document cache and fetch limits in
	// this object, and the auth instance is new on every request.
	const clientDiscovery = createClientDiscovery();

	const withAuth = createMiddleware<AppEnv>(async (c, next) => {
		c.set(
			"auth",
			createAuth({
				db: getDb(c.env),
				secret: c.env.BETTER_AUTH_SECRET,
				baseURL: c.env.BETTER_AUTH_URL,
				google: {
					clientId: c.env.GOOGLE_CLIENT_ID,
					clientSecret: c.env.GOOGLE_CLIENT_SECRET,
				},
				signupsClosed: c.env.SIGNUPS_CLOSED === "true",
				clientDiscovery,
			}),
		);
		await next();
	});

	// AI apps look for metadata at the site root (RFC 8414, RFC 9728); better-auth
	// answers those paths (P5).
	root.get("/.well-known/*", withAuth, (c) => c.var.auth.handler(c.req.raw));

	const requireUser = createMiddleware<AppEnv>(async (c, next) => {
		const { headers, response: session } = await c.var.auth.api.getSession({
			headers: c.req.raw.headers,
			returnHeaders: true,
		});
		// Better Auth renews the cache and session cookies here; dropping them
		// would send every request after the first 5 minutes to the database.
		for (const cookie of headers.getSetCookie())
			c.header("set-cookie", cookie, { append: true });
		if (!session) return c.json({ error: "unauthorized" }, 401);
		c.set("user", session.user);
		await next();
	});

	app.on(["GET", "POST"], "/auth/*", withAuth, (c) =>
		c.var.auth.handler(c.req.raw),
	);

	app.on(["GET", "POST", "DELETE"], "/mcp", withAuth, (c) =>
		mcpRoute(c.var.auth, getDb(c.env), c.env.BETTER_AUTH_URL, c.req.raw),
	);

	app.get("/health", (c) => c.json({ ok: true }));

	app.get("/me", withAuth, requireUser, (c) => {
		const { id, name, email, image } = c.var.user;
		return c.json({ id, name, email, image: image ?? null });
	});

	app.delete("/account", withAuth, requireUser, async (c) => {
		// One statement: the sessions, the Google link, and every app row go
		// with the user row through their foreign keys, all or nothing. Better
		// Auth's own delete wants a session under a day old or an email (#12).
		await getDb(c.env).delete(user).where(eq(user.id, c.var.user.id));
		// Sign-out also clears the 5-minute cookie cache, which would keep the
		// deleted account on screen.
		const { headers } = await c.var.auth.api.signOut({
			headers: c.req.raw.headers,
			returnHeaders: true,
		});
		for (const cookie of headers.getSetCookie())
			c.header("set-cookie", cookie, { append: true });
		return c.body(null, 204);
	});

	app.get("/dress", withAuth, requireUser, async (c) =>
		c.json((await loadDress(getDb(c.env), c.var.user.id)).state),
	);

	app.post("/dress/changes", withAuth, requireUser, async (c) => {
		const body = await readBody(c, dressChangeSchema);
		if ("refused" in body) return body.refused;
		const db = getDb(c.env);
		const userId = c.var.user.id;
		const stored = await loadDress(db, userId);
		const result = applyChange(stored.state, body.data);
		if (!result.ok)
			return c.json({ error: result.error, field: result.field }, 400);
		await saveDress(db, userId, stored, result.state);
		return c.body(null, 204);
	});

	app.get("/looks", withAuth, requireUser, async (c) =>
		c.json({ looks: await listLooks(getDb(c.env), c.var.user.id) }),
	);

	app.post("/looks", withAuth, requireUser, async (c) => {
		const body = await readBody(c, lookInputSchema);
		if ("refused" in body) return body.refused;
		const saved = await saveLook(getDb(c.env), c.var.user.id, body.data);
		if (!saved.ok)
			return saved.error === "conflict"
				? c.json({ error: "conflict", field: "id" }, 409)
				: c.json({ error: "look_limit" }, 409);
		return c.json({ look: saved.look }, saved.created ? 201 : 200);
	});

	// A gone look and another account's look answer the same 404, so ids of
	// other accounts cannot be told from missing ones.
	app.put("/looks/:id", withAuth, requireUser, async (c) => {
		const body = await readBody(c, lookInputSchema);
		if ("refused" in body) return body.refused;
		if (body.data.id !== c.req.param("id"))
			return c.json({ error: "invalid", field: "id" }, 400);
		const look = await updateLook(getDb(c.env), c.var.user.id, body.data);
		if (!look) return c.json({ error: "not_found" }, 404);
		return c.json({ look }, 200);
	});

	app.delete("/looks/:id", withAuth, requireUser, async (c) => {
		const deleted = await deleteLook(
			getDb(c.env),
			c.var.user.id,
			c.req.param("id"),
		);
		if (!deleted) return c.json({ error: "not_found" }, 404);
		return c.body(null, 204);
	});

	app.get("/tags", withAuth, requireUser, async (c) =>
		c.json({ tags: await listTags(getDb(c.env), c.var.user.id) }),
	);

	app.post("/tags", withAuth, requireUser, async (c) => {
		const body = await readBody(c, newTagSchema);
		if ("refused" in body) return body.refused;
		const added = await addTag(getDb(c.env), c.var.user.id, body.data.name);
		if (!added.ok) return c.json({ error: "duplicate", field: "name" }, 400);
		return c.json({ tag: added.tag }, 201);
	});

	// A gone tag and another account's tag answer the same 404, as looks do.
	app.put("/tags/:id", withAuth, requireUser, async (c) => {
		const body = await readBody(c, tagSchema);
		if ("refused" in body) return body.refused;
		if (body.data.id !== c.req.param("id"))
			return c.json({ error: "invalid", field: "id" }, 400);
		const renamed = await renameTag(getDb(c.env), c.var.user.id, body.data);
		if (!renamed.ok)
			return renamed.error === "duplicate"
				? c.json({ error: "duplicate", field: "name" }, 400)
				: c.json({ error: "not_found" }, 404);
		return c.json({ tag: renamed.tag }, 200);
	});

	app.delete("/tags/:id", withAuth, requireUser, async (c) => {
		const deleted = await deleteTag(
			getDb(c.env),
			c.var.user.id,
			c.req.param("id"),
		);
		if (!deleted) return c.json({ error: "not_found" }, 404);
		return c.body(null, 204);
	});

	// Hono runs the not-found handler of the instance that got the request.
	root.notFound((c) => c.json({ error: "not_found" }, 404));

	return root;
}
