CREATE TABLE `email_configs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`smtpHost` varchar(255) NOT NULL,
	`smtpPort` int NOT NULL DEFAULT 587,
	`smtpUser` varchar(255),
	`smtpPass` varchar(255),
	`fromEmail` varchar(320) NOT NULL,
	`toEmails` text NOT NULL,
	`enabled` boolean NOT NULL DEFAULT true,
	`events` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `email_configs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `notification_history` (
	`id` int AUTO_INCREMENT NOT NULL,
	`type` varchar(64) NOT NULL,
	`title` varchar(255) NOT NULL,
	`message` text NOT NULL,
	`severity` enum('info','warning','critical') NOT NULL DEFAULT 'info',
	`containerName` varchar(255),
	`containerId` varchar(64),
	`webhookResults` text,
	`emailResults` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `notification_history_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`openId` varchar(64) NOT NULL,
	`name` text,
	`email` varchar(320),
	`loginMethod` varchar(64),
	`role` enum('user','admin') NOT NULL DEFAULT 'user',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`lastSignedIn` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_openId_unique` UNIQUE(`openId`)
);
--> statement-breakpoint
CREATE TABLE `webhook_configs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`url` text NOT NULL,
	`type` enum('slack','discord','generic','teams') NOT NULL DEFAULT 'generic',
	`enabled` boolean NOT NULL DEFAULT true,
	`events` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `webhook_configs_id` PRIMARY KEY(`id`)
);
