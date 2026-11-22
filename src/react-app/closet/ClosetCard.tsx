import { ItemCard } from "@/item/ItemCard";
import type { Back } from "@/shell/piece-link";
import { itemCard, type OwnedItem, ownedItemPage } from "./owned-item";

// One owned item on the Closet's wall. An item with no price has no price
// line, not "No price": the price paid is a note, not a shop's offer.
export function ClosetCard({ item, state }: { item: OwnedItem; state: Back }) {
	const card = itemCard(item);
	return (
		<ItemCard
			to={ownedItemPage(item.id)}
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
