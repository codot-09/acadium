ALTER TABLE `subscription_receipts` ADD `fingerprint` varchar(64) NOT NULL;--> statement-breakpoint
ALTER TABLE `subscription_receipts` ADD CONSTRAINT `subscription_receipts_fingerprint_unique` UNIQUE(`fingerprint`);--> statement-breakpoint
ALTER TABLE `subscriptions` ADD CONSTRAINT `subscriptions_receiptId_unique` UNIQUE(`receiptId`);