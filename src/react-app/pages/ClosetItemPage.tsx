import { Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { useLocation, useParams } from "react-router";
import { useCloset } from "@/closet/api";
import { DeleteOwnedItemDialog } from "@/closet/DeleteOwnedItemDialog";
import { OwnedItemSheet } from "@/closet/OwnedItemSheet";
import { itemCard, type OwnedItem } from "@/closet/owned-item";
import { PieceCombinations } from "@/combinations/PieceCombinations";
import { Button } from "@/components/ui/button";
import { TYPE_NAMES } from "@/dress/clothing-types";
import { ColourValue, Facts } from "@/item/Facts";
import { ItemPage } from "@/item/ItemPage";
import { ItemPictures } from "@/item/ItemPictures";
import { priceText } from "@/price";
import { type Back, readBack } from "@/shell/piece-link";

const ICON = { size: 18, strokeWidth: 1.9, "aria-hidden": true } as const;

// One owned item. The server has no one-item read, and the closet list holds
// every item, so the page finds it there.
export function ClosetItemPage() {
	const { itemId } = useParams();
	const location = useLocation();
	const back = readBack(location.state, "/closet");
	return (
		<ItemPage
			back={back}
			query={useCloset()}
			find={(items) => items.find((i) => i.id === itemId)}
			failedTitle="Could not load your closet"
		>
			{(item) => ({
				pictures: (
					<ItemPictures
						key={item.id}
						ids={item.pictureIds}
						piece={item}
						label={itemCard(item).title}
					/>
				),
				details: <ItemDetails item={item} back={back} />,
				below: <PieceCombinations piece={item} />,
			})}
		</ItemPage>
	);
}

function ItemDetails({ item, back }: { item: OwnedItem; back: Back }) {
	const [open, setOpen] = useState<"edit" | "delete" | null>(null);
	const card = itemCard(item);
	return (
		<>
			<div className="flex flex-col gap-1">
				<h1 className="break-words text-[32px] leading-tight">{card.title}</h1>
				{item.brand === null ? null : (
					<p
						data-slot="item-brand"
						className="text-[13px] text-muted-foreground"
					>
						{item.brand.name}
					</p>
				)}
				{card.price === null ? null : (
					<p data-slot="item-price" className="font-medium text-[20px]">
						{card.price}
					</p>
				)}
			</div>
			<fieldset aria-label="Actions" className="flex gap-2">
				<Button
					variant="icon"
					size="icon"
					className="border border-border"
					aria-label="Edit item"
					title="Edit item"
					onClick={() => setOpen("edit")}
				>
					<Pencil {...ICON} />
				</Button>
				<Button
					variant="icon"
					size="icon"
					className="border-destructive/40 text-destructive"
					aria-label="Delete item"
					title="Delete item"
					onClick={() => setOpen("delete")}
				>
					<Trash2 {...ICON} />
				</Button>
			</fieldset>
			<Facts
				rows={[
					{ label: "Type", value: TYPE_NAMES[item.typeId] },
					{ label: "Colour", value: <ColourValue colour={item.colour} /> },
					{ label: "Brand", value: item.brand?.name ?? "No brand" },
					{ label: "Quantity", value: String(item.quantity) },
					...(item.price === null
						? []
						: [{ label: "Price paid", value: priceText(item.price) }]),
				]}
			/>
			{open === "edit" ? (
				<OwnedItemSheet mode="edit" item={item} onClose={() => setOpen(null)} />
			) : open === "delete" ? (
				<DeleteOwnedItemDialog
					item={item}
					back={back}
					onClose={() => setOpen(null)}
				/>
			) : null}
		</>
	);
}
