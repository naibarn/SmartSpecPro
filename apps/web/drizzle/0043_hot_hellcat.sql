CREATE TABLE "channel_messages" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenantId" varchar(36) NOT NULL,
	"conversationChannelId" varchar(36) NOT NULL,
	"messageId" text NOT NULL,
	"messageType" varchar(20) NOT NULL,
	"channelType" varchar(20) NOT NULL,
	"externalMessageId" varchar(64),
	"externalChatId" varchar(64),
	"deliveryStatus" varchar(20) DEFAULT 'pending' NOT NULL,
	"attemptCount" integer DEFAULT 0 NOT NULL,
	"lastAttemptAt" timestamp with time zone,
	"deliveredAt" timestamp with time zone,
	"failureCode" varchar(50),
	"failureReason" text,
	"metadata" json
);
--> statement-breakpoint
CREATE TABLE "conversation_channels" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenantId" varchar(36) NOT NULL,
	"chatConversationId" integer,
	"agencyConversationId" varchar(36),
	"conversationType" varchar(20) NOT NULL,
	"channelType" varchar(20) NOT NULL,
	"channelRefId" varchar(64),
	"connectionId" varchar(36),
	"isPrimary" boolean DEFAULT false NOT NULL,
	"syncMode" varchar(20) DEFAULT 'two_way' NOT NULL,
	"state" varchar(20) DEFAULT 'active' NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conversation_channels_one_conv_check" CHECK (
    ("conversationType" = 'chat' AND "chatConversationId" IS NOT NULL AND "agencyConversationId" IS NULL)
    OR
    ("conversationType" = 'agency' AND "agencyConversationId" IS NOT NULL AND "chatConversationId" IS NULL)
  )
);
--> statement-breakpoint
CREATE TABLE "telegram_connections" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenantId" varchar(36) NOT NULL,
	"userId" integer NOT NULL,
	"telegramUserId" varchar(64) NOT NULL,
	"telegramChatId" varchar(64) NOT NULL,
	"telegramUsername" varchar(64),
	"botId" varchar(64) NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"activeChannelId" varchar(36),
	"linkedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"linkedBy" varchar(20) NOT NULL,
	"revokedAt" timestamp with time zone,
	"revokedBy" varchar(36),
	"lastSeenAt" timestamp with time zone,
	"metadata" json
);
--> statement-breakpoint
CREATE TABLE "telegram_link_tokens" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenantId" varchar(36) NOT NULL,
	"userId" integer NOT NULL,
	"targetChatConversationId" integer,
	"targetAgencyConversationId" varchar(36),
	"targetConversationType" varchar(20),
	"purpose" varchar(20) NOT NULL,
	"tokenHash" varchar(128) NOT NULL,
	"expiresAt" timestamp with time zone NOT NULL,
	"usedAt" timestamp with time zone,
	"revokedAt" timestamp with time zone,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"createdBy" integer,
	"metadata" json
);
--> statement-breakpoint
CREATE TABLE "telegram_updates" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"botId" varchar(64) NOT NULL,
	"updateId" bigint NOT NULL,
	"telegramChatId" varchar(64),
	"receivedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"processedAt" timestamp with time zone,
	"processingStatus" varchar(20) DEFAULT 'accepted' NOT NULL,
	"errorCode" varchar(50),
	"errorReason" text
);
--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "defaultChannelPolicy" varchar(20) DEFAULT 'allow_attach';--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "sourceChannel" varchar(20);--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "sourceConnectionId" varchar(36);--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "externalSourceId" varchar(64);--> statement-breakpoint
ALTER TABLE "channel_messages" ADD CONSTRAINT "channel_messages_tenantId_tenants_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_messages" ADD CONSTRAINT "channel_messages_conversationChannelId_conversation_channels_id_fk" FOREIGN KEY ("conversationChannelId") REFERENCES "public"."conversation_channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_channels" ADD CONSTRAINT "conversation_channels_tenantId_tenants_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_channels" ADD CONSTRAINT "conversation_channels_chatConversationId_conversations_id_fk" FOREIGN KEY ("chatConversationId") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_channels" ADD CONSTRAINT "conversation_channels_agencyConversationId_agency_conversations_id_fk" FOREIGN KEY ("agencyConversationId") REFERENCES "public"."agency_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telegram_connections" ADD CONSTRAINT "telegram_connections_tenantId_tenants_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telegram_connections" ADD CONSTRAINT "telegram_connections_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telegram_link_tokens" ADD CONSTRAINT "telegram_link_tokens_tenantId_tenants_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telegram_link_tokens" ADD CONSTRAINT "telegram_link_tokens_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telegram_link_tokens" ADD CONSTRAINT "telegram_link_tokens_targetChatConversationId_conversations_id_fk" FOREIGN KEY ("targetChatConversationId") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telegram_link_tokens" ADD CONSTRAINT "telegram_link_tokens_targetAgencyConversationId_agency_conversations_id_fk" FOREIGN KEY ("targetAgencyConversationId") REFERENCES "public"."agency_conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "channel_messages_external_unique" ON "channel_messages" USING btree ("channelType","externalChatId","externalMessageId");--> statement-breakpoint
CREATE INDEX "channel_messages_channel_msg_idx" ON "channel_messages" USING btree ("conversationChannelId","messageId");--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_channels_chat_unique" ON "conversation_channels" USING btree ("chatConversationId","channelType","channelRefId") WHERE "chatConversationId" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_channels_agency_unique" ON "conversation_channels" USING btree ("agencyConversationId","channelType","channelRefId") WHERE "agencyConversationId" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "conversation_channels_tenant_type_idx" ON "conversation_channels" USING btree ("tenantId","channelType");--> statement-breakpoint
CREATE UNIQUE INDEX "telegram_connections_bot_user_unique" ON "telegram_connections" USING btree ("botId","telegramUserId");--> statement-breakpoint
CREATE INDEX "telegram_connections_tenant_user_idx" ON "telegram_connections" USING btree ("tenantId","userId");--> statement-breakpoint
CREATE INDEX "telegram_connections_chat_id_idx" ON "telegram_connections" USING btree ("telegramChatId");--> statement-breakpoint
CREATE UNIQUE INDEX "telegram_link_tokens_hash_unique" ON "telegram_link_tokens" USING btree ("tokenHash");--> statement-breakpoint
CREATE INDEX "telegram_link_tokens_tenant_user_purpose_idx" ON "telegram_link_tokens" USING btree ("tenantId","userId","purpose");--> statement-breakpoint
CREATE UNIQUE INDEX "telegram_updates_bot_update_unique" ON "telegram_updates" USING btree ("botId","updateId");