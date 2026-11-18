import {
	DoorClosed,
	Layers,
	LayoutGrid,
	type LucideIcon,
	Shirt,
	Tag,
} from "lucide-react";

// The app's main tabs, in order, for both the bottom bar and the top bar.
export const MAIN_TABS: readonly {
	to: string;
	label: string;
	Icon: LucideIcon;
}[] = [
	{ to: "/", label: "Dress", Icon: Shirt },
	{ to: "/looks", label: "Looks", Icon: LayoutGrid },
	{ to: "/combinations", label: "Combinations", Icon: Layers },
	{ to: "/closet", label: "Closet", Icon: DoorClosed },
	{ to: "/labels", label: "Labels", Icon: Tag },
];
