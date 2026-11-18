import type { ReactNode } from "react";
import { Navigate, useParams } from "react-router";
import { useCloset } from "@/closet/api";
import { ClosetPart } from "@/closet/ClosetPart";
import { closetPieces } from "@/closet/owned-item";
import { pieceName } from "@/combinations/combination";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { PLACEHOLDER } from "@/components/ui/placeholder";
import { TypeFigure } from "@/dress/figure/TypeFigure";
import { BackLink, PageHeader } from "../shell/PageHeader";

const PICTURE =
	"relative block aspect-square w-full max-w-[280px] overflow-hidden rounded-[14px]";

// One piece and everything the account holds about it, one part under
// another; the closet's items are the first part.
export function PiecePage() {
	const { typeId, colourId } = useParams();
	const closet = useCloset();
	const piece = closet.data
		? closetPieces(closet.data).find(
				(p) => p.typeId === typeId && p.colour.id === colourId,
			)
		: undefined;
	// A typed address, or the last item of the piece gone since.
	if (closet.data && !piece) return <Navigate to="/closet" replace />;
	let body: ReactNode;
	if (closet.isError && !piece)
		body = (
			<Notice title="Could not load your closet">
				<Button className="mt-2" onClick={() => void closet.refetch()}>
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
				<ClosetPart items={piece.items} />
			</>
		);
	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<PageHeader
				start={<BackLink to="/closet" />}
				title={piece ? pieceName(piece) : ""}
			/>
			<div className="flex min-h-0 flex-1 flex-col gap-6 overflow-auto px-4 pt-1 pb-24 wide:mx-auto wide:w-full wide:max-w-[540px]">
				{body}
			</div>
		</div>
	);
}
