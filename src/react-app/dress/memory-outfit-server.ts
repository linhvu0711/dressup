import type { Loaded, OutfitServer, Sent } from "@/dress/outfit-server";
import {
	applyChange,
	type DressChange,
	type DressState,
	startDressState,
} from "@/dress/state";

type SendAnswer = Exclude<Sent, "stored">;
type LoadAnswer = Exclude<Loaded["kind"], "loaded">;

// The server in tests. It runs the applyChange the worker runs, on its own
// copy, and can be told to fail, refuse, sign out, or hold its answers.
export function createMemoryOutfitServer({
	state = startDressState(),
}: {
	state?: DressState;
} = {}) {
	let current = state;
	const sendAnswers: SendAnswer[] = [];
	const loadAnswers: LoadAnswer[] = [];
	let held: Promise<void> | null = null;

	const server: OutfitServer = {
		load: async () => {
			memory.loadCalls++;
			if (held) await held;
			const answer = loadAnswers.shift();
			// Counted last, so a test that waits for it sees the answer leave.
			memory.loads++;
			return answer ? { kind: answer } : { kind: "loaded", state: current };
		},
		send: async (change) => {
			if (held) await held;
			const answer = sendAnswers.shift();
			if (answer) return answer;
			const result = applyChange(current, change);
			if (!result.ok) return "refused";
			current = result.state;
			memory.stored.push(change);
			return "stored";
		},
	};

	const memory = {
		server,
		stored: [] as DressChange[],
		loads: 0,
		loadCalls: 0,
		state: () => current,
		// A change from another device, stored at once.
		changeElsewhere(change: DressChange) {
			const result = applyChange(current, change);
			if (result.ok) current = result.state;
		},
		answerNextSend(answer: SendAnswer) {
			sendAnswers.push(answer);
		},
		answerNextLoads(answer: LoadAnswer, times = 1) {
			for (let i = 0; i < times; i++) loadAnswers.push(answer);
		},
		// Holds every answer until the returned function runs.
		slow() {
			let release = () => {};
			held = new Promise<void>((resolve) => {
				release = resolve;
			});
			return () => {
				held = null;
				release();
			};
		},
	};
	return memory;
}
