import { useRef } from "react";
import { Link } from "react-router";
import type { Hex } from "@/colour/hex";
import { PLACEHOLDER, PULSE } from "@/components/ui/placeholder";
import type { TypeId } from "@/dress/clothing-types";
import { TypeFigure } from "@/dress/figure/TypeFigure";
import { type PictureId, pictureAddress } from "@/pictures/picture";
import { useNearScreen } from "@/shell/Wall";

const PICTURE =
	"relative block aspect-[3/4] w-full overflow-hidden rounded-[14px] bg-[#D3CFC9]";

// One card of an item: its first picture, else the piece drawn in its colour,
// then its name, a line with the colour's dot, and its price. A price of null
// says "No price"; no price at all leaves the line out. Each text stays on one
// line, so every card of a wall has one height.
export function ItemCard({
	to,
	state,
	label,
	slot,
	pictureId,
	piece,
	name,
	line,
	price,
}: {
	to: string;
	state?: unknown;
	label: string;
	slot: string;
	pictureId?: PictureId | null;
	piece: { typeId: TypeId; colour: { hex: Hex } };
	name: string;
	line: string;
	price?: string | null;
}) {
	const ref = useRef<HTMLAnchorElement>(null);
	const near = useNearScreen(ref);
	return (
		<Link
			ref={ref}
			to={to}
			state={state}
			data-slot={slot}
			aria-label={label}
			className="flex min-w-0 flex-col gap-[7px]"
		>
			<span className={PICTURE}>
				{near ? (
					pictureId ? (
						<img
							src={pictureAddress(pictureId)}
							className="size-full object-cover"
							alt=""
							loading="lazy"
						/>
					) : (
						<TypeFigure
							typeId={piece.typeId}
							hex={piece.colour.hex}
							className="absolute inset-[10%] size-[80%]"
						/>
					)
				) : null}
			</span>
			<span className="flex min-w-0 flex-col">
				<span className="truncate font-medium text-[13.5px]">{name}</span>
				<span className="flex min-w-0 items-center gap-1.5">
					<ColourDot hex={piece.colour.hex} />
					<span className="truncate text-[12.5px] text-muted-foreground">
						{line}
					</span>
				</span>
				{price === undefined ? null : price === null ? (
					<span
						data-slot="item-price"
						className="text-[13.5px] text-muted-foreground"
					>
						No price
					</span>
				) : (
					<span data-slot="item-price" className="font-medium text-[13.5px]">
						{price}
					</span>
				)}
			</span>
		</Link>
	);
}

export function ColourDot({ hex }: { hex: Hex }) {
	return (
		<span
			className="size-2 flex-none rounded-full ring-1 ring-black/10 ring-inset"
			style={{ background: hex }}
		/>
	);
}

export function ItemCardPlaceholder({ slot }: { slot: string }) {
	return (
		<div data-slot={slot} className="flex flex-col gap-[7px]">
			<span className={`${PICTURE} ${PULSE}`} />
			<span className={`block h-3.5 w-[70%] rounded-[12px] ${PLACEHOLDER}`} />
			<span className={`block h-3 w-[50%] rounded-[12px] ${PLACEHOLDER}`} />
		</div>
	);
}
