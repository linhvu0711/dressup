import {
	type GarmentLayer,
	type Hex,
	isJacket,
	type JacketId,
} from "@/dress/clothing-types";
import { BodySkin, Head, Shoes } from "@/dress/figure/body";
import { FigureSvg, Stretch } from "@/dress/figure/frame";
import { useUrl } from "@/dress/figure/parts";
import { GARMENT_DRAWINGS } from "@/dress/figure/type-drawings";

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
	return (
		<FigureSvg
			viewBox={viewBox}
			preserveAspectRatio="xMidYMin slice"
			skin={skin}
			hair={hair}
			lite={lite}
			label={label}
			decorative={decorative}
		>
			<Ground />
			<Stretch>
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
			</Stretch>
			<g transform="translate(200 150) scale(1.04) translate(-200 -150)">
				<Head />
			</g>
		</FigureSvg>
	);
}

// The floor and the shadows. A child of FigureSvg, so useUrl reads this
// figure's prefix and not the context's default.
function Ground() {
	const url = useUrl();
	return (
		<>
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
		</>
	);
}
