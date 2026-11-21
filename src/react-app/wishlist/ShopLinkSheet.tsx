import { useRef, useState } from "react";
import { PanelSheet, usePanel } from "@/components/ui/panel-sheet";
import { Field, INPUT } from "@/components/ui/sheet-form";
import { RequestError } from "@/data/client";
import { BrandField, useBrandPick } from "@/labels/BrandField";
import { PICTURES_LABEL, PictureSlots } from "@/pictures/PictureSlots";
import { usePictureSlots } from "@/pictures/usePictureSlots";
import { typedPrice } from "@/price";
import { useAddShopLink, useChangeShopLink, useDeleteShopLink } from "./api";
import {
	ADDRESS_MAX,
	isWebAddress,
	SHOP_LINK_NAME_MAX,
	type ShopLink,
	type ShopLinkId,
	shopName,
	type WishId,
} from "./wish";

// What the form says under its fields: a field the Save found wrong, or
// the send that failed.
type Problem = "address" | "name" | "failed";

const PROBLEM_TEXT: Record<Problem, string> = {
	address: "Enter a web address that starts with https://.",
	name: "Enter a name.",
	failed: "Not saved. Try again.",
};

const priceShown = (price: number | null) =>
	price === null ? "" : typedPrice(String(price)).shown;

// The form to add a shop link to a wish, or to change or delete the one it
// is given.
export function ShopLinkSheet(
	props: { onClose: () => void } & (
		| { mode: "add"; wishId: WishId }
		| { mode: "edit"; link: ShopLink }
	),
) {
	const { onClose } = props;
	const editing = props.mode === "edit" ? props.link : null;
	const [url, setUrl] = useState(editing?.url ?? "");
	const [name, setName] = useState(editing?.name ?? "");
	const [price, setPrice] = useState(() => ({
		value: editing?.price ?? null,
		shown: priceShown(editing?.price ?? null),
	}));
	const slots = usePictureSlots(editing?.pictureIds ?? []);
	const first = useRef<HTMLInputElement>(null);
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
	const brand = useBrandPick(panel, editing?.brand ?? null);
	const limitHit =
		sent.error instanceof RequestError && sent.error.code === "picture_limit";
	const save = async () => {
		if (sent.isPending || slots.saving) return;
		if (!isWebAddress(url)) return panel.check(PROBLEM_TEXT.address);
		if (name.trim() === "") return panel.check(PROBLEM_TEXT.name);
		const pictureIds = await slots.settle();
		if (pictureIds === null) return;
		const link = {
			url: url.trim(),
			brandId: brand.brandId,
			name: name.trim(),
			price: price.value,
			pictureIds,
		};
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
			focus={first}
			steps={{ brands: brand.step }}
			problem={sent.isError && !limitHit ? PROBLEM_TEXT.failed : null}
			save={{
				disabled: sent.isPending || slots.saving,
				run: () => void save(),
			}}
			remove={
				editing
					? {
							title: "Delete this shop link?",
							text: `${shopName(editing)} · ${editing.name}`,
							deleted: "Shop link deleted",
							del,
						}
					: undefined
			}
		>
			<Field label="Address">
				<input
					ref={first}
					aria-label="Address"
					type="text"
					inputMode="url"
					autoComplete="off"
					maxLength={ADDRESS_MAX}
					placeholder="https://"
					value={url}
					onChange={(e) => panel.change(setUrl)(e.target.value)}
					className={INPUT}
				/>
			</Field>
			<BrandField pick={brand} aria-label="Brand" />
			<Field label="Name">
				<input
					aria-label="Name"
					autoComplete="off"
					maxLength={SHOP_LINK_NAME_MAX}
					value={name}
					onChange={(e) => panel.change(setName)(e.target.value)}
					className={INPUT}
				/>
			</Field>
			<Field label="Price in ₫">
				<input
					aria-label="Price in ₫"
					inputMode="numeric"
					autoComplete="off"
					value={price.shown}
					onChange={(e) => panel.change(setPrice)(typedPrice(e.target.value))}
					className={INPUT}
				/>
			</Field>
			<Field label={PICTURES_LABEL}>
				<PictureSlots slots={slots} limitHit={limitHit} />
			</Field>
		</PanelSheet>
	);
}
