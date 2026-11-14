import { AlertDialog } from "radix-ui";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { SHEET, SHEET_OVERLAY } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { useDressState } from "@/dress/DressState";
import { LookGone, useDeleteLook } from "./api";
import { useLeaveGoneLook } from "./gone";
import { type Look, lookName } from "./look";

// The confirm of docs/prototype/dressup.html:950, 1065. "Delete" waits for
// the server's answer before the confirm closes.
export function DeleteLookDialog({
	look,
	onClose,
}: {
	look: Look;
	onClose: () => void;
}) {
	const del = useDeleteLook();
	const navigate = useNavigate();
	const toast = useToast();
	const leaveGoneLook = useLeaveGoneLook();
	const dress = useDressState();
	return (
		<AlertDialog.Root open onOpenChange={(open) => open || onClose()}>
			<AlertDialog.Portal>
				<AlertDialog.Overlay className={SHEET_OVERLAY} />
				<AlertDialog.Content className={SHEET}>
					<AlertDialog.Title className="text-[25px] leading-tight">
						Delete this look?
					</AlertDialog.Title>
					<AlertDialog.Description className="text-muted-foreground">
						"{lookName(look)}" goes away for good. Your colour squares stay.
					</AlertDialog.Description>
					<div className="mt-0.5 flex flex-wrap justify-end gap-2 [&>button]:flex-1 wide:[&>button]:flex-none">
						<AlertDialog.Cancel asChild>
							<Button>Cancel</Button>
						</AlertDialog.Cancel>
						<Button
							variant="destructive"
							disabled={del.isPending}
							onClick={() =>
								del.mutate(look.id, {
									onSuccess: () => {
										if (
											dress.status === "ready" &&
											dress.editing?.id === look.id
										)
											dress.endEditing();
										onClose();
										navigate("/looks", { replace: true });
										toast("Look deleted");
									},
									onError: (error) => {
										onClose();
										if (error instanceof LookGone) leaveGoneLook(look.id);
										else toast("Not deleted. Try again.");
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
