import { type ReactNode, useId } from "react";
import { ArmsSkin } from "@/dress/figure/body";
import {
	arm,
	both,
	btn,
	cyl,
	f,
	fabric,
	hl,
	hll,
	layer,
	ln,
	piece,
	scallop,
	sh,
	shl,
	useUrl,
} from "@/dress/figure/parts";
import type { GarmentId, Hex } from "@/dress/garments";

// Ported from docs/prototype/dressup.html:533-713, path by path. The test
// "draws the same paths as the prototype" holds each garment to it.

const SL_SHORT =
	"M 126 172 C 110 177, 100 196, 99 222 C 98 238, 98 252, 96 266 L 138 275 C 139 258, 140 240, 139 222 C 134 208, 129 190, 126 172 Z";
const SL_LONG =
	"M 126 172 C 110 177, 100 196, 99 222 C 98 252, 95 282, 92 308 C 88 334, 86 362, 86 392 L 87 419 L 118 422 C 120 396, 124 368, 127 342 C 129 324, 131 312, 134 296 C 137 272, 139 248, 139 222 C 134 208, 129 190, 126 172 Z";
const torso = (neck: string) =>
	`M 177 158 ${neck} L 276 174 C 271 192, 266 210, 262 224 C 259 262, 257 300, 258 340 C 259 362, 262 384, 265 402 C 240 406, 160 406, 135 402 C 138 384, 141 362, 142 340 C 143 300, 141 262, 138 224 C 134 210, 129 192, 124 174 Z`;
const HEM = "M 137 397 C 160 401, 240 401, 263 397";

function PatternPath({ d, name }: { d: string; name: "rib" }) {
	const url = useUrl();
	return <path d={d} fill={url(name)} />;
}

// folds on the body
const torsoShade = () =>
	f(
		cyl(124, 150, 152, 280, 0.7),
		both(
			f(
				shl("M 148 250 C 164 264, 186 264, 199 252", 0.07, 12, 5),
				shl("M 140 232 C 148 250, 158 262, 172 268", 0.11, 5, 3),
				shl("M 146 352 C 158 360, 174 360, 188 354", 0.07, 6, 3),
				shl("M 143 378 C 156 384, 170 384, 182 380", 0.06, 5, 3),
				hll("M 152 214 C 164 206, 180 206, 192 214", 0.1, 14, 5),
			),
		),
	);

// The long sleeve body, shared by the long tee, the long polo, and the long
// button-up, which each finish the cuff in their own way.
const longSleevePiece = (c: Hex, extra?: ReactNode) =>
	piece(
		SL_LONG,
		c,
		f(
			cyl(84, 172, 58, 252, 0.9),
			shl("M 96 300 C 106 308, 118 310, 131 302", 0.14, 4, 3),
			shl("M 95 318 C 104 324, 114 326, 126 322", 0.1, 4, 3),
			shl("M 104 232 C 114 240, 126 242, 137 238", 0.1, 5, 3),
			shl("M 90 380 C 98 386, 108 388, 118 384", 0.1, 4, 3),
			extra,
		),
	);

function longSleeve(c: Hex, kind: "plain" | "rib") {
	const rib = kind === "rib";
	return both(
		arm(
			f(
				longSleevePiece(
					c,
					rib ? (
						<PatternPath
							d="M 85 405 L 121 408 L 119 423 L 85 420 Z"
							name="rib"
						/>
					) : null,
				),
				ln(`M 86.5 ${rib ? 405 : 412} L 119.5 ${rib ? 408 : 415}`, 0.28, 0.9),
			),
		),
	);
}

function shortSleeve(c: Hex) {
	return f(
		<ArmsSkin />,
		both(
			arm(
				f(
					piece(
						SL_SHORT,
						c,
						f(
							cyl(95, 172, 46, 104, 0.9),
							shl("M 104 232 C 114 240, 126 242, 137 238", 0.1, 5, 3),
						),
					),
					ln("M 97 260 L 138 269", 0.28, 0.9),
				),
			),
		),
	);
}

