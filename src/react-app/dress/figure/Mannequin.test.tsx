import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { Mannequin } from "@/dress/figure/Mannequin";
import { GARMENT_IDS, type GarmentId, type JacketId } from "@/dress/garments";

const paths = (markup: string) =>
	[...markup.matchAll(/ d="([^"]*)"/g)].map((m) => m[1]);

// The prototype's own drawing code, run as plain string functions, so the
// port can be held to it path by path.
function prototype() {
	const html = readFileSync(
		join(import.meta.dir, "../../../../docs/prototype/dressup.html"),
		"utf8",
	);
	const lines = html.split("\n");
	const from = lines.findIndex((l) => l.startsWith("let SKIN="));
	const to = lines.findIndex((l) => l.startsWith("const M=[];"));
	const code = lines.slice(from, to).join("\n");
	return new Function(`${code}; return { DRAW, bodySkin, shoes, head };`)() as {
		DRAW: Record<GarmentId, (c: string, open: boolean) => string>;
		bodySkin: () => string;
		shoes: () => string;
		head: () => string;
	};
}

function garmentGroup(markup: string, garment: GarmentId) {
	const start = markup.indexOf(`<g data-garment="${garment}"`);
	let depth = 0;
	const tag = /<(\/?)g[\s>]/g;
	tag.lastIndex = start;
	for (let m = tag.exec(markup); m; m = tag.exec(markup)) {
		depth += m[1] ? -1 : 1;
		if (depth === 0) return markup.slice(start, m.index);
	}
	throw new Error(`no group for ${garment}`);
}

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

	test.each(GARMENT_IDS.map((id) => [id]))(
		"draws each garment in the given colour (%s)",
		(id) => {
			// Given: one garment in the test colour
			// When
			const markup = renderToStaticMarkup(
				<Mannequin layers={[{ garment: id, color: "#12AB34" }]} />,
			);
			// Then
			expect(markup).toContain(`data-garment="${id}"`);
			expect(markup).toContain('fill="#12AB34"');
		},
	);

	test("draws a jacket closed unless it is named open", () => {
		// Given: a chore jacket and a padded jacket, each closed and open
		// When
		const draw = (garment: JacketId, color: `#${string}`, open: boolean) =>
			renderToStaticMarkup(
				<Mannequin
					layers={[{ garment, color }]}
					openJackets={open ? [garment] : []}
				/>,
			);
		const chore = [
			draw("chore", "#55633F", false),
			draw("chore", "#55633F", true),
		];
		const padded = [
			draw("padded", "#1B1B1F", false),
			draw("padded", "#1B1B1F", true),
		];
		// Then
		expect(chore[0]).toContain('data-front="closed"');
		expect(chore[0]).toContain("M 184.5 234 L 200 250 L 215.5 234");
		expect(chore[1]).toContain('data-front="open"');
		expect(chore[1]).not.toContain("M 184.5 234 L 200 250 L 215.5 234");
		expect(padded[0]).toContain('data-front="closed"');
		expect(padded[0]).toContain("M 187.5 137 L 212.5 137");
		expect(padded[1]).toContain('data-front="open"');
		expect(padded[1]).not.toContain("M 187.5 137 L 212.5 137");
	});

	test("paints the layers in the given order", () => {
		// Given: chino pants, a long polo, and a sweater, bottom layer first
		// When
		const markup = renderToStaticMarkup(
			<Mannequin
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

	test("draws the same paths as the prototype", () => {
		// Given: the prototype's drawing code
		const proto = prototype();
		const cases = GARMENT_IDS.flatMap((g): [GarmentId, boolean][] =>
			g === "chore" || g === "padded"
				? [
						[g, true],
						[g, false],
					]
				: [[g, false]],
		);
		// When
		const garments = cases.map(([g, open]) => {
			const port = renderToStaticMarkup(
				<Mannequin
					layers={[{ garment: g, color: "#12AB34" }]}
					openJackets={open && (g === "chore" || g === "padded") ? [g] : []}
				/>,
			);
			return {
				g,
				open,
				port: paths(garmentGroup(port, g)),
				proto: paths(proto.DRAW[g]("#12AB34", open)),
			};
		});
		const bare = renderToStaticMarkup(<Mannequin />);
		const body = paths(bare.slice(bare.indexOf("</defs>")));
		// Then
		for (const { g, open, port, proto: want } of garments) {
			expect({ g, open, d: port }).toEqual({ g, open, d: want });
		}
		expect(body).toEqual(
			paths(proto.bodySkin() + proto.shoes() + proto.head()),
		);
	});
});
