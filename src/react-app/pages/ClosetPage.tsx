import { useCloset } from "@/closet/api";
import { ItemCard, ItemCardSkeleton } from "@/closet/ItemCard";
import { OwnedItemSheet } from "@/closet/OwnedItemSheet";
import { PieceTabPage } from "@/closet/PieceTabPage";
import { PartError } from "@/components/ui/part-error";
import { ownedItemPiece } from "@/piece-filter/piece-filter";

// The items the account owns, one card for each, newest first.
export function ClosetPage() {
	return (
		<PieceTabPage
			title="Closet"
			slot="closet"
			query={useCloset()}
			entries={(items) => items}
			toPiece={ownedItemPiece}
			card={(item) => <ItemCard key={item.id} item={item} />}
			skeleton={<ItemCardSkeleton />}
			failed={(retry) => (
				<PartError onRetry={retry}>Could not load your closet.</PartError>
			)}
			unit="item"
			empty={{ title: "Nothing in your closet yet" }}
			addLabel="Add to closet"
			addSheet={(close) => <OwnedItemSheet mode="add" onClose={close} />}
		/>
	);
}
