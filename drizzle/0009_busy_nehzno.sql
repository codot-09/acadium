CREATE TABLE `teacher_ai_settings` (
	`teacherProfileId` int NOT NULL,
	`mode` enum('web','local') NOT NULL DEFAULT 'web',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `teacher_ai_settings_teacherProfileId` PRIMARY KEY(`teacherProfileId`)
);
--> statement-breakpoint
CREATE TABLE `teacher_sources` (
	`id` varchar(32) NOT NULL,
	`teacherProfileId` int NOT NULL,
	`name` varchar(256) NOT NULL,
	`storageKey` text NOT NULL,
	`mimeType` varchar(128) NOT NULL,
	`sizeBytes` int NOT NULL,
	`extractedText` text,
	`sourceStatus` enum('ready','archived','error') NOT NULL DEFAULT 'ready',
	`errorMessage` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `teacher_sources_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `group_sessions` ADD `aiMode` enum('web','local') DEFAULT 'web' NOT NULL;--> statement-breakpoint
ALTER TABLE `group_sessions` ADD `sourceIdsJson` text;--> statement-breakpoint
CREATE INDEX `teacher_sources_teacher_idx` ON `teacher_sources` (`teacherProfileId`);--> statement-breakpoint
CREATE INDEX `teacher_sources_status_idx` ON `teacher_sources` (`sourceStatus`);