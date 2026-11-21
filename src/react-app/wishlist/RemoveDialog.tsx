import { AlertDialog } from "radix-ui";
import { Button } from "@/components/ui/button";
import { FOOTER_ROW, SHEET, SHEET_OVERLAY } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { useDeleteShopLink, useDeleteWish } from "./api";
import {
	removeLinkText,
	removeWishText,
	type ShopLink,
	type Wish,
} from "./wish";

// The confirm for a whole wish, or for one of its shop links. "Remove" waits
// for the server's answer before the confirm closes. The page then shows
// what is left, or goes back.
export function RemoveDialog({
	wish,
	link,
	onClose,
	onRemoved,
}: {
	wish: Wish;
	link?: ShopLink;
	onClose: () => void;
	onRemoved?: () => void;
}) {
	const delWish = useDeleteWish();
	const delLink = useDeleteShopLink();
	const toast = useToast();
	const handlers = {
		onSuccess: () => {
			onClose();
			toast("Removed from your wishlist");
			onRemoved?.();
		},
		onError: () => {
			onClose();
			toast("Not removed. Try again.");
		},
	};
	const pending = delWish.isPending || delLink.isPending;
	return (
		<AlertDialog.Root open onOpenChange={(open) => open || onClose()}>
			<AlertDialog.Portal>
				<AlertDialog.Overlay className={SHEET_OVERLAY} />
				<AlertDialog.Content className={SHEET}>
					<AlertDialog.Title className="text-[25px] leading-tight">
						Remove from wishlist?
					</AlertDialog.Title>
					<AlertDialog.Description className="text-muted-foreground">
						{link
							? removeLinkText(wish.shopLinks.length === 1)
							: removeWishText(wish.shopLinks.length)}
					</AlertDialog.Description>
					<div className={FOOTER_ROW}>
						<AlertDialog.Cancel asChild>
							<Button>Cancel</Button>
						</AlertDialog.Cancel>
						<Button
							variant="destructive"
							disabled={pending}
							onClick={() =>
								link
									? delLink.mutate(link.id, handlers)
									: delWish.mutate(wish.id, handlers)
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
