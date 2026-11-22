import { PanelSheet, usePanel } from "@/components/ui/panel-sheet";
import { RequestError } from "@/data/client";
import { usePictureSlots } from "@/pictures/usePictureSlots";
import { useAddShopLink, useChangeShopLink, useDeleteShopLink } from "./api";
import {
	PROBLEM_TEXT,
	ShopLinkFields,
	useShopLinkFields,
} from "./ShopLinkFields";
import {
	removeLinkText,
	type ShopLink,
	type ShopLinkId,
	shopName,
	type WishId,
} from "./wish";

// The form to add a shop link to a wish, or to change or delete the one it
// is given.
export function ShopLinkSheet(
	props: { onClose: () => void } & (
		| { mode: "add"; wishId: WishId }
		| { mode: "edit"; link: ShopLink; lastLink: boolean }
	),
) {
	const { onClose } = props;
	const editing = props.mode === "edit" ? props.link : null;
	const slots = usePictureSlots(editing?.pictureIds ?? []);
	const add = useAddShopLink();
	const update = useChangeShopLink();
	const del = useDeleteShopLink();
	const sent = editing ? update : add;
	const panel = usePanel<ShopLinkId>({
		id: editing?.id ?? null,
		sent,
		onClose,
		discard: slots.discard,
	});
	const fields = useShopLinkFields(panel, slots, editing);
	const limitHit =
		sent.error instanceof RequestError && sent.error.code === "picture_limit";
	const save = async () => {
		if (sent.isPending || slots.saving) return;
		const link = await fields.read();
		if (link === null) return;
		if (editing)
			update.mutate(
				{ id: panel.id, ...link },
				{ onSuccess: () => panel.done("Changes saved") },
			);
		else if (props.mode === "add")
			add.mutate(
				{ wishId: props.wishId, id: panel.id, ...link },
				{ onSuccess: () => panel.done("Shop link added") },
			);
	};

	return (
		<PanelSheet
			panel={panel}
			title={editing ? "Edit shop link" : "Add a shop link"}
			focus={fields.first}
			steps={{ brands: fields.brandStep }}
			problem={sent.isError && !limitHit ? PROBLEM_TEXT.failed : null}
			save={{
				disabled: sent.isPending || slots.saving,
				run: () => void save(),
			}}
			remove={
				editing
					? {
							title: "Delete this shop link?",
							text:
								props.mode === "edit" && props.lastLink
									? `${shopName(editing)} · ${editing.name}. ${removeLinkText(true)}`
									: `${shopName(editing)} · ${editing.name}`,
							deleted: "Shop link deleted",
							del,
						}
					: undefined
			}
		>
			<ShopLinkFields fields={fields} panel={panel} limitHit={limitHit} />
		</PanelSheet>
	);
}
