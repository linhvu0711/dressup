import { AlertDialog } from "radix-ui";
import { Button } from "@/components/ui/button";
import { SHEET, SHEET_OVERLAY } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { useDeleteTag } from "./api";
import type { Tag } from "./tag";

// The confirm of docs/prototype/dressup.html:1076. "Delete" waits for the
// server's answer before the confirm closes.
export function DeleteTagDialog({
	tag,
	onClose,
	onFailed,
}: {
	tag: Tag;
	onClose: () => void;
	onFailed: () => void;
}) {
	const del = useDeleteTag();
	const toast = useToast();
	return (
		<AlertDialog.Root open onOpenChange={(open) => open || onClose()}>
			<AlertDialog.Portal>
				<AlertDialog.Overlay className={SHEET_OVERLAY} />
				<AlertDialog.Content className={SHEET}>
					<AlertDialog.Title className="text-[25px] leading-tight">
						Delete the tag "{tag.name}"?
					</AlertDialog.Title>
					<AlertDialog.Description className="text-muted-foreground">
						The looks stay. They lose only this tag.
					</AlertDialog.Description>
					<div className="mt-0.5 flex flex-wrap justify-end gap-2 [&>button]:flex-1 wide:[&>button]:flex-none">
						<AlertDialog.Cancel asChild>
							<Button>Cancel</Button>
						</AlertDialog.Cancel>
						<Button
							variant="destructive"
							disabled={del.isPending}
							onClick={() =>
								del.mutate(tag.id, {
									onSuccess: () => {
										onClose();
										toast("Tag deleted");
									},
									onError: () => {
										onClose();
										onFailed();
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
