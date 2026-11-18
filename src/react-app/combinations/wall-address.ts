import { type To, useLocation } from "react-router";
import { type CombinationFilter, writeCombinationFilter } from "./filter";

// The filter lives in the wall's address, so every way between the wall, a
// combination, and the builder carries the address's search along, and the
// wall comes back filtered. The builder does not read it.
export function useWallAddress() {
	const { search } = useLocation();
	return {
		wall: { pathname: "/combinations", search } satisfies To,
		combination: (id: string): To => ({
			pathname: `/combinations/${id}`,
			search,
		}),
		builder: (id?: string): To => ({
			pathname: id === undefined ? "/build" : `/build/${id}`,
			search,
		}),
	};
}

export const wallAddress = (f: CombinationFilter): To => ({
	pathname: "/combinations",
	search: writeCombinationFilter(f).toString(),
});
