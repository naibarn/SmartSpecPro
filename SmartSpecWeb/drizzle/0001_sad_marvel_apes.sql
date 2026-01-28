CREATE TYPE "public"."billing_period" AS ENUM('monthly', 'quarterly', 'semi_annual', 'yearly');--> statement-breakpoint
CREATE TYPE "public"."package_type" AS ENUM('one_time', 'subscription');--> statement-breakpoint
ALTER TABLE "tenants" ALTER COLUMN "id" SET DATA TYPE varchar(36);--> statement-breakpoint
ALTER TABLE "credit_packages" ADD COLUMN "packageType" "package_type" DEFAULT 'one_time' NOT NULL;--> statement-breakpoint
ALTER TABLE "credit_packages" ADD COLUMN "billingPeriod" "billing_period";--> statement-breakpoint
ALTER TABLE "credit_packages" ADD COLUMN "discountPercent" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "credit_packages" ADD COLUMN "stripeProductId" varchar(128);--> statement-breakpoint
ALTER TABLE "credit_packages" ADD COLUMN "stripePriceIds" json;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "status" varchar(20) DEFAULT 'ACTIVE' NOT NULL;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "plan" varchar(20) DEFAULT 'FREE' NOT NULL;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "created_at" timestamp DEFAULT now() NOT NULL;