function pants(c: Hex) {
	return both(
		f(
			piece(
				"M 138 376 L 200 376 L 200 414 C 199 470, 198 530, 197 580 C 196 640, 195 700, 194 753 L 141 753 C 141 700, 140 640, 140 580 C 139 530, 136 470, 135 420 Z",
				c,
				f(
					cyl(135, 376, 65, 378, 0.9),
					fabric("twill"),
					hll("M 168 446 C 170 540, 170 660, 168 748", 0.1, 3, 2),
					shl("M 198 424 C 186 432, 172 436, 156 438", 0.17, 5, 3),
					shl("M 198 442 C 188 452, 176 458, 160 460", 0.11, 5, 3),
					shl("M 146 566 C 158 576, 180 576, 194 566", 0.14, 5, 3),
					shl("M 145 590 C 158 598, 178 598, 194 588", 0.09, 4, 3),
					shl("M 145 718 C 158 730, 180 730, 192 720", 0.2, 5, 2),
					shl("M 144 700 C 158 710, 178 710, 192 702", 0.13, 4, 2),
					shl("M 146 684 C 158 690, 176 690, 190 684", 0.07, 4, 2),
				),
			),
			ln("M 141 746 L 194 746", 0.28, 0.9),
		),
	);
}

function tee(c: Hex, long: boolean) {
	return layer(
		f(
			piece(
				torso("C 184 172, 192 179, 200 179 C 208 179, 216 172, 223 158"),
				c,
				torsoShade(),
			),
			<path
				d="M 177 161 C 184 175, 192 182, 200 182 C 208 182, 216 175, 223 161"
				fill="none"
				stroke="#000"
				strokeOpacity=".16"
				strokeWidth="5.5"
			/>,
			ln(
				"M 174 164 C 182 180, 191 187, 200 187 C 209 187, 218 180, 226 164",
				0.3,
				0.9,
			),
			ln(HEM, 0.25, 0.9),
			long ? longSleeve(c, "plain") : shortSleeve(c),
		),
	);
}

function polo(c: Hex, long: boolean) {
	return layer(
		f(
			piece(
				torso("L 200 186 L 223 158"),
				c,
				f(torsoShade(), fabric("knit", 0.6)),
			),
			<path
				d="M 193.5 186 L 206.5 186 L 206.5 232 L 193.5 232 Z"
				fill={c}
				stroke="rgba(12,12,22,.4)"
				strokeWidth="1"
			/>,
			btn(200, 200, 2.6),
			btn(200, 219, 2.6),
			both(
				piece(
					"M 181 148 C 176 155, 172 161, 170 167 L 184 195 L 200 184 C 192 174, 185 162, 181 148 Z",
					c,
					f(
						fabric("rib", 0.5),
						hl("M 172 160 L 186 190 L 180 192 L 168 166 Z", 0.1, 2),
					),
				),
			),
			ln(HEM, 0.25, 0.9),
			long
				? longSleeve(c, "rib")
				: f(
						<ArmsSkin />,
						both(
							arm(
								f(
									piece(
										SL_SHORT,
										c,
										f(
											cyl(95, 172, 46, 104, 0.9),
											<PatternPath
												d="M 96 256 L 138 265 L 138 276 L 95 267 Z"
												name="rib"
											/>,
										),
									),
									ln("M 97 257 L 138 266", 0.3, 0.9),
								),
							),
						),
					),
		),
	);
}

