import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Mannequin } from "@/dress/figure/Mannequin";

describe("Mannequin", () => {
	test("draws the skin, hair, and white shoes", () => {
		// Given: no props
		// When
		const markup = renderToStaticMarkup(<Mannequin />);
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
				<Mannequin />
				<Mannequin />
			</>,
		);
		const ids = [...markup.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
		// Then
		expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([]);
	});
});
