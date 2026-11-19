#!/bin/sh
# Runs from `bun install` (the prepare script). A git config hook runs beside
# the global core.hooksPath folder and .git/hooks, where a hooks folder of our
# own would hide them.
set -eu

git rev-parse --git-dir >/dev/null 2>&1 || exit 0

git config hook.dressup-check.event pre-commit
git config hook.dressup-check.command 'bun run check || { echo "Commit stopped: bun run check failed. Fix the errors above, or skip the check once with git commit --no-verify." >&2; exit 1; }'

if ! git hook list pre-commit 2>/dev/null | grep -qx dressup-check; then
	echo "warning: this git does not run hooks from config (git 2.54 or newer does), so the pre-commit check will not run. Update git." >&2
fi
