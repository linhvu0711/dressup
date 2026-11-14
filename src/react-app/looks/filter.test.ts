import { describe, expect, test } from "bun:test";
import type { ModeId } from "@/dress/modes";
import type { TagId } from "@/tags/tag";
import { filterLooks, lookFilter } from "./filter";
import type { Look, LookId } from "./look";

const T1 = "00000000-0000-4000-8000-000000000001" as TagId;
const T2 = "00000000-0000-4000-8000-000000000002" as TagId;

const look = (id: string, modeId: string, tags: TagId[] = []): Look => ({
	id: id as LookId,
	modeId: modeId as ModeId,
	name: id,
	colours: {},
	open: [],
	tags,
});

const ids = (looks: Look[]) => looks.map((l) => l.id);

describe("look filter", () => {
	test("shows the looks of the Hot group", () => {
		// Given: A (Hot), B (Cold), C (Hot), in that order
		const looks = [
			look("A", "tee-casual-shorts"),
			look("B", "polo-sweater"),
			look("C", "polo-chino-pants"),
		];
		// When
		const shown = filterLooks(looks, "Hot");
		// Then
		expect(ids(shown)).toEqual(["A", "C"] as LookId[]);
	});

	test("shows the looks with the tag", () => {
		// Given: A with T1, B with none, C with T2 and T1
		const looks = [
			look("A", "polo-sweater", [T1]),
			look("B", "polo-sweater"),
			look("C", "polo-sweater", [T2, T1]),
		];
		// When
		const shown = filterLooks(looks, T1);
		// Then
		expect(ids(shown)).toEqual(["A", "C"] as LookId[]);
	});

	test("keeps the newest look first", () => {
		// Given: C, B, A, newest first as the server sends them, all Cold
		const looks = [
			look("C", "polo-sweater"),
			look("B", "polo-sweater"),
			look("A", "polo-sweater"),
		];
		// When
		const shown = filterLooks(looks, "Cold");
		// Then
		expect(ids(shown)).toEqual(["C", "B", "A"] as LookId[]);
	});

	test("turns All on for a tag that is gone", () => {
		// Given: only the tag T2
		const tags = [{ id: T2, name: "Trip" }];
		// When
		const filter = lookFilter(T1, tags);
		// Then
		expect(filter).toBe("All");
	});
});
