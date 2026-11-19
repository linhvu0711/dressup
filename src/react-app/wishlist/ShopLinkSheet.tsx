import { ChevronRight } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FormSheet, ROW } from "@/components/ui/sheet-form";
import { useToast } from "@/components/ui/toast";
import { RequestError } from "@/data/client";
import { BrandOptions } from "@/labels/BrandOptions";
import type { BrandId } from "@/labels/brand";
import { useBrands } from "@/labels/brand-api";
import { PICTURES_LABEL, PictureSlots } from "@/pictures/PictureSlots";
import { usePictureSlots } from "@/pictures/usePictureSlots";
import { useAddShopLink, useChangeShopLink, useDeleteShopLink } from "./api";
import {
	ADDRESS_MAX,
	isWebAddress,
	SHOP_LINK_NAME_MAX,
	type ShopLink,
	type ShopLinkId,
	shopName,
	typedPrice,
	type WishId,
} from "./wish";

type Step = "form" | "brands" | "confirm";

const STEP_TITLE: Record<Exclude<Step, "form">, string> = {
	brands: "Pick a brand",
	confirm: "Delete this shop link?",
};

// What the form says under its fields: a field the Save found wrong, or
// the send that failed.
type Problem = "address" | "name" | "failed";

const PROBLEM_TEXT: Record<Problem, string> = {
	address: "Enter a web address that starts with https://.",
	name: "Enter a name.",
	failed: "Not saved. Try again.",
};

const INPUT =
	"h-10 min-w-0 rounded-[12px] border border-input bg-card px-3 text-[14px] outline-none focus-visible:border-ring";

const priceShown = (price: number | null) =>
	price === null ? "" : typedPrice(String(price)).shown;

