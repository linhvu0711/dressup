import { ChevronRight } from "lucide-react";
import { useId, useState } from "react";
import { PictureStrip } from "@/pictures/PictureStrip";
import { OwnedItemSheet } from "./OwnedItemSheet";
import type { OwnedItem } from "./owned-item";

// The piece page's part for the closet: one row for each item of the piece,
// its brand and its quantity, then the item's pictures. A row opens the
// item's edit sheet.
export function ClosetPart({ items }: { items: readonly OwnedItem[] }) {
	const title = useId();
	const [editing, setEditing] = useState<OwnedItem | null>(null);
	return (
		<section aria-labelledby={title} className="flex flex-col gap-1">
			<h2 id={title} className="text-[22px]">
				In your closet
			</h2>
			<ul>
				{items.map((item) => {
					const label = `${item.brand?.name ?? "No brand"} × ${item.quantity}`;
					return (
						<li
							key={item.id}
							className="flex min-w-0 flex-col border-b border-border"
						>
							<button
								type="button"
								data-slot="item-row"
								aria-label={label}
								onClick={() => setEditing(item)}
								className="flex min-h-[58px] w-full min-w-0 items-center gap-3 py-[11px] text-left"
							>
								<span className="truncate text-[14px]">
									{item.brand?.name ?? "No brand"}
								</span>
								<span className="flex-1" />
								<span className="flex-none text-[14px] text-muted-foreground">
									× {item.quantity}
								</span>
								<ChevronRight
									size={18}
									className="flex-none text-muted-foreground"
									aria-hidden
								/>
							</button>
							<PictureStrip
								ids={item.pictureIds}
								brand={item.brand?.name ?? "No brand"}
							/>
						</li>
					);
				})}
			</ul>
			{editing ? (
				<OwnedItemSheet
					mode="edit"
					item={editing}
					onClose={() => setEditing(null)}
				/>
			) : null}
		</section>
	);
}
