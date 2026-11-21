import { readFileSync } from "node:fs";
import { type APIResponse, request } from "@playwright/test";
import { SESSION_FILE } from "./paths";

// Seeds the walks of the Item page: run it after any Playwright run has
// written the session file, which the global setup resets to a fresh account.
const OXFORD = "00000000-0000-4000-8000-000000000142";

const api = await request.newContext({
	baseURL: "http://localhost:5173",
	storageState: SESSION_FILE,
});

async function ok(res: APIResponse, path: string) {
	if (res.status() !== 200 && res.status() !== 201)
		throw new Error(`walk-seed: ${res.status()} from ${path}`);
	return res.json();
}

const post = async (path: string, data: unknown) =>
	ok(await api.post(path, { data }), path);

const { ownedItems } = await ok(
	await api.get("/api/owned-items"),
	"/api/owned-items",
);
if ((ownedItems as { id: string }[]).some((item) => item.id === OXFORD)) {
	console.log("seeded already");
	process.exit(0);
}

const { colours } = (await ok(
	await api.get("/api/colours"),
	"/api/colours",
)) as {
	colours: { id: string; name: string }[];
};
const ids = Object.fromEntries(colours.map((c) => [c.name, c.id]));

const { brand } = await post("/api/brands", { name: "Uniqlo" });

const pictureIds: string[] = [];
for (const file of ["icon-512.png", "apple-touch-icon.png", "icon-64.png"]) {
	const res = await api.post("/api/pictures", {
		data: readFileSync(`public/${file}`),
		headers: { "content-type": "image/png" },
	});
	pictureIds.push((await ok(res, "/api/pictures")).picture.id);
}

for (const item of [
	{ typeId: "tee_s", colourId: ids.White, brandId: null, quantity: 3 },
	{ typeId: "shirt_l", colourId: ids.Navy, brandId: null, quantity: 1 },
	{
		id: OXFORD,
		typeId: "shirt_l",
		colourId: ids.Navy,
		brandId: brand.id,
		quantity: 1,
		name: "Oxford shirt",
		price: 784000,
		pictureIds,
	},
])
	await post("/api/owned-items", { id: crypto.randomUUID(), ...item });

for (const chinos of ["Khaki", "Beige", "Black", "Grey", "Olive", "Brown"])
	await post("/api/combinations", {
		id: crypto.randomUUID(),
		pieces: [
			{ typeId: "chino_p", colourId: ids[chinos] },
			{ typeId: "shirt_l", colourId: ids.Navy },
		],
	});

console.log("seeded");
await api.dispose();