function shirt(c: Hex, short: boolean) {
	const buttons: ReactNode[] = [];
	for (let y = 206; y < 410; y += 36) buttons.push(btn(200, y, 2.7));
	return layer(
		f(
			piece(
				"M 178 156 L 200 188 L 222 156 L 276 174 C 271 192, 266 210, 262 224 C 259 262, 257 300, 258 340 C 259 362, 263 384, 265 398 C 252 414, 225 421, 200 421 C 175 421, 148 414, 135 398 C 137 384, 141 362, 142 340 C 143 300, 141 262, 138 224 C 134 210, 129 192, 124 174 Z",
				c,
				f(
					torsoShade(),
					sh("M 206 188 L 212 188 L 212 421 L 206 421 Z", 0.12, 2),
				),
			),
			ln("M 193.5 190 L 193.5 420", 0.3, 0.9),
			ln("M 206.5 190 L 206.5 420", 0.35, 0.9),
			...buttons,
			<path
				d="M 226 238 L 252 238 L 252 263 L 239 271 L 226 263 Z"
				fill="#000"
				fillOpacity=".03"
				stroke="rgba(12,12,22,.4)"
				strokeWidth="1"
			/>,
			ln(
				"M 137 394 C 150 409, 176 416, 200 416 C 224 416, 250 409, 263 394",
				0.22,
				0.9,
			),
			both(
				piece(
					"M 181 147 C 176 154, 173 161, 171 168 L 187 204 L 200 187 C 192 176, 186 163, 181 147 Z",
					c,
					f(
						hl("M 173 164 L 188 198 L 183 200 L 170 168 Z", 0.12, 2),
						sh("M 184 152 L 200 186 L 196 190 L 180 158 Z", 0.1, 2),
					),
				),
			),
			short
				? shortSleeve(c)
				: both(
						arm(
							f(
								longSleevePiece(c),
								piece(
									"M 86 404 L 120 407 L 118 427 L 86 424 Z",
									c,
									cyl(86, 404, 34, 24, 0.9),
								),
								btn(111, 416, 2.2),
							),
						),
					),
		),
	);
}

const NECK =
	"M 176 161 C 183 180, 191 191, 200 191 C 209 191, 217 180, 224 161";

function SweaterNeck({ c }: { c: Hex }) {
	const url = useUrl();
	const clip = useId();
	return (
		<>
			<clipPath id={clip}>
				<path d="M 170 150 L 230 150 L 230 200 L 170 200 Z" />
			</clipPath>
			<g clipPath={`url(#${clip})`}>
				<path d={NECK} fill="none" stroke={c} strokeWidth="8.5" />
				<path d={NECK} fill="none" stroke={url("rib")} strokeWidth="8.5" />
			</g>
		</>
	);
}

function sweater(c: Hex) {
	const SL =
		"M 125 170 C 107 175, 96 195, 95 222 C 94 252, 91 282, 88 308 C 84 334, 82 362, 82 392 L 83 409 L 121 412 C 123 392, 127 368, 130 342 C 132 324, 134 312, 137 296 C 140 272, 142 248, 142 222 C 137 208, 131 190, 125 170 Z";
	return layer(
		f(
			piece(
				"M 174 158 C 181 177, 190 187, 200 187 C 210 187, 219 177, 226 158 L 279 172 C 274 192, 269 210, 265 224 C 262 262, 261 300, 262 340 C 263 362, 265 380, 266 394 L 263 411 C 240 415, 160 415, 137 411 L 134 394 C 135 380, 137 362, 138 340 C 139 300, 138 262, 135 224 C 131 210, 126 192, 121 172 Z",
				c,
				f(
					cyl(121, 150, 158, 270, 0.75),
					fabric("knit"),
					both(
						f(
							shl("M 146 252 C 164 268, 186 268, 199 254", 0.1, 13, 5),
							shl("M 138 234 C 148 254, 160 266, 174 272", 0.13, 6, 3),
							shl("M 142 372 C 152 382, 166 386, 180 384", 0.14, 7, 3),
							shl("M 144 350 C 156 358, 170 360, 184 356", 0.09, 6, 3),
							hll("M 150 214 C 164 205, 180 205, 194 214", 0.1, 15, 5),
						),
					),
					<PatternPath
						d="M 134 393 C 160 397, 240 397, 266 393 L 263 412 C 240 416, 160 416, 137 412 Z"
						name="rib"
					/>,
					sh(
						"M 133 386 C 160 392, 240 392, 267 386 L 267 396 C 240 400, 160 400, 133 396 Z",
						0.18,
						2,
					),
				),
				{ grain: 0.12 },
			),
			ln("M 134 393.5 C 160 397.5, 240 397.5, 266 393.5", 0.3, 0.9),
			<SweaterNeck c={c} />,
			ln(
				"M 174 158 C 181 177, 190 187, 200 187 C 210 187, 219 177, 226 158",
				0.4,
				1,
			),
			ln(
				"M 172.5 165 C 180 185, 190 195.5, 200 195.5 C 210 195.5, 220 185, 227.5 165",
				0.35,
				1,
			),
			both(
				arm(
					f(
						piece(
							SL,
							c,
							f(
								cyl(80, 170, 64, 244, 0.95),
								fabric("knit"),
								shl("M 92 298 C 104 308, 118 310, 134 302", 0.16, 6, 3),
								shl("M 90 322 C 100 330, 114 332, 128 326", 0.11, 5, 3),
								shl("M 86 384 C 96 394, 108 396, 122 390", 0.16, 6, 3),
								shl("M 102 232 C 114 242, 128 244, 140 238", 0.1, 6, 3),
							),
							{ grain: 0.12 },
						),
						piece(
							"M 84 406 L 122 409 L 119 429 L 86 426 Z",
							c,
							f(
								fabric("rib", undefined, "rotate(4 100 416)"),
								cyl(84, 406, 38, 24, 0.9),
							),
							{ grain: 0.1 },
						),
					),
				),
			),
		),
	);
}

