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
