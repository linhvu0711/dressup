import { ExternalLink, Pencil, Plus } from "lucide-react";
import { useId } from "react";
import { Button } from "@/components/ui/button";
import {
	isWebAddress,
	priceText,
	shopLinkHost,
	shopName,
	type Wish,
} from "./wish";

// The piece page's part for the wishlist: one card for each shop link of
// the wish, oldest first. Only an http or https address becomes a link.
export function WishlistPart({ wish }: { wish: Wish }) {
	const title = useId();
	return (
		<section aria-labelledby={title} className="flex flex-col gap-2">
			<div className="flex items-center gap-3">
				<h2 id={title} className="min-w-0 flex-1 text-[22px]">
					On your wishlist
				</h2>
				<Button>
					<Plus size={16} strokeWidth={1.9} aria-hidden />
					Add a shop link
				</Button>
			</div>
			{wish.shopLinks.length === 0 ? (
				<p className="text-[14px] text-muted-foreground">No shop link yet.</p>
			) : (
				<ul className="flex flex-col gap-2.5">
					{wish.shopLinks.map((link) => (
						<li
							key={link.id}
							data-slot="shop-link"
							aria-label={link.name}
							className="flex min-w-0 items-start gap-3 rounded-[14px] border border-border p-3.5"
						>
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
										<ExternalLink size={14} className="flex-none" aria-hidden />
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
							>
								<Pencil size={16} strokeWidth={1.9} aria-hidden />
							</Button>
						</li>
					))}
				</ul>
			)}
		</section>
	);
}
