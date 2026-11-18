import {
	BRAND_LIMIT,
	BRAND_NAME_MAX,
	brandDeleteText,
	type ListedBrand,
} from "./brand";
import { useAddBrand, useDeleteBrand, useRenameBrand } from "./brand-api";
import { LabelSheet, type LabelWords } from "./LabelSheet";

const WORDS: LabelWords = {
	addTitle: "New brand",
	editTitle: "Edit brand",
	addLabel: "Save",
	confirmTitle: () => "Delete this brand?",
	confirmText: "No item uses it.",
	taken: "You have this brand already.",
	full: `You have ${BRAND_LIMIT} brands. That is the limit. Delete one to add a new one.`,
	added: "Brand added",
	deleted: "Brand deleted",
};

// The form to add a brand, or to rename the one it is given: its name alone.
export function BrandSheet({
	brands,
	editing,
	onClose,
}: {
	brands: ListedBrand[];
	editing: ListedBrand | null;
	onClose: () => void;
}) {
	const add = useAddBrand();
	const rename = useRenameBrand();
	const del = useDeleteBrand();
	return (
		<LabelSheet
			words={{
				...WORDS,
				confirmText: brandDeleteText(
					editing?.items ?? 0,
					editing?.shopLinks ?? 0,
				),
			}}
			labels={brands}
			limit={BRAND_LIMIT}
			limitCode="brand_limit"
			nameMax={BRAND_NAME_MAX}
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
