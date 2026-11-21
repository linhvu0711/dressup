import { PieceTabPage } from "@/closet/PieceTabPage";
import { PieceTile, PieceTileSkeleton } from "@/closet/PieceTile";
import { pieceName } from "@/combinations/combination";
import { PageError } from "@/components/ui/page-error";
import { wishPiece } from "@/piece-filter/piece-filter";
import { useWishlist } from "@/wishlist/api";
import { WishSheet } from "@/wishlist/WishSheet";
import { linksLine } from "@/wishlist/wish";

// The pieces the account wants to buy, one tile for each wish, newest first.
export function WishlistPage() {
	return (
		<PieceTabPage
			title="Wishlist"
			slot="wish"
			query={useWishlist()}
			entries={(wishes) => wishes}
			toPiece={wishPiece}
			card={(wish) => (
				<PieceTile
					key={wish.id}
					piece={wish}
					from="/wishlist"
					slot="wish-tile"
					label={`${pieceName(wish)}, ${linksLine(wish)}`}
					line={linksLine(wish)}
				/>
			)}
			skeleton={<PieceTileSkeleton />}
			failed={(retry) => (
				<PageError title="Could not load your wishlist" onRetry={retry} />
			)}
			unit="piece"
			empty={{
				title: "Nothing on your wishlist yet",
				text: "Add the pieces you want to buy.",
			}}
			addLabel="Add to wishlist"
			addSheet={(close) => <WishSheet onClose={close} />}
		/>
	);
}
