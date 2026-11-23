CREATE TABLE `maintenance_ticket` (
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
	`work_type` text NOT NULL,
	`area_ha` real DEFAULT 0 NOT NULL,
	`tree_count` integer DEFAULT 0 NOT NULL,
	`hk` real DEFAULT 1 NOT NULL,
	`weather` text,
	`notes` text,
	`materials` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `maintenance_ticket_date_worker_idx` ON `maintenance_ticket` (`work_date`,`worker_employee_id`);--> statement-breakpoint
CREATE INDEX `maintenance_ticket_status_idx` ON `maintenance_ticket` (`status`);--> statement-breakpoint
ALTER TABLE `harvest_rate` ADD `maintenance_lines` text;--> statement-breakpoint
ALTER TABLE `product` ADD `dosage_per_ha` real;