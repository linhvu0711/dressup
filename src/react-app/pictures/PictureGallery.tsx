import { cn } from "cn";
import { useState } from "react";
import type { Hex } from "@/colour/hex";
import type { TypeId } from "@/dress/clothing-types";
import { TypeFigure } from "@/dress/figure/TypeFigure";
import { type PictureId, pictureAddress } from "./picture";

// One picture big, with a row of thumbnails to pick another; with no
// picture, the drawn piece in its place.
export function PictureGallery({
	ids,
	piece,
}: {
	ids: readonly PictureId[];
	piece: { typeId: TypeId; colour: { hex: Hex } };
}) {
	const [picked, setPicked] = useState(0);
	// A picture removed in the edit sheet can leave the pick past the list.
	const shown = picked < ids.length ? picked : 0;
	const big = ids[shown];
	return (
		<div className="flex flex-col gap-2.5">
			<div
				data-slot="item-picture"
				className="relative aspect-[3/4] w-full overflow-hidden rounded-[14px] bg-[#D3CFC9]"
			>
				{big ? (
					<img
						src={pictureAddress(big)}
						alt=""
						className="size-full object-cover"
					/>
				) : (
					<TypeFigure
						typeId={piece.typeId}
						hex={piece.colour.hex}
						className="absolute inset-[10%] size-[80%]"
					/>
				)}
			</div>
			{ids.length > 1 ? (
				<div data-slot="picture-thumbs" className="flex flex-wrap gap-2">
					{ids.map((id, i) => (
						<button
							key={id}
							type="button"
							aria-label={`Show picture ${i + 1} of ${ids.length}`}
							aria-pressed={i === shown}
							onClick={() => setPicked(i)}
							className={cn(
								"block aspect-[3/4] w-16 overflow-hidden rounded-[10px] bg-muted focus-visible:outline-2 focus-visible:outline-ring",
								i === shown && "ring-2 ring-foreground",
							)}
						>
							<img
								src={pictureAddress(id)}
								alt=""
								loading="lazy"
								className="size-full object-cover"
							/>
						</button>
					))}
				</div>
			) : null}
		</div>
	);
}
