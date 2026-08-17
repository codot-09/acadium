ALTER TABLE `subscription_receipts` ADD `paymentStatus` varchar(24);--> statement-breakpoint
ALTER TABLE `subscription_receipts` ADD `recipient` varchar(256);--> statement-breakpoint
ALTER TABLE `subscription_receipts` ADD `transactionId` varchar(128);--> statement-breakpoint
ALTER TABLE `subscription_receipts` ADD `paidAt` timestamp;--> statement-breakpoint
ALTER TABLE `subscription_receipts` ADD `evidenceJson` text;--> statement-breakpoint
ALTER TABLE `subscription_receipts` ADD `fraudSignalsJson` text;--> statement-breakpoint
ALTER TABLE `subscription_receipts` ADD `analysisVersion` varchar(32);