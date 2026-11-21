import { eq } from "drizzle-orm";
import { type Context, Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { createMiddleware } from "hono/factory";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { z } from "zod";
import { hexSchema } from "@/colour/hex";
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
import { mannequinPartSchema } from "@/mannequin/mannequin";
import { PICTURE_BYTES_MAX, pictureIdSchema } from "@/pictures/picture";
import { tagIdSchema } from "@/tags/tag";
import type { ActionScope } from "./actions/action";
import { brandActions } from "./actions/brands";
import { colourActions } from "./actions/colours";
import { combinationActions } from "./actions/combinations";
import { tagActions } from "./actions/tags";
import { disconnectAiApp, listAiApps } from "./ai-app-store";
import {
	accountPictureLimit,
	addressGone,
	notAPicture,
	notStored,
	storageFull,
	tooLargeUpload,
} from "./ai-messages";
import {
	type Auth,
	type AuthEnvSettings,
	createAuth,
	createAuthCache,
	createClientDiscovery,
} from "./auth";
import { listBrands } from "./brand-store";
import { listColours } from "./colour-store";
import { listCombinations } from "./combination-store";
import type { Db } from "./db";
import { user } from "./db/auth-schema";
import { loadMannequin, setMannequinColour } from "./mannequin-store";
import { mcpRoute } from "./mcp";
import {
	addOwnedItem,
	type BoughtError,
	buyShopLink,
	changeOwnedItem,
	deleteOwnedItem,
	listOwnedItems,
	type OwnedItemError,
} from "./owned-item-store";
import {
	addPicture,
	deleteDraft,
	deleteWithPictures,
	type PictureError,
	readPicture,
} from "./picture-store";
import type { Result } from "./result";
import { listTags } from "./tag-store";
import { claimUploadAddress } from "./upload-address-store";
import {
	addShopLink,
	addWish,
	changeShopLink,
	deleteShopLink,
	deleteWish,
	listWishes,
	type WishError,
} from "./wish-store";

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

type Refusal = {
	status: ContentfulStatusCode;
	body: ErrorAnswer;
};

// Only the JSON shape: the Closet module runs the owned item rules.
const ownedItemBodySchema = z.object({
	id: z.string(),
	typeId: z.string(),
	colourId: z.string(),
	brandId: z.string().nullable(),
	quantity: z.number(),
	pictureIds: z.array(z.string()).optional(),
});

function ownedItemRefusal(error: OwnedItemError): Refusal {
	switch (error.code) {
		case "invalid":
			return { status: 400, body: { error: "invalid", field: error.field } };
		case "duplicate":
			return { status: 409, body: { error: "duplicate", id: error.id } };
		case "owned_item_limit":
			return { status: 409, body: { error: "owned_item_limit" } };
		case "picture_limit":
			return { status: 409, body: { error: "picture_limit" } };
		case "conflict":
			return { status: 409, body: { error: "conflict", field: "id" } };
		case "not_found":
			return { status: 404, body: { error: "not_found" } };
	}
}

function boughtRefusal(error: BoughtError): Refusal {
	switch (error.code) {
		case "not_found":
			return { status: 404, body: { error: "not_found" } };
		case "owned_item_limit":
			return { status: 409, body: { error: "owned_item_limit" } };
		case "quantity_limit":
			return { status: 409, body: { error: "quantity_limit" } };
		case "conflict":
			return { status: 409, body: { error: "conflict", field: "id" } };
	}
}

// Only the JSON shape: the Wishlist module runs the wish rules.
const wishBodySchema = z.object({
	id: z.string(),
	typeId: z.string(),
	colourId: z.string(),
});

const shopLinkBodySchema = z.object({
	url: z.string(),
	brandId: z.string().nullable(),
	name: z.string(),
	price: z.number().nullable(),
	pictureIds: z.array(z.string()).optional(),
});

function wishRefusal(error: WishError): Refusal {
	switch (error.code) {
		case "invalid":
			return { status: 400, body: { error: "invalid", field: error.field } };
		case "duplicate":
			return { status: 409, body: { error: "duplicate", id: error.id } };
		case "wish_limit":
			return { status: 409, body: { error: "wish_limit" } };
		case "shop_link_limit":
			return { status: 409, body: { error: "shop_link_limit" } };
		case "picture_limit":
			return { status: 409, body: { error: "picture_limit" } };
		case "conflict":
			return { status: 409, body: { error: "conflict", field: "id" } };
		case "not_found":
			return { status: 404, body: { error: "not_found" } };
	}
}

// An AI app reads the code and the model reads the sentence; every refusal
// spends the address, so each sentence says to use a new one.
function uploadRefusal(error: PictureError): {
	status: ContentfulStatusCode;
	body: { error: string; message: string };
} {
	switch (error.code) {
		case "invalid":
			return {
				status: 415,
				body: { error: "not_an_image", message: notAPicture },
			};
		case "account_picture_limit":
			return {
				status: 409,
				body: { error: "account_picture_limit", message: accountPictureLimit },
			};
		case "storage_full":
			return {
				status: 507,
				body: { error: "storage_full", message: storageFull },
			};
		case "not_found":
		case "picture_limit":
			return { status: 500, body: { error: "not_stored", message: notStored } };
	}
}

function pictureRefusal(error: PictureError): Refusal {
	switch (error.code) {
		case "invalid":
			return { status: 400, body: { error: "invalid", field: error.field } };
		case "picture_limit":
			return { status: 409, body: { error: "picture_limit" } };
		case "account_picture_limit":
			return { status: 409, body: { error: "account_picture_limit" } };
		case "storage_full":
			return { status: 507, body: { error: "storage_full" } };
		case "not_found":
			return { status: 404, body: { error: "not_found" } };
	}
}

export function createApp(getDb: (env: Env) => Db) {
	const scope = (c: Context<AppEnv>): ActionScope => ({
		db: getDb(c.env),
		userId: c.var.user.id,
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
			{ userId: c.var.user.id },
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

	app.get("/combinations", withAuth, requireUser, async (c) =>
		c.json({
			combinations: await listCombinations(getDb(c.env), c.var.user.id),
		} satisfies CombinationsAnswer),
	);

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

	app.get("/owned-items", withAuth, requireUser, async (c) =>
		c.json({
			ownedItems: await listOwnedItems(getDb(c.env), c.var.user.id),
		} satisfies OwnedItemsAnswer),
	);

	app.post("/owned-items", withAuth, requireUser, async (c) => {
		const body = await readBody(c, ownedItemBodySchema);
		if (!body.ok) return invalid(c, body.error.field);
		const added = await addOwnedItem(
			getDb(c.env),
			c.env.PICTURES,
			c.var.user.id,
			body.value,
		);
		if (!added.ok) {
			const { status, body: refused } = ownedItemRefusal(added.error);
			return c.json(refused, status);
		}
		const { ownedItem, created } = added.value;
		return c.json({ ownedItem } satisfies OwnedItemAnswer, created ? 201 : 200);
	});

	app.put("/owned-items/:id", withAuth, requireUser, async (c) => {
		const body = await readBody(
			c,
			z.object({
				brandId: z.string().nullable(),
				quantity: z.number(),
				pictureIds: z.array(z.string()).optional(),
			}),
		);
		if (!body.ok) return invalid(c, body.error.field);
		const changed = await changeOwnedItem(
			getDb(c.env),
			c.env.PICTURES,
			c.var.user.id,
			c.req.param("id"),
			body.value,
		);
		if (!changed.ok) {
			const { status, body: refused } = ownedItemRefusal(changed.error);
			return c.json(refused, status);
		}
		return c.json({ ownedItem: changed.value } satisfies OwnedItemAnswer, 200);
	});

	app.delete("/owned-items/:id", withAuth, requireUser, async (c) => {
		const deleted = await deleteOwnedItem(
			getDb(c.env),
			c.env.PICTURES,
			c.var.user.id,
			c.req.param("id"),
		);
		if (!deleted.ok) {
			const { status, body: refused } = ownedItemRefusal(deleted.error);
			return c.json(refused, status);
		}
		return c.body(null, 204);
	});

	app.post("/shop-links/:id/bought", withAuth, requireUser, async (c) => {
		const bought = await buyShopLink(
			getDb(c.env),
			c.env.PICTURES,
			c.var.user.id,
			c.req.param("id"),
		);
		if (!bought.ok) {
			const { status, body: refused } = boughtRefusal(bought.error);
			return c.json(refused, status);
		}
		const { ownedItem, created } = bought.value;
		return c.json({ ownedItem } satisfies OwnedItemAnswer, created ? 201 : 200);
	});

	app.get("/wishes", withAuth, requireUser, async (c) =>
		c.json({
			wishes: await listWishes(getDb(c.env), c.var.user.id),
		} satisfies WishesAnswer),
	);

	app.post("/wishes", withAuth, requireUser, async (c) => {
		const body = await readBody(c, wishBodySchema);
		if (!body.ok) return invalid(c, body.error.field);
		const added = await addWish(getDb(c.env), c.var.user.id, body.value);
		if (!added.ok) {
			const { status, body: refused } = wishRefusal(added.error);
			return c.json(refused, status);
		}
		const { wish, created } = added.value;
		return c.json({ wish } satisfies WishAnswer, created ? 201 : 200);
	});

	app.post("/wishes/:id/shop-links", withAuth, requireUser, async (c) => {
		const body = await readBody(
			c,
			shopLinkBodySchema.extend({ id: z.string() }),
		);
		if (!body.ok) return invalid(c, body.error.field);
		const added = await addShopLink(
			getDb(c.env),
			c.env.PICTURES,
			c.var.user.id,
			c.req.param("id"),
			body.value,
		);
		if (!added.ok) {
			const { status, body: refused } = wishRefusal(added.error);
			return c.json(refused, status);
		}
		const { wish, created } = added.value;
		return c.json({ wish } satisfies WishAnswer, created ? 201 : 200);
	});

	app.put("/shop-links/:id", withAuth, requireUser, async (c) => {
		const body = await readBody(c, shopLinkBodySchema);
		if (!body.ok) return invalid(c, body.error.field);
		const changed = await changeShopLink(
			getDb(c.env),
			c.env.PICTURES,
			c.var.user.id,
			c.req.param("id"),
			body.value,
		);
		if (!changed.ok) {
			const { status, body: refused } = wishRefusal(changed.error);
			return c.json(refused, status);
		}
		return c.json({ wish: changed.value } satisfies WishAnswer, 200);
	});

	app.delete("/shop-links/:id", withAuth, requireUser, async (c) => {
		const deleted = await deleteShopLink(
			getDb(c.env),
			c.env.PICTURES,
			c.var.user.id,
			c.req.param("id"),
		);
		if (!deleted.ok) {
			const { status, body: refused } = wishRefusal(deleted.error);
			return c.json(refused, status);
		}
		return c.body(null, 204);
	});

	app.delete("/wishes/:id", withAuth, requireUser, async (c) => {
		const deleted = await deleteWish(
			getDb(c.env),
			c.env.PICTURES,
			c.var.user.id,
			c.req.param("id"),
		);
		if (!deleted.ok) {
			const { status, body: refused } = wishRefusal(deleted.error);
			return c.json(refused, status);
		}
		return c.body(null, 204);
	});

	app.post(
		"/pictures",
		withAuth,
		requireUser,
		bodyLimit({
			maxSize: PICTURE_BYTES_MAX,
			onError: (c) => c.json({ error: "too_large" } satisfies ErrorAnswer, 413),
		}),
		async (c) => {
			const added = await addPicture(
				getDb(c.env),
				c.env.PICTURES,
				c.var.user.id,
				await c.req.arrayBuffer(),
			);
			if (!added.ok) {
				const { status, body: refused } = pictureRefusal(added.error);
				return c.json(refused, status);
			}
			return c.json({ picture: added.value } satisfies PictureAnswer, 201);
		},
	);

	app.get("/pictures/:id", withAuth, requireUser, async (c) => {
		const id = pictureIdSchema.safeParse(c.req.param("id"));
		const read = id.success
			? await readPicture(getDb(c.env), c.env.PICTURES, c.var.user.id, id.data)
			: ({ ok: false, error: { code: "not_found" } } as const);
		if (!read.ok) {
			const { status, body: refused } = pictureRefusal(read.error);
			return c.json(refused, status);
		}
		const headers = new Headers();
		read.value.writeHttpMetadata(headers);
		// A picture never gets new bytes: a new upload is a new id.
		headers.set("cache-control", "private, max-age=31536000, immutable");
		return new Response(read.value.body, { headers });
	});

	app.delete("/pictures/:id", withAuth, requireUser, async (c) => {
		const deleted = await deleteDraft(
			getDb(c.env),
			c.env.PICTURES,
			c.var.user.id,
			c.req.param("id"),
		);
		if (!deleted.ok) {
			const { status, body: refused } = pictureRefusal(deleted.error);
			return c.json(refused, status);
		}
		return c.body(null, 204);
	});

	app.post(
		"/uploads/:id",
		claimAddress,
		bodyLimit({
			maxSize: PICTURE_BYTES_MAX,
			onError: (c) =>
				c.json({ error: "too_large", message: tooLargeUpload }, 413),
		}),
		async (c) => {
			// Read outside the try, so bodyLimit sees a body that runs over.
			const bytes = await c.req.arrayBuffer();
			try {
				const added = await addPicture(
					getDb(c.env),
					c.env.PICTURES,
					c.var.uploaderId,
					bytes,
				);
				if (!added.ok) {
					const { status, body } = uploadRefusal(added.error);
					return c.json(body, status);
				}
				return c.json({ pictureId: added.value.id }, 201);
			} catch {
				// addPicture takes its row and count back before it throws.
				return c.json({ error: "not_stored", message: notStored }, 500);
			}
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
		const part = mannequinPartSchema.safeParse(c.req.param("part"));
		if (!part.success)
			return c.json(
				{ error: "invalid", field: "part" } satisfies ErrorAnswer,
				400,
			);
		const body = await readBody(c, z.object({ hex: hexSchema }));
		if (!body.ok) return invalid(c, body.error.field);
		const mannequin = await setMannequinColour(
			getDb(c.env),
			c.var.user.id,
			part.data,
			body.value.hex,
		);
		return c.json({ mannequin } satisfies MannequinAnswer, 200);
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
