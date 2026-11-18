import type { ReactNode } from "react";
import { Navigate, useLocation, useParams } from "react-router";
import { useCloset } from "@/closet/api";
import { ClosetPart } from "@/closet/ClosetPart";
import { closetPieces } from "@/closet/owned-item";
import { pieceName } from "@/combinations/combination";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { PLACEHOLDER } from "@/components/ui/placeholder";
import { TypeFigure } from "@/dress/figure/TypeFigure";
import { useWishlist } from "@/wishlist/api";
import { WishlistPart } from "@/wishlist/WishlistPart";
import { BackLink, PageHeader } from "../shell/PageHeader";
import { tabBeforePiece } from "../shell/piece-link";

const PICTURE =
	"relative block aspect-square w-full max-w-[280px] overflow-hidden rounded-[14px]";

// One piece and everything the account holds about it, one part under
// another: the closet's items, then the wish with its shop links.
export function PiecePage() {
	const { typeId, colourId } = useParams();
	const location = useLocation();
	const from = tabBeforePiece(location.state);
	const closet = useCloset();
	const wishlist = useWishlist();
	const owned = closet.data
		? closetPieces(closet.data).find(
				(p) => p.typeId === typeId && p.colour.id === colourId,
			)
		: undefined;
	const wish = wishlist.data?.find(
		(w) => w.typeId === typeId && w.colour.id === colourId,
	);
	const piece = owned ?? wish;
	// A typed address, or the piece gone from both lists since.
	if (closet.data && wishlist.data && !piece)
		return <Navigate to={from} replace />;
	let body: ReactNode;
	if (closet.isError && !piece)
		body = (
			<Notice title="Could not load your closet">
				<Button className="mt-2" onClick={() => void closet.refetch()}>
					Retry
				</Button>
			</Notice>
		);
	else if (wishlist.isError && !piece)
		body = (
			<Notice title="Could not load your wishlist">
				<Button className="mt-2" onClick={() => void wishlist.refetch()}>
					Retry
				</Button>
			</Notice>
		);
	else if (!piece) body = <span className={`${PICTURE} ${PLACEHOLDER}`} />;
	else
		body = (
			<>
				<span className={`${PICTURE} bg-[#D3CFC9]`}>
					<TypeFigure
						typeId={piece.typeId}
						hex={piece.colour.hex}
						className="absolute inset-[10%] size-[80%]"
					/>
				</span>
				{owned ? <ClosetPart items={owned.items} /> : null}
				{wish ? <WishlistPart wish={wish} /> : null}
			</>
		);
	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<PageHeader
				start={<BackLink to={from} />}
				title={piece ? pieceName(piece) : ""}
			/>
			<div className="flex min-h-0 flex-1 flex-col gap-6 overflow-auto px-4 pt-1 pb-24 wide:mx-auto wide:w-full wide:max-w-[540px]">
				{body}
			</div>
		</div>
	);
}
