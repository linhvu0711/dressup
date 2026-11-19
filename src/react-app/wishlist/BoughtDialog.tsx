import { AlertDialog } from "radix-ui";
import { OWNED_ITEM_LIMIT, QUANTITY_MAX } from "@/closet/owned-item";
import { Button } from "@/components/ui/button";
import { SHEET, SHEET_OVERLAY } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { after, cachedUserId, RequestError } from "@/data/client";
import { useMarkBought } from "./api";
import type { ShopLink, WishId } from "./wish";

const refusalText = (error: Error) => {
	if (error instanceof RequestError && error.code === "owned_item_limit")
		return `You have ${OWNED_ITEM_LIMIT} items. That is the limit. Delete one to add a new one.`;
	if (error instanceof RequestError && error.code === "quantity_limit")
		return `You have ${QUANTITY_MAX} of this item. That is the limit.`;
	return "Not saved. Try again.";
};

// The confirm. It stays open on a refusal, so the person reads why and can
// try again; a link gone since, bought or deleted in another tab, closes it.
export function BoughtDialog({
	link,
	wishId,
	onClose,
}: {
	link: ShopLink;
	wishId: WishId;
	onClose: () => void;
}) {
	const userId = cachedUserId();
	const bought = useMarkBought(wishId);
	const toast = useToast();
	return (
		<AlertDialog.Root open onOpenChange={(open) => open || onClose()}>
			<AlertDialog.Portal>
				<AlertDialog.Overlay className={SHEET_OVERLAY} />
				<AlertDialog.Content className={SHEET}>
					<AlertDialog.Title className="text-[25px] leading-tight">
						Bought this one?
					</AlertDialog.Title>
					<AlertDialog.Description className="text-muted-foreground">
						It goes to your closet with its pictures. The wish and its other
						shop links go away.
					</AlertDialog.Description>
					{bought.error ? (
						<p role="alert" className="text-[13px] text-destructive">
							{refusalText(bought.error)}
						</p>
					) : null}
					<div className="mt-0.5 flex flex-wrap justify-end gap-2 [&>button]:flex-1 wide:[&>button]:flex-none">
						<AlertDialog.Cancel asChild>
							<Button>Cancel</Button>
						</AlertDialog.Cancel>
						<Button
							variant="primary"
							disabled={bought.isPending}
							onClick={() =>
								bought.mutate(link.id, {
									onSuccess: () => {
										onClose();
										toast("Moved to your closet");
									},
									onError: (error) => {
										if (
											error instanceof RequestError &&
											error.code === "not_found"
										) {
											onClose();
											after.shopLinkDeleted(userId, link.id);
										}
									},
								})
							}
						>
							Bought
						</Button>
					</div>
				</AlertDialog.Content>
			</AlertDialog.Portal>
		</AlertDialog.Root>
	);
}
