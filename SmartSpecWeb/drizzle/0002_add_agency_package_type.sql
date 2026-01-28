-- Add 'agency' value to package_type enum for White Label packages
ALTER TYPE "package_type" ADD VALUE IF NOT EXISTS 'agency';
