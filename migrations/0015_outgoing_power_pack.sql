CREATE TABLE `picture_storage` (
	`id` integer PRIMARY KEY NOT NULL,
	`bytes` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `picture_upload_month` (
	`month` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL
);
