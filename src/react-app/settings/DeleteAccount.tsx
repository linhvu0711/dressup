import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { Dialog } from "radix-ui";
import { useState } from "react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { meQueryKey } from "../session";

// The "Delete my account" row of the Settings page and its confirm,
// docs/prototype/dressup.html:908 and :949-950.
export function DeleteAccount() {
	const [asking, setAsking] = useState(false);
	return (
		<>
			<div className="flex min-h-[58px] min-w-0 items-center gap-2.5 border-b border-border py-[11px]">
				<div className="min-w-0">
					Delete my account
					<small className="block text-xs text-muted-foreground">
						Your looks and colours go away for good.
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
	const queryClient = useQueryClient();
	const navigate = useNavigate();
	const toast = useToast();
	const del = useMutation({
		mutationFn: async () => {
			const res = await fetch("/api/account", { method: "DELETE" });
			// No session: the session check finds none and shows sign-in.
			if (res.status === 401)
				void queryClient.invalidateQueries({ queryKey: meQueryKey });
			if (res.status !== 204)
				throw new Error(`DELETE /api/account answered ${res.status}`);
		},
		onSuccess: async () => {
			toast("Account deleted");
			// As sign-out: a check sent before the delete still carries the old
			// cookies, and its late 200 would put the person back in the app.
			await queryClient.cancelQueries({ queryKey: meQueryKey });
			queryClient.setQueryData(meQueryKey, null);
			navigate("/", { replace: true });
		},
	});

	return (
		<Dialog.Root open onOpenChange={(open) => open || onClose()}>
			<Dialog.Portal>
				<Dialog.Overlay className="fixed inset-0 z-20 bg-[rgba(20,18,14,.42)]" />
				<Dialog.Content
					role="alertdialog"
					className="fixed inset-x-0 bottom-0 z-[21] flex max-h-[88%] flex-col gap-4 overflow-auto rounded-t-[26px] border border-border border-b-0 bg-card p-5 pb-[22px] shadow-float outline-none duration-[260ms] ease-soft data-[state=open]:slide-in-from-bottom-8 data-[state=open]:animate-in wide:inset-x-auto wide:top-1/2 wide:bottom-auto wide:left-1/2 wide:w-[430px] wide:-translate-x-1/2 wide:-translate-y-1/2 wide:rounded-[22px] wide:border-b wide:p-6"
				>
					<Dialog.Title className="text-[25px] leading-tight">
						Delete your account?
					</Dialog.Title>
					<Dialog.Description className="text-[14px] text-muted-foreground">
						All your looks and colours go away for good. You cannot undo this.
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
