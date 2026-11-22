import { useRef, useState } from "react";
import type { Panel } from "@/components/ui/panel-sheet";
import { Field, INPUT } from "@/components/ui/sheet-form";
import { BrandField, useBrandPick } from "@/labels/BrandField";
import type { BrandId } from "@/labels/brand";
import { PICTURES_LABEL, PictureSlots } from "@/pictures/PictureSlots";
import type { PictureId } from "@/pictures/picture";
import type { usePictureSlots } from "@/pictures/usePictureSlots";
import { typedPrice } from "@/price";
import { usePriceCursor } from "@/usePriceCursor";
import {
	ADDRESS_MAX,
	isWebAddress,
	SHOP_LINK_NAME_MAX,
	type ShopLink,
} from "./wish";

// What the form says under its fields: a field the Save found wrong, or
// the send that failed.
export const PROBLEM_TEXT = {
	address: "Enter a web address that starts with https://.",
	name: "Enter a name.",
	failed: "Not saved. Try again.",
} as const;

export type ShopLinkBody = {
	url: string;
	brandId: BrandId | null;
	name: string;
	price: number | null;
	pictureIds: PictureId[];
};

type Slots = ReturnType<typeof usePictureSlots>;

const priceShown = (price: number | null) =>
	price === null ? "" : typedPrice(String(price)).shown;

// The five fields of a shop link and their checks, for every form that
// writes one, so the forms never drift apart. The caller makes the picture
// slots before its panel, so the panel can discard their drafts on close.
export function useShopLinkFields<Id extends string>(
	panel: Panel<Id>,
	slots: Slots,
	saved: ShopLink | null,
) {
	const [url, setUrl] = useState(saved?.url ?? "");
	const [name, setName] = useState(saved?.name ?? "");
	const [price, setPrice] = useState(() => ({
		value: saved?.price ?? null,
		shown: priceShown(saved?.price ?? null),
	}));
	const brand = useBrandPick(panel, saved?.brand ?? null);
	const first = useRef<HTMLInputElement>(null);
	return {
		url,
		setUrl: panel.change(setUrl),
		name,
		setName: panel.change(setName),
		price,
		setPrice: panel.change(setPrice),
		brand,
		first,
		slots,
		brandStep: brand.step,
		touched:
			url !== "" ||
			name !== "" ||
			price.value !== null ||
			brand.brandId !== null ||
			slots.taken > 0,
		// The link to send, or null when a check stopped it or a picture did
		// not upload.
		async read(): Promise<ShopLinkBody | null> {
			if (!isWebAddress(url)) {
				panel.check(PROBLEM_TEXT.address, "address");
				return null;
			}
			if (name.trim() === "") {
				panel.check(PROBLEM_TEXT.name, "name");
				return null;
			}
			const pictureIds = await slots.settle();
			if (pictureIds === null) return null;
			return {
				url: url.trim(),
				brandId: brand.brandId,
				name: name.trim(),
				price: price.value,
				pictureIds,
			};
		},
	};
}

export type ShopLinkFieldsState = ReturnType<typeof useShopLinkFields>;

export function ShopLinkFields<Id extends string>({
	fields,
	panel,
	limitHit,
}: {
	fields: ShopLinkFieldsState;
	panel: Panel<Id>;
	limitHit: boolean;
}) {
	const priceCursor = usePriceCursor();
	return (
		<>
			<Field label="Address" problem={panel.problemFor("address")}>
				<input
					ref={fields.first}
					aria-label="Address"
					type="text"
					inputMode="url"
					autoComplete="off"
					maxLength={ADDRESS_MAX}
					placeholder="https://"
					value={fields.url}
					onChange={(e) => fields.setUrl(e.target.value)}
					className={INPUT}
				/>
			</Field>
			<BrandField pick={fields.brand} aria-label="Brand" />
			<Field label="Name" problem={panel.problemFor("name")}>
				<input
					aria-label="Name"
					autoComplete="off"
					maxLength={SHOP_LINK_NAME_MAX}
					value={fields.name}
					onChange={(e) => fields.setName(e.target.value)}
					className={INPUT}
				/>
			</Field>
			<Field label="Price in ₫">
				<input
					ref={priceCursor.ref}
					aria-label="Price in ₫"
					inputMode="numeric"
					autoComplete="off"
					value={fields.price.shown}
					onChange={(e) => {
						priceCursor.keep(e.target);
						fields.setPrice(typedPrice(e.target.value));
					}}
					className={INPUT}
				/>
			</Field>
			<Field label={PICTURES_LABEL}>
				<PictureSlots slots={fields.slots} limitHit={limitHit} />
			</Field>
		</>
	);
}
