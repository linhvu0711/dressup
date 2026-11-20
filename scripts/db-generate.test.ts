import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
	type Change,
	changeFilesInOrder,
	currentSnapshot,
	type Snapshot,
	snapshotChange,
} from "./db-generate";

const snapshot = (tables: Record<string, unknown>): Snapshot => ({
	id: "base",
	prevId: "p",
	tables,
	views: {},
	enums: {},
	internal: {},
});

const setTable = (name: string): Change => ({
	set: [{ path: ["tables", name], value: { name } }],
	remove: [],
});

const readSnapshot = (file: string): Snapshot =>
	JSON.parse(readFileSync(`migrations/meta/${file}`, "utf8"));

const kept = (s: Snapshot) => ({
	tables: s.tables,
	views: s.views,
	enums: s.enums,
	internal: s.internal,
});

describe("currentSnapshot", () => {
	test("adds one change onto the base", () => {
		// Given
		const base = snapshot({ user: { name: "user" } });
		// When
		const current = currentSnapshot(base, [setTable("tag")]);
		// Then
		expect({ id: current.id, tables: current.tables }).toEqual({
			id: "base",
			tables: { user: { name: "user" }, tag: { name: "tag" } },
		});
	});

	test("joins two branches' changes", () => {
		// Given
		const base = snapshot({ user: { name: "user" } });
		// When
		const current = currentSnapshot(base, [
			setTable("probe_a"),
			setTable("probe_b"),
		]);
		// Then
		expect(current.tables).toEqual({
			user: { name: "user" },
			probe_a: { name: "probe_a" },
			probe_b: { name: "probe_b" },
		});
	});

	test("keeps the columns two branches add to one table", () => {
		// Given
		const base = snapshot({ user: { columns: { id: { type: "text" } } } });
		const a: Change = {
			set: [
				{ path: ["tables", "user", "columns", "x"], value: { type: "text" } },
			],
			remove: [],
		};
		const b: Change = {
			set: [
				{
					path: ["tables", "user", "columns", "y"],
					value: { type: "integer" },
				},
			],
			remove: [],
		};
		// When
		const current = currentSnapshot(base, [a, b]);
		// Then
		expect(current.tables).toEqual({
			user: {
				columns: {
					id: { type: "text" },
					x: { type: "text" },
					y: { type: "integer" },
				},
			},
		});
	});

	test("keeps a drop made after two branches joined", () => {
		// Given
		const base = snapshot({ user: { name: "user" } });
		const drop: Change = { set: [], remove: [["tables", "probe_a"]] };
		// When
		const current = currentSnapshot(base, [
			setTable("probe_a"),
			setTable("probe_b"),
			drop,
		]);
		// Then
		expect(current.tables).toEqual({
			user: { name: "user" },
			probe_b: { name: "probe_b" },
		});
	});

	test("a change made from 0018 to 0019 rebuilds 0019", () => {
		// Given
		const s0018 = readSnapshot("0018_snapshot.json");
		const s0019 = readSnapshot("0019_snapshot.json");
		// When
		const current = currentSnapshot(s0018, [snapshotChange(s0018, s0019)]);
		// Then
		expect(kept(current)).toEqual(kept(s0019));
	});
});

describe("snapshotChange", () => {
	test("writes the change between two snapshots", () => {
		// Given
		const before = snapshot({
			user: { columns: { id: { type: "text" } } },
			look: { name: "look" },
		});
		const after = snapshot({
			user: { columns: { id: { type: "text" }, x: { type: "text" } } },
		});
		// When
		const change = snapshotChange(before, after);
		// Then
		expect(change).toEqual({
			set: [
				{ path: ["tables", "user", "columns", "x"], value: { type: "text" } },
			],
			remove: [["tables", "look"]],
		});
	});
});

describe("changeFilesInOrder", () => {
	test("orders change files as wrangler orders their migrations", () => {
		// Given: two migrations made in one second, and a snapshot
		const files = [
			"20261119164310_probe_b_change.json",
			"0019_snapshot.json",
			"20261119164310_probe_change.json",
		];
		// When
		const ordered = changeFilesInOrder(files);
		// Then
		expect(ordered).toEqual([
			"20261119164310_probe_change.json",
			"20261119164310_probe_b_change.json",
		]);
	});
});
