CREATE TABLE `verification_queue` (
	`core_ticket_id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`work_date` text NOT NULL,
	`stage` text,
	`block_code` text NOT NULL,
	`tph_code` text NOT NULL,
	`sub_blok_name` text,
	`harvester_id` integer NOT NULL,
	`harvester_name` text NOT NULL,
	`gang_name` text,
	`ripe` integer NOT NULL,
	`unripe` integer NOT NULL,
	`rotten` integer NOT NULL,
	`empty_bunch` integer NOT NULL,
	`long_stalk` integer NOT NULL,
	`loose_fruit_kg` real NOT NULL,
	`is_late_entry` integer NOT NULL,
	`has_photo` integer NOT NULL,
	`mobile_uuid` text,
	`created_by` text,
	`fetched_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `stage_confirm` (
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
	`target_type` text NOT NULL,
	`target_uuid` text,
	`core_ticket_id` integer
);
--> statement-breakpoint
CREATE INDEX `stage_confirm_target_idx` ON `stage_confirm` (`target_uuid`);--> statement-breakpoint
CREATE INDEX `stage_confirm_core_idx` ON `stage_confirm` (`core_ticket_id`);--> statement-breakpoint
CREATE INDEX `stage_confirm_status_idx` ON `stage_confirm` (`status`);--> statement-breakpoint
ALTER TABLE `tx_document` ADD `stage` text;