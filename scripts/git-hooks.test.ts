import { afterEach, describe, expect, test } from "bun:test";
import {
	chmodSync,
	copyFileSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const repoRoot = join(import.meta.dir, "..");
const stopLine =
	"Commit stopped: bun run check failed. Fix the errors above, or skip the check once with git commit --no-verify.";

let tmp = "";

afterEach(() => {
	if (tmp) rmSync(tmp, { recursive: true, force: true });
	tmp = "";
});

type Env = Record<string, string>;

function run(cmd: string[], cwd: string, env: Env) {
	const result = Bun.spawnSync(cmd, {
		cwd,
		env,
		stdout: "pipe",
		stderr: "pipe",
	});
	return {
		code: result.exitCode,
		output: result.stdout.toString() + result.stderr.toString(),
	};
}

function git(args: string[], cwd: string, env: Env) {
	return run(["git", ...args], cwd, env);
}

function writeScript(path: string, body: string) {
	writeFileSync(path, `#!/bin/sh\n${body}\n`);
	chmodSync(path, 0o755);
}

// The env puts the fake bun first on PATH, so the real bun is called by its own path.
function install(dir: string, env: Env) {
	return run([process.execPath, "run", "prepare"], dir, env);
}

function copyPackage(dir: string) {
	mkdirSync(join(dir, "scripts"), { recursive: true });
	copyFileSync(join(repoRoot, "package.json"), join(dir, "package.json"));
	const setup = join(dir, "scripts", "setup-git-hooks.sh");
	copyFileSync(join(repoRoot, "scripts", "setup-git-hooks.sh"), setup);
	chmodSync(setup, 0o755);
}

function makeTmp(): { env: Env } {
	tmp = mkdtempSync(join(tmpdir(), "git-hooks-"));
	mkdirSync(join(tmp, "bin"));
	writeScript(
		join(tmp, "bin", "bun"),
		'echo ran >> "$FAKE_LOG"\necho "$FAKE_OUTPUT"\nexit "$FAKE_EXIT"',
	);
	writeFileSync(join(tmp, "gitconfig"), "");
	const env: Env = {
		HOME: tmp,
		PATH: `${join(tmp, "bin")}:${process.env.PATH ?? ""}`,
		GIT_CONFIG_GLOBAL: join(tmp, "gitconfig"),
		GIT_CONFIG_NOSYSTEM: "1",
		GIT_CEILING_DIRECTORIES: tmp,
		FAKE_LOG: join(tmp, "fake.log"),
		FAKE_EXIT: "0",
	};
	return { env };
}

function initRepo(env: Env): string {
	const repo = join(tmp, "repo");
	mkdirSync(repo);
	git(["init", "-q"], repo, env);
	git(["config", "user.name", "walk"], repo, env);
	git(["config", "user.email", "walk@example.com"], repo, env);
	copyPackage(repo);
	return repo;
}

function makeRepo(): { repo: string; env: Env } {
	const { env } = makeTmp();
	const repo = initRepo(env);
	install(repo, env);
	git(
		["commit", "-q", "--allow-empty", "--no-verify", "-m", "init"],
		repo,
		env,
	);
	return { repo, env };
}

function stage(dir: string, name: string, env: Env) {
	writeFileSync(join(dir, name), `${name}\n`);
	git(["add", name], dir, env);
}

function commitCount(dir: string, env: Env) {
	return git(["rev-list", "--count", "HEAD"], dir, env).output.trim();
}

function fakeLog() {
	return readFileSync(join(tmp, "fake.log"), "utf8");
}

function useGlobalHooks() {
	const global = join(tmp, "global");
	mkdirSync(global);
	writeScript(
		join(global, "post-checkout"),
		`echo "post-checkout $3" >> "${join(tmp, "global.log")}"`,
	);
	writeFileSync(join(tmp, "gitconfig"), `[core]\n\thooksPath = ${global}\n`);
	return global;
}

describe("pre-commit check", () => {
	test("commits when the check passes", () => {
		// Given: a repo set up by bun install, a staged file, a check that passes
		const { repo, env } = makeRepo();
		stage(repo, "a.txt", env);
		const passing = {
			...env,
			FAKE_EXIT: "0",
			FAKE_OUTPUT: "Checked 226 files",
		};
		// When
		const result = git(["commit", "-m", "add a"], repo, passing);
		// Then
		expect(result.code).toBe(0);
		expect(commitCount(repo, env)).toBe("2");
		expect(fakeLog()).toBe("ran\n");
	});

	test("refuses a commit when the check finds a type error", () => {
		// Given: the passing case, with a check that fails on a type error
		const { repo, env } = makeRepo();
		stage(repo, "a.txt", env);
		const failing = {
			...env,
			FAKE_EXIT: "2",
			FAKE_OUTPUT:
				"src/worker/colours.test.ts(28,7): error TS6133: 'coloursOf' is declared but its value is never read.",
		};
		// When
		const result = git(["commit", "-m", "add a"], repo, failing);
		// Then
		expect(result.code).toBe(1);
		expect(result.output).toContain(
			"src/worker/colours.test.ts(28,7): error TS6133: 'coloursOf' is declared but its value is never read.",
		);
		expect(result.output).toContain(stopLine);
		expect(commitCount(repo, env)).toBe("1");
	});

	test("refuses a commit when the check finds a Biome error", () => {
		// Given: the passing case, with a check that fails on a Biome error
		const { repo, env } = makeRepo();
		stage(repo, "a.txt", env);
		const failing = {
			...env,
			FAKE_EXIT: "1",
			FAKE_OUTPUT:
				"src/react-app/components/ui/filter.tsx:109:5 lint/a11y/useSemanticElements",
		};
		// When
		const result = git(["commit", "-m", "add a"], repo, failing);
		// Then
		expect(result.code).toBe(1);
		expect(result.output).toContain(
			"src/react-app/components/ui/filter.tsx:109:5 lint/a11y/useSemanticElements",
		);
		expect(result.output).toContain(stopLine);
		expect(commitCount(repo, env)).toBe("1");
	});

	test("--no-verify skips the check", () => {
		// Given: a check that fails on a type error
		const { repo, env } = makeRepo();
		stage(repo, "a.txt", env);
		const failing = { ...env, FAKE_EXIT: "2", FAKE_OUTPUT: "error TS6133" };
		// When
		const result = git(["commit", "--no-verify", "-m", "add a"], repo, failing);
		// Then
		expect(result.code).toBe(0);
		expect(commitCount(repo, env)).toBe("2");
		expect(existsSync(join(tmp, "fake.log"))).toBe(false);
	});

	test("a new worktree runs the check", () => {
		// Given: a new worktree of the repo, a staged file there, a check that fails
		const { repo, env } = makeRepo();
		const wt = join(tmp, "wt");
		git(["worktree", "add", "-q", wt], repo, env);
		stage(wt, "b.txt", env);
		const failing = { ...env, FAKE_EXIT: "1", FAKE_OUTPUT: "error TS6133" };
		// When
		const result = git(["commit", "-m", "add b"], wt, failing);
		// Then
		expect(result.code).toBe(1);
		expect(commitCount(wt, env)).toBe("1");
	});

	test("install twice runs the check once", () => {
		// Given: bun install run a second time, a staged file, a check that passes
		const { repo, env } = makeRepo();
		install(repo, env);
		stage(repo, "a.txt", env);
		// When
		const result = git(["commit", "-m", "add a"], repo, {
			...env,
			FAKE_EXIT: "0",
		});
		// Then
		expect(result.code).toBe(0);
		expect(fakeLog()).toBe("ran\n");
	});

	test("runs the global post-checkout in a new worktree", () => {
		// Given: a global core.hooksPath folder with a post-checkout hook
		const { repo, env } = makeRepo();
		useGlobalHooks();
		// When
		git(["worktree", "add", "-q", join(tmp, "wt")], repo, env);
		// Then
		expect(readFileSync(join(tmp, "global.log"), "utf8")).toBe(
			"post-checkout 1\n",
		);
	});

	test("runs the global pre-commit after the check passes", () => {
		// Given: a global core.hooksPath folder with a pre-commit hook, a check that passes
		const { repo, env } = makeRepo();
		const global = useGlobalHooks();
		writeScript(
			join(global, "pre-commit"),
			`echo pre-commit >> "${join(tmp, "global.log")}"`,
		);
		stage(repo, "a.txt", env);
		// When
		git(["commit", "-m", "add a"], repo, { ...env, FAKE_EXIT: "0" });
		// Then
		expect(fakeLog()).toBe("ran\n");
		expect(readFileSync(join(tmp, "global.log"), "utf8")).toBe("pre-commit\n");
		expect(commitCount(repo, env)).toBe("2");
	});

	test("install outside git does nothing", () => {
		// Given: the package in a folder that is not a git repo
		const { env } = makeTmp();
		const pkg = join(tmp, "pkg");
		copyPackage(pkg);
		// When
		const result = install(pkg, env);
		// Then
		expect(result.code).toBe(0);
		expect(existsSync(join(pkg, ".git"))).toBe(false);
	});
});
