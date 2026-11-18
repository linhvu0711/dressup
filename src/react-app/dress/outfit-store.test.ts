import { describe, expect, test } from "bun:test";
import { createMemoryOutfitServer } from "@/dress/memory-outfit-server";
import {
	createOutfitStore,
	type OutfitReport,
	type OutfitStore,
} from "@/dress/outfit-store";
import { pickColour, startDressState } from "@/dress/state";
import { type LookId, lookFromDress } from "@/looks/look";

async function until(check: () => boolean) {
	while (!check()) await Bun.sleep(5);
	// One more turn, so the store has handled the answer the check saw.
	await Bun.sleep(0);
}

function setup(memory = createMemoryOutfitServer()) {
	const reports: OutfitReport[] = [];
	// The account the session check names.
	const session: { id: string | null } = { id: "u1" };
	const store = createOutfitStore(memory.server, {
		report: (report) => reports.push(report),
		signedIn: async () => session.id,
		retryDelays: [0, 0],
	});
	return { memory, store, reports, session };
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

const lookIn = (hex: "#7A2E2E" | "#E6DFD0", id: string) =>
	lookFromDress(
		pickColour(startDressState(), "sweater", hex),
		id as LookId,
		"Red day",
		[],
	);
const redLook = lookIn("#7A2E2E", "8f0d5a52-0b2e-4b8e-9a43-2f1c4a6e7b01");
const creamLook = lookIn("#E6DFD0", "8f0d5a52-0b2e-4b8e-9a43-2f1c4a6e7b02");

const editing = (store: OutfitStore) => {
	const view = store.view();
	return view.status === "ready" ? view.editing : undefined;
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

	test("ends the session when a send finds no session", async () => {
		// Given: a ready store; the server holds its answers, and finds no
		// session for the next change
		const { memory, store, reports } = await ready();
		const release = memory.slow();
		memory.answerNextSend("signed-out");
		// When
		store.pickColour("sweater", "#7A2E2E");
		store.pickMode("tee-sweater");
		release();
		await until(() => reports.length === 1);
		store.retry();
		await Bun.sleep(0);
		// Then
		expect({
			reports,
			stored: memory.stored,
			unsaved: store.view().unsaved,
		}).toEqual({ reports: ["signed-out"], stored: [], unsaved: false });
	});

	test("ends the session when the first load finds no session", async () => {
		// Given: the first load finds no session
		const memory = createMemoryOutfitServer();
		memory.answerNextLoads("signed-out");
		const { store, reports } = setup(memory);
		// When
		store.account("u1");
		await until(() => reports.length === 1);
		// Then
		expect({
			reports,
			status: store.view().status,
			loads: memory.loads,
		}).toEqual({ reports: ["signed-out"], status: "loading", loads: 1 });
	});

	test("drops the queue when another account signs in", async () => {
		// Given: a ready store for "u1" with a failed change on its queue
		const { memory, store } = await ready();
		memory.answerNextSend("failed");
		store.pickColour("sweater", "#7A2E2E");
		await until(() => store.view().unsaved);
		// When
		store.account("u2");
		await until(() => store.view().status === "ready");
		store.retry();
		await Bun.sleep(0);
		// Then
		expect({
			stored: memory.stored,
			unsaved: store.view().unsaved,
			sweater: shown(store)?.picked.sweater,
		}).toEqual({ stored: [], unsaved: false, sweater: "#1F3A5F" });
	});

	test("drops a load that answers after another account signed in", async () => {
		// Given: a new store whose first load for "u1" is held
		const { memory, store } = setup();
		const release = memory.slow();
		store.account("u1");
		// When
		store.account(null);
		release();
		await until(() => memory.loads === 1);
		// Then
		expect(store.view().status).toBe("loading");
	});

	test("cancel edit keeps squares deleted during the edit deleted", async () => {
		// Given: a ready store with the navy sweater on, and a look in red
		const { memory, store } = await ready();
		// When
		store.editLook(redLook);
		store.removeColour("sweater", "#1F3A5F");
		store.cancelEdit();
		await until(() => memory.stored.length === 3);
		// Then
		expect({
			editing: editing(store),
			row: shown(store)?.swatches.sweater,
			sweater: shown(store)?.picked.sweater,
			serverRow: memory.state().swatches.sweater,
			serverSweater: memory.state().picked.sweater,
		}).toEqual({
			editing: null,
			row: ["#8C8A84", "#E6DFD0", "#7A2E2E"],
			sweater: "#8C8A84",
			serverRow: ["#8C8A84", "#E6DFD0", "#7A2E2E"],
			serverSweater: "#8C8A84",
		});
	});

	test("finish edit keeps the outfit", async () => {
		// Given: a ready store with the navy sweater on, and a look in red
		const { store } = await ready();
		// When
		store.editLook(redLook);
		store.finishEdit();
		// Then
		expect({
			editing: editing(store),
			sweater: shown(store)?.picked.sweater,
		}).toEqual({ editing: null, sweater: "#7A2E2E" });
	});

	test("a second look keeps the outfit from before the first", async () => {
		// Given: a ready store with the navy sweater on, a look in red and one
		// in cream
		const { store } = await ready();
		// When
		store.editLook(redLook);
		store.editLook(creamLook);
		store.cancelEdit();
		// Then
		expect({
			editing: editing(store),
			sweater: shown(store)?.picked.sweater,
		}).toEqual({ editing: null, sweater: "#1F3A5F" });
	});

	test("ends the edit state when a change is refused", async () => {
		// Given: a ready store with the navy sweater on; the next change is
		// refused
		const { memory, store } = await ready();
		memory.answerNextSend("refused");
		// When
		store.editLook(redLook);
		await until(() => memory.loads === 2);
		// Then
		expect({
			editing: editing(store),
			sweater: shown(store)?.picked.sweater,
		}).toEqual({ editing: null, sweater: "#1F3A5F" });
	});

	test("shows a change from another device on focus", async () => {
		// Given: a ready store; another device picked a red sweater
		const { memory, store } = await ready();
		memory.changeElsewhere({
			kind: "pick",
			garment: "sweater",
			hex: "#7A2E2E",
		});
		// When
		store.focus();
		await until(() => memory.loads === 2);
		// Then
		expect(shown(store)?.picked.sweater).toBe("#7A2E2E");
	});

	test("drops a load on focus when the session names another account", async () => {
		// Given: the Given above; another account signed in from a second tab
		const { memory, store, session } = await ready();
		memory.changeElsewhere({
			kind: "pick",
			garment: "sweater",
			hex: "#7A2E2E",
		});
		session.id = "u2";
		// When
		store.focus();
		await until(() => memory.loads === 2);
		// Then
		expect(shown(store)?.picked.sweater).toBe("#1F3A5F");
	});

	test("skips a load on focus while a change is out", async () => {
		// Given: the Given above; the server holds its answers, and a change
		// is out
		const { memory, store } = await ready();
		memory.changeElsewhere({
			kind: "pick",
			garment: "sweater",
			hex: "#7A2E2E",
		});
		memory.slow();
		store.pickMode("tee-sweater");
		// When
		store.focus();
		// Then
		expect(memory.loadCalls).toBe(1);
	});

	test("skips a load on focus in the Edit state", async () => {
		// Given: a ready store in the Edit state of a look in red
		const { memory, store } = await ready();
		store.editLook(redLook);
		await until(() => memory.stored.length === 1);
		// When
		store.focus();
		// Then
		expect(memory.loadCalls).toBe(1);
	});

	test("skips a load on focus while held", async () => {
		// Given: the Given of the first focus test; loads held
		const { memory, store } = await ready();
		memory.changeElsewhere({
			kind: "pick",
			garment: "sweater",
			hex: "#7A2E2E",
		});
		store.hold(true);
		// When
		store.focus();
		// Then
		expect(memory.loadCalls).toBe(1);
	});

	test("drops a load that finishes after the hold started", async () => {
		// Given: the Given of the first focus test; a load on focus is out
		const { memory, store } = await ready();
		memory.changeElsewhere({
			kind: "pick",
			garment: "sweater",
			hex: "#7A2E2E",
		});
		const release = memory.slow();
		store.focus();
		// When
		store.hold(true);
		release();
		await until(() => memory.loads === 2);
		// Then
		expect(shown(store)?.picked.sweater).toBe("#1F3A5F");
	});

	test("goes back to the last load when a change is refused", async () => {
		// Given: the Given of the first focus test, loaded on focus; the next
		// change is refused and the load after it fails
		const { memory, store } = await ready();
		memory.changeElsewhere({
			kind: "pick",
			garment: "sweater",
			hex: "#7A2E2E",
		});
		store.focus();
		await until(() => memory.loads === 2);
		memory.answerNextSend("refused");
		memory.answerNextLoads("failed");
		// When
		store.pickColour("sweater", "#E6DFD0");
		await until(() => memory.loads === 3);
		// Then
		expect(shown(store)?.picked.sweater).toBe("#7A2E2E");
	});

	test("reports the failed state when the first load fails three times", async () => {
		// Given: the first three loads fail
		const memory = createMemoryOutfitServer();
		memory.answerNextLoads("failed", 3);
		const { store } = setup(memory);
		// When
		store.account("u1");
		await until(() => store.view().status !== "loading");
		// Then
		expect({ status: store.view().status, loads: memory.loads }).toEqual({
			status: "failed",
			loads: 3,
		});
	});

	test("shows the outfit when the third try loads", async () => {
		// Given: the first two loads fail
		const memory = createMemoryOutfitServer();
		memory.answerNextLoads("failed", 2);
		const { store } = setup(memory);
		// When
		store.account("u1");
		await until(() => store.view().status !== "loading");
		// Then
		expect({ status: store.view().status, loads: memory.loads }).toEqual({
			status: "ready",
			loads: 3,
		});
	});

	test("loads again after a failed first load", async () => {
		// Given: a store whose first load failed three times
		const memory = createMemoryOutfitServer();
		memory.answerNextLoads("failed", 3);
		const { store } = setup(memory);
		store.account("u1");
		await until(() => store.view().status === "failed");
		// When
		store.loadAgain();
		await until(() => store.view().status !== "loading");
		// Then
		expect({ status: store.view().status, loads: memory.loads }).toEqual({
			status: "ready",
			loads: 4,
		});
	});

	test("fails again after three more tries when a load again fails", async () => {
		// Given: a store whose first load failed three times, and three more
		// failed loads to come
		const memory = createMemoryOutfitServer();
		memory.answerNextLoads("failed", 6);
		const { store } = setup(memory);
		store.account("u1");
		await until(() => store.view().status === "failed");
		// When
		store.loadAgain();
		await until(() => store.view().status !== "loading");
		// Then
		expect({ status: store.view().status, loads: memory.loads }).toEqual({
			status: "failed",
			loads: 6,
		});
	});
});
