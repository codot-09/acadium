CREATE TABLE `subscription_receipts` (
	`id` varchar(32) NOT NULL,
	`profileId` int NOT NULL,
	`fileName` varchar(256) NOT NULL,
	`storageKey` text NOT NULL,
	`mimeType` varchar(128) NOT NULL,
	`sizeBytes` int NOT NULL,
	`receiptStatus` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
	`parsedAmount` int,
	`parsedCurrency` varchar(16),
	`confidence` int,
	`analysisReason` text,
	`processedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `subscription_receipts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `subscriptions` (
	`id` varchar(32) NOT NULL,
	`profileId` int NOT NULL,
	`subscriptionPlan` enum('individual','enterprise') NOT NULL,
	`subscriptionStatus` enum('active','expired','cancelled') NOT NULL DEFAULT 'active',
	`amount` int NOT NULL,
	`currency` varchar(16) NOT NULL DEFAULT 'UZS',
	`startsAt` timestamp NOT NULL,
	`endsAt` timestamp NOT NULL,
	`receiptId` varchar(32),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `subscriptions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `subscription_receipts_profile_idx` ON `subscription_receipts` (`profileId`);--> statement-breakpoint
CREATE INDEX `subscription_receipts_status_idx` ON `subscription_receipts` (`receiptStatus`);--> statement-breakpoint
CREATE INDEX `subscriptions_profile_idx` ON `subscriptions` (`profileId`);--> statement-breakpoint
CREATE INDEX `subscriptions_active_idx` ON `subscriptions` (`profileId`,`subscriptionStatus`,`endsAt`);