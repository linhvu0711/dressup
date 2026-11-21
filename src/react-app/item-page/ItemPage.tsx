import type { ReactNode } from "react";
import type { Hex } from "@/colour/hex";
import type { PieceRef } from "@/combinations/marks";
import { PictureGallery } from "@/pictures/PictureGallery";
import type { PictureId } from "@/pictures/picture";
import { priceText } from "@/price";
import { BackLink, PageHeader } from "@/shell/PageHeader";

// The frame of one item's page: Back alone in the header, then the page.
export function ItemPage({
	back,
	children,
}: {
	back: string;
	children: ReactNode;
}) {
	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<PageHeader start={<BackLink to={back} />} />
			<div className="flex min-h-0 flex-1 flex-col gap-6 overflow-auto px-4 pt-1 pb-24 wide:mx-auto wide:w-full wide:max-w-[960px]">
				{children}
			</div>
		</div>
	);
}

export type ItemFact = { term: string; value: ReactNode };

// Plain values, not an owned item, so a shop link's page can pass its own.
export function ItemDetails({
	piece,
	pictureIds,
	title,
	brand,
	price,
	actions,
	facts,
}: {
	piece: PieceRef & { colour: { hex: Hex } };
	pictureIds: readonly PictureId[];
	title: string;
	brand: string | null;
	price: number | null;
	actions: ReactNode;
	facts: readonly ItemFact[];
}) {
	return (
		<div className="flex flex-col gap-6 wide:grid wide:grid-cols-[440px_minmax(0,1fr)] wide:gap-12">
			<PictureGallery ids={pictureIds} piece={piece} />
			<div className="flex min-w-0 flex-col gap-4">
				<div className="flex flex-col gap-1">
					<h1 className="break-words text-[32px] leading-[1.1]">{title}</h1>
					{brand === null ? null : (
						<p
							data-slot="item-brand"
							className="text-[13px] text-muted-foreground"
						>
							{brand}
						</p>
					)}
					{price === null ? null : (
						<p data-slot="item-price" className="font-medium text-[18px]">
							{priceText(price)}
						</p>
					)}
				</div>
				<div data-slot="item-actions" className="flex gap-2">
					{actions}
				</div>
				<dl data-slot="item-facts" className="flex flex-col">
					{facts.map((fact) => (
						<div
							key={fact.term}
							className="flex min-h-[46px] items-center justify-between gap-4 border-border border-b"
						>
							<dt className="text-[13px] text-muted-foreground">{fact.term}</dt>
							<dd className="text-right text-[14px]">{fact.value}</dd>
						</div>
					))}
				</dl>
			</div>
		</div>
	);
}
