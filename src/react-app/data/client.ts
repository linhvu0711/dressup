import { QueryClient } from "@tanstack/react-query";
import type { z } from "zod";
import type { AiApp } from "@/ai-apps/ai-app";
import type { OwnedItem } from "@/closet/owned-item";
import type { Combination, CombinationId } from "@/combinations/combination";
import {
	type Brand,
	type BrandId,
	byBrandName,
	type ListedBrand,
} from "@/labels/brand";
import type { Colour, ColourId, ListedColour } from "@/labels/colour";
import type { Mannequin, MannequinPart } from "@/mannequin/mannequin";
import type { ListedTag, Tag, TagId } from "@/tags/tag";
import type { Wish } from "@/wishlist/wish";
import { type ErrorCode, errorAnswer, meAnswer } from "./contract";

// Every request the web app sends to the worker goes through request(), so
// the 401 rule, the error codes, and the contract check live here once. Two
// senders are left out: the session check, fetchMe, whose 401 means no
// session, and the sign-in calls of authClient, which Better Auth sends
// itself.

// "Retry" or "Try again" on the page is the person's way to try again;
// three silent retries would hold the placeholders for about 7 s first.
export const queryClient = new QueryClient({
	defaultOptions: { queries: { retry: false } },
});

export const keys = {
	me: ["me"] as const,
	tags: (userId: string | null) => ["tags", userId] as const,
	colours: (userId: string | null) => ["colours", userId] as const,
	brands: (userId: string | null) => ["brands", userId] as const,
	aiApps: (userId: string | null) => ["ai-apps", userId] as const,
	combinations: (userId: string | null) => ["combinations", userId] as const,
	closet: (userId: string | null) => ["closet", userId] as const,
	wishlist: (userId: string | null) => ["wishlist", userId] as const,
	mannequin: (userId: string | null) => ["mannequin", userId] as const,
	addTag: ["tags", "add"] as const,
	allowApp: (clientId: string) => ["allow-app", clientId] as const,
};

// A list with no data yet keeps a load already under way, and that load
// may have read the server before this change: drop it, then load again.
const reload = (queryKey: readonly unknown[]) =>
	queryClient
		.cancelQueries({ queryKey })
		.then(() => queryClient.invalidateQueries({ queryKey }));

const refresh = (queryKey: readonly unknown[]) => {
	// Not returned: a returned promise holds the caller's callbacks, such as
	// the save form's close, until the list has loaded again.
	void reload(queryKey);
};

// The item in the closet list, in place or first.
const putInCloset = (userId: string | null, item: OwnedItem) =>
	queryClient.setQueryData<OwnedItem[]>(
		keys.closet(userId),
		(old) =>
			old &&
			(old.some((i) => i.id === item.id)
				? old.map((i) => (i.id === item.id ? item : i))
				: [item, ...old]),
	);

