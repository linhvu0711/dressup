import { useId } from "react";
import { BodySkin, Head, Shoes } from "@/dress/figure/body";
import { GARMENT_DRAWINGS } from "@/dress/figure/garments";
import { Defs, FigureContext } from "@/dress/figure/parts";
import {
	type GarmentLayer,
	type Hex,
	isJacket,
	type JacketId,
} from "@/dress/garments";

export function Mannequin({
	layers = [],
	openJackets = [],
	skin,
	hair,
	viewBox = "0 10 400 800",
	lite = false,
	label = "Mannequin",
	decorative = false,
}: {
	layers?: readonly GarmentLayer[];
	openJackets?: readonly JacketId[];
	skin: Hex;
	hair: Hex;
	viewBox?: string;
	lite?: boolean;
	label?: string;
	decorative?: boolean;
}) {
	const prefix = useId();
	const url = (id: string) => `url(#${prefix}${id})`;
	return (
		<FigureContext.Provider value={{ prefix, lite, skin, hair }}>
			<svg
				viewBox={viewBox}
				preserveAspectRatio="xMidYMin slice"
				role={decorative ? undefined : "img"}
				aria-label={decorative ? undefined : label}
				aria-hidden={decorative || undefined}
			>
				<Defs />
				<ellipse
					cx="226"
					cy="430"
					rx="150"
					ry="330"
					fill="#000"
					opacity=".13"
					filter={url("b14")}
				/>
				<rect x="-3000" y="704" width="6400" height="30" fill="#4A4744" />
				<rect x="-3000" y="704" width="6400" height="2" fill="#6A6764" />
				<rect x="-3000" y="732" width="6400" height="140" fill={url("floor")} />
				<ellipse
					cx="200"
					cy="789"
					rx="118"
					ry="8"
					fill="#000"
					opacity=".5"
					filter={url("b5")}
				/>
				<g transform="matrix(1.12 0 0 1 -24 0)">
					<BodySkin />
					<Shoes />
					{layers.map(({ garment, color }) => {
						const open = isJacket(garment) && openJackets.includes(garment);
						return (
							<g
								key={garment}
								data-garment={garment}
								data-front={
									isJacket(garment) ? (open ? "open" : "closed") : undefined
								}
							>
								{GARMENT_DRAWINGS[garment](color, open)}
							</g>
						);
					})}
				</g>
				<g transform="translate(200 150) scale(1.04) translate(-200 -150)">
					<Head />
				</g>
			</svg>
		</FigureContext.Provider>
	);
}
