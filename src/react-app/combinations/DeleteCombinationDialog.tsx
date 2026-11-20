import { AlertDialog } from "radix-ui";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { FOOTER_ROW, SHEET, SHEET_OVERLAY } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { useDeleteCombination } from "./api";
import { type Combination, combinationTitle } from "./combination";
import { useLeaveGoneCombination } from "./gone";
import { useWallAddress } from "./wall-address";

// The confirm. "Delete" waits for the server's answer before the confirm
// closes.
export function DeleteCombinationDialog({
	combination,
	onClose,
}: {
	combination: Combination;
	onClose: () => void;
}) {
	const del = useDeleteCombination();
	const navigate = useNavigate();
	const address = useWallAddress();
	const toast = useToast();
	const leaveGoneCombination = useLeaveGoneCombination();
	return (
		<AlertDialog.Root open onOpenChange={(open) => open || onClose()}>
			<AlertDialog.Portal>
				<AlertDialog.Overlay className={SHEET_OVERLAY} />
				<AlertDialog.Content className={SHEET}>
					<AlertDialog.Title className="text-[25px] leading-tight">
						Delete this combination?
					</AlertDialog.Title>
					<AlertDialog.Description className="text-muted-foreground">
						"{combinationTitle(combination)}" goes away for good. Your colours
						stay.
					</AlertDialog.Description>
					<div className={FOOTER_ROW}>
						<AlertDialog.Cancel asChild>
							<Button>Cancel</Button>
						</AlertDialog.Cancel>
						<Button
							variant="destructive"
							disabled={del.isPending}
							onClick={() =>
								del.mutate(combination.id, {
									onSuccess: (answer) => {
										onClose();
										if (answer === "gone") {
											leaveGoneCombination();
											return;
										}
										navigate(address.wall, { replace: true });
										toast("Combination deleted");
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
