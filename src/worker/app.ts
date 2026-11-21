import { eq } from "drizzle-orm";
import { type Context, Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { createMiddleware } from "hono/factory";
import type { z } from "zod";
import type {
	AiAppsAnswer,
	BrandAnswer,
	BrandsAnswer,
	ColourAnswer,
	ColoursAnswer,
	CombinationAnswer,
	CombinationsAnswer,
	ErrorAnswer,
	MannequinAnswer,
	MeAnswer,
	OwnedItemAnswer,
	OwnedItemsAnswer,
	PictureAnswer,
	TagAnswer,
	TagsAnswer,
	WishAnswer,
	WishesAnswer,
} from "@/data/contract";
import { brandIdSchema } from "@/labels/brand";
import { colourIdSchema } from "@/labels/colour";
import { PICTURE_BYTES_MAX } from "@/pictures/picture";
import { tagIdSchema } from "@/tags/tag";
import type { ActionScope, Refusal } from "./actions/action";
import { boughtActions } from "./actions/bought";
import { brandActions } from "./actions/brands";
import { colourActions } from "./actions/colours";
import { combinationActions } from "./actions/combinations";
import { mannequinActions } from "./actions/mannequin";
import { ownedItemActions } from "./actions/owned-items";
import { pictureActions, tooLarge } from "./actions/pictures";
import { tagActions } from "./actions/tags";
import { shopLinkActions, wishActions } from "./actions/wishes";
import { disconnectAiApp, listAiApps } from "./ai-app-store";
import {
	type Auth,
	type AuthEnvSettings,
	createAuth,
	createAuthCache,
	createClientDiscovery,
} from "./auth";
import { listBrands } from "./brand-store";
import { listColours } from "./colour-store";
import type { Db } from "./db";
import { user } from "./db/auth-schema";
import { loadMannequin } from "./mannequin-store";
import { mcpRoute } from "./mcp";
import { deleteWithPictures } from "./picture-store";
import type { Result } from "./result";
import { listTags } from "./tag-store";
import { claimUploadAddress } from "./upload-address-store";

type User = Auth["$Infer"]["Session"]["user"];
type AppEnv = {
	Bindings: Env;
	Variables: { auth: Auth; user: User; uploaderId: string };
};

type BodyError = { code: "invalid"; field: string };

// The parsed body, or the 400 that names the field: the whole zod path, as
// `colours.sweater`. A body that is not JSON, or JSON but not an object
// (an empty path), names "body".
async function readBody<T extends z.ZodType>(
	c: Context<AppEnv>,
	schema: T,
): Promise<Result<z.output<T>, BodyError>> {
	let body: unknown;
	try {
		body = await c.req.json();
	} catch {
		return { ok: false, error: { code: "invalid", field: "body" } };
	}
	const parsed = schema.safeParse(body);
	if (parsed.success) return { ok: true, value: parsed.data };
	return {
		ok: false,
		error: {
			code: "invalid",
			field: issueField(parsed.error.issues[0]?.path ?? []),
		},
	};
}

const invalid = (c: Context<AppEnv>, field: string) =>
	c.json({ error: "invalid", field } satisfies ErrorAnswer, 400);

const issueField = (path: readonly PropertyKey[]) =>
	path.length === 0 ? "body" : path.map(String).join(".");

export function createApp(getDb: (env: Env) => Db) {
	const scope = (c: Context<AppEnv>): ActionScope => ({
		db: getDb(c.env),
		userId: c.var.user.id,
		pictures: c.env.PICTURES,
	});
	const root = new Hono<AppEnv>();
	const app = root.basePath("/api");
	// One per isolate: the plugin keeps its document cache and fetch limits in
	// this object.
	const clientDiscovery = createClientDiscovery();
	const authFor = createAuthCache();

	const withAuth = createMiddleware<AppEnv>(async (c, next) => {
		const settings: AuthEnvSettings = {
			secret: c.env.BETTER_AUTH_SECRET,
			baseURL: c.env.BETTER_AUTH_URL,
			google: {
				clientId: c.env.GOOGLE_CLIENT_ID,
				clientSecret: c.env.GOOGLE_CLIENT_SECRET,
			},
			signupsClosed: c.env.SIGNUPS_CLOSED === "true",
		};
		c.set(
			"auth",
			await authFor(settings, () =>
				createAuth({ ...settings, db: getDb(c.env), clientDiscovery }),
			),
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
		if (!session)
			return c.json({ error: "unauthorized" } satisfies ErrorAnswer, 401);
		c.set("user", session.user);
		await next();
	});

	const addressGone =
		"This upload address was used or has expired. get_upload_address gives a new one.";

	// The upload address is the pass: only the account's AI app was given it.
	// The claim runs before the body is read, so any POST spends the address.
	const claimAddress = createMiddleware<AppEnv>(async (c, next) => {
		const userId = await claimUploadAddress(
			getDb(c.env),
			c.req.param("id") ?? "",
		);
		if (userId === null)
			return c.json({ error: "address_gone", message: addressGone }, 410);
		c.set("uploaderId", userId);
		await next();
	});

	app.on(["GET", "POST"], "/auth/*", withAuth, (c) =>
		c.var.auth.handler(c.req.raw),
	);

	app.on(["GET", "POST", "DELETE"], "/mcp", withAuth, (c) =>
		mcpRoute(
			c.var.auth,
			getDb(c.env),
			c.env.PICTURES,
			c.env.BETTER_AUTH_URL,
			c.req.raw,
		),
	);

	app.get("/health", (c) => c.json({ ok: true }));

	app.get("/me", withAuth, requireUser, (c) => {
		const { id, name, email, image } = c.var.user;
		return c.json({
			id,
			name,
			email,
			image: image ?? null,
		} satisfies MeAnswer);
	});

	app.delete("/account", withAuth, requireUser, async (c) => {
		// One batch: the sessions, the Google link, and every app row go with
		// the user row through their foreign keys, all or nothing. The picture
		// store deletes the pictures' rows first in the same batch, so their
		// objects and the stored bytes go too. Better Auth's own delete wants a
		// session under a day old or an email (#12).
		const db = getDb(c.env);
		await deleteWithPictures(
			db,
			c.env.PICTURES,
			{ userId: c.var.user.id, owner: { kind: "account" } },
			db.delete(user).where(eq(user.id, c.var.user.id)),
		);
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

	app.get("/combinations", withAuth, requireUser, async (c) => {
		const listed = await combinationActions.list.run(scope(c), {});
		if (!listed.ok) return c.json(listed.error.body, listed.error.status);
		return c.json({ combinations: listed.value } satisfies CombinationsAnswer);
	});

	app.post("/combinations", withAuth, requireUser, async (c) => {
		const body = await readBody(c, combinationActions.save.input);
		if (!body.ok) return invalid(c, body.error.field);
		const saved = await combinationActions.save.run(scope(c), body.value);
		if (!saved.ok) return c.json(saved.error.body, saved.error.status);
		const { combination, created } = saved.value;
		return c.json(
			{ combination } satisfies CombinationAnswer,
			created ? 201 : 200,
		);
	});

	// A gone combination and another account's combination answer the same
	// 404, so ids of other accounts cannot be told from missing ones.
	app.put("/combinations/:id", withAuth, requireUser, async (c) => {
		const body = await readBody(c, combinationActions.change.input);
		if (!body.ok) return invalid(c, body.error.field);
		if (body.value.id !== c.req.param("id")) return invalid(c, "id");
		const changed = await combinationActions.change.run(scope(c), body.value);
		if (!changed.ok) return c.json(changed.error.body, changed.error.status);
		return c.json({ combination: changed.value } satisfies CombinationAnswer);
	});

	app.delete("/combinations/:id", withAuth, requireUser, async (c) => {
		const deleted = await combinationActions.delete.run(scope(c), {
			id: c.req.param("id"),
		});
		if (!deleted.ok) return c.json(deleted.error.body, deleted.error.status);
		return c.body(null, 204);
	});

	app.get("/owned-items", withAuth, requireUser, async (c) => {
		const listed = await ownedItemActions.list.run(scope(c), {});
		if (!listed.ok) return c.json(listed.error.body, listed.error.status);
		return c.json({ ownedItems: listed.value } satisfies OwnedItemsAnswer);
	});

	app.post("/owned-items", withAuth, requireUser, async (c) => {
		const body = await readBody(c, ownedItemActions.add.input);
		if (!body.ok) return invalid(c, body.error.field);
		const added = await ownedItemActions.add.run(scope(c), body.value);
		if (!added.ok) return c.json(added.error.body, added.error.status);
		const { ownedItem, created } = added.value;
		return c.json({ ownedItem } satisfies OwnedItemAnswer, created ? 201 : 200);
	});

	app.put("/owned-items/:id", withAuth, requireUser, async (c) => {
		const body = await readBody(
			c,
			ownedItemActions.change.input.omit({ id: true }),
		);
		if (!body.ok) return invalid(c, body.error.field);
		const changed = await ownedItemActions.change.run(scope(c), {
			...body.value,
			id: c.req.param("id"),
		});
		if (!changed.ok) return c.json(changed.error.body, changed.error.status);
		return c.json({ ownedItem: changed.value } satisfies OwnedItemAnswer, 200);
	});

	app.delete("/owned-items/:id", withAuth, requireUser, async (c) => {
		const deleted = await ownedItemActions.delete.run(scope(c), {
			id: c.req.param("id"),
		});
		if (!deleted.ok) return c.json(deleted.error.body, deleted.error.status);
		return c.body(null, 204);
	});

	app.post("/shop-links/:id/bought", withAuth, requireUser, async (c) => {
		const bought = await boughtActions.buy.run(scope(c), {
			id: c.req.param("id"),
		});
		if (!bought.ok) return c.json(bought.error.body, bought.error.status);
		const { ownedItem, created } = bought.value;
		return c.json({ ownedItem } satisfies OwnedItemAnswer, created ? 201 : 200);
	});

	app.get("/wishes", withAuth, requireUser, async (c) => {
		const listed = await wishActions.list.run(scope(c), {});
		if (!listed.ok) return c.json(listed.error.body, listed.error.status);
		return c.json({ wishes: listed.value } satisfies WishesAnswer);
	});

	app.post("/wishes", withAuth, requireUser, async (c) => {
		const body = await readBody(c, wishActions.add.input);
		if (!body.ok) return invalid(c, body.error.field);
		const added = await wishActions.add.run(scope(c), body.value);
		if (!added.ok) return c.json(added.error.body, added.error.status);
		const { wish, created } = added.value;
		return c.json({ wish } satisfies WishAnswer, created ? 201 : 200);
	});

	// One add from the Wishlist form: the piece, with its first shop link when
	// the user gave an address.
	app.post("/wishlist", withAuth, requireUser, async (c) => {
		const body = await readBody(c, wishActions.addToWishlist.input);
		if (!body.ok) return invalid(c, body.error.field);
		const added = await wishActions.addToWishlist.run(scope(c), body.value);
		if (!added.ok) return c.json(added.error.body, added.error.status);
		const { wish, created } = added.value;
		return c.json({ wish } satisfies WishAnswer, created ? 201 : 200);
	});

	app.post("/wishes/:id/shop-links", withAuth, requireUser, async (c) => {
		const body = await readBody(
			c,
			shopLinkActions.add.input.omit({ wishId: true }),
		);
		if (!body.ok) return invalid(c, body.error.field);
		const added = await shopLinkActions.add.run(scope(c), {
			...body.value,
			wishId: c.req.param("id"),
		});
		if (!added.ok) return c.json(added.error.body, added.error.status);
		const { wish, created } = added.value;
		return c.json({ wish } satisfies WishAnswer, created ? 201 : 200);
	});

	app.put("/shop-links/:id", withAuth, requireUser, async (c) => {
		const body = await readBody(
			c,
			shopLinkActions.change.input.omit({ id: true }),
		);
		if (!body.ok) return invalid(c, body.error.field);
		const changed = await shopLinkActions.change.run(scope(c), {
			...body.value,
			id: c.req.param("id"),
		});
		if (!changed.ok) return c.json(changed.error.body, changed.error.status);
		return c.json({ wish: changed.value } satisfies WishAnswer, 200);
	});

	app.delete("/shop-links/:id", withAuth, requireUser, async (c) => {
		const deleted = await shopLinkActions.delete.run(scope(c), {
			id: c.req.param("id"),
		});
		if (!deleted.ok) return c.json(deleted.error.body, deleted.error.status);
		return c.body(null, 204);
	});

	app.delete("/wishes/:id", withAuth, requireUser, async (c) => {
		const deleted = await wishActions.delete.run(scope(c), {
			id: c.req.param("id"),
		});
		if (!deleted.ok) return c.json(deleted.error.body, deleted.error.status);
		return c.body(null, 204);
	});

	app.post(
		"/pictures",
		withAuth,
		requireUser,
		bodyLimit({
			maxSize: PICTURE_BYTES_MAX,
			onError: (c) => c.json(tooLarge.body, tooLarge.status),
		}),
		async (c) => {
			const added = await pictureActions.add.run(scope(c), {
				bytes: await c.req.arrayBuffer(),
			});
			if (!added.ok) return c.json(added.error.body, added.error.status);
			return c.json({ picture: added.value } satisfies PictureAnswer, 201);
		},
	);

	app.get("/pictures/:id", withAuth, requireUser, async (c) => {
		const read = await pictureActions.read.run(scope(c), {
			id: c.req.param("id"),
		});
		if (!read.ok) return c.json(read.error.body, read.error.status);
		const headers = new Headers();
		read.value.writeHttpMetadata(headers);
		// A picture never gets new bytes: a new upload is a new id.
		headers.set("cache-control", "private, max-age=31536000, immutable");
		return new Response(read.value.body, { headers });
	});

	app.delete("/pictures/:id", withAuth, requireUser, async (c) => {
		const deleted = await pictureActions.deleteDraft.run(scope(c), {
			id: c.req.param("id"),
		});
		if (!deleted.ok) return c.json(deleted.error.body, deleted.error.status);
		return c.body(null, 204);
	});

	// An AI app reads the code and the model reads the message.
	const uploadRefusal = (
		c: Context<AppEnv>,
		{ status, body, text }: Omit<Refusal, "code">,
	) => c.json({ ...body, message: text }, status);

	app.post(
		"/uploads/:id",
		claimAddress,
		bodyLimit({
			maxSize: PICTURE_BYTES_MAX,
			onError: (c) => uploadRefusal(c, tooLarge),
		}),
		async (c) => {
			const added = await pictureActions.add.run(
				{
					db: getDb(c.env),
					userId: c.var.uploaderId,
					pictures: c.env.PICTURES,
				},
				{ bytes: await c.req.arrayBuffer() },
			);
			if (!added.ok) return uploadRefusal(c, added.error);
			return c.json({ pictureId: added.value.id }, 201);
		},
	);

	app.get("/tags", withAuth, requireUser, async (c) =>
		c.json({
			tags: await listTags(getDb(c.env), c.var.user.id),
		} satisfies TagsAnswer),
	);

	app.get("/colours", withAuth, requireUser, async (c) =>
		c.json({
			colours: await listColours(getDb(c.env), c.var.user.id),
		} satisfies ColoursAnswer),
	);

	app.post("/colours", withAuth, requireUser, async (c) => {
		const body = await readBody(c, colourActions.add.input);
		if (!body.ok) return invalid(c, body.error.field);
		const added = await colourActions.add.run(scope(c), body.value);
		if (!added.ok) return c.json(added.error.body, added.error.status);
		return c.json({ colour: added.value } satisfies ColourAnswer, 201);
	});

	// A gone colour and another account's colour answer the same 404, as tags do.
	app.put("/colours/:id", withAuth, requireUser, async (c) => {
		const body = await readBody(
			c,
			colourActions.change.input.extend({ id: colourIdSchema }),
		);
		if (!body.ok) return invalid(c, body.error.field);
		if (body.value.id !== c.req.param("id")) return invalid(c, "id");
		const changed = await colourActions.change.run(scope(c), body.value);
		if (!changed.ok) return c.json(changed.error.body, changed.error.status);
		return c.json({ colour: changed.value } satisfies ColourAnswer, 200);
	});

	app.delete("/colours/:id", withAuth, requireUser, async (c) => {
		const deleted = await colourActions.delete.run(scope(c), {
			id: c.req.param("id"),
		});
		if (!deleted.ok) return c.json(deleted.error.body, deleted.error.status);
		return c.body(null, 204);
	});

	app.get("/mannequin", withAuth, requireUser, async (c) =>
		c.json({
			mannequin: await loadMannequin(getDb(c.env), c.var.user.id),
		} satisfies MannequinAnswer),
	);

	app.put("/mannequin/:part", withAuth, requireUser, async (c) => {
		const body = await readBody(
			c,
			mannequinActions.set.input.omit({ part: true }),
		);
		if (!body.ok) return invalid(c, body.error.field);
		const set = await mannequinActions.set.run(scope(c), {
			...body.value,
			part: c.req.param("part"),
		});
		if (!set.ok) return c.json(set.error.body, set.error.status);
		return c.json({ mannequin: set.value } satisfies MannequinAnswer, 200);
	});

	app.get("/brands", withAuth, requireUser, async (c) =>
		c.json({
			brands: await listBrands(getDb(c.env), c.var.user.id),
		} satisfies BrandsAnswer),
	);

	app.post("/brands", withAuth, requireUser, async (c) => {
		const body = await readBody(c, brandActions.add.input);
		if (!body.ok) return invalid(c, body.error.field);
		const added = await brandActions.add.run(scope(c), body.value);
		if (!added.ok) return c.json(added.error.body, added.error.status);
		return c.json({ brand: added.value } satisfies BrandAnswer, 201);
	});

	// A gone brand and another account's brand answer the same 404.
	app.put("/brands/:id", withAuth, requireUser, async (c) => {
		const body = await readBody(
			c,
			brandActions.rename.input.extend({ id: brandIdSchema }),
		);
		if (!body.ok) return invalid(c, body.error.field);
		if (body.value.id !== c.req.param("id")) return invalid(c, "id");
		const renamed = await brandActions.rename.run(scope(c), body.value);
		if (!renamed.ok) return c.json(renamed.error.body, renamed.error.status);
		return c.json({ brand: renamed.value } satisfies BrandAnswer, 200);
	});

	app.delete("/brands/:id", withAuth, requireUser, async (c) => {
		const deleted = await brandActions.delete.run(scope(c), {
			id: c.req.param("id"),
		});
		if (!deleted.ok) return c.json(deleted.error.body, deleted.error.status);
		return c.body(null, 204);
	});

	app.get("/ai-apps", withAuth, requireUser, async (c) =>
		c.json({
			apps: await listAiApps(getDb(c.env), c.var.user.id),
		} satisfies AiAppsAnswer),
	);

	app.post("/tags", withAuth, requireUser, async (c) => {
		const body = await readBody(c, tagActions.add.input);
		if (!body.ok) return invalid(c, body.error.field);
		const added = await tagActions.add.run(scope(c), body.value);
		if (!added.ok) return c.json(added.error.body, added.error.status);
		return c.json({ tag: added.value } satisfies TagAnswer, 201);
	});

	// A gone tag and another account's tag answer the same 404, as combinations do.
	app.put("/tags/:id", withAuth, requireUser, async (c) => {
		const body = await readBody(
			c,
			tagActions.rename.input.extend({ id: tagIdSchema }),
		);
		if (!body.ok) return invalid(c, body.error.field);
		if (body.value.id !== c.req.param("id")) return invalid(c, "id");
		const renamed = await tagActions.rename.run(scope(c), body.value);
		if (!renamed.ok) return c.json(renamed.error.body, renamed.error.status);
		return c.json({ tag: renamed.value } satisfies TagAnswer, 200);
	});

	app.delete("/tags/:id", withAuth, requireUser, async (c) => {
		const deleted = await tagActions.delete.run(scope(c), {
			id: c.req.param("id"),
		});
		if (!deleted.ok) return c.json(deleted.error.body, deleted.error.status);
		return c.body(null, 204);
	});

	// A gone allow and another account's allow answer the same 404, as combinations do.
	app.delete("/ai-apps/:id", withAuth, requireUser, async (c) => {
		const disconnected = await disconnectAiApp(
			getDb(c.env),
			c.var.user.id,
			c.req.param("id"),
		);
		if (!disconnected)
			return c.json({ error: "not_found" } satisfies ErrorAnswer, 404);
		return c.body(null, 204);
	});

	// Hono runs the not-found handler of the instance that got the request.
	root.notFound((c) =>
		c.json({ error: "not_found" } satisfies ErrorAnswer, 404),
	);

	return root;
}
