import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { RemoveDialog } from "./RemoveDialog";
import { ShopLinkSheet } from "./ShopLinkSheet";
import { SHOP_LINK_LIMIT, type Wish } from "./wish";

const ICON = { size: 18, strokeWidth: 1.9, "aria-hidden": true } as const;

// The whole wish's actions, beside its cards on the piece page: one more shop
// link, or the wish with every link at once. A link page acts on one link.
export function WishActions({ wish }: { wish: Wish }) {
	const [open, setOpen] = useState<"add" | "remove" | null>(null);
	const close = () => setOpen(null);
	return (
		<fieldset aria-label="Wish actions" className="flex gap-2">
			<Button
				variant="icon"
				size="icon"
				className="border border-border"
				aria-label="Add a shop link"
				title="Add a shop link"
				disabled={wish.shopLinks.length >= SHOP_LINK_LIMIT}
				onClick={() => setOpen("add")}
			>
				<Plus {...ICON} />
			</Button>
			<Button
				variant="icon"
				size="icon"
				className="border-destructive/40 text-destructive"
				aria-label="Remove from wishlist"
				title="Remove from wishlist"
				onClick={() => setOpen("remove")}
			>
				<Trash2 {...ICON} />
			</Button>
			{open === "add" ? (
				<ShopLinkSheet mode="add" wishId={wish.id} onClose={close} />
			) : null}
			{open === "remove" ? <RemoveDialog wish={wish} onClose={close} /> : null}
		</fieldset>
	);
}
