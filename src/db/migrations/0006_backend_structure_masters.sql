CREATE TABLE `tx_document` (
	`mobile_uuid` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`state` text NOT NULL,
	`state_label` text,
	`net_kg` real,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `harvest_rate` (
	`id` integer PRIMARY KEY NOT NULL,
	`estate_id` integer,
	`employee_type` text,
	`date_from` text NOT NULL,
	`date_to` text,
	`lines` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `pks` (
	`id` integer PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`estate_id` integer
);
--> statement-breakpoint
CREATE TABLE `sub_blok` (
	`id` integer PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`block_id` integer NOT NULL,
	`terrain_class_id` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `sub_blok_block_idx` ON `sub_blok` (`block_id`);--> statement-breakpoint
ALTER TABLE `employee` ADD `role` text;--> statement-breakpoint
ALTER TABLE `employee` ADD `employee_type` text;--> statement-breakpoint
ALTER TABLE `vehicle` ADD `ownership` text;--> statement-breakpoint
ALTER TABLE `harvest_ticket` ADD `sub_blok_id` integer;--> statement-breakpoint
ALTER TABLE `spb` ADD `driver_employee_id` integer;--> statement-breakpoint
ALTER TABLE `spb` ADD `pks_id` integer;--> statement-breakpoint
ALTER TABLE `spb` ADD `transfer_point` text;--> statement-breakpoint
ALTER TABLE `spb_line` ADD `bunch_count` integer;--> statement-breakpoint
ALTER TABLE `spb_line` ADD `loose_fruit_kg` real;