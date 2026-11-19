import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { type JacketId, TYPE_IDS } from "@/dress/clothing-types";
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
		// Given: a figure with no garments: its floor, shadows, body, and head
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
		"draws each garment in the given colour (%s)",
		(id) => {
			// Given: one garment in the test colour
			// When
			const markup = renderToStaticMarkup(
				<Mannequin
					{...STARTER_MANNEQUIN}
					layers={[{ garment: id, color: "#12AB34" }]}
				/>,
			);
			// Then
			expect(markup).toContain(`data-garment="${id}"`);
			expect(markup).toContain('fill="#12AB34"');
		},
	);

	test("draws a jacket closed unless it is named open", () => {
		// Given: a Harrington jacket in #C9B38C and a wool jacket in #A8865C,
		// each closed and open
		// When
		const draw = (garment: JacketId, color: `#${string}`, open: boolean) =>
			renderToStaticMarkup(
				<Mannequin
					{...STARTER_MANNEQUIN}
					layers={[{ garment, color }]}
					openJackets={open ? [garment] : []}
				/>,
			);
		const harrington = [
			draw("harrington", "#C9B38C", false),
			draw("harrington", "#C9B38C", true),
		];
		const wool = [
			draw("wool", "#A8865C", false),
			draw("wool", "#A8865C", true),
		];
		// Then
		expect(harrington[0]).toContain('data-front="closed"');
		expect(harrington[0]).toContain(
			"M 184 158 L 216 158 L 216 397 L 184 397 Z",
		);
		expect(harrington[1]).toContain('data-front="open"');
		expect(harrington[1]).not.toContain(
			"M 184 158 L 216 158 L 216 397 L 184 397 Z",
		);
		expect(wool[0]).toContain('data-front="closed"');
		expect(wool[0]).toContain("M 184.5 162 L 215.5 162 L 215.5 453");
		expect(wool[1]).toContain('data-front="open"');
		expect(wool[1]).not.toContain("M 184.5 162 L 215.5 162 L 215.5 453");
	});

	test("paints the layers in the given order", () => {
		// Given: chino pants, a long polo, and a sweater, bottom layer first
		// When
		const markup = renderToStaticMarkup(
			<Mannequin
				{...STARTER_MANNEQUIN}
				layers={[
					{ garment: "chino_p", color: "#C9B38C" },
					{ garment: "polo_l", color: "#F3F1EC" },
					{ garment: "sweater", color: "#1F3A5F" },
				]}
			/>,
		);
		// Then
		expect(
			[...markup.matchAll(/data-garment="([^"]+)"/g)].map((m) => m[1]),
		).toEqual(["chino_p", "polo_l", "sweater"]);
	});
});
