import { PieceTabPage } from "@/closet/PieceTabPage";
import { pieceName } from "@/combinations/combination";
import { wishPiece } from "@/piece-filter/piece-filter";
import { useWishlist } from "@/wishlist/api";
import { WishSheet } from "@/wishlist/WishSheet";
import { linksLine } from "@/wishlist/wish";

// The pieces the account wants to buy, one tile for each wish, newest first.
export function WishlistPage() {
	return (
		<PieceTabPage
			title="Wishlist"
			tab="/wishlist"
			slot="wish"
			query={useWishlist()}
			entries={(wishes) => wishes}
			toPiece={wishPiece}
			tile={(wish) => ({
				key: wish.id,
				label: `${pieceName(wish)}, ${linksLine(wish)}`,
				line: linksLine(wish),
			})}
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
