import { type ReactNode, useId } from "react";
import type { Hex } from "@/dress/clothing-types";
import { Defs, FigureContext } from "@/dress/figure/parts";

// The svg of one figure with its own defs, so a page with many figures has no
// shared ids. Children read the prefix through FigureContext (useUrl).
export function FigureSvg({
	viewBox,
	preserveAspectRatio,
	skin,
	hair,
	lite,
	label,
	decorative,
	className,
	children,
}: {
	viewBox: string;
	preserveAspectRatio: string;
	skin: Hex;
	hair: Hex;
	lite: boolean;
	label?: string;
	decorative: boolean;
	className?: string;
	children: ReactNode;
}) {
	const prefix = useId();
	return (
		<FigureContext.Provider value={{ prefix, lite, skin, hair }}>
			<svg
				viewBox={viewBox}
				preserveAspectRatio={preserveAspectRatio}
				role={decorative ? undefined : "img"}
				aria-label={decorative ? undefined : label}
				aria-hidden={decorative || undefined}
				className={className}
			>
				<Defs />
				{children}
			</svg>
		</FigureContext.Provider>
	);
}

// The body and its garments are drawn narrow and stretched wide here.
export function Stretch({ children }: { children: ReactNode }) {
	return <g transform="matrix(1.12 0 0 1 -24 0)">{children}</g>;
}
