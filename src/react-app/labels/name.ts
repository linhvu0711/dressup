// An account has each name once, in any letter case.
export const sameLabelName = (a: string, b: string): boolean =>
	a.trim().toLowerCase() === b.trim().toLowerCase();
