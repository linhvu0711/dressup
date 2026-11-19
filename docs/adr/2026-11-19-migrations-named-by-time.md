# Migrations are named by time

A new migration's file name starts with the time it was made, in UTC. Two branches that each add a migration from the same main get two names, and neither has to rename. Wrangler applies every file whose name it has not applied, also one that sorts before an applied one, so a branch that merges late still reaches the database.

drizzle-kit keeps a journal that both branches append to, so git conflicts on every such merge. Each snapshot also points at its parent, and two snapshots with one parent stop `drizzle-kit generate`. So the journal is not kept. A new migration keeps only its schema change, in a change file beside it. `bun run db:generate` adds the change files in name order onto the last numbered snapshot before drizzle-kit runs, as wrangler applies the SQL in name order.

drizzle-kit 1.0 joins branches itself, but it moves each migration into its own folder. Wrangler would then see 20 new names and apply them again. The first 20 migrations keep their numbers.
