import { Plus } from "lucide-react";
import { type ReactNode, useState } from "react";
import { useCloset } from "@/closet/api";
import { ClosetTile } from "@/closet/ClosetTile";
import { OwnedItemSheet } from "@/closet/OwnedItemSheet";
import { closetPieces } from "@/closet/owned-item";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "../shell/PageHeader";

const WALL =
	"grid min-h-0 flex-1 auto-rows-min grid-cols-2 gap-x-3.5 gap-y-5 overflow-auto px-4 pt-[5px] pb-24 wide:grid-cols-[repeat(auto-fill,minmax(176px,1fr))] wide:gap-x-[18px] wide:gap-y-[26px] wide:px-6";

const PULSE = "animate-placeholder motion-reduce:animate-none";

// The pieces the account owns, one tile for each, the piece of the newest
// item first.
export function ClosetPage() {
	const closet = useCloset();
	const [adding, setAdding] = useState(false);
	let wall: ReactNode;
	if (closet.isPending) {
		wall = (
			<div className={WALL}>
				{Array.from({ length: 6 }, (_, i) => (
					<div
						// biome-ignore lint/suspicious/noArrayIndexKey: the tiles are all alike and never move.
						key={i}
						data-slot="closet-skeleton"
						className="flex flex-col gap-[7px]"
					>
						<span
							className={`block aspect-square w-full rounded-[14px] bg-[#D3CFC9] ${PULSE}`}
						/>
						<span
							className={`block h-3.5 w-[70%] rounded-[12px] bg-muted ${PULSE}`}
						/>
					</div>
				))}
			</div>
		);
	} else if (closet.isError) {
		// Checked before the data: a failed refetch keeps the old list.
		wall = (
			<Notice title="Could not load your closet">
				<Button className="mt-2" onClick={() => void closet.refetch()}>
					Retry
				</Button>
			</Notice>
		);
	} else if (closet.data.length === 0) {
		wall = (
			<Notice title="Nothing in your closet yet">
				<Button
					variant="primary"
					className="mt-2"
					onClick={() => setAdding(true)}
				>
					Add to closet
				</Button>
			</Notice>
		);
	} else {
		wall = (
			<div data-slot="closet-wall" className={WALL}>
				{closetPieces(closet.data).map((piece) => (
					<ClosetTile
						key={`${piece.typeId}/${piece.colour.id}`}
						piece={piece}
					/>
				))}
			</div>
		);
	}
	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<PageHeader
				title="Closet"
				end={
					<Button
						variant="primary"
						size="icon"
						aria-label="Add to closet"
						title="Add to closet"
						onClick={() => setAdding(true)}
					>
						<Plus size={18} strokeWidth={1.9} aria-hidden />
					</Button>
				}
			/>
			{wall}
			{adding ? (
				<OwnedItemSheet mode="add" onClose={() => setAdding(false)} />
			) : null}
		</div>
	);
}
