import { describe, expect, test } from "bun:test";
import { createMemoryOutfitServer } from "@/dress/memory-outfit-server";
import {
	createOutfitStore,
	type OutfitReport,
	type OutfitStore,
} from "@/dress/outfit-store";

async function until(check: () => boolean) {
	while (!check()) await Bun.sleep(5);
	// One more turn, so the store has handled the answer the check saw.
	await Bun.sleep(0);
}

function setup(memory = createMemoryOutfitServer()) {
	const reports: OutfitReport[] = [];
	const store = createOutfitStore(memory.server, {
		report: (report) => reports.push(report),
		retryDelays: [0, 0],
	});
	return { memory, store, reports };
}

async function ready() {
	const s = setup();
	s.store.account("u1");
	await until(() => s.store.view().status === "ready");
	return s;
}

const shown = (store: OutfitStore) => {
	const view = store.view();
	return view.status === "ready" ? view.state : null;
};

describe("outfit store", () => {
	test("sends changes in the order they were made", async () => {
		// Given: a store loaded from the memory server for "u1"
		const { memory, store } = await ready();
		// When
		store.pickColour("sweater", "#7A2E2E");
		store.pickMode("tee-sweater");
		store.addColour("sweater", "#C0392B");
		await until(() => memory.stored.length === 3);
		// Then
		expect(memory.stored).toEqual([
			{ kind: "pick", garment: "sweater", hex: "#7A2E2E" },
			{ kind: "mode", modeId: "tee-sweater" },
			{ kind: "add", garment: "sweater", hex: "#C0392B" },
		]);
	});

	test("says added only for a colour the row lacks", async () => {
		// Given: a ready store
		const { store } = await ready();
		// When
		const answers = [
			store.addColour("sweater", "#C0392B"),
			store.addColour("sweater", "#8C8A84"),
		];
		// Then
		expect(answers).toEqual([{ added: true }, { added: false }]);
	});

	test("marks unsaved when a send fails and clears it with Saved on retry", async () => {
		// Given: a ready store; the next send fails
		const { memory, store, reports } = await ready();
		memory.answerNextSend("failed");
		// When
		store.pickColour("sweater", "#7A2E2E");
		await until(() => store.view().unsaved);
		store.retry();
		await until(() => memory.stored.length === 1);
		// Then
		expect({
			unsaved: store.view().unsaved,
			reports,
			stored: memory.stored,
		}).toEqual({
			unsaved: false,
			reports: ["saved"],
			stored: [{ kind: "pick", garment: "sweater", hex: "#7A2E2E" }],
		});
	});

	test("says still no connection when a retry fails", async () => {
		// Given: a ready store; the next two sends fail
		const { memory, store, reports } = await ready();
		memory.answerNextSend("failed");
		memory.answerNextSend("failed");
		// When
		store.pickColour("sweater", "#7A2E2E");
		await until(() => store.view().unsaved);
		store.retry();
		await until(() => reports.length === 1);
		// Then
		expect({
			unsaved: store.view().unsaved,
			reports,
			stored: memory.stored,
		}).toEqual({ unsaved: true, reports: ["still-unsaved"], stored: [] });
	});

	test("drops the queue and loads the newest outfit when a change is refused", async () => {
		// Given: a ready store; another device picked a cream sweater; the
		// server holds its answers, and refuses the next change
		const { memory, store, reports } = await ready();
		memory.changeElsewhere({
			kind: "pick",
			garment: "sweater",
			hex: "#E6DFD0",
		});
		const release = memory.slow();
		memory.answerNextSend("refused");
		// When
		store.pickColour("sweater", "#7A2E2E");
		store.pickMode("tee-sweater");
		release();
		await until(() => memory.loads === 2);
		// Then
		expect({
			stored: memory.stored,
			modeId: shown(store)?.modeId,
			sweater: shown(store)?.picked.sweater,
			unsaved: store.view().unsaved,
			reports,
		}).toEqual({
			stored: [],
			modeId: "polo-sweater",
			sweater: "#E6DFD0",
			unsaved: false,
			reports: [],
		});
	});
});
