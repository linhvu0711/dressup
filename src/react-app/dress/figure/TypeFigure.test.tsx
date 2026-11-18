import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { TypeFigure } from "./TypeFigure";

test("draws a jacket alone open", () => {
	// Given: a Harrington jacket and a wool jacket in #C9B38C
	// When
	const harrington = renderToStaticMarkup(
		<TypeFigure typeId="harrington" hex="#C9B38C" />,
	);
	const wool = renderToStaticMarkup(<TypeFigure typeId="wool" hex="#C9B38C" />);
	// Then: neither holds the closed front of its jacket
	expect({
		harringtonClosed: harrington.includes(
			"M 184 158 L 216 158 L 216 397 L 184 397 Z",
		),
		woolClosed: wool.includes("M 184.5 162 L 215.5 162 L 215.5 453"),
	}).toEqual({ harringtonClosed: false, woolClosed: false });
});
