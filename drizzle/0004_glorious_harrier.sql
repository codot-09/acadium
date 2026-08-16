CREATE TABLE `group_session_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sessionId` varchar(32) NOT NULL,
	`profileId` int NOT NULL,
	`telegramUserId` varchar(64) NOT NULL,
	`eventType` enum('join','message','question','answer','system') NOT NULL,
	`content` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `group_session_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `group_events_session_idx` ON `group_session_events` (`sessionId`);--> statement-breakpoint
CREATE INDEX `group_events_profile_idx` ON `group_session_events` (`profileId`);