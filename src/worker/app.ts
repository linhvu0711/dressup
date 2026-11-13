import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { applyChange, dressChangeSchema } from "@/dress/state";
import { createAuth } from "./auth";
import type { Db } from "./db";
import { loadDress, saveDress } from "./dress-store";

type Auth = ReturnType<typeof createAuth>;
type User = Auth["$Infer"]["Session"]["user"];
type AppEnv = { Bindings: Env; Variables: { auth: Auth; user: User } };

export function createApp(getDb: (env: Env) => Db) {
	const app = new Hono<AppEnv>().basePath("/api");

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
			}),
		);
		await next();
	});

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

	app.get("/health", (c) => c.json({ ok: true }));

	app.get("/me", withAuth, requireUser, (c) => {
		const { id, name, email, image } = c.var.user;
		return c.json({ id, name, email, image: image ?? null });
	});

	app.get("/dress", withAuth, requireUser, async (c) =>
		c.json((await loadDress(getDb(c.env), c.var.user.id)).state),
	);

	app.post("/dress/changes", withAuth, requireUser, async (c) => {
		let body: unknown;
		try {
			body = await c.req.json();
		} catch {
			return c.json({ error: "invalid", field: "body" }, 400);
		}
		const parsed = dressChangeSchema.safeParse(body);
		if (!parsed.success) {
			// A body that is JSON but not an object fails with an empty path.
			const field = parsed.error.issues[0]?.path[0];
			return c.json(
				{
					error: "invalid",
					field: field === undefined ? "body" : String(field),
				},
				400,
			);
		}
		const db = getDb(c.env);
		const userId = c.var.user.id;
		const stored = await loadDress(db, userId);
		const result = applyChange(stored.state, parsed.data);
		if (!result.ok)
			return c.json({ error: result.error, field: result.field }, 400);
		await saveDress(db, userId, stored, result.state);
		return c.body(null, 204);
	});

	app.notFound((c) => c.json({ error: "not_found" }, 404));

	return app;
}
