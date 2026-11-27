CREATE TABLE `inspection_item` (
	`id` integer PRIMARY KEY NOT NULL,
	`template_id` integer NOT NULL,
	`sequence` integer NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`value_type` text NOT NULL,
	`select_options` text NOT NULL,
	`uom` text,
	`weight` real NOT NULL,
	`bad_when` text,
	`threshold` real NOT NULL,
	`threshold_text` text,
	`finding_category` text,
	`finding_severity` text NOT NULL,
	`required` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `inspection_item_template_idx` ON `inspection_item` (`template_id`);--> statement-breakpoint
CREATE TABLE `inspection_template` (
	`id` integer PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`inspection_type` text NOT NULL,
	`sample_unit` text NOT NULL,
	`default_sample_size` integer NOT NULL,
	`pass_score_pct` real NOT NULL,
	`allowed_roles` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `open_finding` (
	`id` integer PRIMARY KEY NOT NULL,
	`mobile_uuid` text,
	`inspection_id` integer,
	`blok_id` integer NOT NULL,
	`category` text NOT NULL,
	`severity` text NOT NULL,
	`description` text NOT NULL,
	`row_no` integer,
	`tree_no` integer,
	`due_date` text,
	`pic_employee_id` integer,
	`state` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `open_finding_blok_idx` ON `open_finding` (`blok_id`);--> statement-breakpoint
CREATE INDEX `open_finding_mobile_uuid_idx` ON `open_finding` (`mobile_uuid`);--> statement-breakpoint
CREATE TABLE `inspection` (
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
	`inspection_type` text NOT NULL,
	`template_id` integer NOT NULL,
	`block_id` integer NOT NULL,
	`tph_id` integer,
	`harvester_employee_id` integer,
	`gang_id` integer,
	`sample_size` integer NOT NULL,
	`lines` text NOT NULL,
	`taksasi` text,
	`sensus` text,
	`score_pct` real NOT NULL,
	`photo_ids` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `inspection_date_idx` ON `inspection` (`work_date`);--> statement-breakpoint
CREATE INDEX `inspection_status_idx` ON `inspection` (`status`);--> statement-breakpoint
CREATE TABLE `inspection_finding` (
	`finding_uuid` text NOT NULL,
	`inspection_uuid` text NOT NULL,
	`item_id` integer,
	`category` text NOT NULL,
	`severity` text NOT NULL,
	`description` text NOT NULL,
	`row_no` integer,
	`tree_no` integer,
	`palm_tree_qr` text,
	`lat` real,
	`lng` real,
	`photo_ids` text NOT NULL,
	PRIMARY KEY(`inspection_uuid`, `finding_uuid`)
);
--> statement-breakpoint
CREATE INDEX `inspection_finding_uuid_idx` ON `inspection_finding` (`finding_uuid`);--> statement-breakpoint
CREATE TABLE `inspection_followup` (
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
	`finding_ref` text NOT NULL,
	`action_text` text NOT NULL,
	`done` integer NOT NULL,
	`photo_ids` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `inspection_followup_finding_idx` ON `inspection_followup` (`finding_ref`);--> statement-breakpoint
CREATE INDEX `inspection_followup_status_idx` ON `inspection_followup` (`status`);--> statement-breakpoint
ALTER TABLE `block` ADD `tree_count_productive` integer;--> statement-breakpoint
ALTER TABLE `block` ADD `tree_count_sisipan` integer;--> statement-breakpoint
ALTER TABLE `block` ADD `tree_count_dead` integer;--> statement-breakpoint
ALTER TABLE `gang` ADD `acting_foreman_employee_id` integer;