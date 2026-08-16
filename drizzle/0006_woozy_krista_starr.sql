ALTER TABLE `group_session_events` ADD `analysisJson` text;--> statement-breakpoint
ALTER TABLE `group_session_events` ADD `replyToMessageId` varchar(64);--> statement-breakpoint
ALTER TABLE `group_sessions` ADD `lessonBriefJson` text;