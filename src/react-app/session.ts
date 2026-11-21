import { useQuery } from "@tanstack/react-query";
import { fetchMe, keys } from "./data/client";

export function useMe() {
	return useQuery({ queryKey: keys.me, queryFn: fetchMe });
}
