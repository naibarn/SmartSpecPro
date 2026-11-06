CREATE TABLE "vertical_drama_books" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"tenantId" varchar(36) NOT NULL,
	"userId" integer NOT NULL,
	"seriesId" bigint NOT NULL,
	"title" varchar(255) NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"sourceSelection" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"currentRevisionNumber" integer DEFAULT 0 NOT NULL,
	"sourceFingerprint" varchar(64),
	"staleAt" timestamp with time zone,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vertical_drama_books_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade,
	CONSTRAINT "vertical_drama_books_seriesId_vertical_drama_series_id_fk" FOREIGN KEY ("seriesId") REFERENCES "public"."vertical_drama_series"("id") ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX "vds_book_series_owner_idx" ON "vertical_drama_books" USING btree ("tenantId","userId","seriesId","updatedAt");
--> statement-breakpoint
CREATE INDEX "vds_book_source_fingerprint_idx" ON "vertical_drama_books" USING btree ("tenantId","seriesId","sourceFingerprint");
--> statement-breakpoint
CREATE TABLE "vertical_drama_book_revisions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"tenantId" varchar(36) NOT NULL,
	"userId" integer NOT NULL,
	"seriesId" bigint NOT NULL,
	"bookId" bigint NOT NULL,
	"revisionNumber" integer NOT NULL,
	"status" varchar(24) DEFAULT 'draft' NOT NULL,
	"schemaVersion" integer DEFAULT 1 NOT NULL,
	"document" jsonb NOT NULL,
	"sourceSnapshot" jsonb NOT NULL,
	"sourceFingerprint" varchar(64) NOT NULL,
	"documentFingerprint" varchar(64) NOT NULL,
	"approvedBy" integer,
	"approvedAt" timestamp with time zone,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vds_book_revision_number_positive" CHECK ("revisionNumber" > 0),
	CONSTRAINT "vds_book_revision_status_check" CHECK ("status" IN ('draft','candidate','approved','superseded')),
	CONSTRAINT "vertical_drama_book_revisions_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade,
	CONSTRAINT "vertical_drama_book_revisions_seriesId_vertical_drama_series_id_fk" FOREIGN KEY ("seriesId") REFERENCES "public"."vertical_drama_series"("id") ON DELETE cascade,
	CONSTRAINT "vertical_drama_book_revisions_bookId_vertical_drama_books_id_fk" FOREIGN KEY ("bookId") REFERENCES "public"."vertical_drama_books"("id") ON DELETE cascade,
	CONSTRAINT "vertical_drama_book_revisions_approvedBy_users_id_fk" FOREIGN KEY ("approvedBy") REFERENCES "public"."users"("id") ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX "vds_book_revision_number_unique" ON "vertical_drama_book_revisions" USING btree ("tenantId","bookId","revisionNumber");
--> statement-breakpoint
CREATE INDEX "vds_book_revision_source_fingerprint_idx" ON "vertical_drama_book_revisions" USING btree ("tenantId","seriesId","sourceFingerprint");
--> statement-breakpoint
CREATE TABLE "vertical_drama_book_export_artifacts" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"tenantId" varchar(36) NOT NULL,
	"userId" integer NOT NULL,
	"seriesId" bigint NOT NULL,
	"bookId" bigint NOT NULL,
	"revisionId" bigint NOT NULL,
	"format" varchar(8) NOT NULL,
	"status" varchar(24) DEFAULT 'queued' NOT NULL,
	"jobId" varchar(64),
	"idempotencyKey" varchar(200) NOT NULL,
	"profileFingerprint" varchar(64) NOT NULL,
	"storageKey" text,
	"checksumSha256" varchar(64),
	"sizeBytes" bigint,
	"validation" jsonb,
	"errorCode" varchar(80),
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vds_book_export_format_check" CHECK ("format" IN ('epub','pdf')),
	CONSTRAINT "vds_book_export_status_check" CHECK ("status" IN ('queued','running','validating','available','failed','cancelled')),
	CONSTRAINT "vds_book_export_checksum_check" CHECK ("checksumSha256" IS NULL OR "checksumSha256" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "vertical_drama_book_export_artifacts_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade,
	CONSTRAINT "vertical_drama_book_export_artifacts_seriesId_vertical_drama_series_id_fk" FOREIGN KEY ("seriesId") REFERENCES "public"."vertical_drama_series"("id") ON DELETE cascade,
	CONSTRAINT "vertical_drama_book_export_artifacts_bookId_vertical_drama_books_id_fk" FOREIGN KEY ("bookId") REFERENCES "public"."vertical_drama_books"("id") ON DELETE cascade,
	CONSTRAINT "vertical_drama_book_export_artifacts_revisionId_vertical_drama_book_revisions_id_fk" FOREIGN KEY ("revisionId") REFERENCES "public"."vertical_drama_book_revisions"("id") ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX "vds_book_export_idempotency_unique" ON "vertical_drama_book_export_artifacts" USING btree ("tenantId","idempotencyKey");
--> statement-breakpoint
CREATE INDEX "vds_book_export_revision_format_idx" ON "vertical_drama_book_export_artifacts" USING btree ("tenantId","revisionId","format","createdAt");
