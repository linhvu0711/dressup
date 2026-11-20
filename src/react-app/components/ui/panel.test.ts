import { expect, test } from "bun:test";
import { nextPanel } from "./panel";

test("takes a new id for a new try in an add panel", () => {
	// Given: an add panel on its form, with id "a"
	const state = { id: "a", step: "form" };
	// When
	const next = nextPanel(state, { type: "change" }, () => "b");
	// Then
	expect(next).toEqual({ state: { id: "b", step: "form" }, deletes: false });
});

test("keeps the id for a new try in a change panel", () => {
	// Given: a change panel on its form, with id "a"
	const state = { id: "a", step: "form" };
	// When
	const next = nextPanel(state, { type: "change" }, null);
	// Then
	expect(next).toEqual({ state: { id: "a", step: "form" }, deletes: false });
});

test("takes a new id and goes back to the form for a pick in an add panel", () => {
	// Given: an add panel on its brand step, with id "a"
	const state = { id: "a", step: "brands" };
	// When
	const next = nextPanel(state, { type: "pick" }, () => "b");
	// Then
	expect(next).toEqual({ state: { id: "b", step: "form" }, deletes: false });
});

test("opens a step over the form", () => {
	// Given: an add panel on its form, with id "a"
	const state = { id: "a", step: "form" };
	// When
	const next = nextPanel(state, { type: "open", step: "brands" }, () => "b");
	// Then
	expect(next).toEqual({ state: { id: "a", step: "brands" }, deletes: false });
});

test("goes back to the form from the brand step", () => {
	// Given: an add panel on its brand step, with id "a"
	const state = { id: "a", step: "brands" };
	// When
	const next = nextPanel(state, { type: "back" }, () => "b");
	// Then
	expect(next).toEqual({ state: { id: "a", step: "form" }, deletes: false });
});

test("asks before it deletes", () => {
	// Given: a change panel on its form, with id "a"
	const state = { id: "a", step: "form" };
	// When
	const next = nextPanel(state, { type: "delete" }, null);
	// Then
	expect(next).toEqual({ state: { id: "a", step: "delete" }, deletes: false });
});

test("deletes from the delete step", () => {
	// Given: a change panel on its delete step, with id "a"
	const state = { id: "a", step: "delete" };
	// When
	const next = nextPanel(state, { type: "delete" }, null);
	// Then
	expect(next).toEqual({ state: { id: "a", step: "delete" }, deletes: true });
});
