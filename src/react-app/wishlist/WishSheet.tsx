import { useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { TypeField, TypeOptions } from "@/closet/TypeOptions";
import { PanelSheet, usePanel } from "@/components/ui/panel-sheet";
import { Field } from "@/components/ui/sheet-form";
import { limitText } from "@/count-text";
import { RequestError } from "@/data/client";
import type { TypeId } from "@/dress/clothing-types";
import { ColourSwatches } from "@/labels/ColourSwatches";
import type { ColourId } from "@/labels/colour";
import { usePictureSlots } from "@/pictures/usePictureSlots";
import { useAddToWishlist, useWishlist } from "./api";
import {
	PROBLEM_TEXT,
	ShopLinkFields,
	useShopLinkFields,
} from "./ShopLinkFields";
import {
	pageAfterAdd,
	SHOP_LINK_LIMIT,
	type ShopLinkId,
	WISH_LIMIT,
	type WishId,
} from "./wish";

const newLinkId = () => crypto.randomUUID() as ShopLinkId;

const codeOf = (error: Error | null) =>
	error instanceof RequestError ? error.code : null;

// The one form to add to the Wishlist: a type, a colour, then the first
// shop link, which is left out when no field of it is set. The type and
// brand lists swap into the same sheet.
export function WishSheet({ onClose }: { onClose: () => void }) {
	const [typeId, setTypeId] = useState<TypeId | null>(null);
	const [colourId, setColourId] = useState<ColourId | undefined>();
	const first = useRef<HTMLButtonElement>(null);
	const wishlist = useWishlist();
	const add = useAddToWishlist();
	const slots = usePictureSlots([]);
	const panel = usePanel<WishId>({
		id: null,
		sent: add,
		onClose,
		discard: slots.discard,
	});
	const fields = useShopLinkFields(panel, slots, null);
	const navigate = useNavigate();
	const location = useLocation();
	// One id per try for the link too, as for the wish: the panel turns its id
	// over on every change or pick, so a Save again with nothing changed sends
	// both ids again.
	const [ids, setIds] = useState({ wish: panel.id, link: newLinkId() });
	if (ids.wish !== panel.id) setIds({ wish: panel.id, link: newLinkId() });
	const held = wishlist.data?.find(
		(w) => w.typeId === typeId && w.colour.id === colourId,
	);
	const code = codeOf(add.error);
	// A piece already wished for gets the link, so the limit blocks only a
	// new wish. A 409 means another tab filled the wishlist or the wish.
	const full =
		(!held && (wishlist.data?.length ?? 0) >= WISH_LIMIT) ||
		code === "wish_limit";
	const linkFull =
		(fields.touched &&
			held !== undefined &&
			held.shopLinks.length >= SHOP_LINK_LIMIT) ||
		code === "shop_link_limit";
	const limitHit = code === "picture_limit";
	const problem = full
		? limitText(WISH_LIMIT, "wishes")
		: linkFull
			? `${SHOP_LINK_LIMIT} shop links is the limit for one wish.`
			: add.isError && !limitHit
				? PROBLEM_TEXT.failed
				: null;
	const save = async () => {
		if (!typeId || !colourId || full || linkFull) return;
		if (add.isPending || slots.saving) return;
		const link = fields.touched ? await fields.read() : null;
		if (fields.touched && link === null) return;
		const linkId = ids.link;
		add.mutate(
			{
				id: panel.id,
				typeId,
				colourId,
				shopLink: link ? { id: linkId, ...link } : undefined,
			},
			{
				onSuccess: (wish) => {
					panel.done("Added to your wishlist");
					navigate(pageAfterAdd(wish, link ? linkId : null), {
						state: { search: location.search },
					});
				},
			},
		);
	};

	return (
		<PanelSheet
			panel={panel}
			title="Add to wishlist"
			focus={first}
			steps={{
				types: {
					title: "Pick a type",
					body: <TypeOptions onPick={panel.pick(setTypeId)} />,
				},
				brands: fields.brandStep,
			}}
			problem={problem}
			save={{
				disabled:
					!typeId ||
					!colourId ||
					full ||
					linkFull ||
					add.isPending ||
					slots.saving,
				run: () => void save(),
			}}
		>
			<TypeField
				ref={first}
				typeId={typeId}
				onOpen={() => panel.open("types")}
			/>
			<Field label="Colour">
				<ColourSwatches value={colourId} onChange={panel.change(setColourId)} />
			</Field>
			<ShopLinkFields fields={fields} panel={panel} limitHit={limitHit} />
		</PanelSheet>
	);
}
