import { useRef } from "react";
import { Link } from "react-router";
import { PLACEHOLDER, PULSE } from "@/components/ui/placeholder";
import { TypeFigure } from "@/dress/figure/TypeFigure";
import { pictureAddress } from "@/pictures/picture";
import { useItemLink } from "@/shell/piece-link";
import { useNearScreen } from "@/shell/Wall";
import { itemCard, type OwnedItem } from "./owned-item";

// One owned item on the Closet's wall: its first picture, or its piece drawn
// in its colour, then its name, brand line, and price. Each text stays on one
// line, so every card of a row has one height.
export function ItemCard({ item }: { item: OwnedItem }) {
	const linkTo = useItemLink();
	const ref = useRef<HTMLAnchorElement>(null);
	const near = useNearScreen(ref);
	const card = itemCard(item);
	const [picture] = item.pictureIds;
	return (
		<Link
			ref={ref}
			{...linkTo(item)}
			data-slot="closet-card"
			aria-label={card.label}
			className="flex min-w-0 flex-col gap-[7px]"
		>
			<span className="relative block aspect-[3/4] w-full overflow-hidden rounded-[14px] bg-[#D3CFC9]">
				{picture ? (
					<img
						src={pictureAddress(picture)}
						alt=""
						loading="lazy"
						className="size-full object-cover"
					/>
				) : near ? (
					<TypeFigure
						typeId={item.typeId}
						hex={item.colour.hex}
						className="absolute inset-[10%] size-[80%]"
					/>
				) : null}
				{card.badge === null ? null : (
					<span className="absolute top-2 right-2 grid h-6 min-w-6 place-items-center rounded-full bg-foreground px-1.5 font-semibold text-[12px] text-background">
						{card.badge}
					</span>
				)}
			</span>
			<span className="flex min-w-0 flex-col">
				<span className="truncate font-medium text-[13.5px]">{card.title}</span>
				<span className="flex min-w-0 items-center gap-1.5 text-[12.5px] text-muted-foreground">
					<span
						aria-hidden
						className="size-2 flex-none rounded-full ring-1 ring-border"
						style={{ backgroundColor: item.colour.hex }}
					/>
					<span className="truncate">{card.line}</span>
				</span>
				{card.price === null ? null : (
					<span className="font-medium text-[13.5px]">{card.price}</span>
				)}
			</span>
		</Link>
	);
}

export function ItemCardSkeleton() {
	return (
		<div className="flex flex-col gap-[7px]">
			<span
				className={`block aspect-[3/4] w-full rounded-[14px] bg-[#D3CFC9] ${PULSE}`}
			/>
			<span className={`block h-3.5 w-[80%] rounded-[12px] ${PLACEHOLDER}`} />
			<span className={`block h-3 w-[60%] rounded-[12px] ${PLACEHOLDER}`} />
			<span className={`block h-3 w-[40%] rounded-[12px] ${PLACEHOLDER}`} />
		</div>
	);
}
