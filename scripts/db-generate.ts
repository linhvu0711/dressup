import {
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	renameSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";

export type Snapshot = { id: string; prevId: string } & Record<string, unknown>;

export type Change = {
	set: { path: string[]; value: unknown }[];
	remove: string[][];
};

type Tree = Record<string, unknown>;

// The parts of a snapshot that describe the database; _meta only lists the
// renames of one migration.
const PARTS = ["tables", "views", "enums", "internal"];

const isTree = (value: unknown): value is Tree =>
	typeof value === "object" && value !== null && !Array.isArray(value);

function diff(before: Tree, after: Tree, path: string[], change: Change) {
	for (const [key, value] of Object.entries(after)) {
		const old = before[key];
		if (isTree(old) && isTree(value)) diff(old, value, [...path, key], change);
		else if (!(key in before) || !Bun.deepEquals(old, value))
			change.set.push({ path: [...path, key], value });
	}
	for (const key of Object.keys(before))
		if (!(key in after)) change.remove.push([...path, key]);
}

export function snapshotChange(before: Snapshot, after: Snapshot): Change {
	const change: Change = { set: [], remove: [] };
	diff(
		Object.fromEntries(PARTS.map((part) => [part, before[part] ?? {}])),
		Object.fromEntries(PARTS.map((part) => [part, after[part] ?? {}])),
		[],
		change,
	);
	return change;
}

// The change files fold in name order, as wrangler applies the SQL, so two
// branches' changes join and a later drop stays dropped.
export function currentSnapshot(base: Snapshot, changes: Change[]): Snapshot {
	const current = structuredClone(base) as Tree;
	for (const { set, remove } of changes) {
		for (const path of remove) {
			const parent = path
				.slice(0, -1)
				.reduce<unknown>(
					(at, key) => (isTree(at) ? at[key] : undefined),
					current,
				);
			if (isTree(parent)) delete parent[path[path.length - 1]];
		}
		for (const { path, value } of set) {
			let at = current;
			for (const key of path.slice(0, -1)) {
				if (!isTree(at[key])) at[key] = {};
				at = at[key] as Tree;
			}
			at[path[path.length - 1]] = structuredClone(value);
		}
	}
	return {
		...(current as Snapshot),
		_meta: { schemas: {}, tables: {}, columns: {} },
	};
}

const writeAtomic = (file: string, text: string) => {
	writeFileSync(`${file}.tmp`, text);
	renameSync(`${file}.tmp`, file);
};

function main(): number {
	const root = join(import.meta.dir, "..");
	const meta = join(root, "migrations", "meta");
	const files = readdirSync(meta).sort();
	const readJson = (file: string) =>
		JSON.parse(readFileSync(join(meta, file), "utf8"));
	const base: Snapshot = readJson(
		files.filter((file) => file.endsWith("_snapshot.json")).at(-1) as string,
	);
	const current = currentSnapshot(
		base,
		files.filter((file) => file.endsWith("_change.json")).map(readJson),
	);

	const tmp = mkdtempSync(join(tmpdir(), "db-generate-"));
	try {
		const out = join(tmp, "out");
		mkdirSync(join(out, "meta"), { recursive: true });
		writeFileSync(
			join(out, "meta", "0000_snapshot.json"),
			JSON.stringify(current, null, 2),
		);
		writeFileSync(
			join(out, "meta", "_journal.json"),
			JSON.stringify({ version: "7", dialect: "sqlite", entries: [] }),
		);
		// drizzle-kit reads `./<out>/meta/...`, so an absolute out path breaks.
		const config = join(tmp, "drizzle.config.ts");
		writeFileSync(
			config,
			`import base from ${JSON.stringify(join(root, "drizzle.config.ts"))};\nexport default { ...base, out: ${JSON.stringify(relative(root, out))} };\n`,
		);
		const run = Bun.spawnSync(
			[
				join(root, "node_modules", ".bin", "drizzle-kit"),
				"generate",
				"--config",
				config,
				...process.argv.slice(2),
			],
			{ cwd: root, stdio: ["inherit", "inherit", "inherit"] },
		);
		for (const sqlFile of readdirSync(out).filter((f) => f.endsWith(".sql"))) {
			const prefix = sqlFile.slice(0, sqlFile.indexOf("_"));
			const made: Snapshot = JSON.parse(
				readFileSync(join(out, "meta", `${prefix}_snapshot.json`), "utf8"),
			);
			// The change goes first: a crash before the SQL leaves a change with no
			// SQL, which the table test and the next migrate show.
			writeAtomic(
				join(meta, `${prefix}_change.json`),
				`${JSON.stringify(snapshotChange(current, made), null, 2)}\n`,
			);
			writeAtomic(
				join(root, "migrations", sqlFile),
				readFileSync(join(out, sqlFile), "utf8"),
			);
		}
		return run.exitCode ?? 1;
	} finally {
		rmSync(tmp, { recursive: true, force: true });
	}
}

if (import.meta.main) process.exit(main());
