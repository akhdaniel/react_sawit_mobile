ALTER TABLE `employee` ADD `nfc_uid` text;--> statement-breakpoint
CREATE INDEX `employee_nfc_idx` ON `employee` (`nfc_uid`);