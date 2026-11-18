import { type ReactNode, useId } from "react";
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
	// A list that answered once keeps its data through a failed reload, so
	// only a list with no data at all counts as failed.
	const closetFailed = closet.isError && !closet.data;
	const wishlistFailed = wishlist.isError && !wishlist.data;
	const retry = () => {
		if (closetFailed) void closet.refetch();
		if (wishlistFailed) void wishlist.refetch();
	};
	// A typed address, or the piece gone from both lists since.
	if (closet.data && wishlist.data && !piece)
		return <Navigate to={from} replace />;
	let body: ReactNode;
	if (piece)
		body = (
			<>
				<span className={`${PICTURE} bg-[#D3CFC9]`}>
					<TypeFigure
						typeId={piece.typeId}
						hex={piece.colour.hex}
						className="absolute inset-[10%] size-[80%]"
					/>
				</span>
				{owned ? (
					<ClosetPart items={owned.items} />
				) : closetFailed ? (
					<PartError title="In your closet" onRetry={retry}>
						Could not load your closet.
					</PartError>
				) : null}
				{wish ? (
					<WishlistPart wish={wish} />
				) : wishlistFailed ? (
					<PartError title="On your wishlist" onRetry={retry}>
						Could not load your wishlist.
					</PartError>
				) : null}
			</>
		);
	// The piece may be in the list still loading, so a failure waits for it.
	else if (closet.isPending || wishlist.isPending)
		body = <span className={`${PICTURE} ${PLACEHOLDER}`} />;
	else
		body = (
			<Notice title={failedTitle(closetFailed, wishlistFailed)}>
				<Button className="mt-2" onClick={retry}>
					Retry
				</Button>
			</Notice>
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

function failedTitle(closet: boolean, wishlist: boolean) {
	if (closet && wishlist) return "Could not load your closet and wishlist";
	return closet ? "Could not load your closet" : "Could not load your wishlist";
}

// A part of the page whose list failed while the other list holds the piece.
function PartError({
	title,
	onRetry,
	children,
}: {
	title: string;
	onRetry: () => void;
	children: ReactNode;
}) {
	const id = useId();
	return (
		<section aria-labelledby={id} className="flex flex-col items-start gap-2">
			<h2 id={id} className="text-[22px]">
				{title}
			</h2>
			<p role="alert" className="text-[13px] text-destructive">
				{children}
			</p>
			<Button onClick={onRetry}>Retry</Button>
		</section>
	);
}
