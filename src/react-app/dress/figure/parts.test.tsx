import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Piece } from "@/dress/figure/parts";

describe("Piece", () => {
	test("draws no grain for a grain of 0", () => {
		// Given: a piece outside a figure, so the figure default holds, with a
		// grain of 0
		// When
		const markup = renderToStaticMarkup(
			<Piece d="M 0 0 L 10 0 L 10 10 Z" fill="#12AB34" opt={{ grain: 0 }} />,
		);
		// Then
		expect(markup).toContain('style="mix-blend-mode:soft-light" opacity="0"');
	});
});
