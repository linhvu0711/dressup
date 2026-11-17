import { describe, expect, test } from "bun:test";
import { schema } from "./db";
import { BOB, type Harness, withAccount } from "./test/harness";

type Look = typeof schema.look.$inferInsert;

const swapJackets = (h: Harness) => h.runMigration("0007_swap_jackets");

const squares = (userId: string, garment: string) =>
	["#55633F", "#1F3A5F", "#C9B38C"].map((hex, position) => ({
		userId,
		garment,
		hex,
		position,
	}));

// The chore and padded jackets come before migration 0007, so today's look
// types do not hold them.
async function oldRows(h: Harness, userId: string) {
	await h.db
		.insert(schema.outfit)
		.values({ userId, modeId: "polo-sweater-chore" });
	await h.db.insert(schema.outfitGarment).values([
		{ userId, garment: "chore", hex: "#55633F", open: true },
		{ userId, garment: "padded", hex: "#1B1B1F", open: false },
	]);
	await h.db
		.insert(schema.colourSquare)
		.values([
			...squares(userId, "chore"),
			{ userId, garment: "padded", hex: "#1B1B1F", position: 0 },
			{ userId, garment: "padded", hex: "#1F3A5F", position: 1 },
			{ userId, garment: "padded", hex: "#55633F", position: 2 },
		]);
	await h.db.insert(schema.look).values({
		id: "00000000-0000-4000-8000-000000000001",
		userId,
		modeId: "tee-sweater-padded",
		name: "",
		colours: {
			casual_p: "#8C8A84",
			tee_l: "#F3F1EC",
			sweater: "#1F3A5F",
			padded: "#1B1B1F",
		} as unknown as Look["colours"],
		open: ["padded"] as unknown as Look["open"],
	});
}

const OLD = /chore|padded/;

// Rows of any account that still name the old jackets.
async function oldIds(h: Harness) {
	const named = [
		...(await h.rows(schema.colourSquare)).map((row) => row.garment),
		...(await h.rows(schema.outfitGarment)).map((row) => row.garment),
		...(await h.rows(schema.outfit)).map((row) => row.modeId),
		...(await h.rows(schema.look)).map(
			(row) =>
				row.modeId + JSON.stringify(row.colours) + JSON.stringify(row.open),
		),
	];
	return named.filter((text) => OLD.test(text)).length;
}

async function rowsOf(h: Harness, userId: string) {
	const bySquare = (await h.rows(schema.colourSquare, userId)).sort(
		(a, b) => a.garment.localeCompare(b.garment) || a.position - b.position,
	);
	const squares: Record<string, string[]> = {};
	for (const { garment, hex } of bySquare) {
		squares[garment] ??= [];
		squares[garment].push(hex);
	}
	return {
		outfit: (await h.rows(schema.outfit, userId)).map(({ modeId }) => ({
			modeId,
		})),
		garments: (await h.rows(schema.outfitGarment, userId))
			.sort((a, b) => a.garment.localeCompare(b.garment))
			.map(({ garment, hex, open }) => ({ garment, hex, open })),
		squares,
		// Read as plain strings: before the migration they name old jackets.
		looks: (await h.rows(schema.look, userId)).map(
			({ modeId, colours, open }) => ({
				modeId,
				colours: colours as Record<string, string>,
				open: open as string[],
			}),
		),
		oldIds: await oldIds(h),
	};
}

const MOVED = {
	outfit: [{ modeId: "polo-sweater-harrington" }],
	garments: [
		{ garment: "harrington", hex: "#55633F", open: true },
		{ garment: "wool", hex: "#1B1B1F", open: false },
	],
	squares: {
		harrington: ["#55633F", "#1F3A5F", "#C9B38C", "#2F4A3A"],
		wool: ["#1B1B1F", "#1F3A5F", "#55633F", "#A8865C", "#39424F"],
	},
	looks: [
		{
			modeId: "tee-sweater-wool",
			colours: {
				casual_p: "#8C8A84",
				tee_l: "#F3F1EC",
				sweater: "#1F3A5F",
				wool: "#1B1B1F",
			},
			open: ["wool"],
		},
	],
	oldIds: 0,
};

describe("migration 0007, swap jackets", () => {
	test("moves the chore and padded jacket rows to the Harrington and wool jackets", async () => {
		// Given: alice with chore and padded rows in every dress table
		const { h } = await withAccount();
		await oldRows(h, "alice-id");
		// When
		swapJackets(h);
		// Then
		expect(await rowsOf(h, "alice-id")).toEqual(MOVED);
	});

	test("ends in the same rows when run twice", async () => {
		// Given: alice with chore and padded rows in every dress table
		const { h } = await withAccount();
		await oldRows(h, "alice-id");
		// When
		swapJackets(h);
		swapJackets(h);
		// Then
		expect(await rowsOf(h, "alice-id")).toEqual(MOVED);
	});

	test("moves chore rows written after the first run", async () => {
		// Given: the migration ran on an empty database, then the old Worker
		// seeds bob's chore jacket
		const { h } = await withAccount(BOB);
		swapJackets(h);
		await h.db
			.insert(schema.outfit)
			.values({ userId: "bob-id", modeId: "polo-sweater" });
		await h.db.insert(schema.outfitGarment).values({
			userId: "bob-id",
			garment: "chore",
			hex: "#55633F",
			open: false,
		});
		await h.db.insert(schema.colourSquare).values(squares("bob-id", "chore"));
		// When
		swapJackets(h);
		// Then
		const rows = await rowsOf(h, "bob-id");
		expect({
			garments: rows.garments,
			squares: rows.squares,
			oldIds: rows.oldIds,
		}).toEqual({
			garments: [{ garment: "harrington", hex: "#55633F", open: false }],
			squares: {
				harrington: ["#55633F", "#1F3A5F", "#C9B38C", "#2F4A3A"],
			},
			oldIds: 0,
		});
	});
});
