import { useRef } from "react";
import { Link } from "react-router";
import type { Hex } from "@/colour/hex";
import { pieceName } from "@/combinations/combination";
import type { TypeId } from "@/dress/clothing-types";
import { TypeFigure } from "@/dress/figure/TypeFigure";
import { type PieceTab, usePieceLink } from "@/shell/piece-link";
import { useNearScreen } from "@/shell/Wall";

// One tile of a wall of pieces: the piece drawn in its colour, an optional
// badge on the picture, its name, and an optional second line. Each text
// stays on one line, so every tile of a wall has one height.
export function PieceTile({
	piece,
	from,
	label,
	slot,
	badge,
	line,
}: {
	piece: { typeId: TypeId; colour: { id: string; name: string; hex: Hex } };
	from: PieceTab;
	label: string;
	slot: string;
	badge?: number;
	line?: string;
}) {
	const linkTo = usePieceLink(from);
	const ref = useRef<HTMLAnchorElement>(null);
	const near = useNearScreen(ref);
	return (
		<Link
			ref={ref}
			{...linkTo(piece)}
			data-slot={slot}
			aria-label={label}
			className="flex min-w-0 flex-col gap-[7px]"
		>
			<span className="relative block aspect-square w-full overflow-hidden rounded-[14px] bg-[#D3CFC9]">
				{near ? (
					<TypeFigure
						typeId={piece.typeId}
						hex={piece.colour.hex}
						className="absolute inset-[10%] size-[80%]"
					/>
				) : null}
				{badge === undefined ? null : (
					<span className="absolute top-2 right-2 grid h-6 min-w-6 place-items-center rounded-full bg-foreground px-1.5 font-semibold text-[12px] text-background">
						{badge}
					</span>
				)}
			</span>
			<span className="flex min-w-0 flex-col">
				<span className="truncate font-medium text-[13.5px]">
					{pieceName(piece)}
				</span>
				{line === undefined ? null : (
					<span className="truncate text-[12.5px] text-muted-foreground">
						{line}
					</span>
				)}
			</span>
		</Link>
	);
}
