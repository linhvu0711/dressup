import { useMutation } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { Dialog } from "radix-ui";
import { useState } from "react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { SHEET, SHEET_OVERLAY } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { remove, signedOut } from "../data/client";

// The "Delete my account" row of the Settings page and its confirm.
export function DeleteAccount() {
	const [asking, setAsking] = useState(false);
	return (
		<>
			<div className="flex min-h-[58px] min-w-0 items-center gap-2.5 border-b border-border py-[11px]">
				<div className="min-w-0">
					Delete my account
					<small className="block text-xs text-muted-foreground">
						Your combinations, closet, wishlist, and colours go away for good.
					</small>
				</div>
				<span className="flex-1" />
				<Button
					variant="icon"
					size="icon"
					aria-label="Delete my account"
					title="Delete my account"
					className="text-destructive"
					onClick={() => setAsking(true)}
				>
					<Trash2 size={18} strokeWidth={1.9} aria-hidden />
				</Button>
			</div>
			{asking ? <DeleteConfirm onClose={() => setAsking(false)} /> : null}
		</>
	);
}

function DeleteConfirm({ onClose }: { onClose: () => void }) {
	const navigate = useNavigate();
	const toast = useToast();
	const del = useMutation({
		mutationFn: () => remove("/api/account"),
		onSuccess: async () => {
			toast("Account deleted");
			// As sign-out: no data of the deleted account stays.
			await signedOut();
			navigate("/", { replace: true });
		},
	});

	return (
		<Dialog.Root open onOpenChange={(open) => open || onClose()}>
			<Dialog.Portal>
				<Dialog.Overlay className={SHEET_OVERLAY} />
				<Dialog.Content role="alertdialog" className={SHEET}>
					<Dialog.Title className="text-[25px] leading-tight">
						Delete your account?
					</Dialog.Title>
					<Dialog.Description className="text-[14px] text-muted-foreground">
						All your combinations, closet, wishlist, and colours go away for
						good. You cannot undo this.
					</Dialog.Description>
					{del.isError ? (
						<p role="alert" className="text-[13px] text-destructive">
							Not deleted. Try again.
						</p>
					) : null}
					<div className="mt-0.5 flex flex-wrap justify-end gap-2 [&>button]:flex-1 wide:[&>button]:flex-none">
						<Button type="button" onClick={onClose}>
							Cancel
						</Button>
						<Button
							type="button"
							variant="destructive"
							disabled={del.isPending}
							onClick={() => del.mutate()}
						>
							Delete
						</Button>
					</div>
				</Dialog.Content>
			</Dialog.Portal>
		</Dialog.Root>
	);
}
