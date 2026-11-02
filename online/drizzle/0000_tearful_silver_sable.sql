CREATE TABLE `radar_datasets` (
	`owner` text NOT NULL,
	`mode` text NOT NULL,
	`version` integer DEFAULT 0 NOT NULL,
	`data` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`owner`, `mode`)
);
