CREATE TABLE `fertilization_ticket` (
	`mobile_uuid` text PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL,
	`device_id` text NOT NULL,
	`created_trusted_at` text NOT NULL,
	`device_time_at` text NOT NULL,
	`time_source` text DEFAULT 'device' NOT NULL,
	`lat` real,
	`lng` real,
	`accuracy_m` real,
	`mocked` integer DEFAULT false NOT NULL,
	`rooted` integer DEFAULT false NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`reject_reason` text,
	`server_id` integer,
	`sent_at` text,
	`posted_at` text,
	`correction_of` text,
	`work_date` text NOT NULL,
	`block_id` integer NOT NULL,
	`sub_blok_id` integer,
	`gang_id` integer NOT NULL,
	`worker_employee_id` integer NOT NULL,
	`product_id` integer NOT NULL,
	`method` text NOT NULL,
	`application_round` integer,
	`tree_count` integer NOT NULL,
	`qty_kg` real NOT NULL,
	`weather` text,
	`notes` text
);
--> statement-breakpoint
CREATE INDEX `fertilization_ticket_date_worker_idx` ON `fertilization_ticket` (`work_date`,`worker_employee_id`);--> statement-breakpoint
CREATE INDEX `fertilization_ticket_status_idx` ON `fertilization_ticket` (`status`);--> statement-breakpoint
ALTER TABLE `block` ADD `tree_count` integer;--> statement-breakpoint
ALTER TABLE `gang` ADD `gang_type` text;--> statement-breakpoint
ALTER TABLE `harvest_rate` ADD `fertilization_lines` text;--> statement-breakpoint
ALTER TABLE `product` ADD `is_fertilizer` integer;--> statement-breakpoint
ALTER TABLE `product` ADD `fertilizer_group_id` integer;--> statement-breakpoint
ALTER TABLE `product` ADD `dosage_kg_per_tree` real;