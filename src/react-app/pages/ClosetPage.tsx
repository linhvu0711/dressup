import { useCloset } from "@/closet/api";
import { OwnedItemSheet } from "@/closet/OwnedItemSheet";
import { closetPieces } from "@/closet/owned-item";
import { PieceTabPage } from "@/closet/PieceTabPage";
import { PieceTile, PieceTilePlaceholder } from "@/closet/PieceTile";
import { pieceName } from "@/combinations/combination";
import { pieceKey } from "@/combinations/marks";
import { closetPiece } from "@/piece-filter/piece-filter";

// The pieces the account owns, one tile for each, the piece of the newest
// item first.
export function ClosetPage() {
	return (
		<PieceTabPage
			title="Closet"
			slot="closet"
			query={useCloset()}
			entries={closetPieces}
			toPiece={closetPiece}
			card={(piece) => (
				<PieceTile
					key={pieceKey(piece)}
					piece={piece}
					from="/closet"
					slot="closet-tile"
					label={`${pieceName(piece)}, ${piece.quantity}`}
					badge={piece.quantity}
				/>
			)}
			placeholder={(i) => (
				<PieceTilePlaceholder key={i} slot="closet-skeleton" />
			)}
			unit="piece"
			failedTitle="Could not load your closet"
			empty={{ title: "Nothing in your closet yet" }}
			addLabel="Add to closet"
			addSheet={(close) => <OwnedItemSheet mode="add" onClose={close} />}
		/>
	);
}
