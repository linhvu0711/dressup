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
import { disconnectAiApp, listAiApps } from "./ai-app-store";
import {
	type Auth,
	type AuthEnvSettings,
	createAuth,
	createAuthCache,
	createClientDiscovery,
} from "./auth";
import {
	addBrand,
	type BrandError,
	deleteBrand,
	listBrands,
	renameBrand,
} from "./brand-store";
import {
	addColour,
	type ColourError,
	changeColour,
	deleteColour,
	listColours,
} from "./colour-store";
import {
	type CombinationError,
	changeCombination,
	deleteCombination,
	listCombinations,
	saveCombination,
} from "./combination-store";
import type { Db } from "./db";
import { user } from "./db/auth-schema";
import { loadMannequin, setMannequinColour } from "./mannequin-store";
import { mcpRoute } from "./mcp";
import {
	addOwnedItem,
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
import {
	addTag,
	deleteTag,
	listTags,
	renameTag,
	type TagError,
} from "./tag-store";
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
		return {
			refused: c.json(
				{ error: "invalid", field: "body" } satisfies ErrorAnswer,
				400,
			),
		};
	}
	const parsed = schema.safeParse(body);
	if (parsed.success) return { data: parsed.data };
	const field = issueField(parsed.error.issues[0]?.path ?? []);
	return {
		refused: c.json({ error: "invalid", field } satisfies ErrorAnswer, 400),
	};
}

const issueField = (path: readonly PropertyKey[]) =>
	path.length === 0 ? "body" : path.map(String).join(".");

type Refusal = {
	status: ContentfulStatusCode;
	body: ErrorAnswer;
};

// Only the JSON shape: the Combinations module runs the combination rules.
const combinationBodySchema = z.object({
	id: z.string(),
	pieces: z.array(z.object({ typeId: z.string(), colourId: z.string() })),
	open: z.boolean(),
	tags: z.array(z.string()).optional(),
});

function combinationRefusal(error: CombinationError): Refusal {
	switch (error.code) {
		case "not_type":
		case "not_colour":
		case "not_tag":
		case "too_many_tags":
		case "pieces_count":
		case "same_layer":
		case "invalid":
			return {
				status: 400,
				body: { error: "invalid", field: issueField(error.path) },
			};
		case "conflict":
			return { status: 409, body: { error: "conflict", field: "id" } };
		case "duplicate":
			return { status: 409, body: { error: "duplicate", id: error.id } };
		case "combination_limit":
			return { status: 409, body: { error: "combination_limit" } };
		case "not_found":
			return { status: 404, body: { error: "not_found" } };
	}
}

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
		case "conflict":
			return { status: 409, body: { error: "conflict", field: "id" } };
		case "not_found":
			return { status: 404, body: { error: "not_found" } };
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

// The website answers every bad field with "invalid"; the contract
// (src/react-app/data/contract.ts) names every code it sends.
const tagRefusals: Record<TagError["code"], Refusal> = {
	name_length: { status: 400, body: { error: "invalid", field: "name" } },
	duplicate: { status: 400, body: { error: "duplicate", field: "name" } },
	not_found: { status: 404, body: { error: "not_found" } },
};

// A taken name is 409, as for colours.
function brandRefusal(error: BrandError): Refusal {
	switch (error.code) {
		case "invalid":
			return { status: 400, body: { error: "invalid", field: "name" } };
		case "duplicate":
			return { status: 409, body: { error: "duplicate", field: "name" } };
		case "brand_limit":
			return { status: 409, body: { error: "brand_limit" } };
		case "not_found":
			return { status: 404, body: { error: "not_found" } };
	}
}

// A taken name is 409 here, as the colour contract says; tags answer 400.
function colourRefusal(error: ColourError): Refusal {
	switch (error.code) {
		case "invalid":
			return { status: 400, body: { error: "invalid", field: error.field } };
		case "duplicate":
			return { status: 409, body: { error: "duplicate", field: "name" } };
		case "colour_limit":
			return { status: 409, body: { error: "colour_limit" } };
		case "colour_in_use":
			return { status: 409, body: { error: "colour_in_use" } };
		case "not_found":
			return { status: 404, body: { error: "not_found" } };
	}
}