// What each change does to the cache. Each rule takes the account the hook
// read, so a change that ends after an account switch writes nothing of it
// into the other account's lists.
export const after = {
	tagAdded(userId: string | null, tag: Tag) {
		queryClient.setQueryData<ListedTag[]>(keys.tags(userId), (old) =>
			old ? [...old, { ...tag, combinations: 0 }] : old,
		);
	},
	// The renamed tag keeps its place, as the server keeps its time, and its
	// count.
	tagRenamed(userId: string | null, tag: Tag) {
		queryClient.setQueryData<ListedTag[]>(keys.tags(userId), (old) =>
			old?.map((t) => (t.id === tag.id ? { ...t, ...tag } : t)),
		);
	},
	// The server's tags may differ from the cached ones, as after an add
	// whose answer was lost, or a rename refused for a change made elsewhere.
	tagsMayDiffer(userId: string | null) {
		refresh(keys.tags(userId));
	},
	// Until the combinations load again, their views and the chips skip a tag
	// the list no longer holds.
	tagDeleted(userId: string | null, id: TagId) {
		queryClient.setQueryData<ListedTag[]>(keys.tags(userId), (old) =>
			old?.filter((t) => t.id !== id),
		);
		refresh(keys.tags(userId));
		refresh(keys.combinations(userId));
	},
	colourAdded(userId: string | null, colour: Colour) {
		queryClient.setQueryData<ListedColour[]>(keys.colours(userId), (old) =>
			old ? [...old, { ...colour, inUse: false }] : old,
		);
	},
	// The changed colour keeps its place, as the server keeps its time, and
	// its inUse, which a change of name or code leaves as it was.
	colourChanged(userId: string | null, colour: Colour) {
		queryClient.setQueryData<ListedColour[]>(keys.colours(userId), (old) =>
			old?.map((c) => (c.id === colour.id ? { ...c, ...colour } : c)),
		);
		// A combination, an owned item, and a wish show their colours' names
		// and codes.
		refresh(keys.combinations(userId));
		refresh(keys.closet(userId));
		refresh(keys.wishlist(userId));
	},
	// The server's colours may differ from the cached ones, as after an add
	// whose answer was lost, or a change refused for a change made elsewhere.
	coloursMayDiffer(userId: string | null) {
		refresh(keys.colours(userId));
	},
	colourDeleted(userId: string | null, id: ColourId) {
		queryClient.setQueryData<Colour[]>(keys.colours(userId), (old) =>
			old?.filter((c) => c.id !== id),
		);
		refresh(keys.colours(userId));
	},
	// The list is A to Z, so an added brand goes in its place.
	brandAdded(userId: string | null, brand: Brand) {
		queryClient.setQueryData<ListedBrand[]>(keys.brands(userId), (old) =>
			old
				? [...old, { ...brand, items: 0, shopLinks: 0 }].sort(byBrandName)
				: old,
		);
	},
	// The server's brands may differ from the cached ones, as after an add
	// whose answer was lost, or a rename refused for a change made elsewhere.
	brandsMayDiffer(userId: string | null) {
		refresh(keys.brands(userId));
	},
	// Only the part this save set: an older save of the other part can answer
	// later, and its answer still holds that part's colour from before.
	mannequinSet(
		userId: string | null,
		part: MannequinPart,
		mannequin: Mannequin,
	) {
		queryClient.setQueryData<Mannequin>(keys.mannequin(userId), (old) =>
			old ? { ...old, [part]: mannequin[part] } : mannequin,
		);
	},
	// Two saves of one part can answer out of order, so the stored colours
	// are read again once a save ends.
	mannequinSaveEnded(userId: string | null) {
		refresh(keys.mannequin(userId));
	},
	// A new name can move the brand in the A to Z list; its count of items
	// stays, as a rename leaves it.
	brandChanged(userId: string | null, brand: Brand) {
		queryClient.setQueryData<ListedBrand[]>(keys.brands(userId), (old) =>
			old
				?.map((b) => (b.id === brand.id ? { ...b, ...brand } : b))
				.sort(byBrandName),
		);
		// The closet and the shop links show their brand names.
		refresh(keys.closet(userId));
		refresh(keys.wishlist(userId));
	},
	brandDeleted(userId: string | null, id: BrandId) {
		queryClient.setQueryData<ListedBrand[]>(keys.brands(userId), (old) =>
			old?.filter((b) => b.id !== id),
		);
		refresh(keys.brands(userId));
		// Its items and shop links now have no brand.
		refresh(keys.closet(userId));
		refresh(keys.wishlist(userId));
	},
	// The wall shows a cached list at once while it asks the server again, so
	// the saved combination goes into that list now, or a first visit's empty
	// list would show "No combinations yet" after a save. A saved combination
	// also makes its colours in use, and moves its tags' counts.
	combinationSaved(userId: string | null, combination: Combination) {
		queryClient.setQueryData<Combination[]>(
			keys.combinations(userId),
			(old) =>
				old &&
				(old.some((c) => c.id === combination.id)
					? old.map((c) => (c.id === combination.id ? combination : c))
					: [combination, ...old]),
		);
		refresh(keys.combinations(userId));
		refresh(keys.colours(userId));
		refresh(keys.tags(userId));
	},
	// A deleted combination can free its colours, and moves its tags' counts.
	combinationGone(userId: string | null, id: CombinationId) {
		queryClient.setQueryData<Combination[]>(keys.combinations(userId), (old) =>
			old?.filter((c) => c.id !== id),
		);
		refresh(keys.combinations(userId));
		refresh(keys.colours(userId));
		refresh(keys.tags(userId));
	},
	// As combinationSaved; a new item also makes its colour in use and counts
	// on its brand.
	ownedItemAdded(userId: string | null, item: OwnedItem) {
		putInCloset(userId, item);
		refresh(keys.closet(userId));
		refresh(keys.colours(userId));
		refresh(keys.brands(userId));
	},
	// A new brand moves the item's count from one brand to another. The
	// refresh also drops a closet load that began before the change, which
	// would put the old item back.
	ownedItemChanged(userId: string | null, item: OwnedItem) {
		queryClient.setQueryData<OwnedItem[]>(keys.closet(userId), (old) =>
			old?.map((i) => (i.id === item.id ? item : i)),
		);
		refresh(keys.closet(userId));
		refresh(keys.brands(userId));
	},
	// The last item of a colour may free it, and its brand counts one less.
	// As for a change, the closet refresh drops an older closet load.
	ownedItemDeleted(userId: string | null, id: string) {
		queryClient.setQueryData<OwnedItem[]>(keys.closet(userId), (old) =>
			old?.filter((i) => i.id !== id),
		);
		refresh(keys.closet(userId));
		refresh(keys.colours(userId));
		refresh(keys.brands(userId));
	},
	// As combinationSaved; a new wish also makes its colour in use, and its
	// shop link can carry a brand.
	wishAdded(userId: string | null, wish: Wish) {
		queryClient.setQueryData<Wish[]>(
			keys.wishlist(userId),
			(old) =>
				old &&
				(old.some((w) => w.id === wish.id)
					? old.map((w) => (w.id === wish.id ? wish : w))
					: [wish, ...old]),
		);
		refresh(keys.wishlist(userId));
		refresh(keys.colours(userId));
		refresh(keys.brands(userId));
	},
	// A shop link write answers its whole wish. A link's brand counts on the
	// brand list.
	wishChanged(userId: string | null, wish: Wish) {
		queryClient.setQueryData<Wish[]>(keys.wishlist(userId), (old) =>
			old?.map((w) => (w.id === wish.id ? wish : w)),
		);
		refresh(keys.wishlist(userId));
		refresh(keys.brands(userId));
	},
	// The server removes a wish with its last link (#141), so the list matches
	// it before the reload; the wish can free its colour.
	shopLinkDeleted(userId: string | null, id: string) {
		queryClient.setQueryData<Wish[]>(keys.wishlist(userId), (old) =>
			old?.flatMap((w) => {
				if (!w.shopLinks.some((link) => link.id === id)) return [w];
				const shopLinks = w.shopLinks.filter((link) => link.id !== id);
				return shopLinks.length === 0 ? [] : [{ ...w, shopLinks }];
			}),
		);
		refresh(keys.wishlist(userId));
		refresh(keys.colours(userId));
		refresh(keys.brands(userId));
	},
	// A removed wish can free its colour, and its links leave their brands.
	wishDeleted(userId: string | null, id: string) {
		queryClient.setQueryData<Wish[]>(keys.wishlist(userId), (old) =>
			old?.filter((w) => w.id !== id),
		);
		refresh(keys.wishlist(userId));
		refresh(keys.colours(userId));
		refresh(keys.brands(userId));
	},
	// The closet takes the item before the wish goes, so the piece page never
	// finds the piece in neither list and sends the person back.
	shopLinkBought(userId: string | null, item: OwnedItem, wishId: string) {
		putInCloset(userId, item);
		queryClient.setQueryData<Wish[]>(keys.wishlist(userId), (old) =>
			old?.filter((w) => w.id !== wishId),
		);
		refresh(keys.closet(userId));
		refresh(keys.wishlist(userId));
		refresh(keys.colours(userId));
		refresh(keys.brands(userId));
	},
	// A Bought answered not_found: another tab bought the link or deleted
	// it. The closet loads first, so a piece bought there is in the closet
	// before its wish leaves the wishlist, and the piece page stays.
	async shopLinkGone(userId: string | null, id: string) {
		await reload(keys.closet(userId));
		after.shopLinkDeleted(userId, id);
	},
	aiAppGone(userId: string | null, id: string) {
		queryClient.setQueryData<AiApp[]>(keys.aiApps(userId), (old) =>
			old?.filter((app) => app.id !== id),
		);
		refresh(keys.aiApps(userId));
	},
};

