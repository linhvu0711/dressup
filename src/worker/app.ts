import { eq } from "drizzle-orm";
import { type Context, Hono } from "hono";
import { createMiddleware } from "hono/factory";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { z } from "zod";
import type {
	AiAppsAnswer,
	BrandAnswer,
	BrandsAnswer,
	ColourAnswer,
	ColoursAnswer,
	CombinationAnswer,
	CombinationsAnswer,
	DressAnswer,
	ErrorAnswer,
	LookAnswer,
	LooksAnswer,
	MeAnswer,
	OwnedItemAnswer,
	OwnedItemsAnswer,
	TagAnswer,
	TagsAnswer,
	WishAnswer,
	WishesAnswer,
} from "@/data/contract";
import { type DressError, dressChangeSchema } from "@/dress/state";
import { brandIdSchema } from "@/labels/brand";
import { colourIdSchema } from "@/labels/colour";
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
import { changeDress, loadDress } from "./dress-store";
import {
	changeLook,
	deleteLook,
	type LookError,
	listLooks,
	saveLook,
} from "./look-store";
import { mcpRoute } from "./mcp";
import {
	addOwnedItem,
	changeOwnedItem,
	deleteOwnedItem,
	listOwnedItems,
	type OwnedItemError,
} from "./owned-item-store";
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

// Only the JSON shape: the Looks module runs the look rules.
const lookBodySchema = z.object({
	id: z.string(),
	modeId: z.string(),
	name: z.string(),
	colours: z.record(z.string(), z.string()),
	open: z.array(z.string()),
	tags: z.array(z.string()).default([]),
});

function lookRefusal(error: LookError): Refusal {
	switch (error.code) {
		case "not_in_mode":
		case "no_colour":
		case "name_too_long":
		case "too_many_tags":
		case "invalid":
			return {
				status: 400,
				body: { error: "invalid", field: issueField(error.path) },
			};
		case "conflict":
			return { status: 409, body: { error: "conflict", field: "id" } };
		case "look_limit":
			return { status: 409, body: { error: "look_limit" } };
		case "not_found":
			return { status: 404, body: { error: "not_found" } };
		case "moved":
			return { status: 409, body: { error: "conflict" } };
	}
}

// Only the JSON shape: the Combinations module runs the combination rules.
const combinationBodySchema = z.object({
	id: z.string(),
	pieces: z.array(z.object({ typeId: z.string(), colourId: z.string() })),
	open: z.boolean(),
});

function combinationRefusal(error: CombinationError): Refusal {
	switch (error.code) {
		case "not_type":
		case "not_colour":
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
});

function ownedItemRefusal(error: OwnedItemError): Refusal {
	switch (error.code) {
		case "invalid":
			return { status: 400, body: { error: "invalid", field: error.field } };
		case "duplicate":
			return { status: 409, body: { error: "duplicate", id: error.id } };
		case "owned_item_limit":
			return { status: 409, body: { error: "owned_item_limit" } };
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

const dressRefusals: Record<DressError["code"], Refusal> = {
	not_in_row: { status: 400, body: { error: "not_in_row", field: "hex" } },
	last_square: { status: 400, body: { error: "last_square", field: "hex" } },
};

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
		mcpRoute(c.var.auth, getDb(c.env), c.env.BETTER_AUTH_URL, c.req.raw),
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
		c.json(
			(await loadDress(getDb(c.env), c.var.user.id))
				.state satisfies DressAnswer,
		),
	);

	app.post("/dress/changes", withAuth, requireUser, async (c) => {
		const body = await readBody(c, dressChangeSchema);
		if ("refused" in body) return body.refused;
		const result = await changeDress(getDb(c.env), c.var.user.id, body.data);
		if (!result.ok) {
			const { status, body } = dressRefusals[result.error.code];
			return c.json(body, status);
		}
		return c.body(null, 204);
	});

	app.get("/looks", withAuth, requireUser, async (c) =>
		c.json({
			looks: await listLooks(getDb(c.env), c.var.user.id),
		} satisfies LooksAnswer),
	);

	app.post("/looks", withAuth, requireUser, async (c) => {
		const body = await readBody(c, lookBodySchema);
		if ("refused" in body) return body.refused;
		const saved = await saveLook(getDb(c.env), c.var.user.id, body.data);
		if (!saved.ok) {
			const { status, body: refused } = lookRefusal(saved.error);
			return c.json(refused, status);
		}
		const { look, created, tagsLeftOff } = saved.value;
		return c.json(
			{ look, tagsLeftOff } satisfies LookAnswer,
			created ? 201 : 200,
		);
	});

	// A gone look and another account's look answer the same 404, so ids of
	// other accounts cannot be told from missing ones.
	app.put("/looks/:id", withAuth, requireUser, async (c) => {
		const body = await readBody(c, lookBodySchema);
		if ("refused" in body) return body.refused;
		const id = c.req.param("id");
		if (body.data.id !== id)
			return c.json(
				{ error: "invalid", field: "id" } satisfies ErrorAnswer,
				400,
			);
		const changed = await changeLook(
			getDb(c.env),
			c.var.user.id,
			id,
			body.data,
		);
		if (!changed.ok) {
			const { status, body: refused } = lookRefusal(changed.error);
			return c.json(refused, status);
		}
		const { look, tagsLeftOff } = changed.value;
		return c.json({ look, tagsLeftOff } satisfies LookAnswer, 200);
	});

	app.delete("/looks/:id", withAuth, requireUser, async (c) => {
		const deleted = await deleteLook(
			getDb(c.env),
			c.var.user.id,
			c.req.param("id"),
		);
		if (!deleted.ok) {
			const { status, body: refused } = lookRefusal(deleted.error);
			return c.json(refused, status);
		}
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

	// A gone combination and another account's answer the same 404, as looks
	// do.
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
		const added = await addOwnedItem(getDb(c.env), c.var.user.id, body.data);
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
			z.object({ brandId: z.string().nullable(), quantity: z.number() }),
		);
		if ("refused" in body) return body.refused;
		const changed = await changeOwnedItem(
			getDb(c.env),
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

	// A gone tag and another account's tag answer the same 404, as looks do.
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

	// A gone allow and another account's allow answer the same 404, as looks do.
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
