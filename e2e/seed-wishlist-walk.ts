import { readFileSync } from "node:fs";

// Seeds the account of a saved session for a UI walk, as a plain command:
// bun e2e/seed-wishlist-walk.ts <storage file> <set>
// The e2e helpers need a Playwright page, and a walk's Setup runs a command.

const BASE = "http://localhost:5173";
const [storageFile, set] = process.argv.slice(2);
if (!storageFile || (set !== "walk" && set !== "full-closet")) {
	console.error(
		"usage: bun e2e/seed-wishlist-walk.ts <storage file> walk|full-closet",
	);
	process.exit(2);
}

const { cookies } = JSON.parse(readFileSync(storageFile, "utf8")) as {
	cookies: { name: string; value: string }[];
};
const cookie = cookies.map((c) => `${c.name}=${c.value}`).join("; ");

async function send(method: string, path: string, body?: unknown) {
	const res = await fetch(`${BASE}${path}`, {
		method,
		headers: { cookie, origin: BASE, "content-type": "application/json" },
		body: body === undefined ? undefined : JSON.stringify(body),
	});
	if (method !== "GET" && res.status !== 201) {
		console.error(`${method} ${path} answered ${res.status}`);
		process.exit(1);
	}
	return res.json();
}

const { colours } = (await send("GET", "/api/colours")) as {
	colours: { id: string; name: string }[];
};
const colour = (name: string) => {
	const found = colours.find((c) => c.name === name);
	if (!found) throw new Error(`no colour ${name}`);
	return found.id;
};

async function brand(name: string): Promise<string> {
	const { brand } = (await send("POST", "/api/brands", { name })) as {
		brand: { id: string };
	};
	return brand.id;
}

async function picture(): Promise<string> {
	const res = await fetch(`${BASE}/api/pictures`, {
		method: "POST",
		headers: { cookie, origin: BASE, "content-type": "image/png" },
		body: readFileSync("public/icon-512.png"),
	});
	if (res.status !== 201) {
		console.error(`POST /api/pictures answered ${res.status}`);
		process.exit(1);
	}
	return ((await res.json()) as { picture: { id: string } }).picture.id;
}

async function wish(typeId: string, colourName: string): Promise<string> {
	const id = crypto.randomUUID();
	await send("POST", "/api/wishes", {
		id,
		typeId,
		colourId: colour(colourName),
	});
	return id;
}

async function link(
	wishId: string,
	body: {
		url: string;
		brandId: string | null;
		name: string;
		price: number | null;
		pictureIds?: string[];
	},
) {
	await send("POST", `/api/wishes/${wishId}/shop-links`, {
		id: crypto.randomUUID(),
		...body,
	});
}

if (set === "walk") {
	const zara = await brand("Zara");
	const massimo = await brand("Massimo Dutti");
	const pictures = [await picture(), await picture()];
	const jacket = await wish("wool", "Brown");
	await link(jacket, {
		url: "https://www.zara.com/vn/wool-blend-coat",
		brandId: zara,
		name: "Wool blend coat",
		price: 2590000,
		pictureIds: pictures,
	});
	await link(jacket, {
		url: "https://www.massimodutti.com/vn/wool-coat",
		brandId: massimo,
		name: "Single-breasted wool coat",
		price: 4890000,
	});
	await link(jacket, {
		url: "https://www.theoutnet.com/wool-overcoat",
		brandId: null,
		name: "Wool overcoat",
		price: null,
	});
	const cos = await brand("COS");
	const sweater = await wish("sweater", "Cream");
	await link(sweater, {
		url: "https://www.cos.com/vn/cable-knit",
		brandId: cos,
		name: "Cable-knit jumper",
		price: 1890000,
	});
	await wish("polo_s", "Burgundy");
	const pants = await wish("train_p", "Black");
	await link(pants, {
		url: "https://www.zara.com/vn/training-pants",
		brandId: zara,
		name: "Training pants 500",
		price: 349000,
	});
	await send("POST", "/api/combinations", {
		id: crypto.randomUUID(),
		pieces: [
			{ typeId: "polo_s", colourId: colour("Burgundy") },
			{ typeId: "wool", colourId: colour("Brown") },
			{ typeId: "chino_p", colourId: colour("Khaki") },
		],
	});
} else {
	const tee = await wish("tee_l", "Navy");
	await link(tee, {
		url: "https://shop.example/navy-tee",
		brandId: null,
		name: "Navy tee",
		price: 250000,
	});
}
console.log(`seeded ${set}`);
