import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { BOB, type Harness, withAccount } from "./test/harness";

const SWAP_JACKETS = readFileSync("migrations/0007_swap_jackets.sql", "utf8")
	.split("--> statement-breakpoint")
	.map((statement) => statement.trim())
	.filter((statement) => statement !== "");

const swapJackets = (h: Harness) => {
	for (const statement of SWAP_JACKETS) h.sqlite.run(statement);
};

function oldRows(h: Harness, userId: string) {
	h.sqlite.run("INSERT INTO outfit (user_id, mode_id) VALUES (?, ?)", [
		userId,
		"polo-sweater-chore",
	]);
	h.sqlite.run(
		`INSERT INTO outfit_garment (user_id, garment, hex, open) VALUES
		(?1, 'chore', '#55633F', 1), (?1, 'padded', '#1B1B1F', 0)`,
		[userId],
	);
	h.sqlite.run(
		`INSERT INTO colour_square (user_id, garment, hex, position) VALUES
		(?1, 'chore', '#55633F', 0), (?1, 'chore', '#1F3A5F', 1), (?1, 'chore', '#C9B38C', 2),
		(?1, 'padded', '#1B1B1F', 0), (?1, 'padded', '#1F3A5F', 1), (?1, 'padded', '#55633F', 2)`,
		[userId],
	);
	h.sqlite.run(
		`INSERT INTO look (id, user_id, mode_id, name, colours, open) VALUES
		('00000000-0000-4000-8000-000000000001', ?, 'tee-sweater-padded', '', ?, '["padded"]')`,
		[
			userId,
			'{"casual_p":"#8C8A84","tee_l":"#F3F1EC","sweater":"#1F3A5F","padded":"#1B1B1F"}',
		],
	);
}

// Rows of any account that still name the old jackets.
const OLD_IDS = `SELECT
	(SELECT count(*) FROM colour_square WHERE garment IN ('chore', 'padded'))
	+ (SELECT count(*) FROM outfit_garment WHERE garment IN ('chore', 'padded'))
	+ (SELECT count(*) FROM outfit WHERE mode_id LIKE '%chore%' OR mode_id LIKE '%padded%')
	+ (SELECT count(*) FROM look
		WHERE mode_id || colours || open LIKE '%chore%'
		OR mode_id || colours || open LIKE '%padded%') AS n`;

function rowsOf(h: Harness, userId: string) {
	const all = <T>(sql: string) => h.sqlite.query(sql).all(userId) as T[];
	const squares: Record<string, string[]> = {};
	for (const { garment, hex } of all<{ garment: string; hex: string }>(
		"SELECT garment, hex FROM colour_square WHERE user_id = ? ORDER BY garment, position",
	)) {
		squares[garment] ??= [];
		squares[garment].push(hex);
	}
	return {
		outfit: all("SELECT mode_id FROM outfit WHERE user_id = ?"),
		garments: all(
			"SELECT garment, hex, open FROM outfit_garment WHERE user_id = ? ORDER BY garment",
		),
		squares,
		looks: all("SELECT mode_id, colours, open FROM look WHERE user_id = ?"),
		oldIds: (h.sqlite.query(OLD_IDS).get() as { n: number }).n,
	};
}

const MOVED = {
	outfit: [{ mode_id: "polo-sweater-harrington" }],
	garments: [
		{ garment: "harrington", hex: "#55633F", open: 1 },
		{ garment: "wool", hex: "#1B1B1F", open: 0 },
	],
	squares: {
		harrington: ["#55633F", "#1F3A5F", "#C9B38C", "#2F4A3A"],
		wool: ["#1B1B1F", "#1F3A5F", "#55633F", "#A8865C", "#39424F"],
	},
	looks: [
		{
			mode_id: "tee-sweater-wool",
			colours:
				'{"casual_p":"#8C8A84","tee_l":"#F3F1EC","sweater":"#1F3A5F","wool":"#1B1B1F"}',
			open: '["wool"]',
		},
	],
	oldIds: 0,
};

describe("migration 0007, swap jackets", () => {
	test("moves the chore and padded jacket rows to the Harrington and wool jackets", async () => {
		// Given: alice with chore and padded rows in every dress table
		const { h } = await withAccount();
		oldRows(h, "alice-id");
		// When
		swapJackets(h);
		// Then
		expect(rowsOf(h, "alice-id")).toEqual(MOVED);
	});

	test("ends in the same rows when run twice", async () => {
		// Given: alice with chore and padded rows in every dress table
		const { h } = await withAccount();
		oldRows(h, "alice-id");
		// When
		swapJackets(h);
		swapJackets(h);
		// Then
		expect(rowsOf(h, "alice-id")).toEqual(MOVED);
	});

	test("moves chore rows written after the first run", async () => {
		// Given: the migration ran on an empty database, then the old Worker
		// seeds bob's chore jacket
		const { h } = await withAccount(BOB);
		swapJackets(h);
		h.sqlite.run("INSERT INTO outfit (user_id, mode_id) VALUES (?, ?)", [
			"bob-id",
			"polo-sweater",
		]);
		h.sqlite.run(
			"INSERT INTO outfit_garment (user_id, garment, hex, open) VALUES (?, 'chore', '#55633F', 0)",
			["bob-id"],
		);
		h.sqlite.run(
			`INSERT INTO colour_square (user_id, garment, hex, position) VALUES
			(?1, 'chore', '#55633F', 0), (?1, 'chore', '#1F3A5F', 1), (?1, 'chore', '#C9B38C', 2)`,
			["bob-id"],
		);
		// When
		swapJackets(h);
		// Then
		const rows = rowsOf(h, "bob-id");
		expect({
			garments: rows.garments,
			squares: rows.squares,
			oldIds: rows.oldIds,
		}).toEqual({
			garments: [{ garment: "harrington", hex: "#55633F", open: 0 }],
			squares: {
				harrington: ["#55633F", "#1F3A5F", "#C9B38C", "#2F4A3A"],
			},
			oldIds: 0,
		});
	});
});
