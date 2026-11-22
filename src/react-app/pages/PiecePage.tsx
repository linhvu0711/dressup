import { type ReactNode, useId } from "react";
import { Navigate, useLocation, useParams } from "react-router";
import { useCloset } from "@/closet/api";
import { ClosetCard } from "@/closet/ClosetCard";
import { closetPieces } from "@/closet/owned-item";
import { pieceName } from "@/combinations/combination";
import { PieceCombinations } from "@/combinations/PieceCombinations";
import { PageError } from "@/components/ui/page-error";
import { PartError } from "@/components/ui/part-error";
import { PLACEHOLDER } from "@/components/ui/placeholder";
import { isTypeId } from "@/dress/clothing-types";
import { TypeFigure } from "@/dress/figure/TypeFigure";
import { useColours } from "@/labels/api";
import { useWishlist } from "@/wishlist/api";
import { WishActions } from "@/wishlist/WishActions";
import { WishlistCard } from "@/wishlist/WishlistCard";
import { SHOP_LINK_LIMIT, wishlistCards } from "@/wishlist/wish";
import { BackLink, PageHeader } from "../shell/PageHeader";
import { readBack, useHere } from "../shell/piece-link";

const PICTURE =
	"relative block aspect-square w-full max-w-[280px] overflow-hidden rounded-[14px]";

// One piece and everything the account holds about it: its owned items and
// shop links as cards, then the combinations that hold it.
export function PiecePage() {
	const { typeId, colourId } = useParams();
	const location = useLocation();
	const back = readBack(location.state, "/closet");
	const here = useHere();
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
	const listed = owned ?? wish;
	const colours = useColours();
	// A piece in neither list still has its page, drawn from the account's
	// colour, so removing its last wish or item keeps the person on it.
	const colour = colours.data?.find((c) => c.id === colourId);
	const empty =
		!listed &&
		closet.data &&
		wishlist.data &&
		typeId &&
		isTypeId(typeId) &&
		colour
			? { typeId, colour }
			: undefined;
	const piece = listed ?? empty;
	const coloursFailed = colours.isError && !colours.data;
	// A list that answered once keeps its data through a failed reload, so
	// only a list with no data at all counts as failed.
	const closetFailed = closet.isError && !closet.data;
	const wishlistFailed = wishlist.isError && !wishlist.data;
	const retry = () => {
		if (closetFailed) void closet.refetch();
		if (wishlistFailed) void wishlist.refetch();
	};
	// A typed address of a type or colour the account does not have.
	if (closet.data && wishlist.data && colours.data && !piece)
		return <Navigate to={back.to} state={back.state} replace />;
	const skeleton = (
		<span data-slot="piece-skeleton" className={`${PICTURE} ${PLACEHOLDER}`} />
	);
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
					<CardGroup title="In your closet">
						{owned.items.map((item) => (
							<ClosetCard key={item.id} item={item} state={here} />
						))}
					</CardGroup>
				) : closetFailed ? (
					<PartError title="In your closet" onRetry={retry}>
						Could not load your closet.
					</PartError>
				) : null}
				{wish ? (
					<CardGroup
						title="On your wishlist"
						actions={<WishActions wish={wish} />}
						note={
							wish.shopLinks.length >= SHOP_LINK_LIMIT
								? `${SHOP_LINK_LIMIT} shop links is the limit for one wish.`
								: null
						}
					>
						{wishlistCards([wish]).map((card) => (
							<WishlistCard
								key={card.link?.id ?? card.wish.id}
								card={card}
								slot="wish-card"
								state={here}
							/>
						))}
					</CardGroup>
				) : wishlistFailed ? (
					<PartError title="On your wishlist" onRetry={retry}>
						Could not load your wishlist.
					</PartError>
				) : null}
				{empty ? (
					<p className="text-[14px] text-muted-foreground">
						Not in your closet or on your wishlist.
					</p>
				) : null}
				<PieceCombinations piece={piece} />
			</>
		);
	// The piece may be in the list still loading, so a failure waits for it.
	else if (closet.isPending || wishlist.isPending) body = skeleton;
	else if (closetFailed || wishlistFailed)
		body = (
			<PageError
				title={failedTitle(closetFailed, wishlistFailed)}
				onRetry={retry}
			/>
		);
	else if (coloursFailed)
		body = (
			<PageError
				title="Could not load your colours"
				onRetry={() => void colours.refetch()}
			/>
		);
	else body = skeleton;
	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<PageHeader
				start={<BackLink to={back.to} state={back.state} />}
				title={piece ? pieceName(piece) : ""}
			/>
			<div className="flex min-h-0 flex-1 flex-col overflow-auto px-4 pt-1 pb-24 wide:px-6">
				<div className="mx-auto flex w-full max-w-[928px] flex-col gap-6">
					{body}
				</div>
			</div>
		</div>
	);
}

function failedTitle(closet: boolean, wishlist: boolean) {
	if (closet && wishlist) return "Could not load your closet and wishlist";
	return closet ? "Could not load your closet" : "Could not load your wishlist";
}

function CardGroup({
	title,
	actions,
	note,
	children,
}: {
	title: string;
	actions?: ReactNode;
	note?: string | null;
	children: ReactNode;
}) {
	const id = useId();
	return (
		<section aria-labelledby={id} className="flex flex-col gap-2">
			<div className="flex items-center gap-3">
				<h2 id={id} className="min-w-0 flex-1 text-[22px]">
					{title}
				</h2>
				{actions}
			</div>
			{note ? (
				<p className="text-[13px] text-muted-foreground">{note}</p>
			) : null}
			<div className="grid grid-cols-2 gap-3.5 wide:grid-cols-5">
				{children}
			</div>
		</section>
	);
}
