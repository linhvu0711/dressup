import { useLocation } from "react-router";
import { PieceTabPage } from "@/closet/PieceTabPage";
import { ItemCardPlaceholder } from "@/item/ItemCard";
import { wishCardPiece } from "@/piece-filter/piece-filter";
import { useWishlist } from "@/wishlist/api";
import { WishlistCard } from "@/wishlist/WishlistCard";
import { WishSheet } from "@/wishlist/WishSheet";
import { wishlistCards } from "@/wishlist/wish";

// One card per shop link, plus one per wish with no link, newest wish first.
export function WishlistPage() {
	const location = useLocation();
	return (
		<PieceTabPage
			title="Wishlist"
			slot="wish"
			query={useWishlist()}
			entries={wishlistCards}
			toPiece={wishCardPiece}
			card={(card) => (
				<WishlistCard
					key={card.link?.id ?? card.wish.id}
					card={card}
					slot="wish-card"
					state={{ search: location.search }}
				/>
			)}
			placeholder={(i) => <ItemCardPlaceholder key={i} slot="wish-skeleton" />}
			unit="item"
			failedTitle="Could not load your wishlist"
			empty={{
				title: "Nothing on your wishlist yet",
				text: "Add the pieces you want to buy.",
			}}
			addLabel="Add to wishlist"
			addSheet={(close) => <WishSheet onClose={close} />}
		/>
	);
}
