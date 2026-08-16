CREATE TABLE `teacher_invites` (
	`id` varchar(32) NOT NULL,
	`code` varchar(64) NOT NULL,
	`createdByUserId` int NOT NULL,
	`usedByProfileId` int,
	`expiresAt` timestamp NOT NULL,
	`usedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `teacher_invites_id` PRIMARY KEY(`id`),
	CONSTRAINT `teacher_invites_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE INDEX `teacher_invites_code_idx` ON `teacher_invites` (`code`);