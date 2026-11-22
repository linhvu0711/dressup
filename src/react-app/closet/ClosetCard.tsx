import { ItemCard } from "@/item/ItemCard";
import { useItemLink } from "@/shell/piece-link";
import { itemCard, type OwnedItem } from "./owned-item";

// One owned item on the Closet's wall. An item with no price has no price
// line, not "No price": the price paid is a note, not a shop's offer.
export function ClosetCard({ item }: { item: OwnedItem }) {
	const linkTo = useItemLink();
	const card = itemCard(item);
	const { to, state } = linkTo(item);
	return (
		<ItemCard
			to={to}
			state={state}
			slot="closet-card"
			label={card.label}
			pictureId={item.pictureIds[0] ?? null}
			piece={item}
			name={card.title}
			line={card.line}
			price={card.price ?? undefined}
			badge={card.badge}
		/>
	);
}
