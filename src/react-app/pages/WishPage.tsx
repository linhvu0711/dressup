import { Plus } from "lucide-react";
import { useState } from "react";
import { Navigate, useLocation, useNavigate, useParams } from "react-router";
import { pieceName } from "@/combinations/combination";
import { PieceCombinations } from "@/combinations/PieceCombinations";
import { Button } from "@/components/ui/button";
import { TYPE_NAMES } from "@/dress/clothing-types";
import { ColourValue, Facts } from "@/item/Facts";
import { ItemPage } from "@/item/ItemPage";
import { ItemPictures } from "@/item/ItemPictures";
import { type Back, readBack } from "@/shell/piece-link";
import { useWishlist } from "@/wishlist/api";
import { RemoveDialog } from "@/wishlist/RemoveDialog";
import { ShopLinkSheet } from "@/wishlist/ShopLinkSheet";
import { linkPage, type Wish } from "@/wishlist/wish";

// A wish with no shop link. A wish with a link shows as its link cards, so
// its page is its newest link's; that also opens a link just added here.
export function WishPage() {
	const { wishId } = useParams();
	const location = useLocation();
	const back = readBack(location.state, "/wishlist");
	const wishlist = useWishlist();
	const links = wishlist.data?.find((w) => w.id === wishId)?.shopLinks ?? [];
	const newest = links[links.length - 1];
	if (newest)
		return <Navigate to={linkPage(newest.id)} replace state={location.state} />;
	return (
		<ItemPage
			back={back}
			query={wishlist}
			find={(wishes) => wishes.find((w) => w.id === wishId)}
			failedTitle="Could not load your wishlist"
		>
			{(wish) => ({
				pictures: (
					<ItemPictures ids={[]} piece={wish} label={pieceName(wish)} />
				),
				details: <WishDetails wish={wish} back={back} />,
				below: <PieceCombinations piece={wish} />,
			})}
		</ItemPage>
	);
}

function WishDetails({ wish, back }: { wish: Wish; back: Back }) {
	const navigate = useNavigate();
	const [open, setOpen] = useState<"add" | "remove" | null>(null);
	return (
		<>
			<div className="flex flex-col gap-1">
				<h1 className="text-[32px] leading-tight">{pieceName(wish)}</h1>
				<p className="text-[13px] text-muted-foreground">On your wishlist</p>
			</div>
			<p className="text-[14px] text-muted-foreground">No shop link yet.</p>
			<Facts
				rows={[
					{ label: "Type", value: TYPE_NAMES[wish.typeId] },
					{ label: "Colour", value: <ColourValue colour={wish.colour} /> },
				]}
			/>
			<div className="flex flex-wrap gap-2">
				<Button variant="primary" onClick={() => setOpen("add")}>
					<Plus size={16} strokeWidth={1.9} aria-hidden />
					Add a shop link
				</Button>
				<Button variant="destructive" onClick={() => setOpen("remove")}>
					Remove from wishlist
				</Button>
			</div>
			{open === "add" ? (
				<ShopLinkSheet
					mode="add"
					wishId={wish.id}
					onClose={() => setOpen(null)}
				/>
			) : open === "remove" ? (
				<RemoveDialog
					wish={wish}
					onClose={() => setOpen(null)}
					onRemoved={() =>
						navigate(back.to, { replace: true, state: back.state })
					}
				/>
			) : null}
		</>
	);
}