// A refused request, with the code its answer names, or null when it names
// none, and the id it names, as a duplicate's.
export class RequestError extends Error {
	constructor(
		readonly status: number,
		readonly code: ErrorCode | null,
		readonly id: string | null,
		what: string,
	) {
		super(`${what} answered ${status}`);
	}
}

export const isGone = (error: unknown) =>
	error instanceof RequestError && error.code === "not_found";

// The account has a label of this name already, in some letter case.
export const isNameTaken = (error: unknown) =>
	error instanceof RequestError && error.code === "duplicate";

// The session is gone; the 401 rule has run.
export class SignedOut extends Error {}

type Method = "GET" | "POST" | "PUT" | "DELETE";

export function request<S extends z.ZodType>(
	method: Method,
	path: string,
	options: { body?: unknown; answer: S },
): Promise<z.output<S>>;
export function request(
	method: Method,
	path: string,
	options?: { body?: unknown },
): Promise<void>;
export async function request(
	method: Method,
	path: string,
	options: { body?: unknown; answer?: z.ZodType } = {},
): Promise<unknown> {
	const what = `${method} ${path}`;
	const { body } = options;
	const res = await fetch(
		path,
		body === undefined
			? { method }
			: body instanceof Blob
				? { method, headers: { "content-type": body.type }, body }
				: {
						method,
						headers: { "content-type": "application/json" },
						body: JSON.stringify(body),
					},
	);
	if (res.status === 401) {
		// A lost session makes the session check run again; it finds none,
		// and the session gate shows the sign-in screen.
		void queryClient.invalidateQueries({ queryKey: keys.me });
		throw new SignedOut(`${what} answered 401`);
	}
	if (!res.ok) {
		const body = errorAnswer.safeParse(await res.json().catch(() => null));
		throw new RequestError(
			res.status,
			body.success ? body.data.error : null,
			body.success ? (body.data.id ?? null) : null,
			what,
		);
	}
	if (!options.answer) return;
	const answer = options.answer.safeParse(await res.json());
	if (!answer.success)
		throw new Error(`${what}: the answer does not match the contract`);
	return answer.data;
}

