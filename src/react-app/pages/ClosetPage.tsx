import { useCloset } from "@/closet/api";
import { OwnedItemSheet } from "@/closet/OwnedItemSheet";
import { closetPieces } from "@/closet/owned-item";
import { PieceTabPage } from "@/closet/PieceTabPage";
import { pieceName } from "@/combinations/combination";

// The pieces the account owns, one tile for each, the piece of the newest
// item first.
export function ClosetPage() {
	return (
		<PieceTabPage
			title="Closet"
			tab="/closet"
			slot="closet"
			query={useCloset()}
			entries={closetPieces}
			tile={(piece) => ({
				key: `${piece.typeId}/${piece.colour.id}`,
				label: `${pieceName(piece)}, ${piece.quantity}`,
				badge: piece.quantity,
			})}
			failedTitle="Could not load your closet"
			empty={{ title: "Nothing in your closet yet" }}
			addLabel="Add to closet"
			addSheet={(close) => <OwnedItemSheet mode="add" onClose={close} />}
		/>
	);
}
