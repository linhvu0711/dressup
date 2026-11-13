import { createContext, type ReactNode, useContext, useId } from "react";
import type { Hex } from "@/dress/garments";

// Ported from docs/prototype/dressup.html:440-484. Path data and numbers stay
// as in the prototype, so the drawing matches it line for line.

type Figure = {
	prefix: string;
	lite: boolean;
	skin: Hex;
	hair: Hex;
};

export const FigureContext = createContext<Figure>({
	prefix: "f",
	lite: false,
	skin: "#D6A27B",
	hair: "#141418",
});

export const useFigure = () => useContext(FigureContext);

// Every figure has its own defs, so a page with many figures has no shared ids.
export function useUrl() {
	const { prefix } = useFigure();
	return (id: string) => `url(#${prefix}${id})`;
}

const MIR = "translate(400,0) scale(-1,1)";

export function Mir({ children }: { children: ReactNode }) {
	return <g transform={MIR}>{children}</g>;
}

export function both(node: ReactNode) {
	return (
		<>
			{node}
			<Mir>{node}</Mir>
		</>
	);
}

export function Sh({
	d,
	op = 0.2,
	b = 3,
}: {
	d: string;
	op?: number;
	b?: number;
}) {
	const url = useUrl();
	return <path d={d} fill="#07070F" opacity={op} filter={url(`b${b}`)} />;
}

export function Hl({
	d,
	op = 0.12,
	b = 3,
}: {
	d: string;
	op?: number;
	b?: number;
}) {
	const url = useUrl();
	return <path d={d} fill="#fff" opacity={op} filter={url(`b${b}`)} />;
}

function Stroke({
	d,
	color,
	op,
	w,
	b,
}: {
	d: string;
	color: string;
	op: number;
	w: number;
	b: number;
}) {
	const url = useUrl();
	return (
		<path
			d={d}
			fill="none"
			stroke={color}
			strokeWidth={w}
			strokeLinecap="round"
			opacity={op}
			filter={url(`b${b}`)}
		/>
	);
}

export function Shl({
	d,
	op = 0.16,
	w = 6,
	b = 3,
}: {
	d: string;
	op?: number;
	w?: number;
	b?: number;
}) {
	return <Stroke d={d} color="#07070F" op={op} w={w} b={b} />;
}

export function Hll({
	d,
	op = 0.1,
	w = 6,
	b = 3,
}: {
	d: string;
	op?: number;
	w?: number;
	b?: number;
}) {
	return <Stroke d={d} color="#fff" op={op} w={w} b={b} />;
}

export function Ln({
	d,
	op = 0.3,
	w = 1,
	dash,
}: {
	d: string;
	op?: number;
	w?: number;
	dash?: string;
}) {
	return (
		<path
			d={d}
			fill="none"
			stroke="#0A0A14"
			strokeWidth={w}
			opacity={op}
			strokeLinecap="round"
			strokeDasharray={dash || undefined}
		/>
	);
}

export function Cyl({
	x,
	y,
	w,
	h,
	op = 1,
}: {
	x: number;
	y: number;
	w: number;
	h: number;
	op?: number;
}) {
	const url = useUrl();
	return (
		<rect x={x} y={y} width={w} height={h} fill={url("cyl")} opacity={op} />
	);
}

export function Btn({ x, y, r = 3 }: { x: number; y: number; r?: number }) {
	return (
		<>
			<circle cx={x} cy={y + 0.8} r={r} fill="#000" opacity=".25" />
			<circle
				cx={x}
				cy={y}
				r={r}
				fill="#EDEAE4"
				stroke="rgba(0,0,0,.45)"
				strokeWidth=".7"
			/>
			<circle cx={x - 0.9} cy={y} r=".5" fill="#555" />
			<circle cx={x + 0.9} cy={y} r=".5" fill="#555" />
		</>
	);
}

type PieceOptions = { grain?: false | number; stroke?: string };

// One garment piece: flat exact colour, shading clipped to the shape, fabric
// grain, and a soft edge.
export function Piece({
	d,
	fill,
	children,
	opt = {},
}: {
	d: string;
	fill: string;
	children?: ReactNode;
	opt?: PieceOptions;
}) {
	const { lite } = useFigure();
	const url = useUrl();
	const clip = useId();
	return (
		<>
			<clipPath id={clip}>
				<path d={d} />
			</clipPath>
			<g clipPath={`url(#${clip})`}>
				<rect width="400" height="820" fill={fill} />
				{children}
				{opt.grain === false || lite ? null : (
					<rect
						width="400"
						height="820"
						filter={url("grain")}
						style={{ mixBlendMode: "soft-light" }}
						opacity={opt.grain || 0.16}
					/>
				)}
			</g>
			<path
				d={d}
				fill="none"
				stroke={opt.stroke || "rgba(8,8,16,.36)"}
				strokeWidth="1"
				strokeLinejoin="round"
			/>
		</>
	);
}

