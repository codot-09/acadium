CREATE TABLE `telegram_group_members` (
	`id` int AUTO_INCREMENT NOT NULL,
	`telegramGroupId` varchar(64) NOT NULL,
	`profileId` int NOT NULL,
	`memberStatus` enum('member','restricted','administrator','creator','left','kicked') NOT NULL DEFAULT 'member',
	`firstSeenAt` timestamp NOT NULL DEFAULT (now()),
	`lastSeenAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `telegram_group_members_id` PRIMARY KEY(`id`),
	CONSTRAINT `telegram_group_member_unique` UNIQUE(`telegramGroupId`,`profileId`)
);
--> statement-breakpoint
CREATE TABLE `telegram_processed_updates` (
	`updateId` varchar(64) NOT NULL,
	`receivedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `telegram_processed_updates_updateId` PRIMARY KEY(`updateId`)
);
--> statement-breakpoint
ALTER TABLE `group_session_events` ADD `eventKey` varchar(128);--> statement-breakpoint
ALTER TABLE `group_session_events` ADD CONSTRAINT `group_events_key_unique` UNIQUE(`eventKey`);--> statement-breakpoint
CREATE INDEX `telegram_group_member_group_idx` ON `telegram_group_members` (`telegramGroupId`);