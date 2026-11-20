import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { MannequinPlaceholder } from "@/dress/figure/MannequinPlaceholder";

describe("MannequinPlaceholder", () => {
	test("draws a still shape with no label when it is not loading", () => {
		// Given: none
		// When
		const markup = renderToStaticMarkup(
			<MannequinPlaceholder loading={false} />,
		);
		// Then
		expect(markup).toContain('aria-hidden="true"');
		expect(markup).not.toContain('aria-label="Loading"');
		expect(markup).not.toContain("animate-placeholder");
	});
});
