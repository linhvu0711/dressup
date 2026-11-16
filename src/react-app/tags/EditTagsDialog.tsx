import { Pencil, Trash2, X } from "lucide-react";
import { Dialog } from "radix-ui";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { SHEET, SHEET_OVERLAY } from "@/components/ui/sheet";
import { TagNameTaken, useAddTag, useRenameTag, useTags } from "./api";
import { DeleteTagDialog } from "./DeleteTagDialog";
import { TagNameField } from "./TagNameField";
import type { Tag, TagId } from "./tag";

type Field = { kind: "add" } | { kind: "rename"; id: TagId } | null;

const ROW =
	"flex min-h-[54px] items-center gap-2 border-border border-b py-[9px]";

// The tag list: rename in place, delete,
// and add. One box is open at a time.
export function EditTagsDialog({ onClose }: { onClose: () => void }) {
	const tags = useTags();
	const add = useAddTag();
	const rename = useRenameTag();
	const [field, setField] = useState<Field>(null);
	const [failed, setFailed] = useState(false);
	const [deleting, setDeleting] = useState<Tag | null>(null);

	const open = (next: Field) => {
		setField(next);
		setFailed(false);
	};
	// A failed save closes its box, so the list shows the names it had.
	const saving =
		<T,>(send: (value: T) => Promise<unknown>) =>
		async (value: T) => {
			try {
				await send(value);
			} catch (error) {
				if (error instanceof TagNameTaken) throw error;
				setFailed(true);
			}
			setField(null);
		};

	return (
		<Dialog.Root open onOpenChange={(open) => open || onClose()}>
			<Dialog.Portal>
				<Dialog.Overlay className={SHEET_OVERLAY} />
				<Dialog.Content aria-describedby={undefined} className={SHEET}>
					<div className="flex items-center">
						<Dialog.Title className="text-[25px] leading-tight">
							Edit tags
						</Dialog.Title>
						<span className="flex-1" />
						<Dialog.Close asChild>
							<Button
								variant="icon"
								size="icon"
								aria-label="Close"
								title="Close"
							>
								<X size={18} strokeWidth={1.9} aria-hidden />
							</Button>
						</Dialog.Close>
					</div>
					<div>
						{tags.data?.length ? (
							<ul>
								{tags.data.map((tag) =>
									field?.kind === "rename" && field.id === tag.id ? (
										<li key={tag.id} className={ROW}>
											<TagNameField
												label={`New name for ${tag.name}`}
												saveLabel="Save name"
												initial={tag.name}
												except={tag.id}
												className="flex-1"
												boxClassName="h-9 flex-1"
												onSave={saving((name: string) =>
													rename.mutateAsync({ id: tag.id, name }),
												)}
												onCancel={() => setField(null)}
											/>
										</li>
									) : (
										<li key={tag.id} className={ROW}>
											<span className="min-w-0 truncate">{tag.name}</span>
											<span className="flex-1" />
											<Button
												variant="icon"
												size="icon-sm"
												aria-label={`Rename ${tag.name}`}
												title="Rename"
												onClick={() => open({ kind: "rename", id: tag.id })}
											>
												<Pencil size={16} strokeWidth={1.9} aria-hidden />
											</Button>
											<Button
												variant="icon"
												size="icon-sm"
												aria-label={`Delete ${tag.name}`}
												title="Delete"
												className="text-destructive"
												onClick={() => {
													open(null);
													setDeleting(tag);
												}}
											>
												<Trash2 size={16} strokeWidth={1.9} aria-hidden />
											</Button>
										</li>
									),
								)}
							</ul>
						) : (
							<p className="py-2 text-muted-foreground">No tags yet.</p>
						)}
						<div className="flex min-h-[54px] items-center py-[9px]">
							{field?.kind === "add" ? (
								<TagNameField
									label="New tag"
									saveLabel="Add tag"
									className="flex-1"
									boxClassName="h-9 flex-1"
									onSave={saving((name: string) => add.mutateAsync(name))}
									onCancel={() => setField(null)}
								/>
							) : (
								<Button onClick={() => open({ kind: "add" })}>+ New tag</Button>
							)}
						</div>
					</div>
					{failed ? (
						<p role="alert" className="text-[13px] text-destructive">
							Not saved. Try again.
						</p>
					) : null}
					{deleting ? (
						<DeleteTagDialog
							tag={deleting}
							onClose={() => setDeleting(null)}
							onFailed={() => setFailed(true)}
						/>
					) : null}
				</Dialog.Content>
			</Dialog.Portal>
		</Dialog.Root>
	);
}
