CREATE TABLE `ai_materials` (
	`id` varchar(32) NOT NULL,
	`teacherProfileId` int NOT NULL,
	`prompt` text NOT NULL,
	`title` varchar(256) NOT NULL,
	`lessonPlan` text NOT NULL,
	`quiz` text NOT NULL,
	`slidesJson` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `ai_materials_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `assignments` (
	`id` varchar(32) NOT NULL,
	`teacherProfileId` int NOT NULL,
	`studentProfileId` int NOT NULL,
	`title` varchar(256) NOT NULL,
	`instructions` text NOT NULL,
	`status` enum('assigned','submitted','reviewed','completed') NOT NULL DEFAULT 'assigned',
	`dueAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `assignments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `conversations` (
	`id` varchar(32) NOT NULL,
	`ownerProfileId` int NOT NULL,
	`participantProfileId` int,
	`kind` enum('assistant','individual') NOT NULL DEFAULT 'assistant',
	`title` varchar(256) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `conversations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `group_sessions` (
	`id` varchar(32) NOT NULL,
	`teacherProfileId` int NOT NULL,
	`telegramGroupId` varchar(64) NOT NULL,
	`groupTitle` varchar(256) NOT NULL,
	`title` varchar(256) NOT NULL,
	`topic` text NOT NULL,
	`sessionStatus` enum('planned','live','ended') NOT NULL DEFAULT 'planned',
	`startedAt` timestamp,
	`endedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `group_sessions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `messages` (
	`id` varchar(32) NOT NULL,
	`conversationId` varchar(32) NOT NULL,
	`sender` enum('user','assistant','system') NOT NULL,
	`content` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `messages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` varchar(32) NOT NULL,
	`profileId` int NOT NULL,
	`notificationType` enum('assignment','session','general') NOT NULL,
	`body` text NOT NULL,
	`deliveryStatus` enum('queued','sent','failed') NOT NULL DEFAULT 'queued',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`sentAt` timestamp,
	CONSTRAINT `notifications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `session_answers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`questionId` varchar(32) NOT NULL,
	`profileId` int NOT NULL,
	`answerIndex` int NOT NULL,
	`isCorrect` boolean,
	`answeredAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `session_answers_id` PRIMARY KEY(`id`),
	CONSTRAINT `session_answer_unique` UNIQUE(`questionId`,`profileId`)
);
--> statement-breakpoint
CREATE TABLE `session_participants` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sessionId` varchar(32) NOT NULL,
	`profileId` int NOT NULL,
	`joinedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `session_participants_id` PRIMARY KEY(`id`),
	CONSTRAINT `session_participant_unique` UNIQUE(`sessionId`,`profileId`)
);
--> statement-breakpoint
CREATE TABLE `session_questions` (
	`id` varchar(32) NOT NULL,
	`sessionId` varchar(32) NOT NULL,
	`question` text NOT NULL,
	`optionsJson` text NOT NULL,
	`correctOption` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `session_questions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `submissions` (
	`id` varchar(32) NOT NULL,
	`assignmentId` varchar(32) NOT NULL,
	`studentProfileId` int NOT NULL,
	`response` text NOT NULL,
	`score` int,
	`feedback` text,
	`submissionStatus` enum('submitted','reviewed') NOT NULL DEFAULT 'submitted',
	`submittedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `submissions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `teacher_student_links` (
	`id` int AUTO_INCREMENT NOT NULL,
	`teacherProfileId` int NOT NULL,
	`studentProfileId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `teacher_student_links_id` PRIMARY KEY(`id`),
	CONSTRAINT `teacher_student_unique` UNIQUE(`teacherProfileId`,`studentProfileId`)
);
--> statement-breakpoint
CREATE TABLE `telegram_profiles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`telegramId` varchar(64) NOT NULL,
	`chatId` varchar(64) NOT NULL,
	`firstName` varchar(128) NOT NULL,
	`lastName` varchar(128),
	`username` varchar(128),
	`photoUrl` text,
	`academyRole` enum('teacher','student') NOT NULL DEFAULT 'student',
	`isTelegramActive` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`lastSeenAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `telegram_profiles_id` PRIMARY KEY(`id`),
	CONSTRAINT `telegram_profiles_telegramId_unique` UNIQUE(`telegramId`)
);
--> statement-breakpoint
CREATE INDEX `materials_teacher_idx` ON `ai_materials` (`teacherProfileId`);--> statement-breakpoint
CREATE INDEX `assignments_student_idx` ON `assignments` (`studentProfileId`);--> statement-breakpoint
CREATE INDEX `conversations_owner_idx` ON `conversations` (`ownerProfileId`);--> statement-breakpoint
CREATE INDEX `sessions_teacher_idx` ON `group_sessions` (`teacherProfileId`);--> statement-breakpoint
CREATE INDEX `messages_conversation_idx` ON `messages` (`conversationId`);--> statement-breakpoint
CREATE INDEX `notifications_profile_idx` ON `notifications` (`profileId`);--> statement-breakpoint
CREATE INDEX `questions_session_idx` ON `session_questions` (`sessionId`);--> statement-breakpoint
CREATE INDEX `submissions_assignment_idx` ON `submissions` (`assignmentId`);--> statement-breakpoint
CREATE INDEX `teacher_student_teacher_idx` ON `teacher_student_links` (`teacherProfileId`);