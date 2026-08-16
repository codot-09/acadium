CREATE TABLE `telegram_group_analysis_rate_limits` (
	`rateKey` varchar(160) NOT NULL,
	`windowStartedAt` timestamp NOT NULL,
	`requestCount` int NOT NULL DEFAULT 0,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `telegram_group_analysis_rate_limits_rateKey` PRIMARY KEY(`rateKey`)
);
