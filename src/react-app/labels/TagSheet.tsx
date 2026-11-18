import { useAddTag, useDeleteTag, useRenameTag } from "@/tags/api";
import { type ListedTag, TAG_NAME_MAX, tagDeleteText } from "@/tags/tag";
import { LabelSheet } from "./LabelSheet";

// The form to add a tag, or to rename the one it is given: its name alone.
// A tag has no limit, and a delete takes it off its combinations.
export function TagSheet({
	tags,
	editing,
	onClose,
}: {
	tags: ListedTag[];
	editing: ListedTag | null;
	onClose: () => void;
}) {
	const add = useAddTag();
	const rename = useRenameTag();
	const del = useDeleteTag();
	return (
		<LabelSheet
			words={{
				addTitle: "New tag",
				editTitle: "Edit tag",
				addLabel: "Save",
				confirmTitle: () => "Delete this tag?",
				confirmText: tagDeleteText(editing?.combinations ?? 0),
				taken: "You have this tag already.",
				added: "Tag saved",
				changed: "Tag saved",
				deleted: "Tag deleted",
			}}
			labels={tags}
			nameMax={TAG_NAME_MAX}
			editing={editing}
			onSave={(name) =>
				editing
					? rename.mutateAsync({ id: editing.id, name })
					: add.mutateAsync(name)
			}
			onDelete={(id) => del.mutateAsync(id)}
			onClose={onClose}
		/>
	);
}
