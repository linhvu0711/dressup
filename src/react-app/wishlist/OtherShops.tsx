import { Plus } from "lucide-react";
import { useId, useState } from "react";
import { pieceName } from "@/combinations/combination";
import { countText } from "@/count-text";
import type { Back } from "@/shell/piece-link";
import { ShopLinkSheet } from "./ShopLinkSheet";
import { WishlistCard } from "./WishlistCard";
import { SHOP_LINK_LIMIT, type ShopLink, type Wish } from "./wish";

// The wish's other shop links as cards, and a card that adds one more. A
// wish with one link has no part.
export function OtherShops({
	wish,
	link,
	state,
}: {
	wish: Wish;
	link: ShopLink;
	state: Back;
}) {
	const title = useId();
	const [adding, setAdding] = useState(false);
	const n = wish.shopLinks.length;
	if (n < 2) return null;
	return (
		<section aria-labelledby={title} className="flex flex-col gap-2">
			<div className="flex flex-col gap-0.5">
				<h2 id={title} className="text-[22px]">
					Other shops for this wish
				</h2>
				<p className="text-[13px] text-muted-foreground">
					{`${pieceName(wish)} · ${countText(n, "shop link")} in all`}
				</p>
			</div>
			<div className="grid grid-cols-2 gap-3.5 wide:grid-cols-5">
				{wish.shopLinks
					.filter((other) => other.id !== link.id)
					.map((other) => (
						<WishlistCard
							key={other.id}
							card={{ wish, link: other }}
							state={state}
							slot="other-shop"
						/>
					))}
				{n < SHOP_LINK_LIMIT ? (
					<button
						type="button"
						aria-label="Add a shop link"
						onClick={() => setAdding(true)}
						className="flex min-w-0 flex-col gap-[7px] text-left"
					>
						<span className="grid aspect-[3/4] w-full place-items-center rounded-[14px] border border-border border-dashed">
							<Plus size={22} strokeWidth={1.9} aria-hidden />
						</span>
						<span className="font-medium text-[13.5px]">Add a shop link</span>
					</button>
				) : null}
			</div>
			{n < SHOP_LINK_LIMIT ? null : (
				<p className="text-[13px] text-muted-foreground">
					{SHOP_LINK_LIMIT} shop links is the limit for one wish.
				</p>
			)}
			{adding ? (
				<ShopLinkSheet
					mode="add"
					wishId={wish.id}
					onClose={() => setAdding(false)}
				/>
			) : null}
		</section>
	);
}
