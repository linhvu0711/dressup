import { useState } from "react";
import type { Hex } from "@/colour/hex";
import type { TypeId } from "@/dress/clothing-types";
import { TypeFigure } from "@/dress/figure/TypeFigure";
import { PictureViewer } from "@/pictures/PictureViewer";
import { type PictureId, pictureAddress } from "@/pictures/picture";

const BOX =
	"relative block aspect-[3/4] w-full overflow-hidden rounded-[14px] bg-[#D3CFC9]";

// An item's big picture with its thumbnails under it; a tap on the big one
// opens the viewer there. With no picture, the piece drawn in its colour.
export function ItemPictures({
	ids,
	piece,
	label,
}: {
	ids: readonly PictureId[];
	piece: { typeId: TypeId; colour: { hex: Hex } };
	label: string;
}) {
	const [picked, setPicked] = useState(0);
	const [open, setOpen] = useState<number | null>(null);
	if (ids.length === 0)
		return (
			<span className={BOX}>
				<TypeFigure
					typeId={piece.typeId}
					hex={piece.colour.hex}
					className="absolute inset-[10%] size-[80%]"
				/>
			</span>
		);
	// An edit can drop pictures, so the pick never points past the end.
	const at = Math.min(picked, ids.length - 1);
	return (
		<div className="flex flex-col gap-3">
			<button
				type="button"
				aria-label={`Open picture ${at + 1} of ${ids.length}`}
				onClick={() => setOpen(at)}
				className={`${BOX} focus-visible:outline-2 focus-visible:outline-ring`}
			>
				<img
					src={pictureAddress(ids[at])}
					alt=""
					className="size-full object-cover"
				/>
			</button>
			{ids.length < 2 ? null : (
				<ul
					aria-label={`Pictures of ${label}`}
					className="flex flex-wrap gap-2"
				>
					{ids.map((id, i) => (
						<li key={id}>
							<button
								type="button"
								aria-label={`Show picture ${i + 1}`}
								aria-pressed={i === at}
								onClick={() => setPicked(i)}
								className={`block aspect-[3/4] w-16 overflow-hidden rounded-[10px] bg-muted focus-visible:outline-2 focus-visible:outline-ring ${i === at ? "outline-2 outline-foreground" : ""}`}
							>
								<img
									src={pictureAddress(id)}
									alt=""
									loading="lazy"
									className="size-full object-cover"
								/>
							</button>
						</li>
					))}
				</ul>
			)}
			{open === null ? null : (
				<PictureViewer ids={ids} start={open} onClose={() => setOpen(null)} />
			)}
		</div>
	);
}