export function createApp(getDb: (env: Env) => Db) {
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
		const body = await readBody(c, combinationBodySchema);
		if ("refused" in body) return body.refused;
		const saved = await saveCombination(getDb(c.env), c.var.user.id, body.data);
		if (!saved.ok) {
			const { status, body: refused } = combinationRefusal(saved.error);
			return c.json(refused, status);
		}
		const { combination, created } = saved.value;
		return c.json(
			{ combination } satisfies CombinationAnswer,
			created ? 201 : 200,
		);
	});

	// A gone combination and another account's combination answer the same
	// 404, so ids of other accounts cannot be told from missing ones.
	app.put("/combinations/:id", withAuth, requireUser, async (c) => {
		const body = await readBody(c, combinationBodySchema);
		if ("refused" in body) return body.refused;
		const id = c.req.param("id");
		if (body.data.id !== id)
			return c.json(
				{ error: "invalid", field: "id" } satisfies ErrorAnswer,
				400,
			);
		const changed = await changeCombination(getDb(c.env), c.var.user.id, id, {
			pieces: body.data.pieces,
			open: body.data.open,
			tags: body.data.tags,
		});
		if (!changed.ok) {
			const { status, body: refused } = combinationRefusal(changed.error);
			return c.json(refused, status);
		}
		return c.json({ combination: changed.value } satisfies CombinationAnswer);
	});

	app.delete("/combinations/:id", withAuth, requireUser, async (c) => {
		const deleted = await deleteCombination(
			getDb(c.env),
			c.var.user.id,
			c.req.param("id"),
		);
		if (!deleted.ok) {
			const { status, body: refused } = combinationRefusal(deleted.error);
			return c.json(refused, status);
		}
		return c.body(null, 204);
	});

	app.get("/owned-items", withAuth, requireUser, async (c) =>
		c.json({
			ownedItems: await listOwnedItems(getDb(c.env), c.var.user.id),
		} satisfies OwnedItemsAnswer),
	);

	app.post("/owned-items", withAuth, requireUser, async (c) => {
		const body = await readBody(c, ownedItemBodySchema);
		if ("refused" in body) return body.refused;
		const added = await addOwnedItem(
			getDb(c.env),
			c.env.PICTURES,
			c.var.user.id,
			body.data,
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
		if ("refused" in body) return body.refused;
		const changed = await changeOwnedItem(
			getDb(c.env),
			c.env.PICTURES,
			c.var.user.id,
			c.req.param("id"),
			body.data,
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

	app.get("/wishes", withAuth, requireUser, async (c) =>
		c.json({
			wishes: await listWishes(getDb(c.env), c.var.user.id),
		} satisfies WishesAnswer),
	);

	app.post("/wishes", withAuth, requireUser, async (c) => {
		const body = await readBody(c, wishBodySchema);
		if ("refused" in body) return body.refused;
		const added = await addWish(getDb(c.env), c.var.user.id, body.data);
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
		if ("refused" in body) return body.refused;
		const added = await addShopLink(
			getDb(c.env),
			c.var.user.id,
			c.req.param("id"),
			body.data,
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
		if ("refused" in body) return body.refused;
		const changed = await changeShopLink(
			getDb(c.env),
			c.var.user.id,
			c.req.param("id"),
			body.data,
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
		const body = await readBody(
			c,
			z.object({ name: z.string(), hex: z.string() }),
		);
		if ("refused" in body) return body.refused;
		const added = await addColour(getDb(c.env), c.var.user.id, body.data);
		if (!added.ok) {
			const { status, body } = colourRefusal(added.error);
			return c.json(body, status);
		}
		return c.json({ colour: added.value } satisfies ColourAnswer, 201);
	});

	// A gone colour and another account's colour answer the same 404, as tags do.
	app.put("/colours/:id", withAuth, requireUser, async (c) => {
		const body = await readBody(
			c,
			z.object({ id: colourIdSchema, name: z.string(), hex: z.string() }),
		);
		if ("refused" in body) return body.refused;
		if (body.data.id !== c.req.param("id"))
			return c.json(
				{ error: "invalid", field: "id" } satisfies ErrorAnswer,
				400,
			);
		const { id, ...input } = body.data;
		const changed = await changeColour(getDb(c.env), c.var.user.id, id, input);
		if (!changed.ok) {
			const { status, body } = colourRefusal(changed.error);
			return c.json(body, status);
		}
		return c.json({ colour: changed.value } satisfies ColourAnswer, 200);
	});

	app.delete("/colours/:id", withAuth, requireUser, async (c) => {
		const deleted = await deleteColour(
			getDb(c.env),
			c.var.user.id,
			c.req.param("id"),
		);
		if (!deleted.ok) {
			const { status, body } = colourRefusal(deleted.error);
			return c.json(body, status);
		}
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
		if ("refused" in body) return body.refused;
		const mannequin = await setMannequinColour(
			getDb(c.env),
			c.var.user.id,
			part.data,
			body.data.hex,
		);
		return c.json({ mannequin } satisfies MannequinAnswer, 200);
	});

	app.get("/brands", withAuth, requireUser, async (c) =>
		c.json({
			brands: await listBrands(getDb(c.env), c.var.user.id),
		} satisfies BrandsAnswer),
	);

	app.post("/brands", withAuth, requireUser, async (c) => {
		const body = await readBody(c, z.object({ name: z.string() }));
		if ("refused" in body) return body.refused;
		const added = await addBrand(getDb(c.env), c.var.user.id, body.data.name);
		if (!added.ok) {
			const { status, body } = brandRefusal(added.error);
			return c.json(body, status);
		}
		return c.json({ brand: added.value } satisfies BrandAnswer, 201);
	});

	// A gone brand and another account's brand answer the same 404.
	app.put("/brands/:id", withAuth, requireUser, async (c) => {
		const body = await readBody(
			c,
			z.object({ id: brandIdSchema, name: z.string() }),
		);
		if ("refused" in body) return body.refused;
		if (body.data.id !== c.req.param("id"))
			return c.json(
				{ error: "invalid", field: "id" } satisfies ErrorAnswer,
				400,
			);
		const { id, name } = body.data;
		const renamed = await renameBrand(getDb(c.env), c.var.user.id, id, name);
		if (!renamed.ok) {
			const { status, body } = brandRefusal(renamed.error);
			return c.json(body, status);
		}
		return c.json({ brand: renamed.value } satisfies BrandAnswer, 200);
	});

	app.delete("/brands/:id", withAuth, requireUser, async (c) => {
		const deleted = await deleteBrand(
			getDb(c.env),
			c.var.user.id,
			c.req.param("id"),
		);
		if (!deleted.ok) {
			const { status, body } = brandRefusal(deleted.error);
			return c.json(body, status);
		}
		return c.body(null, 204);
	});

	app.get("/ai-apps", withAuth, requireUser, async (c) =>
		c.json({
			apps: await listAiApps(getDb(c.env), c.var.user.id),
		} satisfies AiAppsAnswer),
	);

	app.post("/tags", withAuth, requireUser, async (c) => {
		const body = await readBody(c, z.object({ name: z.string() }));
		if ("refused" in body) return body.refused;
		const added = await addTag(getDb(c.env), c.var.user.id, body.data.name);
		if (!added.ok) {
			const { status, body } = tagRefusals[added.error.code];
			return c.json(body, status);
		}
		return c.json({ tag: added.value } satisfies TagAnswer, 201);
	});

	// A gone tag and another account's tag answer the same 404, as combinations do.
	app.put("/tags/:id", withAuth, requireUser, async (c) => {
		const body = await readBody(
			c,
			z.object({ id: tagIdSchema, name: z.string() }),
		);
		if ("refused" in body) return body.refused;
		if (body.data.id !== c.req.param("id"))
			return c.json(
				{ error: "invalid", field: "id" } satisfies ErrorAnswer,
				400,
			);
		const renamed = await renameTag(
			getDb(c.env),
			c.var.user.id,
			body.data.id,
			body.data.name,
		);
		if (!renamed.ok) {
			const { status, body } = tagRefusals[renamed.error.code];
			return c.json(body, status);
		}
		return c.json({ tag: renamed.value } satisfies TagAnswer, 200);
	});

	app.delete("/tags/:id", withAuth, requireUser, async (c) => {
		const deleted = await deleteTag(
			getDb(c.env),
			c.var.user.id,
			c.req.param("id"),
		);
		if (!deleted.ok) {
			const { status, body } = tagRefusals[deleted.error.code];
			return c.json(body, status);
		}
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
