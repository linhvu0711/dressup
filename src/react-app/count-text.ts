export const countText = (n: number, one: string, many = `${one}s`) =>
	n === 1 ? `1 ${one}` : `${n} ${many}`;

export const limitText = (n: number, many: string) =>
	`You have ${n} ${many}. That is the limit. Delete one to add a new one.`;
