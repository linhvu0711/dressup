import { DoorClosed, Heart, Layers, type LucideIcon, Tag } from "lucide-react";

// The app's main tabs, in order, for both the bottom bar and the top bar.
export const MAIN_TABS: readonly {
	to: string;
	label: string;
	Icon: LucideIcon;
}[] = [
	{ to: "/combinations", label: "Combinations", Icon: Layers },
	{ to: "/closet", label: "Closet", Icon: DoorClosed },
	{ to: "/wishlist", label: "Wishlist", Icon: Heart },
	{ to: "/labels", label: "Labels", Icon: Tag },
];
