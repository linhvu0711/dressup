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
	// Then: the Harrington facing and the wool lapel show only when open
	expect({
		harringtonFacing: harrington.includes(
			"M 181 176 L 186 176 L 186 397 L 183 397 Z",
		),
		woolLapel: wool.includes("M 175 147 L 153 166 L 165 226 L 187 210"),
	}).toEqual({ harringtonFacing: true, woolLapel: true });
});
