import { modeById, WEATHER_GROUPS, type WeatherGroup } from "@/dress/modes";
import type { Tag, TagId } from "@/tags/tag";
import type { Look } from "./look";

// A tag id is a UUID, so it never equals a group name.
export type LookFilter = "All" | WeatherGroup | TagId;

const isGroup = (filter: LookFilter): filter is WeatherGroup =>
	(WEATHER_GROUPS as readonly string[]).includes(filter);

const isTag = (filter: LookFilter): filter is TagId =>
	filter !== "All" && !isGroup(filter);

export const filterLabel = (filter: LookFilter, tags: Tag[]): string =>
	isTag(filter) ? (tags.find((t) => t.id === filter)?.name ?? "") : filter;

// A tag deleted here or on another device turns All on.
export const lookFilter = (chosen: LookFilter, tags: Tag[]): LookFilter =>
	isTag(chosen) && !tags.some((t) => t.id === chosen) ? "All" : chosen;

// Keeps the order it gets, so the newest look stays first.
export function filterLooks(looks: Look[], filter: LookFilter): Look[] {
	if (filter === "All") return looks;
	if (isGroup(filter))
		return looks.filter((l) => modeById(l.modeId).group === filter);
	return looks.filter((l) => l.tags.includes(filter));
}