export function Arm({ children }: { children: ReactNode }) {
	return <g transform="rotate(-3.4 130 178)">{children}</g>;
}

export function Layer({ children }: { children: ReactNode }) {
	const url = useUrl();
	return <g filter={url("lay")}>{children}</g>;
}

export function scallop(
	pts: readonly (readonly [number, number])[],
	b: number,
) {
	let s = "";
	for (let i = 1; i < pts.length; i++) {
		const [x0, y0] = pts[i - 1];
		const [x1, y1] = pts[i];
		const dx = x1 - x0;
		const dy = y1 - y0;
		const L = Math.hypot(dx, dy);
		s += ` Q ${((x0 + x1) / 2 + (dy / L) * b).toFixed(1)} ${((y0 + y1) / 2 - (dx / L) * b).toFixed(1)} ${x1} ${y1}`;
	}
	return s;
}

const BOX = {
	filterUnits: "userSpaceOnUse",
	x: "0",
	y: "0",
	width: "400",
	height: "820",
} as const;

export function Defs() {
	const { prefix } = useFigure();
	const id = (name: string) => `${prefix}${name}`;
	return (
		<defs>
			<filter id={id("b2")} {...BOX}>
				<feGaussianBlur stdDeviation="1.6" />
			</filter>
			<filter id={id("b3")} {...BOX}>
				<feGaussianBlur stdDeviation="3" />
			</filter>
			<filter id={id("b5")} {...BOX}>
				<feGaussianBlur stdDeviation="6" />
			</filter>
			<filter
				id={id("b14")}
				filterUnits="userSpaceOnUse"
				x="-300"
				y="-100"
				width="1000"
				height="1100"
			>
				<feGaussianBlur stdDeviation="18" />
			</filter>
			<filter id={id("lay")} {...BOX}>
				<feDropShadow
					dx="0"
					dy="2.5"
					stdDeviation="2.6"
					floodColor="#000"
					floodOpacity=".3"
				/>
			</filter>
			<filter id={id("grain")} {...BOX}>
				<feTurbulence
					type="fractalNoise"
					baseFrequency="1.3"
					numOctaves="2"
					seed="4"
				/>
				<feColorMatrix
					type="matrix"
					values="1 0 0 0 0  1 0 0 0 0  1 0 0 0 0  0 0 0 0 1"
				/>
				<feComponentTransfer>
					<feFuncR type="linear" slope="2.4" intercept="-.7" />
					<feFuncG type="linear" slope="2.4" intercept="-.7" />
					<feFuncB type="linear" slope="2.4" intercept="-.7" />
				</feComponentTransfer>
			</filter>
			<linearGradient id={id("cyl")} x1="0" x2="1" y1="0" y2="0">
				<stop offset="0" stopColor="#05050C" stopOpacity=".27" />
				<stop offset=".2" stopColor="#05050C" stopOpacity=".08" />
				<stop offset=".36" stopColor="#fff" stopOpacity=".05" />
				<stop offset=".5" stopColor="#fff" stopOpacity=".09" />
				<stop offset=".64" stopColor="#fff" stopOpacity=".05" />
				<stop offset=".8" stopColor="#05050C" stopOpacity=".08" />
				<stop offset="1" stopColor="#05050C" stopOpacity=".27" />
			</linearGradient>
			<linearGradient id={id("floor")} x1="0" x2="0" y1="0" y2="1">
				<stop offset="0" stopColor="#5E5B58" />
				<stop offset="1" stopColor="#403E3C" />
			</linearGradient>
			<pattern
				id={id("knit")}
				width="4"
				height="4"
				patternUnits="userSpaceOnUse"
			>
				<path
					d="M0 .5 L2 3.5 L4 .5"
					stroke="#000"
					strokeOpacity=".13"
					fill="none"
					strokeWidth=".8"
				/>
				<path
					d="M0 0 L2 3 L4 0"
					stroke="#fff"
					strokeOpacity=".06"
					fill="none"
					strokeWidth=".6"
				/>
			</pattern>
			<pattern
				id={id("rib")}
				width="4"
				height="4"
				patternUnits="userSpaceOnUse"
			>
				<rect width="1.7" height="4" fill="#000" fillOpacity=".24" />
				<rect x="2.2" width="1" height="4" fill="#fff" fillOpacity=".1" />
			</pattern>
			<pattern
				id={id("twill")}
				width="5"
				height="5"
				patternUnits="userSpaceOnUse"
				patternTransform="rotate(45)"
			>
				<rect width="1" height="5" fill="#000" fillOpacity=".035" />
			</pattern>
		</defs>
	);
}
