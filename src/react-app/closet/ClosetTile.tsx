import { Link } from "react-router";
import { pieceName } from "@/combinations/combination";
import { TypeFigure } from "@/dress/figure/TypeFigure";
import type { ClosetPiece } from "./owned-item";

// One tile of the closet: the piece drawn in its colour, with the total of
// its items. The name stays on one line, so every tile has one height.
export function ClosetTile({ piece }: { piece: ClosetPiece }) {
	const name = pieceName(piece);
	return (
		<Link
			to={`/piece/${piece.typeId}/${piece.colour.id}`}
			data-slot="closet-tile"
			aria-label={`${name}, ${piece.quantity}`}
			className="flex min-w-0 flex-col gap-[7px]"
		>
			<span className="relative block aspect-square w-full overflow-hidden rounded-[14px] bg-[#D3CFC9]">
				<TypeFigure
					typeId={piece.typeId}
					hex={piece.colour.hex}
					className="absolute inset-[10%] size-[80%]"
				/>
				<span className="absolute top-2 right-2 grid h-6 min-w-6 place-items-center rounded-full bg-foreground px-1.5 font-semibold text-[12px] text-background">
					{piece.quantity}
				</span>
			</span>
			<span className="truncate font-medium text-[13.5px]">{name}</span>
		</Link>
	);
}
