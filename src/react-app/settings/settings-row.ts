import { cn } from "cn";
import { LABEL } from "@/components/ui/sheet-form";

// One row of the Settings page, and the heading over a group of rows.
export const SETTINGS_ROW =
	"flex min-h-[58px] min-w-0 items-center gap-2.5 border-b border-border py-[11px]";

export const SETTINGS_HEADING = cn(LABEL, "mb-1.5 font-sans");
