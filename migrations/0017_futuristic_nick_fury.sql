ALTER TABLE `picture` ADD `shop_link_id` text REFERENCES shop_link(id);--> statement-breakpoint
CREATE INDEX `picture_shopLinkId_idx` ON `picture` (`shop_link_id`);