import { BRAND_LIMIT, BRAND_NAME_MAX, type Brand } from "./brand";
import { useAddBrand } from "./brand-api";
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

// The form to add a brand: its name alone.
export function BrandSheet({
	brands,
	onClose,
}: {
	brands: Brand[];
	onClose: () => void;
}) {
	const add = useAddBrand();
	return (
		<LabelSheet
			words={WORDS}
			labels={brands}
			limit={BRAND_LIMIT}
			limitCode="brand_limit"
			nameMax={BRAND_NAME_MAX}
			editing={null}
			onSave={(name) => add.mutateAsync(name)}
			onDelete={async () => {}}
			onClose={onClose}
		/>
	);
}
