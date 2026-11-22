import { useCloset } from "@/closet/api";
import { ClosetCard } from "@/closet/ClosetCard";
import { OwnedItemSheet } from "@/closet/OwnedItemSheet";
import { PieceTabPage } from "@/closet/PieceTabPage";
import { PartError } from "@/components/ui/part-error";
import { ItemCardPlaceholder } from "@/item/ItemCard";
import { ownedItemPiece } from "@/piece-filter/piece-filter";
import { useHere } from "@/shell/piece-link";

// The items the account owns, one card for each, newest first.
export function ClosetPage() {
	const here = useHere();
	return (
		<PieceTabPage
			title="Closet"
			slot="closet"
			query={useCloset()}
			entries={(items) => items}
			toPiece={ownedItemPiece}
			card={(item) => <ClosetCard key={item.id} item={item} state={here} />}
			placeholder={(i) => (
				<ItemCardPlaceholder key={i} slot="closet-skeleton" />
			)}
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
