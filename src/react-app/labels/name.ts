// An account has each name once, in any letter case. Accents count, so "Đỏ"
// and "Do" are two names.
export const sameLabelName = (a: string, b: string): boolean =>
	a.trim().toLowerCase() === b.trim().toLowerCase();
