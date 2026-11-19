import { TYPE_IDS, TYPE_NAMES, type TypeId } from "@/dress/clothing-types";
import type { ColourId } from "@/labels/colour";
import type { Tag, TagId } from "@/tags/tag";
import { type CombinationProblem, pieceName } from "./combination";

// A piece row: a type, a colour, or both. A row with neither filters nothing.
export type PieceRow = { typeId: TypeId | null; colourId: ColourId | null };

export type CombinationFilter = { pieces: PieceRow[]; tags: TagId[] };

export const NO_FILTER: CombinationFilter = { pieces: [], tags: [] };

export const BLANK_ROW: PieceRow = { typeId: null, colourId: null };

export const isBlank = (row: PieceRow) =>
	row.typeId === null && row.colourId === null;

const isTypeId = (value: string): value is TypeId =>
	(TYPE_IDS as readonly string[]).includes(value);

type Filtered = {
	pieces: readonly { typeId: TypeId; colour: { id: ColourId } }[];
	tags: readonly TagId[];
};

// A row is matched by one piece, so "White short tee" never matches a black
// short tee beside a white long tee.
const matchesRow = (c: Filtered, row: PieceRow) =>
	c.pieces.some(
		(p) =>
			(row.typeId === null || p.typeId === row.typeId) &&
			(row.colourId === null || p.colour.id === row.colourId),
	);

export const matchesFilter = (c: Filtered, f: CombinationFilter): boolean =>
	f.pieces.every((row) => isBlank(row) || matchesRow(c, row)) &&
	f.tags.every((tag) => c.tags.includes(tag));

// Keeps the order it gets, so the newest combination stays first.
export const filterCombinations = <T extends Filtered>(
	list: T[],
	f: CombinationFilter,
): T[] => list.filter((c) => matchesFilter(c, f));

export const filterSize = (f: CombinationFilter) =>
	f.pieces.filter((row) => !isBlank(row)).length + f.tags.length;

// The rows an AI app sends, before the account's colours are checked.
export function checkPieceRows(
	rows: readonly { typeId?: string; colourId?: string }[],
): { ok: true; rows: PieceRow[] } | { ok: false; problem: CombinationProblem } {
	const i = rows.findIndex(
		(r) => r.typeId !== undefined && !isTypeId(r.typeId),
	);
	if (i !== -1)
		return {
			ok: false,
			problem: {
				code: "not_type",
				path: ["pieces", i, "typeId"],
				value: rows[i].typeId,
			},
		};
	return {
		ok: true,
		rows: rows.map((r) => ({
			typeId: (r.typeId ?? null) as TypeId | null,
			colourId: (r.colourId ?? null) as ColourId | null,
		})),
	};
}

// A type id has no "." and a colour id is a UUID, so the first "." splits a
// row: "tee_s.<colour id>", "sweater.", ".<colour id>".
export function readCombinationFilter(
	params: URLSearchParams,
): CombinationFilter {
	const pieces: PieceRow[] = [];
	for (const value of params.getAll("piece")) {
		const dot = value.indexOf(".");
		if (dot === -1) continue;
		const type = value.slice(0, dot);
		const colour = value.slice(dot + 1);
		if (type !== "" && !isTypeId(type)) continue;
		const row: PieceRow = {
			typeId: type === "" ? null : (type as TypeId),
			colourId: colour === "" ? null : (colour as ColourId),
		};
		if (!isBlank(row)) pieces.push(row);
	}
	const tags = [...new Set(params.getAll("tag"))] as TagId[];
	return { pieces, tags };
}

export function writeCombinationFilter(f: CombinationFilter): URLSearchParams {
	const params = new URLSearchParams();
	for (const row of f.pieces) {
		if (!isBlank(row))
			params.append("piece", `${row.typeId ?? ""}.${row.colourId ?? ""}`);
	}
	for (const tag of f.tags) params.append("tag", tag);
	return params;
}

// A tag or a colour deleted here or on another device leaves the filter, so
// no chip is left without a name. A list still loading drops nothing.
export function pruneCombinationFilter(
	f: CombinationFilter,
	tags: readonly { id: TagId }[] | undefined,
	colours: readonly { id: ColourId }[] | undefined,
): CombinationFilter {
	const pieces = colours
		? f.pieces
				.map((row) =>
					row.colourId !== null && !colours.some((c) => c.id === row.colourId)
						? { ...row, colourId: null }
						: row,
				)
				.filter((row) => !isBlank(row))
		: f.pieces;
	return {
		pieces,
		tags: tags ? f.tags.filter((id) => tags.some((t) => t.id === id)) : f.tags,
	};
}

export type FilterChip = {
	key: string;
	label: string;
	// Only a row with a type alone draws its type's figure, as the chips frame
	// shows.
	typeId: TypeId | null;
	without: CombinationFilter;
};

export function filterChips(
	f: CombinationFilter,
	tags: readonly Tag[] | undefined,
	colours: readonly { id: ColourId; name: string }[] | undefined,
): FilterChip[] {
	const colourName = (id: ColourId) =>
		colours?.find((c) => c.id === id)?.name ?? "Colour";
	const rows = f.pieces.flatMap((row, i): FilterChip[] => {
		if (isBlank(row)) return [];
		const without = { ...f, pieces: f.pieces.filter((_, j) => j !== i) };
		const key = `piece-${i}`;
		if (row.typeId !== null && row.colourId !== null)
			return [
				{
					key,
					label: pieceName({
						typeId: row.typeId,
						colour: { name: colourName(row.colourId) },
					}),
					typeId: null,
					without,
				},
			];
		if (row.typeId !== null)
			return [
				{ key, label: TYPE_NAMES[row.typeId], typeId: row.typeId, without },
			];
		return [
			{
				key,
				label: colourName(row.colourId as ColourId),
				typeId: null,
				without,
			},
		];
	});
	const tagChips = f.tags.map(
		(id): FilterChip => ({
			key: `tag-${id}`,
			label: tags?.find((t) => t.id === id)?.name ?? "Tag",
			typeId: null,
			without: { ...f, tags: f.tags.filter((t) => t !== id) },
		}),
	);
	return [...rows, ...tagChips];
}

export const shownText = (n: number) =>
	n === 1 ? "1 combination" : `${n} combinations`;
