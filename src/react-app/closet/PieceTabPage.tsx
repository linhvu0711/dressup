import type { UseQueryResult } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { type ReactNode, useState } from "react";
import type { Hex } from "@/colour/hex";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import type { GarmentId } from "@/dress/garments";
import type { PieceTab } from "@/shell/piece-link";
import { PageHeader } from "../shell/PageHeader";
import { PieceTile } from "./PieceTile";

const WALL =
	"grid min-h-0 flex-1 auto-rows-min grid-cols-2 gap-x-3.5 gap-y-5 overflow-auto px-4 pt-[5px] pb-24 wide:grid-cols-[repeat(auto-fill,minmax(176px,1fr))] wide:gap-x-[18px] wide:gap-y-[26px] wide:px-6";

const PULSE = "animate-placeholder motion-reduce:animate-none";

type TilePiece = {
	typeId: GarmentId;
	colour: { id: string; name: string; hex: Hex };
};

// The Closet and the Wishlist are one page: a wall of piece tiles with its
// loading, failed, and empty states. Each tab brings its list, its tile, its
// words, and its add sheet.
export function PieceTabPage<D, E extends TilePiece>({
	title,
	tab,
	slot,
	query,
	entries,
	tile,
	failedTitle,
	empty,
	addLabel,
	addSheet,
}: {
	title: string;
	tab: PieceTab;
	slot: "closet" | "wish";
	query: UseQueryResult<D[]>;
	entries: (data: D[]) => E[];
	tile: (entry: E) => {
		key: string;
		label: string;
		badge?: number;
		line?: string;
	};
	failedTitle: string;
	empty: { title: string; text?: string };
	addLabel: string;
	addSheet: (onClose: () => void) => ReactNode;
}) {
	const [adding, setAdding] = useState(false);
	let wall: ReactNode;
	if (query.isPending) {
		wall = (
			<div className={WALL}>
				{Array.from({ length: 6 }, (_, i) => (
					<div
						// biome-ignore lint/suspicious/noArrayIndexKey: the tiles are all alike and never move.
						key={i}
						data-slot={`${slot}-skeleton`}
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
	} else if (query.isError) {
		// Checked before the data: a failed refetch keeps the old list.
		wall = (
			<Notice title={failedTitle}>
				<Button className="mt-2" onClick={() => void query.refetch()}>
					Retry
				</Button>
			</Notice>
		);
	} else if (query.data.length === 0) {
		wall = (
			<Notice title={empty.title}>
				{empty.text === undefined ? null : <p>{empty.text}</p>}
				<Button
					variant="primary"
					className="mt-2"
					onClick={() => setAdding(true)}
				>
					{addLabel}
				</Button>
			</Notice>
		);
	} else {
		wall = (
			<div data-slot={`${slot}-wall`} className={WALL}>
				{entries(query.data).map((entry) => {
					const { key, ...shown } = tile(entry);
					return (
						<PieceTile
							key={key}
							piece={entry}
							from={tab}
							slot={`${slot}-tile`}
							{...shown}
						/>
					);
				})}
			</div>
		);
	}
	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<PageHeader
				title={title}
				end={
					<Button
						variant="primary"
						size="icon"
						aria-label={addLabel}
						title={addLabel}
						onClick={() => setAdding(true)}
					>
						<Plus size={18} strokeWidth={1.9} aria-hidden />
					</Button>
				}
			/>
			{wall}
			{adding ? addSheet(() => setAdding(false)) : null}
		</div>
	);
}
