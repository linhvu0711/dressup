import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { TYPE_IDS } from "@/dress/clothing-types";
import { Mannequin } from "@/dress/figure/Mannequin";
import { STARTER_MANNEQUIN } from "@/mannequin/mannequin";

describe("Mannequin", () => {
	test("draws the skin, hair, and white shoes", () => {
		// Given: no props
		// When
		const markup = renderToStaticMarkup(<Mannequin {...STARTER_MANNEQUIN} />);
		// Then
		expect(markup).toContain('fill="#D6A27B"');
		expect(markup).toContain('fill="#141418"');
		expect(markup).toContain('fill="#F7F6F3"');
	});

	test("takes skin and hair as inputs", () => {
		// Given: a skin and a hair colour of its own
		// When
		const markup = renderToStaticMarkup(
			<Mannequin skin="#8D5524" hair="#B55239" />,
		);
		// Then
		expect(markup).toContain('fill="#8D5524"');
		expect(markup).toContain('fill="#B55239"');
		expect(markup).not.toContain("#D6A27B");
		expect(markup).not.toContain("#141418");
	});

	test("gives each figure its own ids", () => {
		// Given: two figures on one page
		// When
		const markup = renderToStaticMarkup(
			<>
				<Mannequin {...STARTER_MANNEQUIN} />
				<Mannequin {...STARTER_MANNEQUIN} />
			</>,
		);
		const ids = [...markup.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
		// Then
		expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([]);
	});

	test("points each url at an id in the figure", () => {
		// Given: a figure with no clothes: its floor, shadows, body, and head
		const markup = renderToStaticMarkup(<Mannequin {...STARTER_MANNEQUIN} />);
		// When
		const ids = new Set(
			[...markup.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]),
		);
		const used = [...markup.matchAll(/url\(#([^)]+)\)/g)].map((m) => m[1]);
		// Then
		expect(used.filter((id) => !ids.has(id))).toEqual([]);
	});

	test.each(TYPE_IDS.map((id) => [id]))(
		"draws each type in the given colour (%s)",
		(id) => {
			// Given: one type in the test colour
			// When
			const markup = renderToStaticMarkup(
				<Mannequin
					{...STARTER_MANNEQUIN}
					layers={[{ typeId: id, color: "#12AB34" }]}
				/>,
			);
			// Then
			expect(markup).toContain(`data-type-id="${id}"`);
			expect(markup).toContain('fill="#12AB34"');
		},
	);

	test("draws every jacket open", () => {
		// Given: a Harrington jacket in #C9B38C and a wool jacket in #A8865C,
		// each the only layer
		// When
		const harrington = renderToStaticMarkup(
			<Mannequin
				{...STARTER_MANNEQUIN}
				layers={[{ typeId: "harrington", color: "#C9B38C" }]}
			/>,
		);
		const wool = renderToStaticMarkup(
			<Mannequin
				{...STARTER_MANNEQUIN}
				layers={[{ typeId: "wool", color: "#A8865C" }]}
			/>,
		);
		// Then: the Harrington facing and the wool lapel show only when open
		expect({
			harringtonFacing: harrington.includes(
				"M 181 176 L 186 176 L 186 397 L 183 397 Z",
			),
			woolLapel: wool.includes("M 175 147 L 153 166 L 165 226 L 187 210"),
		}).toEqual({ harringtonFacing: true, woolLapel: true });
	});

	test("paints the layers in the given order", () => {
		// Given: chino pants, a long polo, and a sweater, bottom layer first
		// When
		const markup = renderToStaticMarkup(
			<Mannequin
				{...STARTER_MANNEQUIN}
				layers={[
					{ typeId: "chino_p", color: "#C9B38C" },
					{ typeId: "polo_l", color: "#F3F1EC" },
					{ typeId: "sweater", color: "#1F3A5F" },
				]}
			/>,
		);
		// Then
		expect(
			[...markup.matchAll(/data-type-id="([^"]+)"/g)].map((m) => m[1]),
		).toEqual(["chino_p", "polo_l", "sweater"]);
	});
});
