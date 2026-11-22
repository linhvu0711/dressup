import { pieceName } from "@/combinations/combination";
import { ItemCard } from "@/item/ItemCard";
import {
	type WishlistCard as Card,
	linkPage,
	priceText,
	shopName,
	wishPage,
} from "./wish";

// A Wishlist card from a wish and one of its shop links, or the wish alone
// when it has none.
export function WishlistCard({
	card: { wish, link },
	state,
	slot,
}: {
	card: Card;
	state: unknown;
	slot: string;
}) {
	if (link === null)
		return (
			<ItemCard
				to={wishPage(wish.id)}
				state={state}
				slot={slot}
				label={`${pieceName(wish)}, No shop link yet`}
				piece={wish}
				name={pieceName(wish)}
				line="No shop link yet"
			/>
		);
	const line = `${shopName(link)} · ${pieceName(wish)}`;
	return (
		<ItemCard
			to={linkPage(link.id)}
			state={state}
			slot={slot}
			label={`${link.name}, ${line}`}
			pictureId={link.pictureIds[0] ?? null}
			piece={wish}
			name={link.name}
			line={line}
			price={link.price === null ? null : priceText(link.price)}
		/>
	);
}
