import { useLocation, useParams } from "react-router";
import { ItemPage } from "@/item/ItemPage";
import { tabSearch } from "@/shell/piece-link";
import { useWishlist } from "@/wishlist/api";
import { wishlistCards } from "@/wishlist/wish";

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
		>
			{({ link }) => ({
				pictures: null,
				details: <h1 className="text-[32px] leading-tight">{link.name}</h1>,
			})}
		</ItemPage>
	);
}