const CHORE_BUTTONS = [262, 306, 350, 394];

function chore(c: Hex, closed: boolean) {
	const SL =
		"M 124 167 C 104 172, 92 194, 91 222 C 90 252, 87 282, 84 308 C 80 334, 77 362, 77 392 L 78 429 L 124 433 C 126 400, 130 370, 133 342 C 135 324, 137 312, 140 296 C 143 272, 145 248, 145 222 C 140 208, 132 188, 124 167 Z";
	const PN =
		"M 172 156 L 118 170 C 124 192, 130 210, 134 226 C 132 280, 131 340, 131 380 L 130 429 C 150 433, 170 434, 185 433 L 185 240 C 184 220, 180 196, 172 156 Z";
	return layer(
		f(
			both(
				f(
					piece(
						PN,
						c,
						f(
							cyl(118, 150, 150, 290, 0.7),
							fabric("twill"),
							shl("M 136 236 C 144 258, 154 272, 168 280", 0.13, 6, 3),
							shl("M 134 330 C 146 340, 160 342, 176 338", 0.08, 7, 4),
							hll("M 150 200 C 160 194, 172 194, 180 200", 0.08, 14, 5),
							sh("M 176 240 L 186 240 L 186 434 L 176 434 Z", 0.12, 3),
						),
					),
					ln("M 181 244 L 181 429", 0.3, 0.8, "2.5 2"),
					ln(
						"M 133 424.5 C 150 428.5, 170 429.5, 184 428.5",
						0.3,
						0.8,
						"2.5 2",
					),
					<path
						d="M 140 352 L 176 352 L 176 414 L 140 414 Z"
						fill="#000"
						fillOpacity=".04"
						stroke="rgba(12,12,22,.45)"
						strokeWidth="1"
					/>,
					ln(
						"M 142.5 354.5 L 173.5 354.5 M 142.5 354.5 L 142.5 411.5 L 173.5 411.5 L 173.5 354.5",
						0.28,
						0.8,
						"2.5 2",
					),
					sh("M 140 414 L 176 414 L 176 419 L 140 419 Z", 0.18, 2),
				),
			),
			<path
				d="M 230 252 L 260 252 L 260 292 L 230 292 Z"
				fill="#000"
				fillOpacity=".04"
				stroke="rgba(12,12,22,.45)"
				strokeWidth="1"
			/>,
			ln(
				"M 232.5 254.5 L 257.5 254.5 M 232.5 254.5 L 232.5 289.5 L 257.5 289.5 L 257.5 254.5",
				0.28,
				0.8,
				"2.5 2",
			),
			...(closed
				? []
				: CHORE_BUTTONS.map((y) =>
						f(btn(221, y, 3.2), ln(`M 172 ${y} L 180 ${y}`, 0.45, 1.4)),
					)),
			both(
				f(
					piece(
						"M 174 149 L 159 166 L 169 218 L 186 207 C 182 190, 178 170, 174 149 Z",
						c,
						f(
							fabric("twill"),
							hl("M 162 168 L 171 212 L 166 214 L 158 170 Z", 0.1, 2),
							sh("M 176 156 L 186 204 L 181 208 L 172 160 Z", 0.1, 2),
						),
					),
					ln("M 162.5 168 L 171 213 L 183 205", 0.28, 0.8, "2.5 2"),
				),
			),
			both(
				arm(
					f(
						piece(
							SL,
							c,
							f(
								cyl(75, 167, 72, 268, 0.95),
								fabric("twill"),
								shl("M 88 298 C 102 310, 118 312, 137 302", 0.17, 6, 3),
								shl("M 86 324 C 98 332, 114 334, 130 328", 0.11, 5, 3),
								shl("M 80 388 C 92 398, 108 400, 124 394", 0.12, 5, 3),
								shl("M 100 230 C 112 242, 128 246, 143 240", 0.1, 6, 3),
							),
						),
						ln("M 78 411 L 125 415", 0.38, 1),
						ln("M 78 414.5 L 125 418.5", 0.2, 0.8, "2.5 2"),
						btn(117, 424, 2.4),
					),
				),
			),
		),
	);
}

