import { LayoutGrid, Shirt } from "lucide-react";
import { NavLink } from "react-router";

const tab =
	"flex h-[60px] flex-1 flex-col items-center justify-center gap-[3px] text-[11.5px] font-medium text-muted-foreground transition-colors aria-[current=page]:text-foreground";

export function BottomBar() {
	return (
		<nav
			aria-label="Main"
			className="flex flex-none border-t border-border bg-background wide:hidden"
		>
			<NavLink to="/" className={tab}>
				<Shirt size={20} strokeWidth={1.9} aria-hidden />
				Dress
			</NavLink>
			<NavLink to="/looks" className={tab}>
				<LayoutGrid size={20} strokeWidth={1.9} aria-hidden />
				Looks
			</NavLink>
		</nav>
	);
}
