import { Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { Navigate, useLocation, useParams } from "react-router";
import { useCloset } from "@/closet/api";
import { DeleteOwnedItemDialog } from "@/closet/DeleteOwnedItemDialog";
import { OwnedItemSheet } from "@/closet/OwnedItemSheet";
import { itemCard, type OwnedItem } from "@/closet/owned-item";
import { Button } from "@/components/ui/button";
import { PageError } from "@/components/ui/page-error";
import { PLACEHOLDER } from "@/components/ui/placeholder";
import { TYPE_NAMES } from "@/dress/clothing-types";
import { ItemDetails, type ItemFact, ItemPage } from "@/item-page/ItemPage";
import { priceText } from "@/price";
import { addressBeforePiece } from "@/shell/piece-link";

// One owned item. The server has no one-item read, and the closet list holds
// every item, so the page finds it there.
export function ClosetItemPage() {
	const { itemId } = useParams();
	const location = useLocation();
	const back = addressBeforePiece(location.state);
	const closet = useCloset();
	const [open, setOpen] = useState<"edit" | "delete" | null>(null);
	const item = closet.data?.find((i) => i.id === itemId);
	// A typed address, another account's item, or the item deleted since.
	if (closet.data && !item) return <Navigate to={back} replace />;
	if (!item)
		return (
			<ItemPage back={back}>
				{closet.isPending ? (
					<span
						data-slot="item-loading"
						className={`block aspect-[3/4] w-full max-w-[440px] rounded-[14px] ${PLACEHOLDER}`}
					/>
				) : (
					<PageError
						title="Could not load your closet"
						onRetry={() => void closet.refetch()}
					/>
				)}
			</ItemPage>
		);
	return (
		<ItemPage back={back}>
			<ItemDetails
				piece={item}
				pictureIds={item.pictureIds}
				title={itemCard(item).title}
				brand={item.brand?.name ?? null}
				price={item.price}
				facts={itemFacts(item)}
				actions={
					<>
						<Button
							variant="icon"
							size="icon"
							aria-label="Edit item"
							title="Edit item"
							onClick={() => setOpen("edit")}
						>
							<Pencil size={18} strokeWidth={1.9} aria-hidden />
						</Button>
						<Button
							variant="icon"
							size="icon"
							aria-label="Delete item"
							title="Delete item"
							className="text-destructive"
							onClick={() => setOpen("delete")}
						>
							<Trash2 size={18} strokeWidth={1.9} aria-hidden />
						</Button>
					</>
				}
			/>
			{open === "edit" ? (
				<OwnedItemSheet mode="edit" item={item} onClose={() => setOpen(null)} />
			) : null}
			{open === "delete" ? (
				<DeleteOwnedItemDialog
					item={item}
					back={back}
					onClose={() => setOpen(null)}
				/>
			) : null}
		</ItemPage>
	);
}

function itemFacts(item: OwnedItem): ItemFact[] {
	const facts: ItemFact[] = [
		{ term: "Type", value: TYPE_NAMES[item.typeId] },
		{
			term: "Colour",
			value: (
				<span className="inline-flex items-center gap-1.5">
					<span
						aria-hidden
						className="size-2.5 rounded-full ring-1 ring-border"
						style={{ backgroundColor: item.colour.hex }}
					/>
					{item.colour.name}
				</span>
			),
		},
		{ term: "Brand", value: item.brand?.name ?? "No brand" },
		{ term: "Quantity", value: String(item.quantity) },
	];
	if (item.price !== null)
		facts.push({ term: "Price paid", value: priceText(item.price) });
	return facts;
}