// Not found: deleted on another device already, which is what was asked.
// The answer says which, for a page that tells the person.
export async function remove(path: string): Promise<"deleted" | "gone"> {
	try {
		await request("DELETE", path);
		return "deleted";
	} catch (error) {
		if (isGone(error)) return "gone";
		throw error;
	}
}

type Me = z.output<typeof meAnswer>;

// The session check. Its 401 means "no session", so it answers null and
// never runs the 401 rule, which would make this same check run again.
export async function fetchMe(): Promise<Me | null> {
	const res = await fetch("/api/me");
	if (res.status === 401) return null;
	if (!res.ok) throw new Error(`GET /api/me answered ${res.status}`);
	return meAnswer.parse(await res.json());
}

// After sign-out and account delete: no data of the account stays. The
// session check stays, as null, so the sign-in screen shows at once with no
// new check sent.
export async function signedOut() {
	// A check sent before sign-out still carries the old cookies, and its
	// late 200 would put the person back in the app.
	await queryClient.cancelQueries({ queryKey: keys.me });
	queryClient.setQueryData(keys.me, null);
	queryClient.removeQueries({
		predicate: (query) => query.queryKey[0] !== keys.me[0],
	});
	queryClient.getMutationCache().clear();
}

// The signed-in account, read from the session check's cache. useMe would
// check the session again each time a form or page mounts; the session gate
// rebuilds the page when the account changes, so the cached id holds.
export function cachedUserId(): string | null {
	return queryClient.getQueryData<Me | null>(keys.me)?.id ?? null;
}
