-- #91: a combination is its pieces; of two that differ only by the jacket state the older stays.
DELETE FROM combination_tag WHERE combination_id IN (SELECT newer.id FROM combination newer JOIN combination older ON older.user_id = newer.user_id AND replace(older.key, '|open', '') = replace(newer.key, '|open', '') AND (older.created_at < newer.created_at OR (older.created_at = newer.created_at AND older.rowid < newer.rowid)));
--> statement-breakpoint
DELETE FROM combination_piece WHERE combination_id IN (SELECT newer.id FROM combination newer JOIN combination older ON older.user_id = newer.user_id AND replace(older.key, '|open', '') = replace(newer.key, '|open', '') AND (older.created_at < newer.created_at OR (older.created_at = newer.created_at AND older.rowid < newer.rowid)));
--> statement-breakpoint
DELETE FROM combination WHERE id IN (SELECT newer.id FROM combination newer JOIN combination older ON older.user_id = newer.user_id AND replace(older.key, '|open', '') = replace(newer.key, '|open', '') AND (older.created_at < newer.created_at OR (older.created_at = newer.created_at AND older.rowid < newer.rowid)));
--> statement-breakpoint
UPDATE combination SET key = replace(key, '|open', '') WHERE key LIKE '%|open';
--> statement-breakpoint
ALTER TABLE `combination` DROP COLUMN `open`;
