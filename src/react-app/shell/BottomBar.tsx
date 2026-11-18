import { NavLink } from "react-router";
import { MAIN_TABS } from "./main-tabs";

const tab =
	"flex h-[60px] flex-1 flex-col items-center justify-center gap-[3px] text-[11.5px] font-medium text-muted-foreground transition-colors aria-[current=page]:text-foreground";

export function BottomBar() {
	return (
		<nav
			aria-label="Main"
			className="flex flex-none border-t border-border bg-background wide:hidden"
		>
			{MAIN_TABS.map(({ to, label, Icon }) => (
				<NavLink key={to} to={to} className={tab}>
					<Icon size={20} strokeWidth={1.9} aria-hidden />
					{label}
				</NavLink>
			))}
		</nav>
	);
}
