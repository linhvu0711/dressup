import { afterEach, describe, expect, test } from "bun:test";
import {
	connectAiApp,
	finishGoogleSignIn,
	type Jar,
	makeHarness,
	send,
	startGoogleSignIn,
	store,
	stubOutside,
	TEST_APP_ID,
	testAppDocument,
} from "./test/harness";

type Harness = Awaited<ReturnType<typeof makeHarness>>;

const googleSignIn = async (h: Harness): Promise<Jar> =>
	(await finishGoogleSignIn(h, await startGoogleSignIn(h))).jar;

const sendJson = (h: Harness, jar: Jar, path: string, body: unknown) =>
	send(h, jar, path, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(body),
	});

const deleteAccount = (h: Harness, jar: Jar) =>
	send(h, jar, "/api/account", { method: "DELETE" });

const me = async (h: Harness, jar: Jar) => {
	const res = await send(h, jar, "/api/me");
	return { status: res.status, body: await res.json() };
};

const NAVY = {
	id: "11111111-1111-4111-8111-111111111111",
	modeId: "polo-sweater-chore",
	name: "Navy day",
	colours: {
		chino_p: "#C9B38C",
		polo_l: "#F3F1EC",
		sweater: "#1F3A5F",
		chore: "#55633F",
	},
	open: ["chore"],
};

// The account's colours, outfit, mannequin, and one look with one tag,
// through the routes.
async function fillAccount(h: Harness, jar: Jar, lookId = NAVY.id) {
	expect((await send(h, jar, "/api/dress")).status).toBe(200);
	const skin = { kind: "mannequin", part: "skin", hex: "#8D5524" };
	expect((await sendJson(h, jar, "/api/dress/changes", skin)).status).toBe(204);
	const added = await sendJson(h, jar, "/api/tags", { name: "Work" });
	const { tag } = (await added.json()) as { tag: { id: string } };
	const look = { ...NAVY, id: lookId, tags: [tag.id] };
	expect((await sendJson(h, jar, "/api/looks", look)).status).toBe(201);
}

const TABLES = [
	["user", "id"],
	["session", "user_id"],
	["account", "user_id"],
	["colour_square", "user_id"],
	["outfit", "user_id"],
	["outfit_garment", "user_id"],
	["mannequin", "user_id"],
	["look", "user_id"],
	["tag", "user_id"],
	["look_tag", "user_id"],
] as const;

function rowsOf(h: Harness, userId: string) {
	return Object.fromEntries(
		TABLES.map(([table, column]) => [
			table,
			(
				h.sqlite
					.query(`select count(*) as n from ${table} where ${column} = ?`)
					.get(userId) as { n: number }
			).n,
		]),
	);
}

const NONE = {
	user: 0,
	session: 0,
	account: 0,
	colour_square: 0,
	outfit: 0,
	outfit_garment: 0,
	mannequin: 0,
	look: 0,
	tag: 0,
	look_tag: 0,
};

const userCount = (h: Harness) =>
	h.sqlite.query("select count(*) as n from user").get();

