import { useCloset } from "@/closet/api";
import { OwnedItemSheet } from "@/closet/OwnedItemSheet";
import { closetPieces } from "@/closet/owned-item";
import { PieceTabPage } from "@/closet/PieceTabPage";
import { pieceName } from "@/combinations/combination";
import { pieceKey } from "@/combinations/marks";
import { closetPiece } from "@/piece-filter/piece-filter";

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
			toPiece={closetPiece}
			tile={(piece) => ({
				key: pieceKey(piece),
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
