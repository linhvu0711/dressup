import { useState } from "react";
import { PictureViewer } from "./PictureViewer";
import { type PictureId, pictureAddress } from "./picture";

// One owned item's pictures as a row of 3:4 thumbnails that scrolls
// sideways; a tap opens the viewer at that picture. No pictures, no row.
export function PictureStrip({
	ids,
	brand,
}: {
	ids: readonly PictureId[];
	brand: string;
}) {
	const [open, setOpen] = useState<number | null>(null);
	if (ids.length === 0) return null;
	return (
		<>
			<ul
				aria-label={`Pictures of ${brand}`}
				className="flex gap-2 overflow-x-auto scrollbar-quiet pt-1 pb-[11px]"
			>
				{ids.map((id, i) => (
					<li key={id} className="flex-none">
						<button
							type="button"
							aria-label={`Open picture ${i + 1} of ${ids.length}`}
							onClick={() => setOpen(i)}
							className="block aspect-[3/4] w-[104px] overflow-hidden rounded-[12px] bg-muted focus-visible:outline-2 focus-visible:outline-ring wide:w-[132px]"
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
			{open === null ? null : (
				<PictureViewer ids={ids} start={open} onClose={() => setOpen(null)} />
			)}
		</>
	);
}
