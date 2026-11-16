// A chip is on when radix gives it data-state=on.
export const CHIP =
	"inline-flex h-8 flex-none items-center gap-1.5 whitespace-nowrap rounded-full border border-border px-[13px] font-medium text-[12.5px] hover:bg-muted data-[state=on]:border-primary data-[state=on]:bg-primary data-[state=on]:text-primary-foreground";

// The dashed chip, used with CHIP.
export const CHIP_DASHED =
	"border-dashed text-muted-foreground hover:text-foreground";
