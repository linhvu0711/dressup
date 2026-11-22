import { ExternalLink, Pencil, Plus } from "lucide-react";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { PictureStrip } from "@/pictures/PictureStrip";
import { priceText } from "@/price";
import { BoughtDialog } from "./BoughtDialog";
import { RemoveDialog } from "./RemoveDialog";
import { ShopLinkSheet } from "./ShopLinkSheet";
import {
	isWebAddress,
	SHOP_LINK_LIMIT,
	type ShopLink,
	shopLinkHost,
	shopName,
	type Wish,
} from "./wish";

// The piece page's part for the wishlist: one card for each shop link of
// the wish, oldest first. Only an http or https address becomes a link.
export function WishlistPart({ wish }: { wish: Wish }) {
	const title = useId();
	// The sheet: a new link, or the link it changes.
	const [sheet, setSheet] = useState<ShopLink | "add" | null>(null);
	const [removing, setRemoving] = useState(false);
	const [buying, setBuying] = useState<ShopLink | null>(null);
	const full = wish.shopLinks.length >= SHOP_LINK_LIMIT;
	return (
		<section aria-labelledby={title} className="flex flex-col gap-2">
			<div className="flex items-center gap-3">
				<h2 id={title} className="min-w-0 flex-1 text-[22px]">
					On your wishlist
				</h2>
				<Button disabled={full} onClick={() => setSheet("add")}>
					<Plus size={16} strokeWidth={1.9} aria-hidden />
					Add a shop link
				</Button>
			</div>
			{full ? (
				<p className="text-[13px] text-muted-foreground">
					{SHOP_LINK_LIMIT} shop links is the limit for one wish.
				</p>
			) : null}
			{wish.shopLinks.length === 0 ? (
				<p className="text-[14px] text-muted-foreground">No shop link yet.</p>
			) : (
				<ul className="flex flex-col gap-2.5">
					{wish.shopLinks.map((link) => (
						<li
							key={link.id}
							data-slot="shop-link"
							aria-label={link.name}
							className="flex min-w-0 flex-col gap-2 rounded-[14px] border border-border p-3.5"
						>
							<PictureStrip ids={link.pictureIds} brand={shopName(link)} />
							<div className="flex min-w-0 items-start gap-3">
								<div className="flex min-w-0 flex-1 flex-col gap-0.5">
									<p className="truncate text-[12.5px] text-muted-foreground">
										{shopName(link)}
									</p>
									<p className="text-[14px]">{link.name}</p>
									{link.price === null ? null : (
										<p className="font-medium text-[14px]">
											{priceText(link.price)}
										</p>
									)}
									{isWebAddress(link.url) ? (
										<a
											href={link.url}
											target="_blank"
											rel="noopener noreferrer"
											data-slot="shop-address"
											className="flex min-w-0 items-center gap-1 text-[13px] underline-offset-2 hover:underline"
										>
											<span className="truncate">{shopLinkHost(link.url)}</span>
											<ExternalLink
												size={14}
												className="flex-none"
												aria-hidden
											/>
										</a>
									) : (
										<p className="truncate text-[13px]">{link.url}</p>
									)}
								</div>
								<Button
									variant="icon"
									size="icon"
									aria-label="Change shop link"
									title="Change shop link"
									onClick={() => setSheet(link)}
								>
									<Pencil size={16} strokeWidth={1.9} aria-hidden />
								</Button>
							</div>
							<Button className="self-end" onClick={() => setBuying(link)}>
								Bought
							</Button>
						</li>
					))}
				</ul>
			)}
			<Button
				variant="destructive"
				className="mt-2 self-start"
				onClick={() => setRemoving(true)}
			>
				Remove from wishlist
			</Button>
			{buying ? (
				<BoughtDialog
					link={buying}
					wishId={wish.id}
					onClose={() => setBuying(null)}
				/>
			) : null}
			{removing ? (
				<RemoveDialog wish={wish} onClose={() => setRemoving(false)} />
			) : null}
			{sheet === "add" ? (
				<ShopLinkSheet
					mode="add"
					wishId={wish.id}
					onClose={() => setSheet(null)}
				/>
			) : sheet ? (
				<ShopLinkSheet
					mode="edit"
					link={sheet}
					lastLink={wish.shopLinks.length === 1}
					onClose={() => setSheet(null)}
				/>
			) : null}
		</section>
	);
}
