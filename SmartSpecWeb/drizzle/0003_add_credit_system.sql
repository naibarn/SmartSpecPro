-- Migration: Add Credit System
-- Date: 2026-01-12

-- Add credits and plan columns to users table
ALTER TABLE `users` ADD COLUMN `credits` int NOT NULL DEFAULT 0;
ALTER TABLE `users` ADD COLUMN `plan` enum('free','starter','pro','enterprise') NOT NULL DEFAULT 'free';

-- Create credit_transactions table
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
  CONSTRAINT `credit_transactions_id` PRIMARY KEY(`id`),
  CONSTRAINT `credit_transactions_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
);

-- Create credit_packages table
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

-- Create indexes for better query performance
CREATE INDEX `credit_transactions_userId_idx` ON `credit_transactions` (`userId`);
CREATE INDEX `credit_transactions_type_idx` ON `credit_transactions` (`type`);
CREATE INDEX `credit_transactions_createdAt_idx` ON `credit_transactions` (`createdAt`);

-- Insert default credit packages
INSERT INTO `credit_packages` (`name`, `description`, `credits`, `priceUsd`, `isActive`, `isFeatured`, `sortOrder`) VALUES
('Starter Pack', 'Perfect for trying out SmartSpec', 100, 5.00, true, false, 1),
('Basic Pack', 'Great for regular users', 500, 20.00, true, false, 2),
('Pro Pack', 'Best value for power users', 1500, 50.00, true, true, 3),
('Enterprise Pack', 'For teams and businesses', 5000, 150.00, true, false, 4);

-- Give existing users 100 free credits (signup bonus)
UPDATE `users` SET `credits` = 100 WHERE `credits` = 0;
