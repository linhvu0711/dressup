// The scrim and the sheet: a sheet from the bottom under 900 px, a box in
// the middle from 900 px.
export const SHEET_OVERLAY = "fixed inset-0 z-20 bg-[rgba(20,18,14,.42)]";

export const SHEET =
	"fixed inset-x-0 bottom-0 z-[21] flex max-h-[88%] flex-col gap-4 overflow-auto scrollbar-quiet rounded-t-[26px] border border-border border-b-0 bg-card p-5 pb-[22px] shadow-float outline-none duration-[260ms] ease-soft data-[state=open]:slide-in-from-bottom-8 data-[state=open]:animate-in wide:inset-x-auto wide:top-1/2 wide:bottom-auto wide:left-1/2 wide:w-[430px] wide:-translate-x-1/2 wide:-translate-y-1/2 wide:rounded-[22px] wide:border-b wide:p-6";

// The row of buttons at the foot of a sheet or a dialog: full width each under
// 900 px, at the end from 900 px.
export const FOOTER_ROW =
	"mt-0.5 flex flex-wrap justify-end gap-2 [&>button]:flex-1 wide:[&>button]:flex-none";
