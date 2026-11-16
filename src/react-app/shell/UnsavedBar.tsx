import { useDressState } from "@/dress/DressState";

// The "Not saved" bar. It stays until the
// waiting changes are stored, unlike a toast, which fades.
export function UnsavedBar() {
	const { unsaved, retry } = useDressState();
	if (!unsaved) return null;
	return (
		<div
			role="alert"
			className="flex flex-none items-center gap-2.5 bg-destructive px-4 py-[9px] font-medium text-[13px] text-white"
		>
			<span>Not saved. Check your internet.</span>
			<span className="flex-1" />
			<button
				type="button"
				onClick={retry}
				className="h-7 rounded-full bg-white px-[13px] font-semibold text-[#1A1917] text-[12.5px]"
			>
				Retry
			</button>
		</div>
	);
}
