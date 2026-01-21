CREATE TABLE `credit_packages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(128) NOT NULL,
	`description` text,
	`credits` int NOT NULL,
	`priceUsd` decimal(10,2) NOT NULL,
	`stripePriceId` varchar(128),
	`isActive` boolean NOT NULL DEFAULT true,
	`isFeatured` boolean NOT NULL DEFAULT false,
	`sortOrder` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `credit_packages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `credit_transactions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`amount` int NOT NULL,
	`type` enum('purchase','usage','bonus','refund','adjustment','subscription') NOT NULL,
	`description` varchar(512),
	`metadata` json,
	`balanceAfter` int NOT NULL,
	`referenceId` varchar(128),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `credit_transactions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `llm_providers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`providerName` varchar(64) NOT NULL,
	`displayName` varchar(128) NOT NULL,
	`description` text,
	`baseUrl` varchar(512),
	`apiKeyEncrypted` text,
	`hasApiKey` boolean NOT NULL DEFAULT false,
	`defaultModel` varchar(128),
	`availableModels` json,
	`configJson` json,
	`isEnabled` boolean NOT NULL DEFAULT false,
	`sortOrder` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `llm_providers_id` PRIMARY KEY(`id`),
	CONSTRAINT `llm_providers_providerName_unique` UNIQUE(`providerName`)
);
--> statement-breakpoint
ALTER TABLE `users` ADD `credits` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `plan` enum('free','starter','pro','enterprise') DEFAULT 'free' NOT NULL;--> statement-breakpoint
ALTER TABLE `credit_transactions` ADD CONSTRAINT `credit_transactions_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;