function choreX(c: Hex, closed: boolean) {
	if (!closed) return chore(c, closed);
	return f(
		chore(c, closed),
		piece(
			"M 184.5 234 L 200 250 L 215.5 234 L 215.5 433.6 C 206 434.4, 194 434.4, 184.5 433.6 Z",
			c,
			f(cyl(118, 150, 164, 290, 0.7), fabric("twill")),
		),
		ln("M 207.5 243 L 207.5 432", 0.4, 1),
		ln("M 204 247 L 204 430", 0.25, 0.8, "2.5 2"),
		ln("M 185 428.5 L 215 428.5", 0.3, 0.8, "2.5 2"),
		...CHORE_BUTTONS.map((y) => btn(200, y, 3.2)),
	);
}

type Point = readonly [number, number];

function padded(c: Hex) {
	const oP: Point[] = [
		[122, 164],
		[100, 192],
		[89, 224],
		[86, 256],
		[83, 288],
		[80, 320],
		[77, 352],
		[75, 384],
		[74, 416],
	];
	const iP: Point[] = [
		[126, 438],
		[129, 404],
		[133, 370],
		[137, 336],
		[141, 302],
		[145, 268],
		[148, 234],
	];
	const SL = `M 122 164 ${scallop(oP, -4.5)} L 77 434 L 126 438 ${scallop(iP, -2.5)} C 143 212, 133 188, 122 164 Z`;
	const sP: Point[] = [
		[131, 230],
		[128, 258],
		[127, 286],
		[127, 314],
		[127, 342],
		[127, 370],
		[128, 398],
		[129, 426],
	];
	const PN = `M 170 158 L 114 166 C 122 190, 128 210, 131 230 ${scallop(sP, -4)} C 150 431, 172 432, 188 431 L 188 210 C 186 190, 180 172, 170 158 Z`;
	const seam = (d: string, dx = 0, dy = 13) =>
		f(
			shl(d, 0.3, 7, 3),
			ln(d, 0.55, 1.1),
			hll(
				d.replace(
					/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g,
					(_m, x, y) => `${(+x + dx).toFixed(1)} ${(+y + dy).toFixed(1)}`,
				),
				0.11,
				9,
				3,
			),
		);
	const sleeveSeams = (
		[
			[
				[100, 192],
				[140, 204],
			],
			[
				[89, 224],
				[148, 234],
			],
			[
				[86, 256],
				[145, 268],
			],
			[
				[83, 288],
				[141, 302],
			],
			[
				[80, 320],
				[137, 336],
			],
			[
				[77, 352],
				[133, 370],
			],
			[
				[75, 384],
				[129, 404],
			],
			[
				[74, 416],
				[127, 424],
			],
		] as const
	).map(([a, b]) =>
		seam(
			`M ${a[0]} ${a[1]} Q ${(a[0] + b[0]) / 2} ${(a[1] + b[1]) / 2 + 4} ${b[0]} ${b[1]}`,
		),
	);
	const panelSeams = [202, 230, 258, 286, 314, 342, 370, 398].map((y) =>
		seam(`M 112 ${y} Q 156 ${y + 4} 190 ${y + 1}`),
	);
	return layer(
		f(
			both(
				f(
					piece(
						PN,
						c,
						f(
							cyl(112, 150, 176, 290, 0.75),
							...panelSeams,
							sh("M 178 200 L 190 200 L 190 434 L 178 434 Z", 0.14, 3),
						),
						{ grain: 0.1 },
					),
					<path d="M 188 139 L 188 431" stroke="#8E8E96" strokeWidth="1.6" />,
					ln("M 184 210 L 184 430", 0.3, 0.8),
				),
			),
			both(
				piece(
					"M 168 162 C 163 150, 164 138, 169 129 C 175 133, 182 136, 189 137 C 187 158, 187 182, 188 210 C 180 194, 173 178, 168 162 Z",
					c,
					f(cyl(162, 129, 30, 82, 0.9), seam("M 164 150 Q 176 156 189 158")),
					{ grain: 0.1 },
				),
			),
			<rect
				x="209.5"
				y="214"
				width="5"
				height="12"
				rx="2"
				fill="#9A9AA2"
				stroke="rgba(0,0,0,.4)"
				strokeWidth=".6"
			/>,
			both(
				arm(
					f(
						piece(SL, c, f(cyl(70, 164, 82, 276, 1), ...sleeveSeams), {
							grain: 0.1,
						}),
						piece(
							"M 77 420 L 127 425 L 126 439 L 77 435 Z",
							c,
							fabric("rib", undefined, "rotate(5 100 430)"),
							{ grain: 0.1 },
						),
					),
				),
			),
		),
	);
}

