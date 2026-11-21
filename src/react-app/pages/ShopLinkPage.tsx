import { CircleCheck, ExternalLink, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { useLocation, useParams } from "react-router";
import { Button } from "@/components/ui/button";
import { TYPE_NAMES } from "@/dress/clothing-types";
import { ColourValue, Facts } from "@/item/Facts";
import { ItemPage } from "@/item/ItemPage";
import { ItemPictures } from "@/item/ItemPictures";
import { tabSearch } from "@/shell/piece-link";
import { useWishlist } from "@/wishlist/api";
import { BoughtDialog } from "@/wishlist/BoughtDialog";
import { OtherShops } from "@/wishlist/OtherShops";
import { ShopLinkSheet } from "@/wishlist/ShopLinkSheet";
import {
	isWebAddress,
	priceText,
	type ShopLink,
	shopLinkHost,
	shopName,
	type Wish,
	wishlistCards,
} from "@/wishlist/wish";

const ICON = { size: 18, strokeWidth: 1.9, "aria-hidden": true } as const;

const ROUND = "border border-border";

// One shop link of a wish: its pictures, facts, and actions.
export function ShopLinkPage() {
	const { shopLinkId } = useParams();
	const location = useLocation();
	const back = `/wishlist${tabSearch(location.state)}`;
	return (
		<ItemPage
			back={back}
			query={useWishlist()}
			find={(wishes) => {
				const card = wishlistCards(wishes).find(
					(c) => c.link?.id === shopLinkId,
				);
				return card?.link ? { wish: card.wish, link: card.link } : undefined;
			}}
			failedTitle="Could not load your wishlist"
		>
			{({ wish, link }) => ({
				pictures: (
					<ItemPictures
						key={link.id}
						ids={link.pictureIds}
						piece={wish}
						label={shopName(link)}
					/>
				),
				details: <LinkDetails wish={wish} link={link} />,
				below: (
					<OtherShops
						wish={wish}
						link={link}
						state={{ search: tabSearch(location.state) }}
					/>
				),
			})}
		</ItemPage>
	);
}

function LinkDetails({ wish, link }: { wish: Wish; link: ShopLink }) {
	const [open, setOpen] = useState<"bought" | "edit" | null>(null);
	const price = link.price === null ? null : priceText(link.price);
	return (
		<>
			<div className="flex flex-col gap-1">
				<h1 className="text-[32px] leading-tight">{link.name}</h1>
				<p className="text-[13px] text-muted-foreground">{shopName(link)}</p>
				{price === null ? (
					<p className="text-[20px] text-muted-foreground">No price</p>
				) : (
					<p className="font-medium text-[20px]">{price}</p>
				)}
			</div>
			<fieldset aria-label="Actions" className="flex gap-2">
				{isWebAddress(link.url) ? (
					<Button asChild variant="primary" size="icon">
						<a
							href={link.url}
							target="_blank"
							rel="noopener noreferrer"
							aria-label="Open shop"
							title="Open shop"
						>
							<ExternalLink {...ICON} />
						</a>
					</Button>
				) : null}
				<Button
					variant="icon"
					size="icon"
					className={ROUND}
					aria-label="Bought"
					title="Bought"
					onClick={() => setOpen("bought")}
				>
					<CircleCheck {...ICON} />
				</Button>
				<Button
					variant="icon"
					size="icon"
					className={ROUND}
					aria-label="Edit"
					title="Edit"
					onClick={() => setOpen("edit")}
				>
					<Pencil {...ICON} />
				</Button>
				<Button
					variant="icon"
					size="icon"
					className="border-destructive/40 text-destructive"
					aria-label="Remove from wishlist"
					title="Remove from wishlist"
				>
					<Trash2 {...ICON} />
				</Button>
			</fieldset>
			<Facts
				rows={[
					{ label: "Shop", value: shopName(link) },
					{ label: "Type", value: TYPE_NAMES[wish.typeId] },
					{ label: "Colour", value: <ColourValue colour={wish.colour} /> },
					{ label: "Price", value: price ?? "No price" },
					{ label: "Address", value: <Address url={link.url} /> },
				]}
			/>
			{open === "bought" ? (
				<BoughtDialog
					link={link}
					wishId={wish.id}
					onClose={() => setOpen(null)}
				/>
			) : open === "edit" ? (
				<ShopLinkSheet mode="edit" link={link} onClose={() => setOpen(null)} />
			) : null}
		</>
	);
}

// A saved address is drawn as a link only when it is a web address, so a
// script address never becomes one.
function Address({ url }: { url: string }) {
	if (!isWebAddress(url)) return <span className="break-all">{url}</span>;
	return (
		<a
			href={url}
			target="_blank"
			rel="noopener noreferrer"
			className="inline-flex min-w-0 items-center gap-1 underline-offset-2 hover:underline"
		>
			<span className="truncate">{shopLinkHost(url)}</span>
			<ExternalLink size={14} className="flex-none" aria-hidden />
		</a>
	);
}