// The form to add a shop link to a wish, or to change or delete the one it
// is given. The brand list and the delete confirm swap into the same sheet;
// the form stays mounted behind them, so Back finds what was typed.
export function ShopLinkSheet(
	props: { onClose: () => void } & (
		| { mode: "add"; wishId: WishId }
		| { mode: "edit"; link: ShopLink }
	),
) {
	const { onClose } = props;
	const editing = props.mode === "edit" ? props.link : null;
	// One id for what was typed, so a Save after a failed Save that did reach
	// the server gives back the same link rather than a second one.
	const [id, setId] = useState(
		() => editing?.id ?? (crypto.randomUUID() as ShopLinkId),
	);
	const [step, setStep] = useState<Step>("form");
	const [url, setUrl] = useState(editing?.url ?? "");
	const [brandId, setBrandId] = useState<BrandId | null>(
		editing?.brand?.id ?? null,
	);
	const [name, setName] = useState(editing?.name ?? "");
	const [price, setPrice] = useState(() => ({
		value: editing?.price ?? null,
		shown: priceShown(editing?.price ?? null),
	}));
	const [checked, setChecked] = useState<Problem | null>(null);
	const slots = usePictureSlots(editing?.pictureIds ?? []);
	const first = useRef<HTMLInputElement>(null);
	const brands = useBrands();
	const add = useAddShopLink();
	const update = useChangeShopLink();
	const del = useDeleteShopLink();
	const sent = editing ? update : add;
	const toast = useToast();
	const limitHit =
		sent.error instanceof RequestError && sent.error.code === "picture_limit";
	const problem = checked ?? (sent.isError && !limitHit ? "failed" : null);
	// The link's own brand while the brand list loads.
	const brandName =
		brands.data?.find((b) => b.id === brandId)?.name ??
		(brandId !== null && brandId === editing?.brand?.id
			? editing.brand.name
			: undefined);
	// A new value is a new try, so the last refusal no longer holds.
	const change =
		<T,>(set: (value: T) => void) =>
		(value: T) => {
			set(value);
			if (!editing) setId(crypto.randomUUID() as ShopLinkId);
			setChecked(null);
			sent.reset();
		};
	const back = () => {
		setStep("form");
		del.reset();
	};
	const done = (message: string) => () => {
		toast(message);
		onClose();
	};
	// Nothing picked in the sheet stays unless Save sent it.
	const close = () => {
		slots.discard();
		onClose();
	};
	const save = async () => {
		if (sent.isPending || slots.saving) return;
		if (!isWebAddress(url)) return setChecked("address");
		if (name.trim() === "") return setChecked("name");
		const pictureIds = await slots.settle();
		if (pictureIds === null) return;
		const link = {
			url: url.trim(),
			brandId,
			name: name.trim(),
			price: price.value,
			pictureIds,
		};
		if (editing)
			update.mutate({ id, ...link }, { onSuccess: done("Changes saved") });
		else if (props.mode === "add")
			add.mutate(
				{ wishId: props.wishId, id, ...link },
				{ onSuccess: done("Shop link added") },
			);
	};

	return (
		<FormSheet
			title={editing ? "Edit shop link" : "Add a shop link"}
			step={step === "form" ? null : STEP_TITLE[step]}
			onBack={back}
			focus={first}
			onClose={close}
		>
			<form
				hidden={step !== "form"}
				noValidate
				className="flex flex-col gap-4 [&[hidden]]:hidden"
				onSubmit={(e) => {
					e.preventDefault();
					void save();
				}}
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
						onChange={(e) => change(setUrl)(e.target.value)}
						className={INPUT}
					/>
				</Field>
				<Field label="Brand">
					<button
						type="button"
						aria-label="Brand"
						className={ROW}
						onClick={() => setStep("brands")}
					>
						<span className="min-w-0 flex-1 truncate">
							{brandName ?? "No brand"}
						</span>
						<ChevronRight size={16} strokeWidth={1.9} aria-hidden />
					</button>
				</Field>
				<Field label="Name">
					<input
						aria-label="Name"
						autoComplete="off"
						maxLength={SHOP_LINK_NAME_MAX}
						value={name}
						onChange={(e) => change(setName)(e.target.value)}
						className={INPUT}
					/>
				</Field>
				<Field label="Price in ₫">
					<input
						aria-label="Price in ₫"
						inputMode="numeric"
						autoComplete="off"
						value={price.shown}
						onChange={(e) => change(setPrice)(typedPrice(e.target.value))}
						className={INPUT}
					/>
				</Field>
				<Field label={PICTURES_LABEL}>
					<PictureSlots slots={slots} limitHit={limitHit} />
				</Field>
				{problem ? (
					<p role="alert" className="text-[13px] text-destructive">
						{PROBLEM_TEXT[problem]}
					</p>
				) : null}
				<div className="mt-0.5 flex flex-wrap justify-end gap-2 [&>button]:flex-1 wide:[&>button]:flex-none">
					{editing ? (
						<Button
							type="button"
							variant="destructive"
							onClick={() => setStep("confirm")}
						>
							Delete
						</Button>
					) : null}
					<Button type="button" onClick={close}>
						Cancel
					</Button>
					<Button
						type="submit"
						variant="primary"
						disabled={sent.isPending || slots.saving}
					>
						Save
					</Button>
				</div>
			</form>
			{step === "brands" ? (
				<BrandOptions
					brands={brands}
					onPick={(option) => {
						change(setBrandId)(option);
						back();
					}}
				/>
			) : null}
			{editing && step === "confirm" ? (
				<>
					<p className="text-muted-foreground">
						{shopName(editing)} · {editing.name}
					</p>
					{del.isError ? (
						<p role="alert" className="text-[13px] text-destructive">
							Not deleted. Try again.
						</p>
					) : null}
					<div className="mt-0.5 flex flex-wrap justify-end gap-2 [&>button]:flex-1 wide:[&>button]:flex-none">
						<Button
							variant="destructive"
							disabled={del.isPending}
							onClick={() =>
								del.mutate(editing.id, {
									onSuccess: () => {
										slots.discard();
										done("Shop link deleted")();
									},
								})
							}
						>
							Delete
						</Button>
					</div>
				</>
			) : null}
		</FormSheet>
	);
}
