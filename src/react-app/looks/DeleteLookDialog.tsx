import { AlertDialog } from "radix-ui";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
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
	return (
		<AlertDialog.Root open onOpenChange={(open) => open || onClose()}>
			<AlertDialog.Portal>
				<AlertDialog.Overlay className="fixed inset-0 z-20 bg-[rgba(20,18,14,.42)]" />
				<AlertDialog.Content className="fixed inset-x-0 bottom-0 z-[21] flex max-h-[88%] flex-col gap-4 overflow-auto rounded-t-[26px] border border-border border-b-0 bg-card p-5 pb-[22px] shadow-float outline-none duration-[260ms] ease-soft data-[state=open]:slide-in-from-bottom-8 data-[state=open]:animate-in wide:inset-x-auto wide:top-1/2 wide:bottom-auto wide:left-1/2 wide:w-[430px] wide:-translate-x-1/2 wide:-translate-y-1/2 wide:rounded-[22px] wide:border-b wide:p-6">
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