function paddedX(c: Hex, closed: boolean) {
	if (!closed) return padded(c);
	const seams = [158, 203, 231, 259, 287, 315, 343, 371, 399].map((y) =>
		f(
			shl(`M 186 ${y} L 214 ${y}`, 0.3, 7, 3),
			ln(`M 186 ${y} L 214 ${y}`, 0.55, 1.1),
		),
	);
	return f(
		padded(c),
		piece(
			"M 187.5 137 L 212.5 137 L 212.5 431.3 L 187.5 431.3 Z",
			c,
			f(cyl(112, 150, 176, 290, 0.75), ...seams),
			{ grain: 0.1 },
		),
		<path d="M 200 138 L 200 431" stroke="#8E8E96" strokeWidth="1.6" />,
		<rect
			x="197.5"
			y="146"
			width="5"
			height="12"
			rx="2"
			fill="#9A9AA2"
			stroke="rgba(0,0,0,.4)"
			strokeWidth=".6"
		/>,
	);
}

// training tee: same cut, with seams from the neck to the armpit and down the side
function ttee(c: Hex, long: boolean) {
	return f(
		tee(c, long),
		both(
			f(
				ln("M 179 161 C 163 178, 148 200, 139 225", 0.34, 1),
				ln("M 147 250 C 144 300, 145 350, 147 398", 0.2, 0.9),
			),
		),
	);
}

function chinoShorts(c: Hex) {
	return both(
		f(
			piece(
				"M 138 376 L 200 376 L 200 414 C 199 450, 199 500, 198 551 L 139 547 C 139 510, 137 460, 136 420 Z",
				c,
				f(
					cyl(136, 376, 64, 178, 0.9),
					fabric("twill"),
					hll("M 168 440 C 169 480, 169 520, 168 546", 0.1, 3, 2),
					shl("M 198 424 C 186 434, 172 438, 156 438", 0.16, 5, 3),
					shl("M 198 446 C 188 456, 174 460, 160 460", 0.1, 5, 3),
				),
			),
			ln("M 139 540 L 198 544", 0.3, 0.8, "2.5 2"),
		),
	);
}

function casualShorts(c: Hex) {
	return both(
		f(
			piece(
				"M 138 376 L 200 376 L 200 414 C 200 450, 200 490, 199 531 L 132 526 C 132 498, 132 460, 134 420 Z",
				c,
				f(
					cyl(132, 376, 68, 160, 0.9),
					shl("M 198 424 C 186 434, 172 438, 156 438", 0.16, 5, 3),
					shl("M 198 446 C 188 456, 174 460, 160 460", 0.1, 5, 3),
					shl("M 140 480 C 148 496, 150 510, 148 524", 0.1, 5, 3),
					shl("M 176 470 C 180 490, 180 508, 178 524", 0.07, 5, 3),
					sh("M 132 519 L 200 524 L 200 536 L 132 531 Z", 0.12, 3),
				),
			),
			ln("M 132 520 L 199 525", 0.3, 0.9),
		),
	);
}

