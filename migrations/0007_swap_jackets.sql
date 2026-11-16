UPDATE colour_square SET garment = 'harrington' WHERE garment = 'chore';
--> statement-breakpoint
UPDATE colour_square SET garment = 'wool' WHERE garment = 'padded';
--> statement-breakpoint
UPDATE outfit_garment SET garment = 'harrington' WHERE garment = 'chore';
--> statement-breakpoint
UPDATE outfit_garment SET garment = 'wool' WHERE garment = 'padded';
--> statement-breakpoint
UPDATE outfit SET mode_id = replace(replace(mode_id, '-chore', '-harrington'), '-padded', '-wool');
--> statement-breakpoint
UPDATE look SET mode_id = replace(replace(mode_id, '-chore', '-harrington'), '-padded', '-wool'), colours = replace(replace(colours, '"chore":', '"harrington":'), '"padded":', '"wool":'), open = replace(replace(open, '"chore"', '"harrington"'), '"padded"', '"wool"');
--> statement-breakpoint
INSERT OR IGNORE INTO colour_square (user_id, garment, hex, position) SELECT user_id, 'harrington', '#C9B38C', max(position) + 1 FROM colour_square WHERE garment = 'harrington' GROUP BY user_id;
--> statement-breakpoint
INSERT OR IGNORE INTO colour_square (user_id, garment, hex, position) SELECT user_id, 'harrington', '#1F3A5F', max(position) + 1 FROM colour_square WHERE garment = 'harrington' GROUP BY user_id;
--> statement-breakpoint
INSERT OR IGNORE INTO colour_square (user_id, garment, hex, position) SELECT user_id, 'harrington', '#2F4A3A', max(position) + 1 FROM colour_square WHERE garment = 'harrington' GROUP BY user_id;
--> statement-breakpoint
INSERT OR IGNORE INTO colour_square (user_id, garment, hex, position) SELECT user_id, 'wool', '#A8865C', max(position) + 1 FROM colour_square WHERE garment = 'wool' GROUP BY user_id;
--> statement-breakpoint
INSERT OR IGNORE INTO colour_square (user_id, garment, hex, position) SELECT user_id, 'wool', '#39424F', max(position) + 1 FROM colour_square WHERE garment = 'wool' GROUP BY user_id;
--> statement-breakpoint
INSERT OR IGNORE INTO colour_square (user_id, garment, hex, position) SELECT user_id, 'wool', '#1F3A5F', max(position) + 1 FROM colour_square WHERE garment = 'wool' GROUP BY user_id;
