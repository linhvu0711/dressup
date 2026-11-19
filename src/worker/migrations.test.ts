import { describe, expect, test } from "bun:test";
import { schema } from "./db";
import { ALICE, type Harness, makeHarness } from "./test/harness";

const DROP = "0016_harsh_gunslinger";

const OLD_TABLES = [
	"colour_square",
	"outfit",
	"outfit_garment",
	"look",
	"look_tag",
];

// Alice at migration 0015, with a mannequin, a tag "Work", and one row in each
// table that 0016 drops; her look carries "Work".
async function beforeTheDrop() {
	const h = await makeHarness({ through: "0015_outgoing_power_pack" });
	await h.addAccount(ALICE);
	await h.db
		.insert(schema.mannequin)
		.values({ userId: ALICE.id, skin: "#8D5524", hair: "#B55239" });
	await h.db
		.insert(schema.tag)
		.values({ id: "tag-work", userId: ALICE.id, name: "Work" });
	h.insertOld(
		`INSERT INTO colour_square (user_id, garment, hex, position) VALUES ('${ALICE.id}', 'sweater', '#1F3A5F', 0)`,
	);
	h.insertOld(
		`INSERT INTO outfit (user_id, mode_id) VALUES ('${ALICE.id}', 'polo-sweater-harrington')`,
	);
	h.insertOld(
		`INSERT INTO outfit_garment (user_id, garment, hex, open) VALUES ('${ALICE.id}', 'harrington', '#55633F', 1)`,
	);
	h.insertOld(
		`INSERT INTO look (id, user_id, mode_id, name, colours, open) VALUES ('look-navy', '${ALICE.id}', 'polo-sweater-harrington', 'Navy day', '{"sweater":"#1F3A5F"}', '[]')`,
	);
	h.insertOld(
		`INSERT INTO look_tag (user_id, look_id, tag_id) VALUES ('${ALICE.id}', 'look-navy', 'tag-work')`,
	);
	return h;
}

const after = async (h: Harness) => ({
	mannequin: await h.rows(schema.mannequin),
	tags: (await h.rows(schema.tag)).map((t) => t.name),
	left: h.tables().filter((name) => OLD_TABLES.includes(name)),
});

const kept = {
	mannequin: [{ userId: ALICE.id, skin: "#8D5524", hair: "#B55239" }],
	tags: ["Work"],
	left: [],
};

describe("migration 0016, drop the dress and look tables", () => {
	test("drops the five old tables and keeps the mannequin and tag rows", async () => {
		// Given
		const h = await beforeTheDrop();
		// When
		h.runMigration(DROP);
		// Then
		expect(await after(h)).toEqual(kept);
	});

	test("ends in the same tables when run twice", async () => {
		// Given
		const h = await beforeTheDrop();
		// When
		h.runMigration(DROP);
		h.runMigration(DROP);
		// Then
		expect(await after(h)).toEqual(kept);
	});
});

const DROP_OPEN = "0018_awesome_inhumans";

const KEY = "casual_p:c-navy+tee_l:c-black+harrington:c-khaki";
const SOLO_KEY = "train_sh:c-navy+tee_s:c-black+wool:c-khaki";

// Alice at migration 0016 with Khaki, Black, and Navy, the tag "Work", and
// each given combination with its three pieces and the tag.
async function beforeTheOpenDrop(
	combinations: { id: string; key: string; open: 0 | 1; createdAt: number }[],
) {
	const h = await makeHarness({ through: DROP });
	const headers = await h.addAccount(ALICE);
	await h.db.insert(schema.colour).values([
		{ id: "c-khaki", userId: ALICE.id, name: "Khaki", hex: "#B8A57C" },
		{ id: "c-black", userId: ALICE.id, name: "Black", hex: "#1B1B1F" },
		{ id: "c-navy", userId: ALICE.id, name: "Navy", hex: "#1F3A5F" },
	]);
	await h.db
		.insert(schema.tag)
		.values({ id: "tag-work", userId: ALICE.id, name: "Work" });
	for (const { id, key, open, createdAt } of combinations) {
		h.insertOld(
			`INSERT INTO combination (id, user_id, key, open, created_at) VALUES ('${id}', '${ALICE.id}', '${key}', ${open}, ${createdAt})`,
		);
		const [bottom, top, jacket] = key.replace("|open", "").split("+");
		for (const [layer, piece] of [
			["bottom", bottom],
			["inner_top", top],
			["jacket", jacket],
		]) {
			const [typeId, colourId] = piece.split(":");
			h.insertOld(
				`INSERT INTO combination_piece (combination_id, user_id, layer, type_id, colour_id) VALUES ('${id}', '${ALICE.id}', '${layer}', '${typeId}', '${colourId}')`,
			);
		}
		h.insertOld(
			`INSERT INTO combination_tag (user_id, combination_id, tag_id) VALUES ('${ALICE.id}', '${id}', 'tag-work')`,
		);
	}
	return { h, headers };
}

describe("migration 0018, drop the jacket state", () => {
	test("keeps the older of two combinations that differ only by the jacket state", async () => {
		// Given: c-old saved open, c-new the same pieces saved closed later, and
		// c-solo saved open alone
		const { h } = await beforeTheOpenDrop([
			{ id: "c-old", key: `${KEY}|open`, open: 1, createdAt: 1000 },
			{ id: "c-new", key: KEY, open: 0, createdAt: 2000 },
			{ id: "c-solo", key: `${SOLO_KEY}|open`, open: 1, createdAt: 3000 },
		]);
		// When
		h.runMigration(DROP_OPEN);
		// Then
		const byId = (a: string, b: string) => a.localeCompare(b);
		expect({
			combinations: (await h.rows(schema.combination))
				.map((c) => [c.id, c.key])
				.sort((a, b) => byId(a[0], b[0])),
			pieces: (await h.rows(schema.combinationPiece))
				.map((p) => p.combinationId)
				.sort(byId),
			tags: (await h.rows(schema.combinationTag))
				.map((t) => t.combinationId)
				.sort(byId),
			columns: h.columns("combination"),
		}).toEqual({
			combinations: [
				["c-old", KEY],
				["c-solo", SOLO_KEY],
			],
			pieces: ["c-old", "c-old", "c-old", "c-solo", "c-solo", "c-solo"],
			tags: ["c-old", "c-solo"],
			columns: ["id", "user_id", "key", "created_at"],
		});
	});

	test("refuses a save of the pieces of a combination stored with its jacket open", async () => {
		// Given: c-old saved open before the drop
		const { h, headers } = await beforeTheOpenDrop([
			{ id: "c-old", key: `${KEY}|open`, open: 1, createdAt: 1000 },
		]);
		h.runMigration(DROP_OPEN);
		// When: the same pieces saved under a new id
		const res = await h.app.request(
			"/api/combinations",
			{
				method: "POST",
				headers: {
					...Object.fromEntries(headers),
					"content-type": "application/json",
				},
				body: JSON.stringify({
					id: "11111111-1111-4111-8111-111111111111",
					pieces: [
						{ typeId: "harrington", colourId: "c-khaki" },
						{ typeId: "tee_l", colourId: "c-black" },
						{ typeId: "casual_p", colourId: "c-navy" },
					],
				}),
			},
			h.env,
		);
		// Then
		expect({ status: res.status, body: await res.json() }).toEqual({
			status: 409,
			body: { error: "duplicate", id: "c-old" },
		});
	});
});
