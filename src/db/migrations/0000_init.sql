CREATE TABLE `app_meta` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `doc_sequence` (
	`doc_type` text NOT NULL,
	`prefix` text NOT NULL,
	`last_seq` integer NOT NULL,
	PRIMARY KEY(`doc_type`, `prefix`)
);
--> statement-breakpoint
CREATE TABLE `activity` (
	`id` integer PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`wage_basis` text NOT NULL,
	`rate` real NOT NULL
);
--> statement-breakpoint
CREATE TABLE `afdeling` (
	`id` integer PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`estate_id` integer NOT NULL,
	`polygon_geojson` text
);
--> statement-breakpoint
CREATE INDEX `afdeling_estate_idx` ON `afdeling` (`estate_id`);--> statement-breakpoint
CREATE TABLE `block` (
	`id` integer PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`afdeling_id` integer NOT NULL,
	`ha` real NOT NULL,
	`planting_year` integer,
	`status` text NOT NULL,
	`bjr_kg` real NOT NULL,
	`polygon_geojson` text
);
--> statement-breakpoint
CREATE INDEX `block_afdeling_idx` ON `block` (`afdeling_id`);--> statement-breakpoint
CREATE TABLE `dosage_rule` (
	`id` integer PRIMARY KEY NOT NULL,
	`activity_id` integer NOT NULL,
	`product_id` integer NOT NULL,
	`dose_per_ha` real NOT NULL,
	`tolerance_pct` real NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `dosage_rule_activity_product_uq` ON `dosage_rule` (`activity_id`,`product_id`);--> statement-breakpoint
CREATE TABLE `employee` (
	`id` integer PRIMARY KEY NOT NULL,
	`nik` text NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`gang_id` integer,
	`active` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE INDEX `employee_gang_idx` ON `employee` (`gang_id`);--> statement-breakpoint
CREATE INDEX `employee_nik_idx` ON `employee` (`nik`);--> statement-breakpoint
CREATE TABLE `estate` (
	`id` integer PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `gang` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`foreman_employee_id` integer,
	`afdeling_id` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `gang_afdeling_idx` ON `gang` (`afdeling_id`);--> statement-breakpoint
CREATE TABLE `penalty_rule` (
	`id` integer PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`amount` real NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `penalty_rule_code_uq` ON `penalty_rule` (`code`);--> statement-breakpoint
CREATE TABLE `product` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`uom` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sync_cursor` (
	`entity` text PRIMARY KEY NOT NULL,
	`cursor` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tph` (
	`id` integer PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`block_id` integer NOT NULL,
	`lat` real,
	`lng` real
);
--> statement-breakpoint
CREATE INDEX `tph_block_idx` ON `tph` (`block_id`);--> statement-breakpoint
CREATE TABLE `vehicle` (
	`id` integer PRIMARY KEY NOT NULL,
	`plate` text NOT NULL,
	`type` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `work_plan` (
	`id` integer PRIMARY KEY NOT NULL,
	`date` text NOT NULL,
	`afdeling_id` integer NOT NULL,
	`block_id` integer NOT NULL,
	`activity_id` integer NOT NULL,
	`gang_id` integer NOT NULL,
	`target_ha` real,
	`target_bunch` integer
);
--> statement-breakpoint
CREATE INDEX `work_plan_date_afdeling_idx` ON `work_plan` (`date`,`afdeling_id`);--> statement-breakpoint
CREATE TABLE `approval_decision` (
	`mobile_uuid` text PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL,
	`device_id` text NOT NULL,
	`created_trusted_at` text NOT NULL,
	`device_time_at` text NOT NULL,
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
	`target_uuid` text NOT NULL,
	`target_type` text NOT NULL,
	`decision` text NOT NULL,
	`note` text,
	`corrected_json` text
);
--> statement-breakpoint
CREATE INDEX `approval_decision_target_idx` ON `approval_decision` (`target_uuid`);--> statement-breakpoint
CREATE INDEX `approval_decision_status_idx` ON `approval_decision` (`status`);--> statement-breakpoint
CREATE TABLE `assignment` (
	`mobile_uuid` text PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL,
	`device_id` text NOT NULL,
	`created_trusted_at` text NOT NULL,
	`device_time_at` text NOT NULL,
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
	`work_plan_id` integer,
	`unplanned_reason` text,
	`activity_id` integer NOT NULL,
	`block_id` integer NOT NULL,
	`employee_ids` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `assignment_date_idx` ON `assignment` (`work_date`);--> statement-breakpoint
CREATE INDEX `assignment_status_idx` ON `assignment` (`status`);--> statement-breakpoint
CREATE TABLE `attendance` (
	`mobile_uuid` text PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL,
	`device_id` text NOT NULL,
	`created_trusted_at` text NOT NULL,
	`device_time_at` text NOT NULL,
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
	`employee_id` integer NOT NULL,
	`gang_id` integer NOT NULL,
	`type` text NOT NULL,
	`att_status` text NOT NULL,
	`late_reason` text,
	`photo_id` text,
	`outside_afdeling` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE INDEX `attendance_date_employee_idx` ON `attendance` (`work_date`,`employee_id`);--> statement-breakpoint
CREATE INDEX `attendance_status_idx` ON `attendance` (`status`);--> statement-breakpoint
CREATE TABLE `daily_report` (
	`mobile_uuid` text PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL,
	`device_id` text NOT NULL,
	`created_trusted_at` text NOT NULL,
	`device_time_at` text NOT NULL,
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
	`date` text NOT NULL,
	`gang_id` integer NOT NULL,
	`summary_json` text NOT NULL,
	`signature_png_id` text
);
--> statement-breakpoint
CREATE INDEX `daily_report_date_gang_idx` ON `daily_report` (`date`,`gang_id`);--> statement-breakpoint
CREATE INDEX `daily_report_status_idx` ON `daily_report` (`status`);--> statement-breakpoint
CREATE TABLE `harvest_ticket` (
	`mobile_uuid` text PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL,
	`device_id` text NOT NULL,
	`created_trusted_at` text NOT NULL,
	`device_time_at` text NOT NULL,
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
	`ticket_no` text NOT NULL,
	`tph_id` integer NOT NULL,
	`block_id` integer NOT NULL,
	`harvester_employee_id` integer NOT NULL,
	`ripe` integer DEFAULT 0 NOT NULL,
	`unripe` integer DEFAULT 0 NOT NULL,
	`rotten` integer DEFAULT 0 NOT NULL,
	`empty_bunch` integer DEFAULT 0 NOT NULL,
	`long_stalk` integer DEFAULT 0 NOT NULL,
	`loose_fruit_kg` real DEFAULT 0 NOT NULL,
	`est_kg` real NOT NULL,
	`photo_id` text,
	`is_late_entry` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `harvest_ticket_no_uq` ON `harvest_ticket` (`ticket_no`);--> statement-breakpoint
CREATE INDEX `harvest_ticket_date_tph_harvester_idx` ON `harvest_ticket` (`work_date`,`tph_id`,`harvester_employee_id`);--> statement-breakpoint
CREATE INDEX `harvest_ticket_status_idx` ON `harvest_ticket` (`status`);--> statement-breakpoint
CREATE TABLE `material_usage` (
	`mobile_uuid` text PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL,
	`device_id` text NOT NULL,
	`created_trusted_at` text NOT NULL,
	`device_time_at` text NOT NULL,
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
	`upkeep_uuid` text NOT NULL,
	`product_id` integer NOT NULL,
	`qty` real NOT NULL,
	`uom` text NOT NULL,
	`over_dose` integer DEFAULT false NOT NULL,
	`approval_note` text
);
--> statement-breakpoint
CREATE INDEX `material_usage_upkeep_idx` ON `material_usage` (`upkeep_uuid`);--> statement-breakpoint
CREATE INDEX `material_usage_status_idx` ON `material_usage` (`status`);--> statement-breakpoint
CREATE TABLE `photo` (
	`id` text PRIMARY KEY NOT NULL,
	`transaction_uuid` text,
	`local_uri` text NOT NULL,
	`sha256` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`taken_trusted_at` text NOT NULL,
	`lat` real,
	`lng` real,
	`accuracy_m` real,
	`mocked` integer DEFAULT false NOT NULL,
	`upload_status` text DEFAULT 'pending' NOT NULL,
	`server_photo_id` integer
);
--> statement-breakpoint
CREATE INDEX `photo_upload_status_idx` ON `photo` (`upload_status`);--> statement-breakpoint
CREATE INDEX `photo_transaction_idx` ON `photo` (`transaction_uuid`);--> statement-breakpoint
CREATE TABLE `spb` (
	`mobile_uuid` text PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL,
	`device_id` text NOT NULL,
	`created_trusted_at` text NOT NULL,
	`device_time_at` text NOT NULL,
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
	`spb_no` text NOT NULL,
	`vehicle_id` integer NOT NULL,
	`driver_name` text NOT NULL,
	`destination` text NOT NULL,
	`parent_spb_uuid` text,
	`total_bunch` integer NOT NULL,
	`est_kg` real NOT NULL,
	`photo_ids` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `spb_no_uq` ON `spb` (`spb_no`);--> statement-breakpoint
CREATE INDEX `spb_status_idx` ON `spb` (`status`);--> statement-breakpoint
CREATE TABLE `spb_line` (
	`spb_uuid` text NOT NULL,
	`harvest_ticket_uuid` text NOT NULL,
	PRIMARY KEY(`spb_uuid`, `harvest_ticket_uuid`)
);
--> statement-breakpoint
CREATE INDEX `spb_line_ticket_idx` ON `spb_line` (`harvest_ticket_uuid`);--> statement-breakpoint
CREATE TABLE `upkeep` (
	`mobile_uuid` text PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL,
	`device_id` text NOT NULL,
	`created_trusted_at` text NOT NULL,
	`device_time_at` text NOT NULL,
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
	`activity_id` integer NOT NULL,
	`block_id` integer NOT NULL,
	`employee_ids` text NOT NULL,
	`hk` real NOT NULL,
	`realized_ha` real,
	`realized_trees` integer,
	`photo_id` text
);
--> statement-breakpoint
CREATE INDEX `upkeep_date_idx` ON `upkeep` (`work_date`);--> statement-breakpoint
CREATE INDEX `upkeep_status_idx` ON `upkeep` (`status`);