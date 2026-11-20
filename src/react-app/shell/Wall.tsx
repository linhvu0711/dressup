import {
	createContext,
	type ReactNode,
	type RefObject,
	useContext,
	useEffect,
	useState,
} from "react";

const WALL =
	"grid min-h-0 flex-1 auto-rows-min grid-cols-2 gap-x-3.5 gap-y-5 overflow-auto px-4 pt-[5px] pb-24 wide:grid-cols-[repeat(auto-fill,minmax(176px,1fr))] wide:gap-x-[18px] wide:gap-y-[26px] wide:px-6";

type Watch = (tile: Element, onChange: (near: boolean) => void) => () => void;

const WallContext = createContext<Watch | null>(null);

// The scrolling grid of tiles. A full account's wall drew hundreds of figures
// at once and lagged (#112), so the wall tells each tile whether it is within
// one wall-height of what shows, and a tile draws only then. The wall is the
// observer's root because the wall, not the window, scrolls.
export function Wall({
	slot,
	children,
}: {
	slot?: string;
	children: ReactNode;
}) {
	const [near] = useState(nearTiles);
	return (
		<WallContext.Provider value={near.watch}>
			<div ref={near.attach} data-slot={slot} className={WALL}>
				{children}
			</div>
		</WallContext.Provider>
	);
}

// Whether the tile is near the screen. A tile outside a wall, such as a card
// on the Piece page, is always near.
export function useNearScreen(ref: RefObject<Element | null>): boolean {
	const watch = useContext(WallContext);
	const [near, setNear] = useState(false);
	useEffect(() => {
		const tile = ref.current;
		if (watch === null || tile === null) return;
		return watch(tile, setNear);
	}, [watch, ref]);
	return watch === null || near;
}

// One observer for the whole wall. Tiles can register before the wall's div
// is attached, so the ones already registered are observed when it is.
function nearTiles() {
	const tiles = new Map<Element, (near: boolean) => void>();
	let observer: IntersectionObserver | null = null;
	return {
		attach(root: HTMLDivElement | null) {
			if (root === null) return;
			const current = new IntersectionObserver(
				(entries) => {
					for (const entry of entries)
						tiles.get(entry.target)?.(entry.isIntersecting);
				},
				{ root, rootMargin: "100% 0px" },
			);
			observer = current;
			for (const tile of tiles.keys()) current.observe(tile);
			return () => {
				current.disconnect();
				if (observer === current) observer = null;
			};
		},
		watch(tile: Element, onChange: (near: boolean) => void) {
			tiles.set(tile, onChange);
			observer?.observe(tile);
			return () => {
				tiles.delete(tile);
				observer?.unobserve(tile);
			};
		},
	};
}
