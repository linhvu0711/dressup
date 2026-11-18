import { Plus } from "lucide-react";
import { type ReactNode, useState } from "react";
import { PieceTile } from "@/closet/PieceTile";
import { pieceName } from "@/combinations/combination";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { useWishlist } from "@/wishlist/api";
import { WishSheet } from "@/wishlist/WishSheet";
import { linksLine } from "@/wishlist/wish";
import { PageHeader } from "../shell/PageHeader";

const WALL =
	"grid min-h-0 flex-1 auto-rows-min grid-cols-2 gap-x-3.5 gap-y-5 overflow-auto px-4 pt-[5px] pb-24 wide:grid-cols-[repeat(auto-fill,minmax(176px,1fr))] wide:gap-x-[18px] wide:gap-y-[26px] wide:px-6";

const PULSE = "animate-placeholder motion-reduce:animate-none";

// The pieces the account wants to buy, one tile for each wish, newest first.
export function WishlistPage() {
	const wishlist = useWishlist();
	const [adding, setAdding] = useState(false);
	let wall: ReactNode;
	if (wishlist.isPending) {
		wall = (
			<div className={WALL}>
				{Array.from({ length: 6 }, (_, i) => (
					<div
						// biome-ignore lint/suspicious/noArrayIndexKey: the tiles are all alike and never move.
						key={i}
						data-slot="wish-skeleton"
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
	} else if (wishlist.isError) {
		// Checked before the data: a failed refetch keeps the old list.
		wall = (
			<Notice title="Could not load your wishlist">
				<Button className="mt-2" onClick={() => void wishlist.refetch()}>
					Retry
				</Button>
			</Notice>
		);
	} else if (wishlist.data.length === 0) {
		wall = (
			<Notice title="Nothing on your wishlist yet">
				<p>Add the pieces you want to buy.</p>
				<Button
					variant="primary"
					className="mt-2"
					onClick={() => setAdding(true)}
				>
					Add to wishlist
				</Button>
			</Notice>
		);
	} else {
		wall = (
			<div data-slot="wish-wall" className={WALL}>
				{wishlist.data.map((wish) => {
					const name = pieceName(wish);
					const line = linksLine(wish);
					return (
						<PieceTile
							key={wish.id}
							piece={wish}
							from="/wishlist"
							label={`${name}, ${line}`}
							slot="wish-tile"
							line={line}
						/>
					);
				})}
			</div>
		);
	}
	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<PageHeader
				title="Wishlist"
				end={
					<Button
						variant="primary"
						size="icon"
						aria-label="Add to wishlist"
						title="Add to wishlist"
						onClick={() => setAdding(true)}
					>
						<Plus size={18} strokeWidth={1.9} aria-hidden />
					</Button>
				}
			/>
			{wall}
			{adding ? <WishSheet onClose={() => setAdding(false)} /> : null}
		</div>
	);
}
