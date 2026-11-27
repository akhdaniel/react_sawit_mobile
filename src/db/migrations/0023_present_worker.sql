CREATE TABLE `present_worker` (
	`work_date` text NOT NULL,
	`employee_id` integer NOT NULL,
	`gang_id` integer NOT NULL,
	`att_status` text NOT NULL,
	`checked_out` integer NOT NULL,
	`fetched_at` text NOT NULL,
	PRIMARY KEY(`work_date`, `employee_id`)
);
