import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { createAuth } from "./auth";
import type { Db } from "./db";
import { loadDress } from "./dress-store";

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
		c.json(await loadDress(getDb(c.env), c.var.user.id)),
	);

	app.notFound((c) => c.json({ error: "not_found" }, 404));

	return app;
}