function casualPants(c: Hex) {
	return both(
		f(
			piece(
				"M 138 376 L 200 376 L 200 414 C 200 470, 199 530, 199 580 C 198 640, 198 700, 197 755 L 134 755 C 134 700, 133 640, 133 580 C 133 530, 132 470, 133 420 Z",
				c,
				f(
					cyl(132, 376, 68, 380, 0.9),
					shl("M 198 424 C 186 432, 172 436, 156 438", 0.15, 5, 3),
					shl("M 198 444 C 188 454, 176 458, 160 460", 0.1, 5, 3),
					shl("M 140 560 C 156 572, 182 572, 197 560", 0.12, 6, 3),
					shl("M 138 640 C 156 650, 180 650, 197 640", 0.08, 6, 3),
					shl("M 138 724 C 156 736, 182 736, 197 726", 0.18, 5, 2),
					shl("M 138 704 C 156 714, 180 714, 197 706", 0.11, 4, 2),
				),
			),
			ln("M 134 748 L 197 748", 0.28, 0.9),
		),
	);
}

function trainPants(c: Hex) {
	return both(
		f(
			piece(
				"M 138 376 L 200 376 L 200 414 C 199 470, 197 530, 195 580 C 193 640, 191 690, 190 738 L 146 738 C 146 690, 143 640, 141 580 C 139 530, 136 470, 135 420 Z",
				c,
				f(
					cyl(135, 376, 65, 364, 0.9),
					hll("M 150 440 C 152 540, 154 650, 156 734", 0.12, 3, 2),
					shl("M 198 424 C 186 432, 172 436, 156 438", 0.15, 5, 3),
					shl("M 146 566 C 158 576, 180 576, 194 566", 0.13, 5, 3),
					shl("M 148 716 C 158 726, 178 726, 190 718", 0.2, 5, 2),
					shl("M 147 698 C 158 706, 176 706, 190 700", 0.12, 4, 2),
				),
				{ grain: false },
			),
			piece(
				"M 146 734 L 190 734 L 189 754 L 147 754 Z",
				c,
				f(fabric("rib"), cyl(146, 734, 44, 20, 0.9)),
				{ grain: false },
			),
		),
	);
}

function trainShorts(c: Hex) {
	return both(
		f(
			piece(
				"M 138 376 L 200 376 L 200 414 C 199.5 440, 199 470, 198.5 501 L 133 495 C 133 470, 133 445, 135 420 Z",
				c,
				f(
					cyl(133, 376, 67, 128, 0.9),
					hll("M 146 430 C 147 455, 147 475, 146 494", 0.12, 3, 2),
					shl("M 198 424 C 186 434, 172 438, 156 438", 0.14, 5, 3),
					sh("M 133 489 L 200 494 L 200 506 L 133 500 Z", 0.12, 3),
				),
				{ grain: false },
			),
			ln("M 133 489 L 198 495", 0.3, 0.9),
			ln("M 137 478 L 139 495", 0.4, 1),
		),
	);
}

// `DRAW` of the prototype. Its jackets take "closed", so `open` is turned
// around here, as the prototype does.
export const GARMENT_DRAWINGS: Record<
	GarmentId,
	(c: Hex, open: boolean) => ReactNode
> = {
	tee_s: (c) => tee(c, false),
	tee_l: (c) => tee(c, true),
	polo_s: (c) => polo(c, false),
	polo_l: (c) => polo(c, true),
	shirt_s: (c) => shirt(c, true),
	shirt_l: (c) => shirt(c, false),
	sweater: (c) => sweater(c),
	chore: (c, open) => choreX(c, !open),
	padded: (c, open) => paddedX(c, !open),
	ttee_s: (c) => ttee(c, false),
	ttee_l: (c) => ttee(c, true),
	chino_sh: (c) => layer(chinoShorts(c)),
	chino_p: (c) => layer(pants(c)),
	casual_sh: (c) => layer(casualShorts(c)),
	casual_p: (c) => layer(casualPants(c)),
	train_sh: (c) => layer(trainShorts(c)),
	train_p: (c) => layer(trainPants(c)),
};
