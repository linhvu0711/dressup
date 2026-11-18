import { AlertDialog } from "radix-ui";
import { Button } from "@/components/ui/button";
import { SHEET, SHEET_OVERLAY } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { useDeleteWish } from "./api";
import { removeWishText, type Wish } from "./wish";

// The confirm. "Remove" waits for the server's answer before the confirm
// closes. The piece page then shows what is left, or goes back.
export function RemoveWishDialog({
	wish,
	onClose,
}: {
	wish: Wish;
	onClose: () => void;
}) {
	const del = useDeleteWish();
	const toast = useToast();
	return (
		<AlertDialog.Root open onOpenChange={(open) => open || onClose()}>
			<AlertDialog.Portal>
				<AlertDialog.Overlay className={SHEET_OVERLAY} />
				<AlertDialog.Content className={SHEET}>
					<AlertDialog.Title className="text-[25px] leading-tight">
						Remove from wishlist?
					</AlertDialog.Title>
					<AlertDialog.Description className="text-muted-foreground">
						{removeWishText(wish.shopLinks.length)}
					</AlertDialog.Description>
					<div className="mt-0.5 flex flex-wrap justify-end gap-2 [&>button]:flex-1 wide:[&>button]:flex-none">
						<AlertDialog.Cancel asChild>
							<Button>Cancel</Button>
						</AlertDialog.Cancel>
						<Button
							variant="destructive"
							disabled={del.isPending}
							onClick={() =>
								del.mutate(wish.id, {
									onSuccess: () => {
										onClose();
										toast("Removed from your wishlist");
									},
									onError: () => {
										onClose();
										toast("Not removed. Try again.");
									},
								})
							}
						>
							Remove
						</Button>
					</div>
				</AlertDialog.Content>
			</AlertDialog.Portal>
		</AlertDialog.Root>
	);
}
