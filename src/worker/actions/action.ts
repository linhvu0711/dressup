import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { z } from "zod";
import type { ErrorAnswer } from "@/data/contract";
import type { Db } from "../db";
import type { Result } from "../result";

// The account an action acts in: its rows and its pictures.
export type ActionScope = { db: Db; userId: string; pictures: R2Bucket };

// The website answers every bad field with "invalid"; the contract
// (src/react-app/data/contract.ts) names every code it sends. The website
// answers status and body; the AI app reads text.
export type Refusal = {
	code: string;
	status: ContentfulStatusCode;
	body: ErrorAnswer;
	text: string;
};

// One row for each code of a store's error.
export type Refusals<E extends { code: string }> = {
	[K in E["code"]]: (error: E & { code: K }) => Omit<Refusal, "code">;
};

export type Action<S extends z.ZodObject, T> = {
	input: S;
	run: (scope: ActionScope, input: z.output<S>) => Promise<Result<T, Refusal>>;
};

export function action<S extends z.ZodObject, T, E extends { code: string }>(
	input: S,
	refusals: Refusals<E>,
	run: (scope: ActionScope, input: z.output<S>) => Promise<Result<T, E>>,
): Action<S, T> {
	return {
		input,
		run: async (scope, value) => {
			const result = await run(scope, value);
			if (result.ok) return result;
			const row = refusals[result.error.code as E["code"]] as (
				error: E,
			) => Omit<Refusal, "code">;
			return {
				ok: false,
				error: { code: result.error.code, ...row(result.error) },
			};
		},
	};
}

export const issueField = (path: readonly PropertyKey[]) =>
	path.length === 0 ? "body" : path.map(String).join(".");

export const serverError = "dressup could not do this. Try again.";

export const notAType = (value: unknown) =>
	`${value} is not a type. list_types names the types.`;

export const notYourColour = (value: unknown) =>
	`${value} is not one of your colours. list_colours names them.`;

export const notYourBrand = (value: unknown) =>
	`${value} is not one of your brands. list_brands names them.`;
