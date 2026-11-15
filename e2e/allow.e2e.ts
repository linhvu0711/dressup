import { expect, test } from "./fixtures";

test("serves the protected resource metadata from the worker", async ({
	request,
}) => {
	// Given: the e2e app (`bun run dev`, Cloudflare's Vite plugin)
	// When
	const res = await request.get("/.well-known/oauth-protected-resource");
	// Then
	expect({
		status: res.status(),
		resource: ((await res.json()) as { resource: string }).resource,
	}).toEqual({ status: 200, resource: "http://localhost:5173/api/mcp" });
});