describe("DELETE /api/account", () => {
	let restore = () => {};
	afterEach(() => restore());

	async function aliceWithRows() {
		const h = await makeHarness();
		restore = stubOutside({
			google: {
				sub: "g-alice",
				email: "alice@example.com",
				name: "Alice",
				picture: "https://example.com/a.png",
			},
		}).restore;
		const jar = await googleSignIn(h);
		const { body } = await me(h, jar);
		const aliceId = (body as { id: string }).id;
		await fillAccount(h, jar);
		return { h, jar, aliceId };
	}

	test("deletes the account and every row of it", async () => {
		// Given: alice signed in through Google, with colours, an outfit, a
		// skin colour, and one look
		const { h, jar, aliceId } = await aliceWithRows();
		// When
		const res = await deleteAccount(h, jar);
		// Then
		expect({ status: res.status, rows: rowsOf(h, aliceId) }).toEqual({
			status: 204,
			rows: NONE,
		});
	});

	test("signs the browser out with the delete", async () => {
		// Given: alice signed in through Google; /api/me answered once, so the
		// cookie cache is set
		const { h, jar } = await aliceWithRows();
		expect((await me(h, jar)).status).toBe(200);
		// When
		const res = await deleteAccount(h, jar);
		const after = await me(h, store(jar, res));
		// Then
		expect(after).toEqual({ status: 401, body: { error: "unauthorized" } });
	});

	test("leaves every row of the other account", async () => {
		// Given: alice and bob signed in through Google, each with rows
		const { h, jar: alice } = await aliceWithRows();
		restore();
		restore = stubOutside({
			google: {
				sub: "g-bob",
				email: "bob@example.com",
				name: "Bob",
				picture: "https://example.com/b.png",
			},
		}).restore;
		const bob = await googleSignIn(h);
		const bobId = ((await me(h, bob)).body as { id: string }).id;
		await fillAccount(h, bob, "22222222-2222-4222-8222-222222222222");
		const bobBefore = rowsOf(h, bobId);
		// When
		await deleteAccount(h, alice);
		// Then
		const bobMe = await me(h, bob);
		expect({
			rows: rowsOf(h, bobId),
			filled: Object.values(bobBefore).every((n) => n >= 1),
			me: {
				status: bobMe.status,
				email: (bobMe.body as { email: string }).email,
			},
		}).toEqual({
			rows: bobBefore,
			filled: true,
			me: { status: 200, email: "bob@example.com" },
		});
	});

	test("keeps the account and the session when the delete fails", async () => {
		// Given: alice with rows; the user row cannot be deleted
		const { h, jar, aliceId } = await aliceWithRows();
		const before = rowsOf(h, aliceId);
		h.sqlite.run(
			"CREATE TRIGGER no_delete BEFORE DELETE ON user BEGIN SELECT RAISE(ABORT, 'no delete'); END",
		);
		// When
		const res = await deleteAccount(h, jar);
		// Then
		const after = await me(h, jar);
		expect({
			status: res.status,
			rows: rowsOf(h, aliceId),
			me: {
				status: after.status,
				email: (after.body as { email: string }).email,
			},
		}).toEqual({
			status: 500,
			rows: before,
			me: { status: 200, email: "alice@example.com" },
		});
	});

	test("ends in the same state when the delete comes twice", async () => {
		// Given: alice with rows, deleted once with these cookies
		const { h, jar, aliceId } = await aliceWithRows();
		expect((await deleteAccount(h, jar)).status).toBe(204);
		// When: the same old cookies, whose cache cookie still lets them in
		const res = await deleteAccount(h, jar);
		// Then
		expect({ status: res.status, rows: rowsOf(h, aliceId) }).toEqual({
			status: 204,
			rows: NONE,
		});
	});

	test("makes a new empty account on the next Google sign-in", async () => {
		// Given: alice's first sign-in with its starter dress, then rows, then
		// the delete
		const h = await makeHarness();
		restore = stubOutside({
			google: {
				sub: "g-alice",
				email: "alice@example.com",
				name: "Alice",
				picture: "https://example.com/a.png",
			},
		}).restore;
		const first = await googleSignIn(h);
		const firstId = ((await me(h, first)).body as { id: string }).id;
		const starter = await (await send(h, first, "/api/dress")).json();
		await fillAccount(h, first);
		expect((await deleteAccount(h, first)).status).toBe(204);
		// When
		const again = await googleSignIn(h);
		// Then
		const now = (await me(h, again)).body as { id: string; email: string };
		expect({
			email: now.email,
			newId: now.id !== firstId,
			looks: await (await send(h, again, "/api/looks")).json(),
			dress: await (await send(h, again, "/api/dress")).json(),
		}).toEqual({
			email: "alice@example.com",
			newId: true,
			looks: { looks: [] },
			dress: starter,
		});
	});

	test("refuses DELETE /api/account without a session", async () => {
		// Given: alice signed in through Google; no cookie on the request
		const { h } = await aliceWithRows();
		// When
		const res = await deleteAccount(h, new Map());
		// Then
		expect({
			status: res.status,
			body: await res.json(),
			users: userCount(h),
		}).toEqual({
			status: 401,
			body: { error: "unauthorized" },
			users: { n: 1 },
		});
	});

	test("deletes the account's AI app records with the account", async () => {
		// Given: alice through connectAiApp, so she has 1 oauth_consent and 1
		// oauth_refresh_token row
		const h = await makeHarness();
		restore = stubOutside({
			google: {
				sub: "g-alice",
				email: "alice@example.com",
				name: "Alice",
				picture: "https://example.com/a.png",
			},
			documents: { [TEST_APP_ID]: testAppDocument },
		}).restore;
		const { jar } = await connectAiApp(h, { accept: true });
		const aliceId = ((await me(h, jar)).body as { id: string }).id;
		const count = (table: string) =>
			(
				h.sqlite
					.query(`select count(*) as n from ${table} where user_id = ?`)
					.get(aliceId) as { n: number }
			).n;
		expect([count("oauth_consent"), count("oauth_refresh_token")]).toEqual([
			1, 1,
		]);
		// When
		const res = await deleteAccount(h, jar);
		// Then
		expect({
			status: res.status,
			rows: {
				oauth_consent: count("oauth_consent"),
				oauth_refresh_token: count("oauth_refresh_token"),
				oauth_access_token: count("oauth_access_token"),
			},
		}).toEqual({
			status: 204,
			rows: { oauth_consent: 0, oauth_refresh_token: 0, oauth_access_token: 0 },
		});
	});
});
