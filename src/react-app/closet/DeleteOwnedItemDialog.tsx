import { AlertDialog } from "radix-ui";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { FOOTER_ROW, SHEET, SHEET_OVERLAY } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import type { Back } from "@/shell/piece-link";
import { useDeleteOwnedItem } from "./api";
import { itemCard, type OwnedItem } from "./owned-item";

// The confirm. "Delete" waits for the server's answer before the confirm
// closes; an item another tab deleted first is gone all the same.
export function DeleteOwnedItemDialog({
	item,
	back,
	onClose,
}: {
	item: OwnedItem;
	back: Back;
	onClose: () => void;
}) {
	const del = useDeleteOwnedItem();
	const navigate = useNavigate();
	const toast = useToast();
	return (
		<AlertDialog.Root open onOpenChange={(open) => open || onClose()}>
			<AlertDialog.Portal>
				<AlertDialog.Overlay className={SHEET_OVERLAY} />
				<AlertDialog.Content className={SHEET}>
					<AlertDialog.Title className="text-[25px] leading-tight">
						Remove this item?
					</AlertDialog.Title>
					<AlertDialog.Description className="text-muted-foreground">
						{`${itemCard(item).title} · ${item.brand?.name ?? "No brand"}`}
					</AlertDialog.Description>
					<div className={FOOTER_ROW}>
						<AlertDialog.Cancel asChild>
							<Button>Cancel</Button>
						</AlertDialog.Cancel>
						<Button
							variant="destructive"
							disabled={del.isPending}
							onClick={() =>
								del.mutate(item.id, {
									onSuccess: () => {
										onClose();
										navigate(back.to, { replace: true, state: back.state });
										toast("Removed from your closet");
									},
									onError: () => {
										onClose();
										toast("Not deleted. Try again.");
									},
								})
							}
						>
							Delete
						</Button>
					</div>
				</AlertDialog.Content>
			</AlertDialog.Portal>
		</AlertDialog.Root>
	);
}
