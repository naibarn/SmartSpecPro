--
-- PostgreSQL database dump
--

\restrict YOCtxgkABxoOfMuBQqzafbOO4gwMN63Ce6Ufdo3kleUFEx0oK0gIraCYpUevBno

-- Dumped from database version 15.15
-- Dumped by pg_dump version 15.15

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: drizzle; Type: SCHEMA; Schema: -; Owner: smartspec
--

CREATE SCHEMA drizzle;


ALTER SCHEMA drizzle OWNER TO smartspec;

--
-- Name: approvalstatus; Type: TYPE; Schema: public; Owner: smartspec
--

CREATE TYPE public.approvalstatus AS ENUM (
    'PENDING',
    'APPROVED',
    'REJECTED',
    'EXPIRED',
    'CANCELLED'
);


ALTER TYPE public.approvalstatus OWNER TO smartspec;

--
-- Name: approvaltype; Type: TYPE; Schema: public; Owner: smartspec
--

CREATE TYPE public.approvaltype AS ENUM (
    'CODE_EXECUTION',
    'FILE_MODIFICATION',
    'DEPLOYMENT',
    'CONFIGURATION_CHANGE',
    'COST_THRESHOLD',
    'SECURITY_SENSITIVE',
    'CUSTOM'
);


ALTER TYPE public.approvaltype OWNER TO smartspec;

--
-- Name: aspect_ratio; Type: TYPE; Schema: public; Owner: smartspec
--

CREATE TYPE public.aspect_ratio AS ENUM (
    '1:1',
    '9:16',
    '16:9'
);


ALTER TYPE public.aspect_ratio OWNER TO smartspec;

--
-- Name: assetstatus; Type: TYPE; Schema: public; Owner: smartspec
--

CREATE TYPE public.assetstatus AS ENUM (
    'ACTIVE',
    'ARCHIVED',
    'DELETED'
);


ALTER TYPE public.assetstatus OWNER TO smartspec;

--
-- Name: assettype; Type: TYPE; Schema: public; Owner: smartspec
--

CREATE TYPE public.assettype AS ENUM (
    'IMAGE',
    'VIDEO',
    'AUDIO'
);


ALTER TYPE public.assettype OWNER TO smartspec;

--
-- Name: billing_period; Type: TYPE; Schema: public; Owner: smartspec
--

CREATE TYPE public.billing_period AS ENUM (
    'monthly',
    'quarterly',
    'semi_annual',
    'yearly'
);


ALTER TYPE public.billing_period OWNER TO smartspec;

--
-- Name: content_type; Type: TYPE; Schema: public; Owner: smartspec
--

CREATE TYPE public.content_type AS ENUM (
    'image',
    'video',
    'website'
);


ALTER TYPE public.content_type OWNER TO smartspec;

--
-- Name: entity_type; Type: TYPE; Schema: public; Owner: smartspec
--

CREATE TYPE public.entity_type AS ENUM (
    'user',
    'project',
    'preference',
    'technical',
    'decision',
    'plan',
    'architecture',
    'component',
    'task',
    'code_knowledge',
    'rule'
);


ALTER TYPE public.entity_type OWNER TO smartspec;

--
-- Name: executionstatus; Type: TYPE; Schema: public; Owner: smartspec
--

CREATE TYPE public.executionstatus AS ENUM (
    'PENDING',
    'RUNNING',
    'COMPLETED',
    'FAILED',
    'CANCELLED'
);


ALTER TYPE public.executionstatus OWNER TO smartspec;

--
-- Name: follow_status; Type: TYPE; Schema: public; Owner: smartspec
--

CREATE TYPE public.follow_status AS ENUM (
    'active',
    'blocked'
);


ALTER TYPE public.follow_status OWNER TO smartspec;

--
-- Name: media_model_type; Type: TYPE; Schema: public; Owner: smartspec
--

CREATE TYPE public.media_model_type AS ENUM (
    'image',
    'video',
    'audio'
);


ALTER TYPE public.media_model_type OWNER TO smartspec;

--
-- Name: media_provider_type; Type: TYPE; Schema: public; Owner: smartspec
--

CREATE TYPE public.media_provider_type AS ENUM (
    'image',
    'video',
    'audio',
    'multimodal'
);


ALTER TYPE public.media_provider_type OWNER TO smartspec;

--
-- Name: memoryscope; Type: TYPE; Schema: public; Owner: smartspec
--

CREATE TYPE public.memoryscope AS ENUM (
    'GLOBAL',
    'USER',
    'PROJECT',
    'SESSION',
    'WORKFLOW'
);


ALTER TYPE public.memoryscope OWNER TO smartspec;

--
-- Name: memorytype; Type: TYPE; Schema: public; Owner: smartspec
--

CREATE TYPE public.memorytype AS ENUM (
    'USER_PREFERENCE',
    'USER_INSTRUCTION',
    'PROJECT_FACT',
    'PROJECT_CONVENTION',
    'PROJECT_TECH_STACK',
    'LEARNED_PATTERN',
    'FEEDBACK',
    'SKILL',
    'RULE'
);


ALTER TYPE public.memorytype OWNER TO smartspec;

--
-- Name: message_role; Type: TYPE; Schema: public; Owner: smartspec
--

CREATE TYPE public.message_role AS ENUM (
    'user',
    'assistant',
    'system'
);


ALTER TYPE public.message_role OWNER TO smartspec;

--
-- Name: notification_type; Type: TYPE; Schema: public; Owner: smartspec
--

CREATE TYPE public.notification_type AS ENUM (
    'scheduled_message',
    'follow_request',
    'alert',
    'system',
    'direct_message',
    'urgent_message'
);


ALTER TYPE public.notification_type OWNER TO smartspec;

--
-- Name: opencodekeystatus; Type: TYPE; Schema: public; Owner: smartspec
--

CREATE TYPE public.opencodekeystatus AS ENUM (
    'ACTIVE',
    'REVOKED',
    'EXPIRED',
    'SUSPENDED'
);


ALTER TYPE public.opencodekeystatus OWNER TO smartspec;

--
-- Name: package_type; Type: TYPE; Schema: public; Owner: smartspec
--

CREATE TYPE public.package_type AS ENUM (
    'one_time',
    'subscription',
    'agency'
);


ALTER TYPE public.package_type OWNER TO smartspec;

--
-- Name: permissionscope; Type: TYPE; Schema: public; Owner: smartspec
--

CREATE TYPE public.permissionscope AS ENUM (
    'GLOBAL',
    'TENANT',
    'PROJECT',
    'RESOURCE'
);


ALTER TYPE public.permissionscope OWNER TO smartspec;

--
-- Name: plan; Type: TYPE; Schema: public; Owner: smartspec
--

CREATE TYPE public.plan AS ENUM (
    'free',
    'starter',
    'pro',
    'enterprise'
);


ALTER TYPE public.plan OWNER TO smartspec;

--
-- Name: refundstatus; Type: TYPE; Schema: public; Owner: smartspec
--

CREATE TYPE public.refundstatus AS ENUM (
    'PENDING',
    'PROCESSING',
    'COMPLETED',
    'FAILED',
    'CANCELLED'
);


ALTER TYPE public.refundstatus OWNER TO smartspec;

--
-- Name: refundtype; Type: TYPE; Schema: public; Owner: smartspec
--

CREATE TYPE public.refundtype AS ENUM (
    'FULL',
    'PARTIAL'
);


ALTER TYPE public.refundtype OWNER TO smartspec;

--
-- Name: role; Type: TYPE; Schema: public; Owner: smartspec
--

CREATE TYPE public.role AS ENUM (
    'user',
    'admin',
    'domain_admin'
);


ALTER TYPE public.role OWNER TO smartspec;

--
-- Name: schedule_status; Type: TYPE; Schema: public; Owner: smartspec
--

CREATE TYPE public.schedule_status AS ENUM (
    'active',
    'paused',
    'completed',
    'failed'
);


ALTER TYPE public.schedule_status OWNER TO smartspec;

--
-- Name: secrettype; Type: TYPE; Schema: public; Owner: smartspec
--

CREATE TYPE public.secrettype AS ENUM (
    'API_KEY',
    'PASSWORD',
    'TOKEN',
    'CERTIFICATE',
    'SSH_KEY',
    'DATABASE_URL',
    'WEBHOOK_SECRET',
    'ENCRYPTION_KEY',
    'CUSTOM'
);


ALTER TYPE public.secrettype OWNER TO smartspec;

--
-- Name: skill_category; Type: TYPE; Schema: public; Owner: smartspec
--

CREATE TYPE public.skill_category AS ENUM (
    'image_generation',
    'video_generation',
    'audio_generation',
    'sound_effects',
    'prompt_enhancement',
    'code_assistant',
    'document_analysis',
    'web_search',
    'data_analysis',
    'translation',
    'summarization',
    'chat_assistant',
    'automation',
    'other'
);


ALTER TYPE public.skill_category OWNER TO smartspec;

--
-- Name: storage_provider_type; Type: TYPE; Schema: public; Owner: smartspec
--

CREATE TYPE public.storage_provider_type AS ENUM (
    'r2',
    's3',
    'local'
);


ALTER TYPE public.storage_provider_type OWNER TO smartspec;

--
-- Name: templatecategory; Type: TYPE; Schema: public; Owner: smartspec
--

CREATE TYPE public.templatecategory AS ENUM (
    'IMAGE_GENERATION',
    'VIDEO_GENERATION',
    'AUDIO_GENERATION',
    'MEDIA_SUITE',
    'AI_FEATURES',
    'UI_COMPONENTS',
    'BACKEND_SERVICES',
    'FULL_STACK',
    'INTEGRATIONS',
    'UTILITIES'
);


ALTER TYPE public.templatecategory OWNER TO smartspec;

--
-- Name: templatestatus; Type: TYPE; Schema: public; Owner: smartspec
--

CREATE TYPE public.templatestatus AS ENUM (
    'DRAFT',
    'PENDING_REVIEW',
    'APPROVED',
    'REJECTED',
    'SUSPENDED',
    'ARCHIVED'
);


ALTER TYPE public.templatestatus OWNER TO smartspec;

--
-- Name: tenantplan; Type: TYPE; Schema: public; Owner: smartspec
--

CREATE TYPE public.tenantplan AS ENUM (
    'FREE',
    'STARTER',
    'PROFESSIONAL',
    'ENTERPRISE'
);


ALTER TYPE public.tenantplan OWNER TO smartspec;

--
-- Name: tenantstatus; Type: TYPE; Schema: public; Owner: smartspec
--

CREATE TYPE public.tenantstatus AS ENUM (
    'ACTIVE',
    'SUSPENDED',
    'PENDING',
    'DELETED'
);


ALTER TYPE public.tenantstatus OWNER TO smartspec;

--
-- Name: ticketcategory; Type: TYPE; Schema: public; Owner: smartspec
--

CREATE TYPE public.ticketcategory AS ENUM (
    'TECHNICAL',
    'BILLING',
    'FEATURE_REQUEST',
    'BUG_REPORT',
    'ACCOUNT',
    'OTHER'
);


ALTER TYPE public.ticketcategory OWNER TO smartspec;

--
-- Name: ticketpriority; Type: TYPE; Schema: public; Owner: smartspec
--

CREATE TYPE public.ticketpriority AS ENUM (
    'LOW',
    'MEDIUM',
    'HIGH',
    'URGENT'
);


ALTER TYPE public.ticketpriority OWNER TO smartspec;

--
-- Name: ticketstatus; Type: TYPE; Schema: public; Owner: smartspec
--

CREATE TYPE public.ticketstatus AS ENUM (
    'OPEN',
    'IN_PROGRESS',
    'WAITING_USER',
    'RESOLVED',
    'CLOSED'
);


ALTER TYPE public.ticketstatus OWNER TO smartspec;

--
-- Name: transaction_type; Type: TYPE; Schema: public; Owner: smartspec
--

CREATE TYPE public.transaction_type AS ENUM (
    'purchase',
    'usage',
    'bonus',
    'refund',
    'adjustment'
);


ALTER TYPE public.transaction_type OWNER TO smartspec;

--
-- Name: vectorindextype; Type: TYPE; Schema: public; Owner: smartspec
--

CREATE TYPE public.vectorindextype AS ENUM (
    'FLAT',
    'IVFFLAT',
    'HNSW'
);


ALTER TYPE public.vectorindextype OWNER TO smartspec;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: __drizzle_migrations; Type: TABLE; Schema: drizzle; Owner: smartspec
--

CREATE TABLE drizzle.__drizzle_migrations (
    id integer NOT NULL,
    hash text NOT NULL,
    created_at bigint
);


ALTER TABLE drizzle.__drizzle_migrations OWNER TO smartspec;

--
-- Name: __drizzle_migrations_id_seq; Type: SEQUENCE; Schema: drizzle; Owner: smartspec
--

CREATE SEQUENCE drizzle.__drizzle_migrations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE drizzle.__drizzle_migrations_id_seq OWNER TO smartspec;

--
-- Name: __drizzle_migrations_id_seq; Type: SEQUENCE OWNED BY; Schema: drizzle; Owner: smartspec
--

ALTER SEQUENCE drizzle.__drizzle_migrations_id_seq OWNED BY drizzle.__drizzle_migrations.id;


--
-- Name: api_key_usage; Type: TABLE; Schema: public; Owner: smartspec
--

CREATE TABLE public.api_key_usage (
    id character varying(36) NOT NULL,
    api_key_id character varying(36) NOT NULL,
    endpoint character varying(500) NOT NULL,
    method character varying(10) NOT NULL,
    status_code integer NOT NULL,
    response_time integer NOT NULL,
    credits_used integer,
    ip_address character varying(45),
    user_agent text,
    "timestamp" timestamp without time zone
);


ALTER TABLE public.api_key_usage OWNER TO smartspec;

--
-- Name: api_keys; Type: TABLE; Schema: public; Owner: smartspec
--

CREATE TABLE public.api_keys (
    id character varying(36) NOT NULL,
    user_id integer NOT NULL,
    name character varying(255) NOT NULL,
    key_hash character varying(255) NOT NULL,
    key_prefix character varying(20) NOT NULL,
    permissions json,
    rate_limit integer,
    is_active boolean,
    expires_at timestamp without time zone,
    last_used_at timestamp without time zone,
    description text,
    created_at timestamp without time zone,
    updated_at timestamp without time zone
);


ALTER TABLE public.api_keys OWNER TO smartspec;

--
-- Name: approval_requests; Type: TABLE; Schema: public; Owner: smartspec
--

CREATE TABLE public.approval_requests (
    id character varying(36) NOT NULL,
    request_type public.approvaltype NOT NULL,
    title character varying(255) NOT NULL,
    description text,
    tenant_id character varying(36),
    project_id character varying(36),
    execution_id character varying(36),
    requester_id integer,
    requester_type character varying(50),
    status public.approvalstatus NOT NULL,
    payload json,
    extra_data json,
    risk_level character varying(20),
    risk_factors json,
    required_approvers integer,
    current_approvals integer,
    expires_at timestamp without time zone,
    timeout_action character varying(20),
    created_at timestamp without time zone NOT NULL,
    updated_at timestamp without time zone,
    resolved_at timestamp without time zone
);


ALTER TABLE public.approval_requests OWNER TO smartspec;

--
-- Name: approval_responses; Type: TABLE; Schema: public; Owner: smartspec
--

CREATE TABLE public.approval_responses (
    id character varying(36) NOT NULL,
    request_id character varying(36) NOT NULL,
    approver_id integer NOT NULL,
    decision character varying(20) NOT NULL,
    comment text,
    created_at timestamp without time zone NOT NULL
);


ALTER TABLE public.approval_responses OWNER TO smartspec;

--
-- Name: approval_rules; Type: TABLE; Schema: public; Owner: smartspec
--

CREATE TABLE public.approval_rules (
    id character varying(36) NOT NULL,
    name character varying(100) NOT NULL,
    description text,
    tenant_id character varying(36),
    project_id character varying(36),
    trigger_type public.approvaltype NOT NULL,
    conditions json,
    approver_roles json,
    approver_users json,
    required_approvals integer,
    timeout_minutes integer,
    timeout_action character varying(20),
    auto_approve_conditions json,
    priority integer,
    is_active boolean,
    created_at timestamp without time zone NOT NULL,
    updated_at timestamp without time zone
);


ALTER TABLE public.approval_rules OWNER TO smartspec;

--
-- Name: assets; Type: TABLE; Schema: public; Owner: smartspec
--

CREATE TABLE public.assets (
    id character varying(36) NOT NULL,
    user_id integer NOT NULL,
    project_id character varying(36),
    spec_id character varying(100),
    filename character varying(255) NOT NULL,
    original_filename character varying(255),
    relative_path text NOT NULL,
    file_size integer,
    mime_type character varying(100),
    asset_type public.assettype NOT NULL,
    status public.assetstatus NOT NULL,
    version integer NOT NULL,
    is_latest boolean NOT NULL,
    parent_asset_id character varying(36),
    generation_task_id character varying(36),
    asset_metadata json,
    tags json,
    description text,
    alt_text character varying(500),
    created_at timestamp without time zone NOT NULL,
    updated_at timestamp without time zone NOT NULL,
    deleted_at timestamp without time zone
);


ALTER TABLE public.assets OWNER TO smartspec;

--
-- Name: audit_events; Type: TABLE; Schema: public; Owner: smartspec
--

CREATE TABLE public.audit_events (
    id character varying(36) NOT NULL,
    action character varying(50) NOT NULL,
    description text,
    actor_id character varying(36),
    actor_email character varying(255),
    actor_ip character varying(45),
    actor_user_agent text,
    target_type character varying(50),
    target_id character varying(36),
    tenant_id character varying(36),
    project_id character varying(36),
    success boolean,
    error_message text,
    severity character varying(20),
    extra_data json,
    created_at timestamp without time zone NOT NULL
);


ALTER TABLE public.audit_events OWNER TO smartspec;

--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: smartspec
--

CREATE TABLE public.audit_logs (
    id character varying(36) NOT NULL,
    user_id character varying(36),
    user_email character varying(255),
    user_role character varying(50),
    impersonator_id character varying(36),
    impersonator_email character varying(255),
    is_impersonated character varying(10),
    action character varying(100) NOT NULL,
    resource_type character varying(100),
    resource_id character varying(255),
    method character varying(10),
    endpoint character varying(500),
    status_code character varying(10),
    details json,
    ip_address character varying(45),
    user_agent text,
    "timestamp" timestamp without time zone NOT NULL
);


ALTER TABLE public.audit_logs OWNER TO smartspec;

--
-- Name: blocked_patterns; Type: TABLE; Schema: public; Owner: smartspec
--

CREATE TABLE public.blocked_patterns (
    id integer NOT NULL,
    "patternType" character varying(20) NOT NULL,
    pattern character varying(320) NOT NULL,
    reason text,
    "createdBy" integer,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.blocked_patterns OWNER TO smartspec;

--
-- Name: blocked_patterns_id_seq; Type: SEQUENCE; Schema: public; Owner: smartspec
--

CREATE SEQUENCE public.blocked_patterns_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.blocked_patterns_id_seq OWNER TO smartspec;

--
-- Name: blocked_patterns_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: smartspec
--

ALTER SEQUENCE public.blocked_patterns_id_seq OWNED BY public.blocked_patterns.id;


--
-- Name: blog_posts; Type: TABLE; Schema: public; Owner: smartspec
--

CREATE TABLE public.blog_posts (
    id integer NOT NULL,
    "tenantId" character varying(36) NOT NULL,
    slug character varying(255) NOT NULL,
    title character varying(500) NOT NULL,
    excerpt text,
    content text,
    "coverImage" character varying(1024),
    author character varying(255),
    "authorAvatar" character varying(1024),
    category character varying(100),
    tags json,
    "readTime" character varying(50),
    "isPublished" boolean DEFAULT false NOT NULL,
    "isFeatured" boolean DEFAULT false NOT NULL,
    "metaDescription" text,
    "metaKeywords" character varying(500),
    "publishedAt" timestamp with time zone,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.blog_posts OWNER TO smartspec;

--
-- Name: blog_posts_id_seq; Type: SEQUENCE; Schema: public; Owner: smartspec
--

CREATE SEQUENCE public.blog_posts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.blog_posts_id_seq OWNER TO smartspec;

--
-- Name: blog_posts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: smartspec
--

ALTER SEQUENCE public.blog_posts_id_seq OWNED BY public.blog_posts.id;


--
-- Name: checkpoints; Type: TABLE; Schema: public; Owner: smartspec
--

CREATE TABLE public.checkpoints (
    id character varying NOT NULL,
    execution_id character varying NOT NULL,
    step_number integer NOT NULL,
    step_name character varying NOT NULL,
    state json NOT NULL,
    tokens_used integer,
    cost double precision,
    created_at timestamp without time zone NOT NULL
);


ALTER TABLE public.checkpoints OWNER TO smartspec;

--
-- Name: conversation_summaries; Type: TABLE; Schema: public; Owner: smartspec
--

CREATE TABLE public.conversation_summaries (
    id integer NOT NULL,
    "conversationId" integer NOT NULL,
    summary text NOT NULL,
    "messageRangeStart" integer NOT NULL,
    "messageRangeEnd" integer NOT NULL,
    "messageCount" integer NOT NULL,
    "tokensUsed" integer,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    project_id character varying(100)
);


ALTER TABLE public.conversation_summaries OWNER TO smartspec;

--
-- Name: conversation_summaries_id_seq; Type: SEQUENCE; Schema: public; Owner: smartspec
--

CREATE SEQUENCE public.conversation_summaries_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.conversation_summaries_id_seq OWNER TO smartspec;

--
-- Name: conversation_summaries_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: smartspec
--

ALTER SEQUENCE public.conversation_summaries_id_seq OWNED BY public.conversation_summaries.id;


--
-- Name: conversations; Type: TABLE; Schema: public; Owner: smartspec
--

CREATE TABLE public.conversations (
    id integer NOT NULL,
    "userId" integer NOT NULL,
    title character varying(255) DEFAULT 'New Chat'::character varying NOT NULL,
    model character varying(100) DEFAULT 'gpt-4o-mini'::character varying,
    temperature numeric(3,2) DEFAULT 0.7,
    "systemPrompt" text,
    "skillSettings" json DEFAULT '{"autoDetect":true,"enabledSkills":[],"detectionMode":"auto"}'::json,
    "isArchived" boolean DEFAULT false NOT NULL,
    "isPinned" boolean DEFAULT false NOT NULL,
    "totalCreditsUsed" numeric(12,4) DEFAULT '0'::numeric,
    "messageCount" integer DEFAULT 0 NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
    project_id character varying(100),
    memory_mode character varying(20) DEFAULT 'full'::character varying,
    "brainstormMaxRounds" integer DEFAULT 3,
    "brainstormPartnerModel" character varying(100),
    "trashedAt" timestamp without time zone
);


ALTER TABLE public.conversations OWNER TO smartspec;

--
-- Name: conversations_id_seq; Type: SEQUENCE; Schema: public; Owner: smartspec
--

CREATE SEQUENCE public.conversations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.conversations_id_seq OWNER TO smartspec;

--
-- Name: conversations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: smartspec
--

ALTER SEQUENCE public.conversations_id_seq OWNED BY public.conversations.id;


--
-- Name: credit_packages; Type: TABLE; Schema: public; Owner: smartspec
--

CREATE TABLE public.credit_packages (
    id integer NOT NULL,
    name character varying(128) NOT NULL,
    description text,
    credits integer NOT NULL,
    "priceUsd" numeric(10,2) NOT NULL,
    "stripePriceId" character varying(128),
    "isActive" boolean DEFAULT true NOT NULL,
    "isFeatured" boolean DEFAULT false NOT NULL,
    "sortOrder" integer DEFAULT 0 NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
    "packageType" public.package_type DEFAULT 'one_time'::public.package_type NOT NULL,
    "billingPeriod" public.billing_period,
    "discountPercent" integer DEFAULT 0,
    "stripeProductId" character varying(128),
    "stripePriceIds" json
);


ALTER TABLE public.credit_packages OWNER TO smartspec;

--
-- Name: credit_packages_id_seq; Type: SEQUENCE; Schema: public; Owner: smartspec
--

CREATE SEQUENCE public.credit_packages_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.credit_packages_id_seq OWNER TO smartspec;

--
-- Name: credit_packages_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: smartspec
--

ALTER SEQUENCE public.credit_packages_id_seq OWNED BY public.credit_packages.id;


--
-- Name: credit_transactions; Type: TABLE; Schema: public; Owner: smartspec
--

CREATE TABLE public.credit_transactions (
    id integer NOT NULL,
    "userId" integer NOT NULL,
    amount integer NOT NULL,
    type public.transaction_type NOT NULL,
    description character varying(512),
    metadata jsonb,
    "balanceAfter" integer NOT NULL,
    "referenceId" character varying(128),
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.credit_transactions OWNER TO smartspec;

--
-- Name: credit_transactions_id_seq; Type: SEQUENCE; Schema: public; Owner: smartspec
--

CREATE SEQUENCE public.credit_transactions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.credit_transactions_id_seq OWNER TO smartspec;

--
-- Name: credit_transactions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: smartspec
--

ALTER SEQUENCE public.credit_transactions_id_seq OWNED BY public.credit_transactions.id;


--
-- Name: custom_skill_prompts; Type: TABLE; Schema: public; Owner: smartspec
--

CREATE TABLE public.custom_skill_prompts (
    id character varying(36) NOT NULL,
    user_id integer NOT NULL,
    skill_id character varying(100) NOT NULL,
    custom_system_prompt text NOT NULL,
    template_variables json,
    is_active boolean NOT NULL,
    created_at timestamp without time zone NOT NULL,
    updated_at timestamp without time zone NOT NULL
);


ALTER TABLE public.custom_skill_prompts OWNER TO smartspec;

--
-- Name: device_fingerprints; Type: TABLE; Schema: public; Owner: smartspec
--

CREATE TABLE public.device_fingerprints (
    id integer NOT NULL,
    "userId" integer NOT NULL,
    "fingerprintHash" character varying(64) NOT NULL,
    "firstSeenAt" timestamp with time zone DEFAULT now() NOT NULL,
    "lastSeenAt" timestamp with time zone DEFAULT now() NOT NULL,
    "seenCount" integer DEFAULT 1 NOT NULL
);


ALTER TABLE public.device_fingerprints OWNER TO smartspec;

--
-- Name: device_fingerprints_id_seq; Type: SEQUENCE; Schema: public; Owner: smartspec
--

CREATE SEQUENCE public.device_fingerprints_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.device_fingerprints_id_seq OWNER TO smartspec;

--
-- Name: device_fingerprints_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: smartspec
--

ALTER SEQUENCE public.device_fingerprints_id_seq OWNED BY public.device_fingerprints.id;


--
-- Name: direct_messages; Type: TABLE; Schema: public; Owner: smartspec
--

CREATE TABLE public.direct_messages (
    id integer NOT NULL,
    "senderId" integer NOT NULL,
    "receiverId" integer NOT NULL,
    content text NOT NULL,
    "isUrgent" boolean DEFAULT false NOT NULL,
    "isRead" boolean DEFAULT false NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.direct_messages OWNER TO smartspec;

--
-- Name: direct_messages_id_seq; Type: SEQUENCE; Schema: public; Owner: smartspec
--

CREATE SEQUENCE public.direct_messages_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.direct_messages_id_seq OWNER TO smartspec;

--
-- Name: direct_messages_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: smartspec
--

ALTER SEQUENCE public.direct_messages_id_seq OWNED BY public.direct_messages.id;


--
-- Name: email_verification_tokens; Type: TABLE; Schema: public; Owner: smartspec
--

CREATE TABLE public.email_verification_tokens (
    id integer NOT NULL,
    "userId" integer NOT NULL,
    email character varying(320) NOT NULL,
    code character varying(6) NOT NULL,
    "expiresAt" timestamp with time zone NOT NULL,
    "usedAt" timestamp with time zone,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    channel character varying(20) DEFAULT 'email'::character varying NOT NULL
);


ALTER TABLE public.email_verification_tokens OWNER TO smartspec;

--
-- Name: email_verification_tokens_id_seq; Type: SEQUENCE; Schema: public; Owner: smartspec
--

CREATE SEQUENCE public.email_verification_tokens_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.email_verification_tokens_id_seq OWNER TO smartspec;

--
-- Name: email_verification_tokens_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: smartspec
--

ALTER SEQUENCE public.email_verification_tokens_id_seq OWNED BY public.email_verification_tokens.id;


--
-- Name: embedding_jobs; Type: TABLE; Schema: public; Owner: smartspec
--

CREATE TABLE public.embedding_jobs (
    id character varying(36) NOT NULL,
    collection_id character varying(36) NOT NULL,
    status character varying(20),
    total_documents integer,
    processed_documents integer,
    failed_documents integer,
    embedding_model character varying(100) NOT NULL,
    batch_size integer,
    error_message text,
    errors json,
    created_at timestamp without time zone NOT NULL,
    started_at timestamp without time zone,
    completed_at timestamp without time zone
);


ALTER TABLE public.embedding_jobs OWNER TO smartspec;

--
-- Name: entity_memories; Type: TABLE; Schema: public; Owner: smartspec
--

CREATE TABLE public.entity_memories (
    id integer NOT NULL,
    "userId" integer NOT NULL,
    "entityType" public.entity_type NOT NULL,
    "entityName" character varying(255) NOT NULL,
    facts json DEFAULT '[]'::json NOT NULL,
    "sourceConversationId" integer,
    confidence numeric(3,2) DEFAULT 0.8,
    "lastAccessedAt" timestamp with time zone DEFAULT now(),
    "reinforcementCount" integer DEFAULT 1,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
    importance integer DEFAULT 5,
    source character varying(20) DEFAULT 'auto'::character varying,
    "projectId" character varying(100)
);


ALTER TABLE public.entity_memories OWNER TO smartspec;

--
-- Name: entity_memories_id_seq; Type: SEQUENCE; Schema: public; Owner: smartspec
--

CREATE SEQUENCE public.entity_memories_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.entity_memories_id_seq OWNER TO smartspec;

--
-- Name: entity_memories_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: smartspec
--

ALTER SEQUENCE public.entity_memories_id_seq OWNED BY public.entity_memories.id;


--
-- Name: executions; Type: TABLE; Schema: public; Owner: smartspec
--

CREATE TABLE public.executions (
    id character varying NOT NULL,
    workflow_id character varying NOT NULL,
    status public.executionstatus NOT NULL,
    steps json,
    current_step integer,
    total_steps integer,
    files_created json,
    files_modified json,
    files_deleted json,
    outputs json,
    tokens_used integer,
    cost double precision,
    duration_seconds double precision,
    error text,
    created_at timestamp without time zone NOT NULL,
    updated_at timestamp without time zone NOT NULL,
    started_at timestamp without time zone,
    completed_at timestamp without time zone
);


ALTER TABLE public.executions OWNER TO smartspec;

--
-- Name: gallery_items; Type: TABLE; Schema: public; Owner: smartspec
--

CREATE TABLE public.gallery_items (
    id integer NOT NULL,
    "tenantId" character varying(36),
    type public.content_type NOT NULL,
    title character varying(255) NOT NULL,
    description text,
    "aspectRatio" public.aspect_ratio NOT NULL,
    "fileKey" character varying(512),
    "fileUrl" character varying(1024),
    "thumbnailKey" character varying(512),
    "thumbnailUrl" character varying(1024),
    duration character varying(10),
    "demoUrl" character varying(512),
    tags json,
    model character varying(128),
    views integer DEFAULT 0 NOT NULL,
    likes integer DEFAULT 0 NOT NULL,
    downloads integer DEFAULT 0 NOT NULL,
    "isPublished" boolean DEFAULT true NOT NULL,
    "isFeatured" boolean DEFAULT false NOT NULL,
    "authorId" integer,
    "authorName" character varying(255),
    "authorAvatar" character varying(512),
    "sortOrder" integer DEFAULT 0 NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.gallery_items OWNER TO smartspec;

--
-- Name: gallery_items_id_seq; Type: SEQUENCE; Schema: public; Owner: smartspec
--

CREATE SEQUENCE public.gallery_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.gallery_items_id_seq OWNER TO smartspec;

--
-- Name: gallery_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: smartspec
--

ALTER SEQUENCE public.gallery_items_id_seq OWNED BY public.gallery_items.id;


--
-- Name: invoice_config; Type: TABLE; Schema: public; Owner: smartspec
--

CREATE TABLE public.invoice_config (
    id integer NOT NULL,
    "tenantId" character varying(36),
    "companyName" character varying(256),
    "addressLine1" character varying(256),
    "addressLine2" character varying(256),
    city character varying(128),
    state character varying(128),
    "postalCode" character varying(32),
    country character varying(128),
    "taxId" character varying(64),
    email character varying(256),
    phone character varying(64),
    website character varying(256),
    "logoUrl" character varying(512),
    "footerText" text,
    "termsText" text,
    "bankDetails" json,
    "customFields" json,
    "isActive" boolean DEFAULT true,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.invoice_config OWNER TO smartspec;

--
-- Name: invoice_config_id_seq; Type: SEQUENCE; Schema: public; Owner: smartspec
--

CREATE SEQUENCE public.invoice_config_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.invoice_config_id_seq OWNER TO smartspec;

--
-- Name: invoice_config_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: smartspec
--

ALTER SEQUENCE public.invoice_config_id_seq OWNED BY public.invoice_config.id;


--
-- Name: llm_providers; Type: TABLE; Schema: public; Owner: smartspec
--

CREATE TABLE public.llm_providers (
    id integer NOT NULL,
    "providerName" character varying(64) NOT NULL,
    "displayName" character varying(128) NOT NULL,
    description text,
    "baseUrl" character varying(512),
    "apiKeyEncrypted" text,
    "hasApiKey" boolean DEFAULT false NOT NULL,
    "defaultModel" character varying(128),
    "availableModels" json,
    "configJson" json,
    "isEnabled" boolean DEFAULT false NOT NULL,
    "sortOrder" integer DEFAULT 0 NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.llm_providers OWNER TO smartspec;

--
-- Name: llm_providers_id_seq; Type: SEQUENCE; Schema: public; Owner: smartspec
--

CREATE SEQUENCE public.llm_providers_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.llm_providers_id_seq OWNER TO smartspec;

--
-- Name: llm_providers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: smartspec
--

ALTER SEQUENCE public.llm_providers_id_seq OWNED BY public.llm_providers.id;


--
-- Name: marketplace_templates; Type: TABLE; Schema: public; Owner: smartspec
--

CREATE TABLE public.marketplace_templates (
    id character varying(36) NOT NULL,
    creator_id integer NOT NULL,
    name character varying(255) NOT NULL,
    slug character varying(255) NOT NULL,
    tagline character varying(500) NOT NULL,
    description text NOT NULL,
    category public.templatecategory NOT NULL,
    tags json,
    tech_stack json NOT NULL,
    price_credits integer NOT NULL,
    status public.templatestatus NOT NULL,
    is_featured boolean NOT NULL,
    template_file_url text NOT NULL,
    preview_images json,
    demo_video_url text,
    version character varying(50) NOT NULL,
    readme_content text,
    changelog text,
    min_smartspec_version character varying(50),
    dependencies json,
    download_count integer NOT NULL,
    purchase_count integer NOT NULL,
    rating_average integer,
    rating_count integer NOT NULL,
    view_count integer NOT NULL,
    total_revenue_credits integer NOT NULL,
    platform_commission_credits integer NOT NULL,
    submitted_at timestamp with time zone,
    reviewed_at timestamp with time zone,
    reviewed_by integer,
    review_notes text,
    rejection_reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    published_at timestamp with time zone
);


ALTER TABLE public.marketplace_templates OWNER TO smartspec;

--
-- Name: media_models; Type: TABLE; Schema: public; Owner: smartspec
--

CREATE TABLE public.media_models (
    id integer NOT NULL,
    "modelId" character varying(128) NOT NULL,
    name character varying(128) NOT NULL,
    description text,
    "modelType" public.media_model_type NOT NULL,
    provider character varying(64) NOT NULL,
    aliases json DEFAULT '[]'::json,
    "creditCost" integer DEFAULT 10 NOT NULL,
    "aspectRatios" json,
    sizes json,
    durations json,
    voices json,
    "configJson" json,
    "isEnabled" boolean DEFAULT true NOT NULL,
    priority integer DEFAULT 99 NOT NULL,
    "sortOrder" integer DEFAULT 0 NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.media_models OWNER TO smartspec;

--
-- Name: media_models_id_seq; Type: SEQUENCE; Schema: public; Owner: smartspec
--

CREATE SEQUENCE public.media_models_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.media_models_id_seq OWNER TO smartspec;

--
-- Name: media_models_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: smartspec
--

ALTER SEQUENCE public.media_models_id_seq OWNED BY public.media_models.id;


--
-- Name: media_providers; Type: TABLE; Schema: public; Owner: smartspec
--

CREATE TABLE public.media_providers (
    id integer NOT NULL,
    "providerName" character varying(64) NOT NULL,
    "displayName" character varying(128) NOT NULL,
    description text,
    "providerType" public.media_provider_type DEFAULT 'multimodal'::public.media_provider_type NOT NULL,
    "baseUrl" character varying(512),
    "callbackUrl" character varying(512),
    "apiKeyEncrypted" text,
    "hasApiKey" boolean DEFAULT false NOT NULL,
    "availableModels" json,
    "defaultModel" character varying(128),
    "configJson" json,
    "isEnabled" boolean DEFAULT false NOT NULL,
    "isPrimary" boolean DEFAULT false NOT NULL,
    priority integer DEFAULT 0 NOT NULL,
    "sortOrder" integer DEFAULT 0 NOT NULL,
    "lastTestedAt" timestamp with time zone,
    "lastTestResult" json,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.media_providers OWNER TO smartspec;

--
-- Name: media_providers_id_seq; Type: SEQUENCE; Schema: public; Owner: smartspec
--

CREATE SEQUENCE public.media_providers_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.media_providers_id_seq OWNER TO smartspec;

--
-- Name: media_providers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: smartspec
--

ALTER SEQUENCE public.media_providers_id_seq OWNED BY public.media_providers.id;


--
-- Name: media_tasks; Type: TABLE; Schema: public; Owner: smartspec
--

CREATE TABLE public.media_tasks (
    id character varying(36) NOT NULL,
    task_id character varying(64),
    user_id integer NOT NULL,
    media_type character varying(20) NOT NULL,
    status character varying(20) NOT NULL,
    model character varying(100) NOT NULL,
    prompt text NOT NULL,
    parameters json,
    result_url text,
    result_data json,
    error_message text,
    credits_used integer,
    credits_balance integer,
    created_at timestamp without time zone NOT NULL,
    started_at timestamp without time zone,
    completed_at timestamp without time zone
);


ALTER TABLE public.media_tasks OWNER TO smartspec;

--
-- Name: messages; Type: TABLE; Schema: public; Owner: smartspec
--

CREATE TABLE public.messages (
    id integer NOT NULL,
    "conversationId" integer NOT NULL,
    role public.message_role NOT NULL,
    content text NOT NULL,
    "inputTokens" integer DEFAULT 0,
    "outputTokens" integer DEFAULT 0,
    "creditsUsed" numeric(10,4) DEFAULT '0'::numeric,
    "modelUsed" character varying(100),
    attachments json DEFAULT '[]'::json,
    artifacts json DEFAULT '[]'::json,
    "skillUsed" character varying(100),
    "skillArgs" json,
    error text,
    "isRegenerated" boolean DEFAULT false,
    "parentMessageId" integer,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.messages OWNER TO smartspec;

--
-- Name: messages_id_seq; Type: SEQUENCE; Schema: public; Owner: smartspec
--

CREATE SEQUENCE public.messages_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.messages_id_seq OWNER TO smartspec;

--
-- Name: messages_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: smartspec
--

ALTER SEQUENCE public.messages_id_seq OWNED BY public.messages.id;


--
-- Name: model_comparisons; Type: TABLE; Schema: public; Owner: smartspec
--

CREATE TABLE public.model_comparisons (
    id character varying(36) NOT NULL,
    user_id character varying(36) NOT NULL,
    prompt text NOT NULL,
    models json NOT NULL,
    results json NOT NULL,
    total_cost_usd double precision NOT NULL,
    total_credits_used integer NOT NULL,
    created_at timestamp without time zone NOT NULL
);


ALTER TABLE public.model_comparisons OWNER TO smartspec;

--
-- Name: moderation_logs; Type: TABLE; Schema: public; Owner: smartspec
--

CREATE TABLE public.moderation_logs (
    id character varying(36) NOT NULL,
    user_id character varying(36) NOT NULL,
    content_type character varying(20) NOT NULL,
    content text NOT NULL,
    flagged boolean NOT NULL,
    categories text,
    action_taken character varying(50),
    created_at timestamp without time zone NOT NULL
);


ALTER TABLE public.moderation_logs OWNER TO smartspec;

--
-- Name: notifications; Type: TABLE; Schema: public; Owner: smartspec
--

CREATE TABLE public.notifications (
    id character varying(36) NOT NULL,
    user_id character varying(36) NOT NULL,
    type character varying(50) NOT NULL,
    title character varying(255) NOT NULL,
    message text NOT NULL,
    data json,
    is_read boolean NOT NULL,
    read_at timestamp without time zone,
    created_at timestamp without time zone NOT NULL
);


ALTER TABLE public.notifications OWNER TO smartspec;

--
-- Name: oauth_connections; Type: TABLE; Schema: public; Owner: smartspec
--

CREATE TABLE public.oauth_connections (
    id character varying(36) NOT NULL,
    user_id integer NOT NULL,
    provider character varying(50) NOT NULL,
    provider_user_id character varying(255) NOT NULL,
    access_token text,
    refresh_token text,
    token_expires_at timestamp with time zone,
    profile_data text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.oauth_connections OWNER TO smartspec;

--
-- Name: opencode_api_key_usage; Type: TABLE; Schema: public; Owner: smartspec
--

CREATE TABLE public.opencode_api_key_usage (
    id character varying(36) NOT NULL,
    api_key_id character varying(36) NOT NULL,
    endpoint character varying(255) NOT NULL,
    model character varying(100),
    input_tokens integer,
    output_tokens integer,
    total_tokens integer,
    cost double precision,
    status_code integer,
    latency_ms integer,
    error text,
    request_id character varying(36),
    ip_address character varying(45),
    user_agent character varying(500),
    created_at timestamp without time zone NOT NULL
);


ALTER TABLE public.opencode_api_key_usage OWNER TO smartspec;

--
-- Name: opencode_api_keys; Type: TABLE; Schema: public; Owner: smartspec
--

CREATE TABLE public.opencode_api_keys (
    id character varying(36) NOT NULL,
    user_id integer NOT NULL,
    name character varying(255) NOT NULL,
    key_hash character varying(255) NOT NULL,
    key_prefix character varying(20) NOT NULL,
    status public.opencodekeystatus NOT NULL,
    allowed_models json,
    allowed_endpoints json,
    max_tokens_per_request integer,
    max_tokens_per_day integer,
    max_cost_per_day double precision,
    tokens_used_today integer,
    cost_used_today double precision,
    total_tokens_used integer,
    total_cost double precision,
    total_requests integer,
    last_used_at timestamp without time zone,
    last_reset_at timestamp without time zone,
    rate_limit_rpm integer,
    rate_limit_tpm integer,
    description text,
    extra_metadata json,
    created_at timestamp without time zone NOT NULL,
    updated_at timestamp without time zone,
    expires_at timestamp without time zone,
    revoked_at timestamp without time zone
);


ALTER TABLE public.opencode_api_keys OWNER TO smartspec;

--
-- Name: password_reset_tokens; Type: TABLE; Schema: public; Owner: smartspec
--

CREATE TABLE public.password_reset_tokens (
    id character varying(36) NOT NULL,
    user_id character varying(36) NOT NULL,
    token_hash character varying(255) NOT NULL,
    expires_at timestamp without time zone NOT NULL,
    used_at timestamp without time zone,
    created_at timestamp without time zone NOT NULL,
    ip_address character varying(45),
    user_agent character varying(255)
);


ALTER TABLE public.password_reset_tokens OWNER TO smartspec;

--
-- Name: payment_transactions; Type: TABLE; Schema: public; Owner: smartspec
--

CREATE TABLE public.payment_transactions (
    id integer NOT NULL,
    user_id integer NOT NULL,
    stripe_session_id character varying(255),
    stripe_payment_intent_id character varying(255),
    stripe_customer_id character varying(255),
    amount_usd numeric(10,2) NOT NULL,
    currency character varying(3),
    status character varying(50) NOT NULL,
    credits_amount integer,
    credits_added_at timestamp without time zone,
    payment_method character varying(50),
    metadata json,
    created_at timestamp without time zone NOT NULL,
    updated_at timestamp without time zone NOT NULL,
    completed_at timestamp without time zone
);


ALTER TABLE public.payment_transactions OWNER TO smartspec;

--
-- Name: payment_transactions_id_seq; Type: SEQUENCE; Schema: public; Owner: smartspec
--

CREATE SEQUENCE public.payment_transactions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.payment_transactions_id_seq OWNER TO smartspec;

--
-- Name: payment_transactions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: smartspec
--

ALTER SEQUENCE public.payment_transactions_id_seq OWNED BY public.payment_transactions.id;


--
-- Name: permissions; Type: TABLE; Schema: public; Owner: smartspec
--

CREATE TABLE public.permissions (
    id character varying(36) NOT NULL,
    name character varying(100) NOT NULL,
    display_name character varying(255) NOT NULL,
    description text,
    resource character varying(100) NOT NULL,
    action character varying(50) NOT NULL,
    scope public.permissionscope,
    is_system boolean,
    created_at timestamp without time zone NOT NULL
);


ALTER TABLE public.permissions OWNER TO smartspec;

--
-- Name: policies; Type: TABLE; Schema: public; Owner: smartspec
--

CREATE TABLE public.policies (
    id character varying(36) NOT NULL,
    name character varying(100) NOT NULL,
    description text,
    effect character varying(10) NOT NULL,
    principals json,
    actions json,
    resources json,
    conditions json,
    tenant_id character varying(36),
    priority integer,
    is_active boolean,
    created_at timestamp without time zone NOT NULL,
    updated_at timestamp without time zone
);


ALTER TABLE public.policies OWNER TO smartspec;

--
-- Name: prompt_templates; Type: TABLE; Schema: public; Owner: smartspec
--

CREATE TABLE public.prompt_templates (
    id character varying(36) NOT NULL,
    user_id character varying(36) NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    template text NOT NULL,
    variables json,
    category character varying(100),
    is_public boolean NOT NULL,
    is_favorite boolean NOT NULL,
    use_count integer NOT NULL,
    version integer NOT NULL,
    parent_id character varying(36),
    created_at timestamp without time zone NOT NULL,
    updated_at timestamp without time zone NOT NULL
);


ALTER TABLE public.prompt_templates OWNER TO smartspec;

--
-- Name: provider_configs; Type: TABLE; Schema: public; Owner: smartspec
--

CREATE TABLE public.provider_configs (
    id character varying(36) NOT NULL,
    provider_name character varying(50) NOT NULL,
    display_name character varying(100) NOT NULL,
    api_key_encrypted text,
    base_url character varying(255),
    config_json json,
    is_enabled boolean NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.provider_configs OWNER TO smartspec;

--
-- Name: refunds; Type: TABLE; Schema: public; Owner: smartspec
--

CREATE TABLE public.refunds (
    id character varying(36) NOT NULL,
    payment_id character varying(36) NOT NULL,
    user_id character varying(36) NOT NULL,
    refund_type public.refundtype NOT NULL,
    amount_usd double precision NOT NULL,
    credits_deducted integer NOT NULL,
    reason text,
    status public.refundstatus NOT NULL,
    stripe_refund_id character varying(255),
    requested_by character varying(36),
    requested_at timestamp without time zone NOT NULL,
    processed_at timestamp without time zone,
    completed_at timestamp without time zone,
    created_at timestamp without time zone NOT NULL,
    updated_at timestamp without time zone
);


ALTER TABLE public.refunds OWNER TO smartspec;

--
-- Name: registration_events; Type: TABLE; Schema: public; Owner: smartspec
--

CREATE TABLE public.registration_events (
    id integer NOT NULL,
    "userId" integer,
    email character varying(320) NOT NULL,
    "normalizedEmail" character varying(320) NOT NULL,
    "ipAddress" character varying(45) NOT NULL,
    "fingerprintHash" character varying(64),
    "userAgent" text,
    "loginMethod" character varying(64),
    "trustScore" integer,
    outcome character varying(20) NOT NULL,
    metadata jsonb,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.registration_events OWNER TO smartspec;

--
-- Name: registration_events_id_seq; Type: SEQUENCE; Schema: public; Owner: smartspec
--

CREATE SEQUENCE public.registration_events_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.registration_events_id_seq OWNER TO smartspec;

--
-- Name: registration_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: smartspec
--

ALTER SEQUENCE public.registration_events_id_seq OWNED BY public.registration_events.id;


--
-- Name: role_assignments; Type: TABLE; Schema: public; Owner: smartspec
--

CREATE TABLE public.role_assignments (
    id character varying(36) NOT NULL,
    user_id integer NOT NULL,
    role_id character varying(36) NOT NULL,
    tenant_id character varying(36),
    project_id character varying(36),
    assigned_by integer,
    reason text,
    is_active boolean,
    expires_at timestamp without time zone,
    created_at timestamp without time zone NOT NULL,
    updated_at timestamp without time zone
);


ALTER TABLE public.role_assignments OWNER TO smartspec;

--
-- Name: roles; Type: TABLE; Schema: public; Owner: smartspec
--

CREATE TABLE public.roles (
    id character varying(36) NOT NULL,
    name character varying(100) NOT NULL,
    display_name character varying(255) NOT NULL,
    description text,
    tenant_id character varying(36),
    scope public.permissionscope,
    permissions json,
    is_system boolean,
    is_default boolean,
    parent_role_id character varying(36),
    priority integer,
    created_at timestamp without time zone NOT NULL,
    updated_at timestamp without time zone
);


ALTER TABLE public.roles OWNER TO smartspec;

--
-- Name: scheduled_message_logs; Type: TABLE; Schema: public; Owner: smartspec
--

CREATE TABLE public.scheduled_message_logs (
    id integer NOT NULL,
    "scheduledMessageId" integer NOT NULL,
    "executedAt" timestamp with time zone DEFAULT now() NOT NULL,
    "responseContent" text,
    "creditsUsed" numeric(10,4) DEFAULT 0,
    status character varying(20) DEFAULT 'success'::character varying NOT NULL,
    error text
);


ALTER TABLE public.scheduled_message_logs OWNER TO smartspec;

--
-- Name: scheduled_message_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: smartspec
--

CREATE SEQUENCE public.scheduled_message_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.scheduled_message_logs_id_seq OWNER TO smartspec;

--
-- Name: scheduled_message_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: smartspec
--

ALTER SEQUENCE public.scheduled_message_logs_id_seq OWNED BY public.scheduled_message_logs.id;


--
-- Name: scheduled_messages; Type: TABLE; Schema: public; Owner: smartspec
--

CREATE TABLE public.scheduled_messages (
    id integer NOT NULL,
    "userId" integer NOT NULL,
    "conversationId" integer,
    "targetUserId" integer,
    prompt text NOT NULL,
    "cronExpression" character varying(100),
    timezone character varying(64) DEFAULT 'Asia/Bangkok'::character varying NOT NULL,
    "scheduledAt" timestamp with time zone,
    "isRecurring" boolean DEFAULT false NOT NULL,
    status public.schedule_status DEFAULT 'active'::public.schedule_status NOT NULL,
    "modelId" character varying(128),
    "skillId" character varying(100) DEFAULT 'chat-alert'::character varying,
    "emailNotify" boolean DEFAULT true NOT NULL,
    description text,
    "lastRunAt" timestamp with time zone,
    "nextRunAt" timestamp with time zone,
    "bullmqJobId" character varying(255),
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.scheduled_messages OWNER TO smartspec;

--
-- Name: scheduled_messages_id_seq; Type: SEQUENCE; Schema: public; Owner: smartspec
--

CREATE SEQUENCE public.scheduled_messages_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.scheduled_messages_id_seq OWNER TO smartspec;

--
-- Name: scheduled_messages_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: smartspec
--

ALTER SEQUENCE public.scheduled_messages_id_seq OWNED BY public.scheduled_messages.id;


--
-- Name: secret_versions; Type: TABLE; Schema: public; Owner: smartspec
--

CREATE TABLE public.secret_versions (
    id character varying(36) NOT NULL,
    secret_id character varying(36) NOT NULL,
    version integer NOT NULL,
    encrypted_value text NOT NULL,
    value_hash character varying(64),
    created_by integer,
    reason text,
    is_current boolean,
    created_at timestamp without time zone NOT NULL
);


ALTER TABLE public.secret_versions OWNER TO smartspec;

--
-- Name: secrets; Type: TABLE; Schema: public; Owner: smartspec
--

CREATE TABLE public.secrets (
    id character varying(36) NOT NULL,
    name character varying(100) NOT NULL,
    description text,
    tenant_id character varying(36),
    project_id character varying(36),
    secret_type public.secrettype,
    encrypted_value text NOT NULL,
    value_hash character varying(64),
    encryption_key_id character varying(36),
    encryption_algorithm character varying(50),
    rotation_enabled boolean,
    rotation_interval_days integer,
    last_rotated_at timestamp without time zone,
    next_rotation_at timestamp without time zone,
    expires_at timestamp without time zone,
    allowed_services json,
    created_by integer,
    last_accessed_at timestamp without time zone,
    access_count integer,
    created_at timestamp without time zone NOT NULL,
    updated_at timestamp without time zone
);


ALTER TABLE public.secrets OWNER TO smartspec;

--
-- Name: semantic_memories; Type: TABLE; Schema: public; Owner: smartspec
--

CREATE TABLE public.semantic_memories (
    id integer NOT NULL,
    memory_key character varying(255) NOT NULL,
    memory_type public.memorytype NOT NULL,
    scope public.memoryscope NOT NULL,
    user_id integer,
    project_id character varying(255),
    session_id character varying(255),
    workflow_id character varying(255),
    content text NOT NULL,
    extra_data json,
    importance double precision NOT NULL,
    access_count integer NOT NULL,
    last_accessed_at timestamp without time zone,
    source character varying(255),
    source_execution_id character varying(255),
    created_at timestamp without time zone NOT NULL,
    updated_at timestamp without time zone NOT NULL,
    expires_at timestamp without time zone,
    is_active integer NOT NULL
);


ALTER TABLE public.semantic_memories OWNER TO smartspec;

--
-- Name: semantic_memories_id_seq; Type: SEQUENCE; Schema: public; Owner: smartspec
--

CREATE SEQUENCE public.semantic_memories_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.semantic_memories_id_seq OWNER TO smartspec;

--
-- Name: semantic_memories_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: smartspec
--

ALTER SEQUENCE public.semantic_memories_id_seq OWNED BY public.semantic_memories.id;


--
-- Name: seo_metadata; Type: TABLE; Schema: public; Owner: smartspec
--

CREATE TABLE public.seo_metadata (
    id integer NOT NULL,
    "tenantId" character varying(36) NOT NULL,
    path character varying(512) NOT NULL,
    title character varying(255) NOT NULL,
    description text,
    keywords json,
    "canonicalUrl" character varying(512),
    "ogMetadata" json,
    "twitterMetadata" json,
    "aiContent" json,
    "structuredData" json,
    "geoData" json,
    "qualitySignals" json,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.seo_metadata OWNER TO smartspec;

--
-- Name: seo_metadata_id_seq; Type: SEQUENCE; Schema: public; Owner: smartspec
--

CREATE SEQUENCE public.seo_metadata_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.seo_metadata_id_seq OWNER TO smartspec;

--
-- Name: seo_metadata_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: smartspec
--

ALTER SEQUENCE public.seo_metadata_id_seq OWNED BY public.seo_metadata.id;


--
-- Name: skill_comments; Type: TABLE; Schema: public; Owner: smartspec
--

CREATE TABLE public.skill_comments (
    id integer NOT NULL,
    "skillId" integer NOT NULL,
    "userId" integer NOT NULL,
    content text NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.skill_comments OWNER TO smartspec;

--
-- Name: skill_comments_id_seq; Type: SEQUENCE; Schema: public; Owner: smartspec
--

CREATE SEQUENCE public.skill_comments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.skill_comments_id_seq OWNER TO smartspec;

--
-- Name: skill_comments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: smartspec
--

ALTER SEQUENCE public.skill_comments_id_seq OWNED BY public.skill_comments.id;


--
-- Name: skill_likes; Type: TABLE; Schema: public; Owner: smartspec
--

CREATE TABLE public.skill_likes (
    id integer NOT NULL,
    "skillId" integer NOT NULL,
    "userId" integer NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.skill_likes OWNER TO smartspec;

--
-- Name: skill_likes_id_seq; Type: SEQUENCE; Schema: public; Owner: smartspec
--

CREATE SEQUENCE public.skill_likes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.skill_likes_id_seq OWNER TO smartspec;

--
-- Name: skill_likes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: smartspec
--

ALTER SEQUENCE public.skill_likes_id_seq OWNED BY public.skill_likes.id;


--
-- Name: skill_preferences; Type: TABLE; Schema: public; Owner: smartspec
--

CREATE TABLE public.skill_preferences (
    id integer NOT NULL,
    "conversationId" integer NOT NULL,
    "skillId" character varying(100) NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    priority integer DEFAULT 0 NOT NULL,
    "customSettings" json,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.skill_preferences OWNER TO smartspec;

--
-- Name: skill_preferences_id_seq; Type: SEQUENCE; Schema: public; Owner: smartspec
--

CREATE SEQUENCE public.skill_preferences_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.skill_preferences_id_seq OWNER TO smartspec;

--
-- Name: skill_preferences_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: smartspec
--

ALTER SEQUENCE public.skill_preferences_id_seq OWNED BY public.skill_preferences.id;


--
-- Name: skill_prompt_templates; Type: TABLE; Schema: public; Owner: smartspec
--

CREATE TABLE public.skill_prompt_templates (
    id character varying(36) NOT NULL,
    skill_id character varying(100) NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    system_prompt text NOT NULL,
    template_variables json,
    category character varying(100),
    is_public boolean NOT NULL,
    created_by integer,
    usage_count integer NOT NULL,
    created_at timestamp without time zone NOT NULL
);


ALTER TABLE public.skill_prompt_templates OWNER TO smartspec;

--
-- Name: skill_repositories; Type: TABLE; Schema: public; Owner: smartspec
--

CREATE TABLE public.skill_repositories (
    id integer NOT NULL,
    name character varying(200) NOT NULL,
    git_url character varying(500) NOT NULL,
    branch character varying(100) DEFAULT 'main'::character varying,
    format_type character varying(50) DEFAULT 'auto'::character varying,
    skills_subdir character varying(200) DEFAULT 'skills'::character varying,
    last_fetched_at timestamp with time zone,
    last_commit_hash character varying(64),
    skill_count integer DEFAULT 0,
    status character varying(50) DEFAULT 'pending'::character varying NOT NULL,
    error_message text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by integer
);


ALTER TABLE public.skill_repositories OWNER TO smartspec;

--
-- Name: skill_repositories_id_seq; Type: SEQUENCE; Schema: public; Owner: smartspec
--

CREATE SEQUENCE public.skill_repositories_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.skill_repositories_id_seq OWNER TO smartspec;

--
-- Name: skill_repositories_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: smartspec
--

ALTER SEQUENCE public.skill_repositories_id_seq OWNED BY public.skill_repositories.id;


--
-- Name: skills; Type: TABLE; Schema: public; Owner: smartspec
--

CREATE TABLE public.skills (
    id integer NOT NULL,
    slug character varying(100) NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    category public.skill_category DEFAULT 'other'::public.skill_category NOT NULL,
    version character varying(20) DEFAULT '1.0.0'::character varying,
    author character varying(255),
    icon character varying(50) DEFAULT 'sparkles'::character varying,
    tags json DEFAULT '[]'::json,
    "folderPath" character varying(512),
    "isAutoTrigger" boolean DEFAULT false NOT NULL,
    "triggerPatterns" json DEFAULT '[]'::json,
    "isEnabled" boolean DEFAULT true NOT NULL,
    "enabledByDefault" boolean DEFAULT true NOT NULL,
    "creditMultiplier" numeric(5,2) DEFAULT 1.0,
    priority integer DEFAULT 50 NOT NULL,
    "availableModels" json,
    "defaultModel" character varying(128),
    "systemPrompt" text,
    "skillContent" text,
    knowledgebase text,
    "configJson" json,
    "importSource" character varying(50) DEFAULT 'manual'::character varying,
    "importedFromZip" character varying(512),
    "createdBy" integer,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
    "visibleByDefault" boolean DEFAULT true NOT NULL,
    "marketplaceContent" text,
    "repositoryId" integer,
    "repositorySlug" character varying(200),
    "contentHash" character varying(64),
    "executionMode" character varying(50) DEFAULT 'llm-only'::character varying NOT NULL
);


ALTER TABLE public.skills OWNER TO smartspec;

--
-- Name: skills_id_seq; Type: SEQUENCE; Schema: public; Owner: smartspec
--

CREATE SEQUENCE public.skills_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.skills_id_seq OWNER TO smartspec;

--
-- Name: skills_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: smartspec
--

ALTER SEQUENCE public.skills_id_seq OWNED BY public.skills.id;


--
-- Name: storage_settings; Type: TABLE; Schema: public; Owner: smartspec
--

CREATE TABLE public.storage_settings (
    id integer NOT NULL,
    name character varying(64) NOT NULL,
    "displayName" character varying(128) NOT NULL,
    description text,
    "providerType" public.storage_provider_type DEFAULT 'r2'::public.storage_provider_type NOT NULL,
    endpoint character varying(512),
    region character varying(64) DEFAULT 'auto'::character varying,
    bucket character varying(128),
    "accessKeyIdEncrypted" text,
    "secretAccessKeyEncrypted" text,
    "hasCredentials" boolean DEFAULT false NOT NULL,
    "publicUrlPrefix" character varying(512),
    "devTunnelUrl" character varying(512),
    "pathPrefix" character varying(128) DEFAULT 'uploads/'::character varying,
    "isActive" boolean DEFAULT false NOT NULL,
    "configJson" json,
    "lastTestedAt" timestamp with time zone,
    "lastTestResult" json,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.storage_settings OWNER TO smartspec;

--
-- Name: storage_settings_id_seq; Type: SEQUENCE; Schema: public; Owner: smartspec
--

CREATE SEQUENCE public.storage_settings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.storage_settings_id_seq OWNER TO smartspec;

--
-- Name: storage_settings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: smartspec
--

ALTER SEQUENCE public.storage_settings_id_seq OWNED BY public.storage_settings.id;


--
-- Name: support_tickets; Type: TABLE; Schema: public; Owner: smartspec
--

CREATE TABLE public.support_tickets (
    id character varying(36) NOT NULL,
    ticket_number character varying(20) NOT NULL,
    user_id integer NOT NULL,
    subject character varying(500) NOT NULL,
    description text NOT NULL,
    category public.ticketcategory NOT NULL,
    priority public.ticketpriority NOT NULL,
    status public.ticketstatus NOT NULL,
    assigned_to integer,
    created_at timestamp without time zone NOT NULL,
    updated_at timestamp without time zone NOT NULL,
    resolved_at timestamp without time zone,
    closed_at timestamp without time zone
);


ALTER TABLE public.support_tickets OWNER TO smartspec;

--
-- Name: system_config; Type: TABLE; Schema: public; Owner: smartspec
--

CREATE TABLE public.system_config (
    key character varying(100) NOT NULL,
    value text NOT NULL,
    description text,
    updated_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.system_config OWNER TO smartspec;

--
-- Name: system_settings; Type: TABLE; Schema: public; Owner: smartspec
--

CREATE TABLE public.system_settings (
    id integer NOT NULL,
    category character varying(64) NOT NULL,
    key character varying(128) NOT NULL,
    value text,
    "valueJson" json,
    "isSensitive" boolean DEFAULT false NOT NULL,
    description text,
    "updatedBy" integer,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.system_settings OWNER TO smartspec;

--
-- Name: system_settings_id_seq; Type: SEQUENCE; Schema: public; Owner: smartspec
--

CREATE SEQUENCE public.system_settings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.system_settings_id_seq OWNER TO smartspec;

--
-- Name: system_settings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: smartspec
--

ALTER SEQUENCE public.system_settings_id_seq OWNED BY public.system_settings.id;


--
-- Name: template_purchases; Type: TABLE; Schema: public; Owner: smartspec
--

CREATE TABLE public.template_purchases (
    id character varying(36) NOT NULL,
    template_id character varying(36) NOT NULL,
    buyer_id integer NOT NULL,
    price_paid_credits integer NOT NULL,
    creator_revenue integer NOT NULL,
    platform_commission integer NOT NULL,
    buyer_balance_before integer NOT NULL,
    buyer_balance_after integer NOT NULL,
    download_count integer NOT NULL,
    last_downloaded_at timestamp with time zone,
    template_version character varying(50) NOT NULL,
    purchased_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.template_purchases OWNER TO smartspec;

--
-- Name: template_revenue_ledger; Type: TABLE; Schema: public; Owner: smartspec
--

CREATE TABLE public.template_revenue_ledger (
    id character varying(36) NOT NULL,
    purchase_id character varying(36) NOT NULL,
    template_id character varying(36) NOT NULL,
    buyer_id integer NOT NULL,
    creator_id integer NOT NULL,
    total_credits integer NOT NULL,
    creator_credits integer NOT NULL,
    platform_credits integer NOT NULL,
    recorded_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.template_revenue_ledger OWNER TO smartspec;

--
-- Name: template_reviews; Type: TABLE; Schema: public; Owner: smartspec
--

CREATE TABLE public.template_reviews (
    id character varying(36) NOT NULL,
    template_id character varying(36) NOT NULL,
    reviewer_id integer NOT NULL,
    purchase_id character varying(36) NOT NULL,
    rating integer NOT NULL,
    title character varying(255),
    review_text text,
    helpful_count integer NOT NULL,
    is_verified_purchase boolean NOT NULL,
    is_hidden boolean NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.template_reviews OWNER TO smartspec;

--
-- Name: tenant_pages; Type: TABLE; Schema: public; Owner: smartspec
--

CREATE TABLE public.tenant_pages (
    id integer NOT NULL,
    "tenantId" character varying(36) NOT NULL,
    "pageKey" character varying(64) NOT NULL,
    title character varying(255) NOT NULL,
    slug character varying(255) NOT NULL,
    content text,
    sections json,
    metadata json,
    "isPublished" boolean DEFAULT false NOT NULL,
    "sortOrder" integer DEFAULT 0 NOT NULL,
    "showInMenu" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.tenant_pages OWNER TO smartspec;

--
-- Name: tenant_pages_id_seq; Type: SEQUENCE; Schema: public; Owner: smartspec
--

CREATE SEQUENCE public.tenant_pages_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.tenant_pages_id_seq OWNER TO smartspec;

--
-- Name: tenant_pages_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: smartspec
--

ALTER SEQUENCE public.tenant_pages_id_seq OWNED BY public.tenant_pages.id;


--
-- Name: tenant_users; Type: TABLE; Schema: public; Owner: smartspec
--

CREATE TABLE public.tenant_users (
    id character varying(36) NOT NULL,
    tenant_id character varying(36) NOT NULL,
    user_id integer NOT NULL,
    role character varying(50) NOT NULL,
    is_active boolean,
    joined_at timestamp without time zone NOT NULL,
    last_active_at timestamp without time zone
);


ALTER TABLE public.tenant_users OWNER TO smartspec;

--
-- Name: tenants; Type: TABLE; Schema: public; Owner: smartspec
--

CREATE TABLE public.tenants (
    id character varying(36) NOT NULL,
    name character varying(255) NOT NULL,
    slug character varying(100) NOT NULL,
    status public.tenantstatus NOT NULL,
    plan public.tenantplan NOT NULL,
    owner_id integer,
    owner_email character varying(255),
    settings json,
    max_users integer,
    max_projects integer,
    max_storage_gb integer,
    max_api_calls_per_month integer,
    current_users integer,
    current_projects integer,
    current_storage_gb integer,
    current_api_calls integer,
    billing_email character varying(255),
    stripe_customer_id character varying(255),
    description text,
    logo_url character varying(500),
    website character varying(255),
    created_at timestamp without time zone NOT NULL,
    updated_at timestamp without time zone,
    suspended_at timestamp without time zone,
    deleted_at timestamp without time zone,
    "primaryDomain" character varying(255),
    domains json,
    "logoUrl" character varying(512),
    "faviconUrl" character varying(512),
    "isActive" boolean DEFAULT true,
    "seoConfig" json,
    "themeConfig" json,
    "contactInfo" json,
    "ownerId" integer,
    "createdAt" timestamp with time zone DEFAULT now(),
    "updatedAt" timestamp with time zone DEFAULT now(),
    "websiteLogoUrl" character varying(512)
);


ALTER TABLE public.tenants OWNER TO smartspec;

--
-- Name: theme_presets; Type: TABLE; Schema: public; Owner: smartspec
--

CREATE TABLE public.theme_presets (
    id integer NOT NULL,
    name character varying(128) NOT NULL,
    "displayName" character varying(255) NOT NULL,
    description text,
    "previewImageUrl" character varying(512),
    "themeConfig" json NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "isDefault" boolean DEFAULT false NOT NULL,
    "sortOrder" integer DEFAULT 0 NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.theme_presets OWNER TO smartspec;

--
-- Name: theme_presets_id_seq; Type: SEQUENCE; Schema: public; Owner: smartspec
--

CREATE SEQUENCE public.theme_presets_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.theme_presets_id_seq OWNER TO smartspec;

--
-- Name: theme_presets_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: smartspec
--

ALTER SEQUENCE public.theme_presets_id_seq OWNED BY public.theme_presets.id;


--
-- Name: ticket_messages; Type: TABLE; Schema: public; Owner: smartspec
--

CREATE TABLE public.ticket_messages (
    id character varying(36) NOT NULL,
    ticket_id character varying(36) NOT NULL,
    user_id integer NOT NULL,
    message text NOT NULL,
    is_staff_response character varying(10),
    attachments text,
    created_at timestamp without time zone NOT NULL
);


ALTER TABLE public.ticket_messages OWNER TO smartspec;

--
-- Name: token_blacklist; Type: TABLE; Schema: public; Owner: smartspec
--

CREATE TABLE public.token_blacklist (
    jti character varying(36) NOT NULL,
    user_id character varying(36) NOT NULL,
    token_type character varying(20) NOT NULL,
    expires_at timestamp without time zone NOT NULL,
    revoked_at timestamp without time zone NOT NULL,
    reason character varying(100)
);


ALTER TABLE public.token_blacklist OWNER TO smartspec;

--
-- Name: user_follows; Type: TABLE; Schema: public; Owner: smartspec
--

CREATE TABLE public.user_follows (
    id integer NOT NULL,
    "followerId" integer NOT NULL,
    "followingId" integer NOT NULL,
    status public.follow_status DEFAULT 'active'::public.follow_status NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.user_follows OWNER TO smartspec;

--
-- Name: user_follows_id_seq; Type: SEQUENCE; Schema: public; Owner: smartspec
--

CREATE SEQUENCE public.user_follows_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.user_follows_id_seq OWNER TO smartspec;

--
-- Name: user_follows_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: smartspec
--

ALTER SEQUENCE public.user_follows_id_seq OWNED BY public.user_follows.id;


--
-- Name: user_notifications; Type: TABLE; Schema: public; Owner: smartspec
--

CREATE TABLE public.user_notifications (
    id integer NOT NULL,
    "userId" integer NOT NULL,
    type public.notification_type NOT NULL,
    title character varying(255) NOT NULL,
    content text,
    "conversationId" integer,
    "scheduledMessageId" integer,
    "isRead" boolean DEFAULT false NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.user_notifications OWNER TO smartspec;

--
-- Name: user_notifications_id_seq; Type: SEQUENCE; Schema: public; Owner: smartspec
--

CREATE SEQUENCE public.user_notifications_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.user_notifications_id_seq OWNER TO smartspec;

--
-- Name: user_notifications_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: smartspec
--

ALTER SEQUENCE public.user_notifications_id_seq OWNED BY public.user_notifications.id;


--
-- Name: user_preferences; Type: TABLE; Schema: public; Owner: smartspec
--

CREATE TABLE public.user_preferences (
    id uuid NOT NULL,
    user_id integer NOT NULL,
    email_notifications boolean NOT NULL,
    low_credits_alert boolean NOT NULL,
    payment_notifications boolean NOT NULL,
    support_ticket_updates boolean NOT NULL,
    marketing_emails boolean NOT NULL,
    low_credits_threshold integer NOT NULL,
    default_llm_model character varying(100),
    default_llm_provider character varying(50),
    default_budget_priority character varying(20) NOT NULL,
    theme character varying(20) NOT NULL,
    language character varying(10) NOT NULL,
    timezone character varying(50) NOT NULL,
    dashboard_layout jsonb,
    favorite_features jsonb,
    default_api_key_rate_limit integer NOT NULL,
    custom_settings jsonb
);


ALTER TABLE public.user_preferences OWNER TO smartspec;

--
-- Name: user_skill_visibility; Type: TABLE; Schema: public; Owner: smartspec
--

CREATE TABLE public.user_skill_visibility (
    id integer NOT NULL,
    "userId" integer NOT NULL,
    "skillId" integer NOT NULL,
    visible boolean DEFAULT true NOT NULL,
    "autoTriggerEnabled" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.user_skill_visibility OWNER TO smartspec;

--
-- Name: user_skill_visibility_id_seq; Type: SEQUENCE; Schema: public; Owner: smartspec
--

CREATE SEQUENCE public.user_skill_visibility_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.user_skill_visibility_id_seq OWNER TO smartspec;

--
-- Name: user_skill_visibility_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: smartspec
--

ALTER SEQUENCE public.user_skill_visibility_id_seq OWNED BY public.user_skill_visibility.id;


--
-- Name: users; Type: TABLE; Schema: public; Owner: smartspec
--

CREATE TABLE public.users (
    id integer NOT NULL,
    "openId" character varying(64),
    name text,
    email character varying(320),
    password text,
    "loginMethod" character varying(64),
    role public.role NOT NULL,
    plan public.plan NOT NULL,
    credits integer NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
    "lastSignedIn" timestamp with time zone DEFAULT now() NOT NULL,
    "registeredDomain" character varying(255),
    "currentTenantId" character varying(36),
    "isDisabled" boolean NOT NULL,
    is_banned boolean DEFAULT false NOT NULL,
    banned_until timestamp with time zone,
    ban_reason text,
    "normalizedEmail" character varying(320),
    "trustScore" integer DEFAULT 100,
    "registrationIp" character varying(45),
    "userPreferences" jsonb DEFAULT '{}'::jsonb,
    "backupEmail" character varying(320),
    "backupEmailVerified" boolean DEFAULT false NOT NULL,
    phone character varying(20),
    "phoneVerified" boolean DEFAULT false NOT NULL,
    "twoFactorEnabled" boolean DEFAULT false NOT NULL,
    "twoFactorSecret" text,
    "recoveryCodes" json DEFAULT '[]'::json
);


ALTER TABLE public.users OWNER TO smartspec;

--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: smartspec
--

CREATE SEQUENCE public.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.users_id_seq OWNER TO smartspec;

--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: smartspec
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- Name: vector_collections; Type: TABLE; Schema: public; Owner: smartspec
--

CREATE TABLE public.vector_collections (
    id character varying(36) NOT NULL,
    name character varying(100) NOT NULL,
    description text,
    tenant_id character varying(36),
    project_id character varying(36),
    dimension integer NOT NULL,
    distance_metric character varying(20),
    index_type public.vectorindextype,
    index_params json,
    vector_count integer,
    total_size_bytes integer,
    is_indexed boolean,
    last_indexed_at timestamp without time zone,
    created_at timestamp without time zone NOT NULL,
    updated_at timestamp without time zone
);


ALTER TABLE public.vector_collections OWNER TO smartspec;

--
-- Name: vector_documents; Type: TABLE; Schema: public; Owner: smartspec
--

CREATE TABLE public.vector_documents (
    id character varying(36) NOT NULL,
    collection_id character varying(36) NOT NULL,
    content text NOT NULL,
    content_hash character varying(64),
    extra_data json,
    source character varying(255),
    source_type character varying(50),
    chunk_index integer,
    parent_id character varying(36),
    embedding_model character varying(100),
    embedding_dimension integer,
    created_at timestamp without time zone NOT NULL,
    updated_at timestamp without time zone
);


ALTER TABLE public.vector_documents OWNER TO smartspec;

--
-- Name: __drizzle_migrations id; Type: DEFAULT; Schema: drizzle; Owner: smartspec
--

ALTER TABLE ONLY drizzle.__drizzle_migrations ALTER COLUMN id SET DEFAULT nextval('drizzle.__drizzle_migrations_id_seq'::regclass);


--
-- Name: blocked_patterns id; Type: DEFAULT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.blocked_patterns ALTER COLUMN id SET DEFAULT nextval('public.blocked_patterns_id_seq'::regclass);


--
-- Name: blog_posts id; Type: DEFAULT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.blog_posts ALTER COLUMN id SET DEFAULT nextval('public.blog_posts_id_seq'::regclass);


--
-- Name: conversation_summaries id; Type: DEFAULT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.conversation_summaries ALTER COLUMN id SET DEFAULT nextval('public.conversation_summaries_id_seq'::regclass);


--
-- Name: conversations id; Type: DEFAULT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.conversations ALTER COLUMN id SET DEFAULT nextval('public.conversations_id_seq'::regclass);


--
-- Name: credit_packages id; Type: DEFAULT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.credit_packages ALTER COLUMN id SET DEFAULT nextval('public.credit_packages_id_seq'::regclass);


--
-- Name: credit_transactions id; Type: DEFAULT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.credit_transactions ALTER COLUMN id SET DEFAULT nextval('public.credit_transactions_id_seq'::regclass);


--
-- Name: device_fingerprints id; Type: DEFAULT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.device_fingerprints ALTER COLUMN id SET DEFAULT nextval('public.device_fingerprints_id_seq'::regclass);


--
-- Name: direct_messages id; Type: DEFAULT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.direct_messages ALTER COLUMN id SET DEFAULT nextval('public.direct_messages_id_seq'::regclass);


--
-- Name: email_verification_tokens id; Type: DEFAULT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.email_verification_tokens ALTER COLUMN id SET DEFAULT nextval('public.email_verification_tokens_id_seq'::regclass);


--
-- Name: entity_memories id; Type: DEFAULT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.entity_memories ALTER COLUMN id SET DEFAULT nextval('public.entity_memories_id_seq'::regclass);


--
-- Name: gallery_items id; Type: DEFAULT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.gallery_items ALTER COLUMN id SET DEFAULT nextval('public.gallery_items_id_seq'::regclass);


--
-- Name: invoice_config id; Type: DEFAULT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.invoice_config ALTER COLUMN id SET DEFAULT nextval('public.invoice_config_id_seq'::regclass);


--
-- Name: llm_providers id; Type: DEFAULT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.llm_providers ALTER COLUMN id SET DEFAULT nextval('public.llm_providers_id_seq'::regclass);


--
-- Name: media_models id; Type: DEFAULT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.media_models ALTER COLUMN id SET DEFAULT nextval('public.media_models_id_seq'::regclass);


--
-- Name: media_providers id; Type: DEFAULT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.media_providers ALTER COLUMN id SET DEFAULT nextval('public.media_providers_id_seq'::regclass);


--
-- Name: messages id; Type: DEFAULT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.messages ALTER COLUMN id SET DEFAULT nextval('public.messages_id_seq'::regclass);


--
-- Name: payment_transactions id; Type: DEFAULT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.payment_transactions ALTER COLUMN id SET DEFAULT nextval('public.payment_transactions_id_seq'::regclass);


--
-- Name: registration_events id; Type: DEFAULT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.registration_events ALTER COLUMN id SET DEFAULT nextval('public.registration_events_id_seq'::regclass);


--
-- Name: scheduled_message_logs id; Type: DEFAULT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.scheduled_message_logs ALTER COLUMN id SET DEFAULT nextval('public.scheduled_message_logs_id_seq'::regclass);


--
-- Name: scheduled_messages id; Type: DEFAULT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.scheduled_messages ALTER COLUMN id SET DEFAULT nextval('public.scheduled_messages_id_seq'::regclass);


--
-- Name: semantic_memories id; Type: DEFAULT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.semantic_memories ALTER COLUMN id SET DEFAULT nextval('public.semantic_memories_id_seq'::regclass);


--
-- Name: seo_metadata id; Type: DEFAULT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.seo_metadata ALTER COLUMN id SET DEFAULT nextval('public.seo_metadata_id_seq'::regclass);


--
-- Name: skill_comments id; Type: DEFAULT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.skill_comments ALTER COLUMN id SET DEFAULT nextval('public.skill_comments_id_seq'::regclass);


--
-- Name: skill_likes id; Type: DEFAULT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.skill_likes ALTER COLUMN id SET DEFAULT nextval('public.skill_likes_id_seq'::regclass);


--
-- Name: skill_preferences id; Type: DEFAULT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.skill_preferences ALTER COLUMN id SET DEFAULT nextval('public.skill_preferences_id_seq'::regclass);


--
-- Name: skill_repositories id; Type: DEFAULT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.skill_repositories ALTER COLUMN id SET DEFAULT nextval('public.skill_repositories_id_seq'::regclass);


--
-- Name: skills id; Type: DEFAULT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.skills ALTER COLUMN id SET DEFAULT nextval('public.skills_id_seq'::regclass);


--
-- Name: storage_settings id; Type: DEFAULT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.storage_settings ALTER COLUMN id SET DEFAULT nextval('public.storage_settings_id_seq'::regclass);


--
-- Name: system_settings id; Type: DEFAULT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.system_settings ALTER COLUMN id SET DEFAULT nextval('public.system_settings_id_seq'::regclass);


--
-- Name: tenant_pages id; Type: DEFAULT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.tenant_pages ALTER COLUMN id SET DEFAULT nextval('public.tenant_pages_id_seq'::regclass);


--
-- Name: theme_presets id; Type: DEFAULT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.theme_presets ALTER COLUMN id SET DEFAULT nextval('public.theme_presets_id_seq'::regclass);


--
-- Name: user_follows id; Type: DEFAULT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.user_follows ALTER COLUMN id SET DEFAULT nextval('public.user_follows_id_seq'::regclass);


--
-- Name: user_notifications id; Type: DEFAULT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.user_notifications ALTER COLUMN id SET DEFAULT nextval('public.user_notifications_id_seq'::regclass);


--
-- Name: user_skill_visibility id; Type: DEFAULT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.user_skill_visibility ALTER COLUMN id SET DEFAULT nextval('public.user_skill_visibility_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- Data for Name: __drizzle_migrations; Type: TABLE DATA; Schema: drizzle; Owner: smartspec
--

COPY drizzle.__drizzle_migrations (id, hash, created_at) FROM stdin;
\.


--
-- Data for Name: api_key_usage; Type: TABLE DATA; Schema: public; Owner: smartspec
--

COPY public.api_key_usage (id, api_key_id, endpoint, method, status_code, response_time, credits_used, ip_address, user_agent, "timestamp") FROM stdin;
\.


--
-- Data for Name: api_keys; Type: TABLE DATA; Schema: public; Owner: smartspec
--

COPY public.api_keys (id, user_id, name, key_hash, key_prefix, permissions, rate_limit, is_active, expires_at, last_used_at, description, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: approval_requests; Type: TABLE DATA; Schema: public; Owner: smartspec
--

COPY public.approval_requests (id, request_type, title, description, tenant_id, project_id, execution_id, requester_id, requester_type, status, payload, extra_data, risk_level, risk_factors, required_approvers, current_approvals, expires_at, timeout_action, created_at, updated_at, resolved_at) FROM stdin;
\.


--
-- Data for Name: approval_responses; Type: TABLE DATA; Schema: public; Owner: smartspec
--

COPY public.approval_responses (id, request_id, approver_id, decision, comment, created_at) FROM stdin;
\.


--
-- Data for Name: approval_rules; Type: TABLE DATA; Schema: public; Owner: smartspec
--

COPY public.approval_rules (id, name, description, tenant_id, project_id, trigger_type, conditions, approver_roles, approver_users, required_approvals, timeout_minutes, timeout_action, auto_approve_conditions, priority, is_active, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: assets; Type: TABLE DATA; Schema: public; Owner: smartspec
--

COPY public.assets (id, user_id, project_id, spec_id, filename, original_filename, relative_path, file_size, mime_type, asset_type, status, version, is_latest, parent_asset_id, generation_task_id, asset_metadata, tags, description, alt_text, created_at, updated_at, deleted_at) FROM stdin;
\.


--
-- Data for Name: audit_events; Type: TABLE DATA; Schema: public; Owner: smartspec
--

COPY public.audit_events (id, action, description, actor_id, actor_email, actor_ip, actor_user_agent, target_type, target_id, tenant_id, project_id, success, error_message, severity, extra_data, created_at) FROM stdin;
\.


--
-- Data for Name: audit_logs; Type: TABLE DATA; Schema: public; Owner: smartspec
--

COPY public.audit_logs (id, user_id, user_email, user_role, impersonator_id, impersonator_email, is_impersonated, action, resource_type, resource_id, method, endpoint, status_code, details, ip_address, user_agent, "timestamp") FROM stdin;
\.


--
-- Data for Name: blocked_patterns; Type: TABLE DATA; Schema: public; Owner: smartspec
--

COPY public.blocked_patterns (id, "patternType", pattern, reason, "createdBy", "isActive", "createdAt") FROM stdin;
\.


--
-- Data for Name: blog_posts; Type: TABLE DATA; Schema: public; Owner: smartspec
--

COPY public.blog_posts (id, "tenantId", slug, title, excerpt, content, "coverImage", author, "authorAvatar", category, tags, "readTime", "isPublished", "isFeatured", "metaDescription", "metaKeywords", "publishedAt", "createdAt", "updatedAt") FROM stdin;
1	tenant-ZCSKEM9s	introducing-smart-ai-hub	Introducing Smart AI Hub: Your All-in-One AI Creative Platform	We're excited to launch Smart AI Hub — a unified platform for AI-powered image, video, and audio generation with enterprise-grade features.	<h2>Welcome to Smart AI Hub</h2>\n<p>We're thrilled to announce the launch of <strong>Smart AI Hub</strong>, a comprehensive platform that brings together the best AI models for creative content generation.</p>\n\n<h3>What You Can Create</h3>\n<ul>\n<li><strong>Images</strong> — Generate stunning visuals with FLUX, Stable Diffusion, and more</li>\n<li><strong>Videos</strong> — Create professional video content with cutting-edge AI models</li>\n<li><strong>Audio</strong> — Text-to-speech, music generation, and sound effects</li>\n<li><strong>Code</strong> — AI-assisted code generation and refactoring</li>\n</ul>\n\n<h3>Built for Teams</h3>\n<p>Smart AI Hub is designed from the ground up for team collaboration. Share projects, manage credits across your organization, and maintain brand consistency with shared style presets.</p>\n\n<h3>Enterprise-Ready</h3>\n<p>With multi-tenant architecture, SSO integration, audit logs, and granular access controls, Smart AI Hub meets the security and compliance requirements of modern enterprises.</p>\n\n<blockquote><p>The future of creative work is AI-augmented. Smart AI Hub puts the power of dozens of AI models at your fingertips.</p></blockquote>\n\n<p>Ready to get started? <a href="/signup">Create your free account</a> and start generating today.</p>		Smart AI Hub Team		News	"[\\"launch\\",\\"platform\\",\\"ai\\"]"	3 min read	t	t	\N	\N	2026-01-29 04:01:44.616441+00	2026-01-29 04:01:44.616441+00	2026-01-29 04:01:44.616441+00
2	tenant-ZCSKEM9s	getting-started-with-image-generation	Getting Started with AI Image Generation	Learn how to create your first AI-generated image using Smart AI Hub's Media Studio with step-by-step instructions.	<h2>Your First AI Image</h2>\n<p>Creating images with AI has never been easier. This guide walks you through generating your first image on Smart AI Hub.</p>\n\n<h3>Step 1: Open Media Studio</h3>\n<p>Navigate to <a href="/media-studio">Media Studio</a> from the sidebar. Select <strong>Image Generation</strong> as your creation type.</p>\n\n<h3>Step 2: Choose a Model</h3>\n<p>We offer several models optimized for different use cases:</p>\n<ul>\n<li><strong>FLUX</strong> — Best for photorealistic images and complex scenes</li>\n<li><strong>Stable Diffusion XL</strong> — Great all-rounder with fast generation</li>\n<li><strong>DALL-E 3</strong> — Excellent for creative and artistic styles</li>\n</ul>\n\n<h3>Step 3: Write Your Prompt</h3>\n<p>Be specific and descriptive. Good prompts include:</p>\n<ul>\n<li>Subject and action</li>\n<li>Style and mood</li>\n<li>Lighting and composition</li>\n<li>Technical details (resolution, aspect ratio)</li>\n</ul>\n\n<h3>Example Prompt</h3>\n<pre><code>A serene mountain lake at sunset, golden hour lighting,\nreflection on calm water, pine forest in background,\nphotorealistic, 4K, cinematic composition</code></pre>\n\n<h3>Step 4: Generate and Iterate</h3>\n<p>Click <strong>Generate</strong> and wait a few seconds. You can refine your results by adjusting the prompt, changing the model, or tweaking advanced settings like guidance scale and seed.</p>\n\n<p>Happy creating!</p>		Smart AI Hub Team		Tutorial	"[\\"tutorial\\",\\"image-generation\\",\\"getting-started\\"]"	4 min read	t	f	\N	\N	2026-01-29 04:01:44.625379+00	2026-01-29 04:01:44.625379+00	2026-01-29 04:01:44.625379+00
3	tenant-ZCSKEM9s	api-key-security-best-practices	API Key Security: Best Practices for Developers	Keep your API keys safe with these essential security practices for integrating Smart AI Hub into your applications.	<h2>Protecting Your API Keys</h2>\n<p>API keys are the gateway to your Smart AI Hub account. Treating them with care is essential to prevent unauthorized usage and unexpected charges.</p>\n\n<h3>Never Expose Keys in Client-Side Code</h3>\n<p>Your API key should <strong>never</strong> appear in frontend JavaScript, mobile app bundles, or public repositories. Always make API calls from your server.</p>\n\n<h3>Use Environment Variables</h3>\n<pre><code># .env (never commit this file)\nSMARTAIHUB_API_KEY=sk-your-secret-key-here</code></pre>\n\n<h3>Rotate Keys Regularly</h3>\n<p>Generate new API keys periodically and revoke old ones. You can manage your keys from the <a href="/settings">Settings</a> page.</p>\n\n<h3>Set Usage Limits</h3>\n<p>Configure spending alerts and hard limits in your account settings to prevent runaway costs if a key is compromised.</p>\n\n<h3>Monitor Usage</h3>\n<p>Review your API usage logs regularly. Unusual spikes in traffic may indicate a compromised key.</p>\n\n<h3>Key Security Checklist</h3>\n<ul>\n<li>Store keys in environment variables or a secrets manager</li>\n<li>Add <code>.env</code> to your <code>.gitignore</code></li>\n<li>Use separate keys for development and production</li>\n<li>Enable MFA on your Smart AI Hub account</li>\n<li>Set up billing alerts</li>\n</ul>		Smart AI Hub Team		Security	"[\\"security\\",\\"api\\",\\"best-practices\\"]"	3 min read	t	f	\N	\N	2026-01-29 04:01:44.627464+00	2026-01-29 04:01:44.627464+00	2026-01-29 04:01:44.627464+00
4	tenant-ZCSKEM9s	whats-new-january-2025	What's New: January 2025 Platform Updates	Video generation improvements, new audio models, enhanced Media Studio UI, and more in this month's update.	<h2>January 2025 Updates</h2>\n<p>Here's a roundup of everything new on Smart AI Hub this month.</p>\n\n<h3>Video Generation Improvements</h3>\n<p>We've upgraded our video pipeline with faster processing and higher resolution output. Videos now render up to <strong>2x faster</strong> with improved frame consistency.</p>\n\n<h3>New Audio Models</h3>\n<p>Two new text-to-speech voices are now available, along with an experimental music generation model that creates royalty-free background tracks.</p>\n\n<h3>Media Studio UX Overhaul</h3>\n<p>The Media Studio has been redesigned with a cleaner layout, better prompt editing, and a new gallery view for browsing your generation history.</p>\n\n<h3>Credit System Updates</h3>\n<ul>\n<li>New flexible packages for teams of all sizes</li>\n<li>Volume discounts for enterprise customers</li>\n<li>Transparent per-model pricing in the dashboard</li>\n</ul>\n\n<h3>Bug Fixes</h3>\n<ul>\n<li>Fixed image download issues on Safari</li>\n<li>Resolved timeout errors for long video generations</li>\n<li>Fixed gallery pagination on mobile devices</li>\n</ul>\n\n<p>Questions or feedback? <a href="/contact">Reach out to our team</a>.</p>		Smart AI Hub Team		Product Update	"[\\"product-update\\",\\"changelog\\"]"	3 min read	t	f	\N	\N	2026-01-29 04:01:44.629395+00	2026-01-29 04:01:44.629395+00	2026-01-29 04:01:44.629395+00
5	tenant-ZCSKEM9s	prompt-engineering-guide	The Complete Guide to Prompt Engineering for AI Image Generation	Master the art of writing effective prompts to get better results from AI image generation models.	<h2>Why Prompts Matter</h2>\n<p>The quality of your AI-generated images depends heavily on how you write your prompts. A well-crafted prompt can be the difference between a mediocre result and a stunning masterpiece.</p>\n\n<h3>Anatomy of a Good Prompt</h3>\n<p>Effective prompts typically include these elements:</p>\n<ol>\n<li><strong>Subject</strong> — What is the main focus?</li>\n<li><strong>Style</strong> — What artistic style? (photorealistic, watercolor, anime, etc.)</li>\n<li><strong>Composition</strong> — How should it be framed? (close-up, wide angle, bird's eye)</li>\n<li><strong>Lighting</strong> — What mood? (golden hour, dramatic, soft, studio)</li>\n<li><strong>Details</strong> — Colors, textures, atmosphere</li>\n</ol>\n\n<h3>Prompt Formulas</h3>\n<p>Try this structure as a starting point:</p>\n<pre><code>[Subject] in [setting], [style], [lighting], [camera angle], [quality modifiers]</code></pre>\n\n<h3>Quality Modifiers That Work</h3>\n<ul>\n<li><code>highly detailed</code>, <code>4K</code>, <code>8K</code></li>\n<li><code>cinematic lighting</code>, <code>volumetric fog</code></li>\n<li><code>sharp focus</code>, <code>depth of field</code></li>\n<li><code>award-winning photography</code></li>\n</ul>\n\n<h3>Common Mistakes</h3>\n<ul>\n<li>Being too vague — "a dog" vs "a golden retriever puppy playing in autumn leaves"</li>\n<li>Conflicting instructions — "dark moody lighting, bright and cheerful"</li>\n<li>Too many subjects — focus on one main element</li>\n</ul>\n\n<h3>Negative Prompts</h3>\n<p>Most models support negative prompts to exclude unwanted elements. Common negative prompt terms: <code>blurry, low quality, distorted, watermark, text</code></p>\n\n<p>Practice makes perfect. Experiment with different styles and save your best prompts for reuse!</p>		Smart AI Hub Team		Guide	"[\\"guide\\",\\"prompts\\",\\"image-generation\\",\\"tips\\"]"	5 min read	t	f	\N	\N	2026-01-29 04:01:44.631323+00	2026-01-29 04:01:44.631323+00	2026-01-29 04:01:44.631323+00
\.


--
-- Data for Name: checkpoints; Type: TABLE DATA; Schema: public; Owner: smartspec
--

COPY public.checkpoints (id, execution_id, step_number, step_name, state, tokens_used, cost, created_at) FROM stdin;
\.


--
-- Data for Name: conversation_summaries; Type: TABLE DATA; Schema: public; Owner: smartspec
--

COPY public.conversation_summaries (id, "conversationId", summary, "messageRangeStart", "messageRangeEnd", "messageCount", "tokensUsed", "createdAt", project_id) FROM stdin;
3	1	Key points from 2 messages:\nUSER: Coding AuthenTicaition use Context7\n\nUSER: Coding AuthenTicaition use Context7	1	2	2	\N	2026-01-29 15:08:13.265364+00	\N
\.


--
-- Data for Name: conversations; Type: TABLE DATA; Schema: public; Owner: smartspec
--

COPY public.conversations (id, "userId", title, model, temperature, "systemPrompt", "skillSettings", "isArchived", "isPinned", "totalCreditsUsed", "messageCount", "createdAt", "updatedAt", project_id, memory_mode, "brainstormMaxRounds", "brainstormPartnerModel", "trashedAt") FROM stdin;
1	1	Coding AuthenTicaition use Context7	openai/gpt-5.2	0.70	\N	{"autoDetect":true,"enabledSkills":[],"detectionMode":"auto"}	f	f	40.0000	14	2026-01-29 05:13:22.703049+00	2026-01-30 09:01:35.501+00	Project001	full	3	\N	\N
5	1	Authentication Context7	moonshotai/kimi-k2.5	0.70	Context from previous conversation in project "Project001":\n\nPrevious conversation summaries:\n- Key points from 2 messages:\nUSER: Coding AuthenTicaition use Context7\n\nUSER: Coding AuthenTicaition use Context7\n\nRecent messages:\nASSISTANT: It seems like you're asking for help with authentication using Context7, which is likely in the context of the framework Framework7. Framework7 is a popular JavaScript framework for building mobile applications.\n\nHere’s a basic approach to implementing authentication in a Framework7 (Context7) application. This example will assume that you're building a simple app that checks user credentials against a hypothetical API.\n\n### Step 1: Set Up Your Project\n\nMake sure you have a Framework7 project se\nUSER: ค้นหา Agent Skill ใน Context7\nASSISTANT: การค้นหา "Agent Skill" ใน Context7 (ซึ่งมักหมายถึง Framework7) อาจหมายถึงการสร้างชุดทักษะหรือฟังก์ชั่นที่ใช้สำหรับเอเจนท์ (Agents) ในแอปพลิเคชันที่สร้างขึ้น แต่ไม่แน่ใจว่านี่คือสิ่งที่คุณต้องการจริง ๆ หรือไม่ หากคำถามของคุณเกี่ยวข้องกับแนวคิดหรือฟีเจอร์เฉพาะในซอฟต์แวร์หรือแพลตฟอร์มใด ๆ กรุณาให้รายละเอียดเพิ่มเติม\n\n### แนวทางการสร้าง Agent Skill ใน Framework7\n\n1. **สร้างแอปพลิเคชันใหม่**:\n    สร้างแอปพลิเคชันใหม่ด้วย Framework7 หากคุณยังไม่มี:\n\n    ```bash\n    framework7 create\n    ```\n\n2. **ตั้ง\nUSER: การสร้าง skill ใน claude ทำอย่างไรได้บ้าง หรือ หา skill ที่มีคนพัฒนาไว้แล้วที่ไหนดี\nUSER: การสร้าง skill ใน claude ทำอย่างไรได้บ้าง หรือ หา skill ที่มีคนพัฒนาไว้แล้วที่ไหนดี\nUSER: การสร้าง skill ใน claude ทำอย่างไรได้บ้าง หรือ หา skill ที่มีคนพัฒนาไว้แล้วที่ไหนดี\nUSER: วันนี้คุยกันเรื่องอะไร\nUSER: วันนี้คุยกันเรื่องอะไร\nUSER: การสร้าง skill ใน claude ทำอย่างไรได้บ้าง หรือ หา skill ที่มีคนพัฒนาไว้แล้วที่ไหนดี\nASSISTANT: วันนี้เราคุยกันหลัก ๆ 2 เรื่อง:\n\n1) **“Context7/Framework7”** – คุณขอแนวทางทำ **Authentication (ล็อกอิน/ปกป้อง route)** และถามเรื่อง **การค้นหา/ทำ Agent Skill ใน Context7**  \n2) ตอนนี้คุณเปลี่ยนมาถามเรื่อง **“Skill ใน Claude”** ว่าจะสร้างเองได้ยังไง และจะไปหา “skill” ที่คนอื่นทำไว้แล้วที่ไหน\n\n---\n\n## การสร้าง “skill” ใน Claude ทำได้แบบไหนบ้าง\nคำว่า “skill” ในโลกของ Claude มักจะหมายถึงการ **เพิ่มความสามารถให้ Claude เรียกใช้งานเครื่องมือภายนอกได้** ซึ่งทำได้หลัก ๆ 2 แนวทาง (ขึ้นกับว่าคุณใช้ Claud	{"autoDetect":true,"enabledSkills":[],"detectionMode":"auto"}	f	f	60.0000	4	2026-01-30 10:11:57.468995+00	2026-01-30 10:23:37.455+00	Project001	full	3	\N	\N
20	1	New Chat	openai/gpt-4o-mini	0.70	\N	{"autoDetect":true,"enabledSkills":[],"detectionMode":"auto"}	f	f	0.0000	0	2026-01-31 17:56:42.970341+00	2026-01-31 17:56:42.970341+00	\N	full	3	\N	\N
21	1	New Chat	openai/gpt-4o-mini	0.70	\N	{"autoDetect":true,"enabledSkills":[],"detectionMode":"auto"}	f	f	0.0000	0	2026-01-31 18:01:08.591488+00	2026-01-31 18:01:08.591488+00	\N	full	3	\N	\N
25	1	New Chat	openai/gpt-4o-mini	0.70	\N	{"autoDetect":true,"enabledSkills":[],"detectionMode":"auto"}	f	f	0.0000	0	2026-02-02 02:51:49.738715+00	2026-02-02 02:51:49.738715+00	\N	full	3	\N	\N
7	1	ไก่กับไข่ใครเกิดก่อนกัน	openai/gpt-4o-mini	0.70	\N	{"autoDetect":true,"enabledSkills":[],"detectionMode":"auto"}	f	f	95.0000	9	2026-01-30 15:47:35.054882+00	2026-01-30 16:06:15.117+00	\N	full	3	\N	\N
26	1	New Chat	openai/gpt-4o-mini	0.70	\N	{"autoDetect":true,"enabledSkills":[],"detectionMode":"auto"}	f	f	0.0000	0	2026-02-02 02:54:13.237991+00	2026-02-02 02:54:13.237991+00	\N	full	3	\N	\N
27	1	New Chat	openai/gpt-4o-mini	0.70	\N	{"autoDetect":true,"enabledSkills":[],"detectionMode":"auto"}	f	f	0.0000	0	2026-02-02 02:55:38.403107+00	2026-02-02 02:55:38.403107+00	\N	full	3	\N	\N
17	1	คุยเรื่องอะไรกันอยู่	openai/gpt-4o-mini	0.70	\N	{"autoDetect":true,"enabledSkills":[],"detectionMode":"auto"}	f	f	4.0000	2	2026-01-30 17:11:12.113454+00	2026-01-30 17:11:30.352+00	\N	full	3	\N	2026-01-30 17:29:29.641
28	1	New Chat	openai/gpt-4o-mini	0.70	\N	{"autoDetect":true,"enabledSkills":[],"detectionMode":"auto"}	f	f	0.0000	0	2026-02-02 02:56:52.056317+00	2026-02-02 02:56:52.056317+00	\N	full	3	\N	\N
10	1	แจ้งฉัน ทุกวันตอนแปดโมงเช้า ค้นหาข่าวเกี่ยวกับ เทค...	openai/gpt-4o-mini	0.70	\N	{"autoDetect":true,"enabledSkills":[],"detectionMode":"auto"}	f	f	19.0000	4	2026-01-30 16:15:55.123721+00	2026-01-30 17:34:52.753+00	\N	full	3	\N	\N
6	1	วางแผนโปรโมท ระบบ Smart AI Hub (Smart Spec Pro) ที...	moonshotai/kimi-k2.5	0.70	\N	{"autoDetect":true,"enabledSkills":[],"detectionMode":"auto"}	f	f	220.0000	22	2026-01-30 14:40:48.866983+00	2026-01-31 02:11:37.088+00	Project 002	full	3	\N	\N
29	1	New Chat	amazon/nova-lite-v1	0.70	\N	{"autoDetect":true,"enabledSkills":[],"detectionMode":"auto"}	f	f	0.0000	0	2026-02-02 02:59:13.860731+00	2026-02-02 03:00:42.831+00	\N	full	3	\N	\N
30	1	New Chat	openai/gpt-4o-mini	0.70	\N	{"autoDetect":true,"enabledSkills":[],"detectionMode":"auto"}	f	f	0.0000	0	2026-02-02 03:04:14.333052+00	2026-02-02 03:04:14.333052+00	\N	full	3	\N	\N
15	1	คุยเรื่องอะไรกันอยู่	openai/gpt-4o-mini	0.70	\N	{"autoDetect":true,"enabledSkills":[],"detectionMode":"auto"}	f	f	12.0000	4	2026-01-30 17:04:32.078506+00	2026-01-31 06:52:52.174+00	\N	full	3	\N	\N
22	1	เป็นภาพอะไร	openai/gpt-4o-mini	0.70	\N	{"autoDetect":true,"enabledSkills":[],"detectionMode":"auto"}	f	f	16.0000	6	2026-02-02 02:44:17.135352+00	2026-02-02 03:52:12.49+00	\N	full	3	\N	\N
18	1	แจ้งฉัน ทุกวันตอนแปดโมงเช้า ค้นหาข่าวเกี่ยวกับ เทค...	openai/gpt-4o-mini	0.70	\N	{"autoDetect":true,"enabledSkills":[],"detectionMode":"auto"}	f	f	41.0000	7	2026-01-30 17:35:45.696849+00	2026-02-02 03:13:43.308+00	\N	full	3	\N	\N
19	1	สร้างภาพ เด็กผู้หญิง 2 ขวบเดินเล่นในห้องนั่งเล่น	openai/gpt-4o-mini	0.70	\N	{"autoDetect":true,"enabledSkills":[],"detectionMode":"auto"}	f	f	200.0000	21	2026-01-31 17:53:32.912477+00	2026-02-02 12:54:36.741+00	\N	full	3	\N	\N
23	1	ภาพอะไร	openai/o4-mini	0.70	\N	{"autoDetect":true,"enabledSkills":[],"detectionMode":"auto"}	f	f	36.0000	14	2026-02-02 02:48:36.229298+00	2026-02-02 04:02:34.292+00	\N	full	3	\N	\N
24	1	สร้างพรอมต์ ภาพผู้หญิงชาวไทยอายุ 20 ปี เดินอยู่ในส...	openai/gpt-4o-mini	0.70	\N	{"autoDetect":true,"enabledSkills":[],"detectionMode":"auto"}	f	f	100.0000	1	2026-02-02 02:51:29.862661+00	2026-02-02 07:21:04.688+00	\N	full	3	\N	\N
\.


--
-- Data for Name: credit_packages; Type: TABLE DATA; Schema: public; Owner: smartspec
--

COPY public.credit_packages (id, name, description, credits, "priceUsd", "stripePriceId", "isActive", "isFeatured", "sortOrder", "createdAt", "updatedAt", "packageType", "billingPeriod", "discountPercent", "stripeProductId", "stripePriceIds") FROM stdin;
1	Starter	<div class="space-y-2">\n  <p class="font-medium">Perfect for trying out our AI services</p>\n  <ul class="list-disc list-inside text-sm text-muted-foreground">\n    <li>1,000 credits</li>\n    <li>~100 basic image generations</li>\n    <li>~50 high-quality images</li>\n    <li>No expiration</li>\n  </ul>\n</div>	1000	1.25	\N	t	f	1	2026-01-28 14:56:30.996351+00	2026-01-28 14:56:30.996351+00	one_time	\N	0	\N	\N
2	Basic	<div class="space-y-2">\n  <p class="font-medium">Great for casual creators</p>\n  <ul class="list-disc list-inside text-sm text-muted-foreground">\n    <li>5,000 credits</li>\n    <li>~500 basic image generations</li>\n    <li>~5 short video clips</li>\n    <li>No expiration</li>\n  </ul>\n</div>	5000	5.99	\N	t	f	2	2026-01-28 14:56:31.023195+00	2026-01-28 14:56:31.023195+00	one_time	\N	0	\N	\N
3	Standard	<div class="space-y-2">\n  <p class="font-medium text-primary">Most Popular - Best value for regular users</p>\n  <ul class="list-disc list-inside text-sm text-muted-foreground">\n    <li>10,000 credits</li>\n    <li>~1,000 basic image generations</li>\n    <li>~10 short video clips</li>\n    <li>~100 audio generations</li>\n    <li>Priority support</li>\n    <li>No expiration</li>\n  </ul>\n</div>	10000	11.99	\N	t	t	3	2026-01-28 14:56:31.027433+00	2026-01-28 14:56:31.027433+00	one_time	\N	0	\N	\N
4	Pro	<div class="space-y-2">\n  <p class="font-medium">For professional creators & small teams</p>\n  <ul class="list-disc list-inside text-sm text-muted-foreground">\n    <li>25,000 credits</li>\n    <li>~2,500 basic image generations</li>\n    <li>~25 short video clips</li>\n    <li>~250 audio generations</li>\n    <li>Priority processing queue</li>\n    <li>No expiration</li>\n  </ul>\n</div>	25000	29.99	\N	t	f	4	2026-01-28 14:56:31.03178+00	2026-01-28 14:56:31.03178+00	one_time	\N	0	\N	\N
5	Business	<div class="space-y-2">\n  <p class="font-medium">For agencies & growing businesses</p>\n  <ul class="list-disc list-inside text-sm text-muted-foreground">\n    <li>50,000 credits</li>\n    <li>~5,000 basic image generations</li>\n    <li>~50 short video clips</li>\n    <li>~500 audio generations</li>\n    <li>Priority processing queue</li>\n    <li>Dedicated support</li>\n    <li>No expiration</li>\n  </ul>\n</div>	50000	59.00	\N	t	f	5	2026-01-28 14:56:31.035995+00	2026-01-28 14:56:31.035995+00	one_time	\N	0	\N	\N
6	Enterprise	<div class="space-y-2">\n  <p class="font-medium text-green-600">Best Value - Save 15%</p>\n  <ul class="list-disc list-inside text-sm text-muted-foreground">\n    <li>100,000 credits</li>\n    <li>~10,000 basic image generations</li>\n    <li>~100 short video clips</li>\n    <li>~1,000 audio generations</li>\n    <li>Highest priority queue</li>\n    <li>Dedicated account manager</li>\n    <li>Custom integrations support</li>\n    <li>No expiration</li>\n  </ul>\n</div>	100000	115.00	\N	t	f	6	2026-01-28 14:56:31.040108+00	2026-01-28 14:56:31.040108+00	one_time	\N	0	\N	\N
7	Top-up $10	Quick top-up for light usage	8700	10.00	\N	t	f	10	2026-01-28 15:03:08.514407+00	2026-01-28 15:03:08.514407+00	one_time	\N	0	\N	\N
8	Top-up $20	Small top-up for regular users	17400	20.00	\N	t	f	11	2026-01-28 15:03:08.542663+00	2026-01-28 15:03:08.542663+00	one_time	\N	0	\N	\N
9	Top-up $30	Medium top-up for active creators	26000	30.00	\N	t	f	12	2026-01-28 15:03:08.547961+00	2026-01-28 15:03:08.547961+00	one_time	\N	0	\N	\N
10	Top-up $50	Popular choice for frequent users	43500	50.00	\N	t	f	13	2026-01-28 15:03:08.5524+00	2026-01-28 15:03:08.5524+00	one_time	\N	0	\N	\N
11	Top-up $100	Best seller - Great value for power users	87000	100.00	\N	t	t	14	2026-01-28 15:03:08.562773+00	2026-01-28 15:03:08.562773+00	one_time	\N	0	\N	\N
12	Top-up $200	Professional choice for heavy usage	174000	200.00	\N	t	f	15	2026-01-28 15:03:08.56964+00	2026-01-28 15:03:08.56964+00	one_time	\N	0	\N	\N
13	Top-up $300	Team-friendly package	261000	300.00	\N	t	f	16	2026-01-28 15:03:08.57578+00	2026-01-28 15:03:08.57578+00	one_time	\N	0	\N	\N
14	Top-up $500	Business package for agencies	435000	500.00	\N	t	f	17	2026-01-28 15:03:08.58109+00	2026-01-28 15:03:08.58109+00	one_time	\N	0	\N	\N
15	Top-up $900	Enterprise-grade credit bundle	783000	900.00	\N	t	f	18	2026-01-28 15:03:08.585619+00	2026-01-28 15:03:08.585619+00	one_time	\N	0	\N	\N
16	Top-up $1000	Maximum value - Best for large projects	870000	1000.00	\N	t	f	19	2026-01-28 15:03:08.590513+00	2026-01-28 15:03:08.590513+00	one_time	\N	0	\N	\N
17	Starter Plan	<ul class="space-y-1">\n      <li>5,000 credits/month</li>\n      <li>Basic support</li>\n      <li>Access to standard models</li>\n    </ul>	5000	5.99	\N	t	f	100	2026-01-28 15:22:28.228249+00	2026-01-28 15:22:28.228249+00	subscription	monthly	0	\N	\N
18	Professional Plan	<ul class="space-y-1">\n      <li>25,000 credits/month</li>\n      <li>Priority support</li>\n      <li>Access to all standard models</li>\n      <li>API access</li>\n    </ul>	24000	24.99	\N	t	t	101	2026-01-28 15:22:28.251366+00	2026-01-28 15:22:28.251366+00	subscription	monthly	0	\N	\N
19	Business Plan	<ul class="space-y-1">\n      <li>100,000 credits/month</li>\n      <li>24/7 priority support</li>\n      <li>Access to all models including premium</li>\n      <li>Advanced API features</li>\n      <li>Team collaboration tools</li>\n    </ul>	80000	89.99	\N	t	f	102	2026-01-28 15:22:28.253666+00	2026-01-28 15:22:28.253666+00	subscription	monthly	0	\N	\N
20	Enterprise Plan	<ul class="space-y-1">\n      <li>500,000 credits/month</li>\n      <li>Dedicated support manager</li>\n      <li>All models + early access to new features</li>\n      <li>Custom integrations</li>\n      <li>SLA guarantee</li>\n      <li>Volume discounts on additional credits</li>\n    </ul>	390000	399.99	\N	t	f	103	2026-01-28 15:22:28.255263+00	2026-01-28 15:22:28.255263+00	subscription	monthly	0	\N	\N
21	Agency White Label	<ul class="space-y-1">\n    <li>200,000 credits (One-Time only</li>\n    <li>Custom domain support</li>\n    <li>White label branding</li>\n    <li>Domain admin privileges</li>\n    <li>Manage & transfer credits to domain users</li>\n    <li>Custom invoice configuration</li>\n    <li>Dedicated priority support</li>\n    <li>Access to all models including premium</li>\n    <li>Advanced API features</li>\n    <li>SLA guarantee</li>\n  </ul>	200000	299.00	\N	t	f	200	2026-01-28 16:05:11.50436+00	2026-01-28 16:05:11.50436+00	one_time	monthly	0	\N	\N
\.


--
-- Data for Name: credit_transactions; Type: TABLE DATA; Schema: public; Owner: smartspec
--

COPY public.credit_transactions (id, "userId", amount, type, description, metadata, "balanceAfter", "referenceId", "createdAt") FROM stdin;
1	1	-4	usage	LLM usage: gpt-4o-mini	{"model": "gpt-4o-mini", "costUsd": "0.003372", "endpoint": "/v1/chat/completions", "provider": "openrouter", "inputTokens": 0, "outputTokens": 5620}	99996	\N	2026-01-29 12:19:49.599923+00
2	1	-4	usage	LLM usage: gpt-4o-mini	{"model": "gpt-4o-mini", "costUsd": "0.003264", "endpoint": "/v1/chat/completions", "provider": "openrouter", "inputTokens": 0, "outputTokens": 5440}	99992	\N	2026-01-29 12:21:23.078358+00
3	1	-32	usage	LLM usage: openai/gpt-5.2	{"model": "openai/gpt-5.2", "costUsd": "0.031160", "endpoint": "/v1/chat/completions", "provider": "openrouter", "inputTokens": 0, "outputTokens": 7790}	99960	\N	2026-01-30 09:01:35.451517+00
4	1	-9	usage	LLM usage: openai/gpt-4o-mini	{"model": "openai/gpt-4o-mini", "costUsd": "0.008800", "endpoint": "/v1/chat/completions", "provider": "openrouter", "inputTokens": 0, "outputTokens": 880}	99951	\N	2026-01-30 10:14:28.233929+00
5	1	-51	usage	LLM usage: moonshotai/kimi-k2.5	{"model": "moonshotai/kimi-k2.5", "costUsd": "0.050560", "endpoint": "/v1/chat/completions", "provider": "openrouter", "inputTokens": 0, "outputTokens": 12640}	99900	\N	2026-01-30 10:23:37.434357+00
6	1	-7	usage	Translation (→EN)	{"model": "openai/chatgpt-4o-latest", "tokens": {"cost": 0.0109, "is_byok": false, "cost_details": {"upstream_inference_cost": 0.0109, "upstream_inference_prompt_cost": 0.003145, "upstream_inference_completions_cost": 0.007755}, "total_tokens": 1146, "prompt_tokens": 629, "completion_tokens": 517, "prompt_tokens_details": {"audio_tokens": 0, "cached_tokens": 0}, "completion_tokens_details": {"audio_tokens": 0, "reasoning_tokens": 0}}, "provider": "openrouter"}	99893	\N	2026-01-30 13:31:22.058504+00
7	1	-1	usage	Translation (→EN)	{"model": "openai/chatgpt-4o-latest", "tokens": {"cost": 0.00046, "is_byok": false, "cost_details": {"upstream_inference_cost": 0.00046, "upstream_inference_prompt_cost": 0.000265, "upstream_inference_completions_cost": 0.000195}, "total_tokens": 66, "prompt_tokens": 53, "completion_tokens": 13, "prompt_tokens_details": {"audio_tokens": 0, "cached_tokens": 0}, "completion_tokens_details": {"audio_tokens": 0, "reasoning_tokens": 0}}, "provider": "openrouter"}	99892	\N	2026-01-30 13:33:44.403572+00
8	1	-2	usage	Translation (→EN)	{"model": "openai/chatgpt-4o-latest", "tokens": {"cost": 0.00214, "is_byok": false, "cost_details": {"upstream_inference_cost": 0.00214, "upstream_inference_prompt_cost": 0.000775, "upstream_inference_completions_cost": 0.001365}, "total_tokens": 246, "prompt_tokens": 155, "completion_tokens": 91, "prompt_tokens_details": {"audio_tokens": 0, "cached_tokens": 0}, "completion_tokens_details": {"audio_tokens": 0, "reasoning_tokens": 0}}, "provider": "openrouter"}	99890	\N	2026-01-30 13:34:40.645595+00
9	1	-5	usage	LLM usage: openai/gpt-4o-mini	{"model": "openai/gpt-4o-mini", "costUsd": "0.004407", "endpoint": "/v1/chat/completions", "provider": "openrouter", "inputTokens": 0, "outputTokens": 440.75}	99885	\N	2026-01-30 14:42:28.23658+00
10	1	-4	usage	LLM usage: openai/gpt-4o-mini	{"model": "openai/gpt-4o-mini", "costUsd": "0.003805", "endpoint": "/v1/chat/completions", "provider": "openrouter", "inputTokens": 0, "outputTokens": 380.5}	99881	\N	2026-01-30 14:51:57.316331+00
11	1	-2	usage	LLM usage: moonshotai/kimi-k2.5	{"model": "moonshotai/kimi-k2.5", "costUsd": "0.001511", "endpoint": "/v1/chat/completions", "provider": "openrouter", "inputTokens": 0, "outputTokens": 377.75}	99879	\N	2026-01-30 15:10:54.923467+00
12	1	-7	usage	LLM usage: moonshotai/kimi-k2.5	{"model": "moonshotai/kimi-k2.5", "costUsd": "0.007000", "endpoint": "/v1/chat/completions", "provider": "openrouter", "inputTokens": 1044, "outputTokens": 1489}	99872	\N	2026-01-30 15:38:10.119822+00
13	1	-6	usage	LLM usage: openai/o4-mini	{"model": "openai/o4-mini", "costUsd": "0.005716", "endpoint": "/v1/chat/completions", "provider": "openrouter", "inputTokens": 1480, "outputTokens": 1059}	99866	\N	2026-01-30 15:38:21.848888+00
14	1	-7	usage	LLM usage: moonshotai/kimi-k2.5	{"model": "moonshotai/kimi-k2.5", "costUsd": "0.006644", "endpoint": "/v1/chat/completions", "provider": "openrouter", "inputTokens": 2696, "outputTokens": 987}	99859	\N	2026-01-30 15:38:46.237609+00
15	1	-5	usage	LLM usage: openai/o4-mini	{"model": "openai/o4-mini", "costUsd": "0.004592", "endpoint": "/v1/chat/completions", "provider": "openrouter", "inputTokens": 2468, "outputTokens": 531}	99854	\N	2026-01-30 15:38:52.175625+00
16	1	-12	usage	LLM usage: moonshotai/kimi-k2.5	{"model": "moonshotai/kimi-k2.5", "costUsd": "0.011228", "endpoint": "/v1/chat/completions", "provider": "openrouter", "inputTokens": 3740, "outputTokens": 1872}	99842	\N	2026-01-30 15:39:32.24908+00
17	1	-8	usage	LLM usage: openai/o4-mini	{"model": "openai/o4-mini", "costUsd": "0.007392", "endpoint": "/v1/chat/completions", "provider": "openrouter", "inputTokens": 3776, "outputTokens": 904}	99834	\N	2026-01-30 15:39:41.243103+00
18	1	-25	usage	LLM usage: moonshotai/kimi-k2.5	{"model": "moonshotai/kimi-k2.5", "costUsd": "0.024134", "endpoint": "/v1/chat/completions", "provider": "openrouter", "inputTokens": 5518, "outputTokens": 4654}	99809	\N	2026-01-30 15:41:12.612589+00
19	1	-17	usage	LLM usage: moonshotai/kimi-k2.5	{"model": "moonshotai/kimi-k2.5", "costUsd": "0.016750", "endpoint": "/v1/chat/completions", "provider": "openrouter", "inputTokens": 8566, "outputTokens": 2046}	99792	\N	2026-01-30 15:42:51.403465+00
20	1	-11	usage	LLM usage: openai/o4-mini	{"model": "openai/o4-mini", "costUsd": "0.010027", "endpoint": "/v1/chat/completions", "provider": "openrouter", "inputTokens": 6927, "outputTokens": 775}	99781	\N	2026-01-30 15:43:01.293037+00
21	1	-19	usage	LLM usage: moonshotai/kimi-k2.5	{"model": "moonshotai/kimi-k2.5", "costUsd": "0.018573", "endpoint": "/v1/chat/completions", "provider": "openrouter", "inputTokens": 10053, "outputTokens": 2130}	99762	\N	2026-01-30 15:43:50.264559+00
22	1	-11	usage	LLM usage: openai/o4-mini	{"model": "openai/o4-mini", "costUsd": "0.010525", "endpoint": "/v1/chat/completions", "provider": "openrouter", "inputTokens": 8145, "outputTokens": 595}	99751	\N	2026-01-30 15:43:58.761508+00
23	1	-21	usage	LLM usage: moonshotai/kimi-k2.5	{"model": "moonshotai/kimi-k2.5", "costUsd": "0.020418", "endpoint": "/v1/chat/completions", "provider": "openrouter", "inputTokens": 11818, "outputTokens": 2150}	99730	\N	2026-01-30 15:44:51.321853+00
24	1	-13	usage	LLM usage: openai/o4-mini	{"model": "openai/o4-mini", "costUsd": "0.012534", "endpoint": "/v1/chat/completions", "provider": "openrouter", "inputTokens": 9486, "outputTokens": 762}	99717	\N	2026-01-30 15:45:01.10392+00
25	1	-28	usage	LLM usage: moonshotai/kimi-k2.5	{"model": "moonshotai/kimi-k2.5", "costUsd": "0.027004", "endpoint": "/v1/chat/completions", "provider": "openrouter", "inputTokens": 13556, "outputTokens": 3362}	99689	\N	2026-01-30 15:46:16.703506+00
26	1	-6	usage	LLM usage: openai/gpt-4o-mini	{"model": "openai/gpt-4o-mini", "costUsd": "0.005437", "endpoint": "/v1/chat/completions", "provider": "openrouter", "inputTokens": 267, "outputTokens": 477}	99683	\N	2026-01-30 15:49:25.329298+00
27	1	-7	usage	LLM usage: moonshotai/kimi-k2.5	{"model": "moonshotai/kimi-k2.5", "costUsd": "0.006939", "endpoint": "/v1/chat/completions", "provider": "openrouter", "inputTokens": 1179, "outputTokens": 1440}	99676	\N	2026-01-30 15:49:59.168608+00
28	1	-10	usage	LLM usage: openai/gpt-4o-mini	{"model": "openai/gpt-4o-mini", "costUsd": "0.009270", "endpoint": "/v1/chat/completions", "provider": "openrouter", "inputTokens": 1320, "outputTokens": 597}	99666	\N	2026-01-30 15:50:13.421952+00
29	1	-16	usage	LLM usage: moonshotai/kimi-k2.5	{"model": "moonshotai/kimi-k2.5", "costUsd": "0.015188", "endpoint": "/v1/chat/completions", "provider": "openrouter", "inputTokens": 3072, "outputTokens": 3029}	99650	\N	2026-01-30 15:51:10.966947+00
30	1	-20	usage	LLM usage: openai/gpt-4o-mini	{"model": "openai/gpt-4o-mini", "costUsd": "0.019917", "endpoint": "/v1/chat/completions", "provider": "openrouter", "inputTokens": 2563, "outputTokens": 1351}	99630	\N	2026-01-30 15:51:39.854294+00
31	1	-20	usage	LLM usage: moonshotai/kimi-k2.5	{"model": "moonshotai/kimi-k2.5", "costUsd": "0.019750", "endpoint": "/v1/chat/completions", "provider": "openrouter", "inputTokens": 6582, "outputTokens": 3292}	99610	\N	2026-01-30 15:52:53.04718+00
32	1	-16	usage	LLM usage: openai/gpt-4o-mini	{"model": "openai/gpt-4o-mini", "costUsd": "0.015813", "endpoint": "/v1/chat/completions", "provider": "openrouter", "inputTokens": 4349, "outputTokens": 494}	99594	\N	2026-01-30 15:53:03.640074+00
33	1	-9	usage	Translation (EN→TH)	{"model": "openai/chatgpt-4o-latest", "tokens": {"cost": 0.013095, "is_byok": false, "cost_details": {"upstream_inference_cost": 0.013095, "upstream_inference_prompt_cost": 0.00204, "upstream_inference_completions_cost": 0.011055}, "total_tokens": 1145, "prompt_tokens": 408, "completion_tokens": 737, "prompt_tokens_details": {"audio_tokens": 0, "cached_tokens": 0}, "completion_tokens_details": {"audio_tokens": 0, "reasoning_tokens": 0}}, "provider": "openrouter"}	99585	\N	2026-01-30 15:53:27.066288+00
34	1	-9	usage	LLM usage: openai/gpt-4o-mini	{"model": "openai/gpt-4o-mini", "costUsd": "0.008300", "endpoint": "/v1/chat/completions", "provider": "openrouter", "inputTokens": 0, "outputTokens": 830}	99576	\N	2026-01-30 16:20:40.473962+00
35	1	-3	usage	LLM usage: openai/gpt-4o-mini	{"model": "openai/gpt-4o-mini", "costUsd": "0.003000", "endpoint": "/v1/chat/completions", "provider": "openrouter", "inputTokens": 0, "outputTokens": 300}	99573	\N	2026-01-30 17:05:16.159162+00
36	1	-4	usage	LLM usage: openai/gpt-4o-mini	{"model": "openai/gpt-4o-mini", "costUsd": "0.003900", "endpoint": "/v1/chat/completions", "provider": "openrouter", "inputTokens": 0, "outputTokens": 390}	99569	\N	2026-01-30 17:11:30.332782+00
37	1	-10	usage	LLM usage: openai/gpt-4o-mini	{"model": "openai/gpt-4o-mini", "costUsd": "0.009400", "endpoint": "/v1/chat/completions", "provider": "openrouter", "inputTokens": 0, "outputTokens": 940}	99559	\N	2026-01-30 17:34:52.725325+00
38	1	-10	usage	LLM usage: openai/gpt-4o-mini	{"model": "openai/gpt-4o-mini", "costUsd": "0.009900", "endpoint": "/v1/chat/completions", "provider": "openrouter", "inputTokens": 0, "outputTokens": 990}	99549	\N	2026-01-30 17:35:54.07379+00
39	1	-17	usage	LLM usage: openai/gpt-4o-mini	{"model": "openai/gpt-4o-mini", "costUsd": "0.016900", "endpoint": "/v1/chat/completions", "provider": "openrouter", "inputTokens": 0, "outputTokens": 1690}	99532	\N	2026-01-30 17:39:26.246358+00
40	1	-30	usage	LLM usage: moonshotai/kimi-k2.5	{"model": "moonshotai/kimi-k2.5", "costUsd": "0.029600", "endpoint": "/v1/chat/completions", "provider": "openrouter", "inputTokens": 0, "outputTokens": 7400}	99502	\N	2026-01-31 02:11:37.069154+00
41	1	-9	usage	LLM usage: openai/gpt-4o-mini	{"model": "openai/gpt-4o-mini", "costUsd": "0.008500", "endpoint": "/v1/chat/completions", "provider": "openrouter", "inputTokens": 0, "outputTokens": 850}	99493	\N	2026-01-31 06:52:52.15244+00
42	1	-1	usage	Auto Prompt enhancement (CreateImagePrompt skill)	{"model": "google/gemini-3-flash-preview", "skill": "create-image-prompt", "inputTokens": 0, "outputTokens": 0, "hasReferenceImages": false, "referenceImageCount": 0}	99492	\N	2026-01-31 13:01:14.839214+00
43	1	-6	usage	Auto Prompt enhancement (CreateImagePrompt skill)	{"model": "openai/gpt-5.2", "skill": "create-image-prompt", "inputTokens": 243, "outputTokens": 1258, "hasReferenceImages": false, "referenceImageCount": 0}	99486	\N	2026-01-31 13:03:06.6329+00
44	1	-7	usage	Auto Prompt enhancement (CreateImagePrompt skill)	{"model": "openai/gpt-5.2", "skill": "create-image-prompt", "inputTokens": 219, "outputTokens": 1473, "hasReferenceImages": false, "referenceImageCount": 0}	99479	\N	2026-01-31 13:30:21.766356+00
45	1	-10	usage	IMAGE Generation: google/pro-image-to-image	{"model": "google/pro-image-to-image", "provider": "kie_ai", "response_id": "20265af96599d727f64a48ddd5b0f0ef", "llm_cost_usd": 0.01, "request_type": "ImageGenerationRequest", "balance_before": 99479, "use_openrouter": false, "actual_cost_usd": 0.01, "credits_deducted": 10, "estimated_cost_usd": 0.01}	99469	\N	2026-01-31 14:41:45.186238+00
46	1	-10	usage	Image generation: google/pro-image-to-image	{"model": "google/pro-image-to-image", "prompt": "แมวกับหมาวิ่งไล่กันในห้องนั่งเล่น มีเด็กยืนมองอยู่", "skillId": "image_prompt_engineer"}	99459	\N	2026-01-31 14:41:45.255504+00
47	1	-3	usage	Auto Prompt enhancement (CreateImagePrompt skill)	{"model": "openai/gpt-5.2", "skill": "create-image-prompt", "inputTokens": 228, "outputTokens": 590, "hasReferenceImages": false, "referenceImageCount": 0}	99456	\N	2026-01-31 14:43:47.253467+00
48	1	-2	usage	Auto Prompt enhancement (CreateImagePrompt skill)	{"model": "openai/gpt-5.2", "skill": "create-image-prompt", "inputTokens": 271, "outputTokens": 274, "hasReferenceImages": false, "referenceImageCount": 0}	99454	\N	2026-01-31 14:46:41.551418+00
49	1	-10	usage	IMAGE Generation: google/pro-image-to-image	{"model": "google/pro-image-to-image", "provider": "kie_ai", "response_id": "8dc7e2b038100647c6e197e1ecaa87f5", "llm_cost_usd": 0.01, "request_type": "ImageGenerationRequest", "balance_before": 99454, "use_openrouter": false, "actual_cost_usd": 0.01, "credits_deducted": 10, "estimated_cost_usd": 0.01}	99444	\N	2026-01-31 14:47:43.595682+00
50	1	-10	usage	Image generation: google/pro-image-to-image	{"model": "google/pro-image-to-image", "prompt": "A photorealistic, vertical 9:16 scene of a fluffy white long‑haired cat and a large long‑haired dog ", "skillId": "image_prompt_engineer"}	99434	\N	2026-01-31 14:47:43.76882+00
51	1	-2	usage	Auto Prompt enhancement (CreateImagePrompt skill)	{"model": "openai/gpt-5.2", "skill": "create-image-prompt", "inputTokens": 279, "outputTokens": 334, "hasReferenceImages": false, "referenceImageCount": 0}	99432	\N	2026-01-31 15:46:39.017875+00
52	1	-10	usage	IMAGE Generation: google/pro-image-to-image	{"model": "google/pro-image-to-image", "provider": "kie_ai", "response_id": "74738a8d3dc2880751b21c90de19f1c6", "llm_cost_usd": 0.01, "request_type": "ImageGenerationRequest", "balance_before": 99432, "use_openrouter": false, "actual_cost_usd": 0.01, "credits_deducted": 10, "estimated_cost_usd": 0.01}	99422	\N	2026-01-31 15:47:18.267112+00
53	1	-2	usage	Auto Prompt enhancement (CreateImagePrompt skill)	{"model": "openai/gpt-5.2", "skill": "create-image-prompt", "inputTokens": 281, "outputTokens": 337, "hasReferenceImages": false, "referenceImageCount": 0}	99420	\N	2026-01-31 16:43:37.970223+00
54	1	-40	usage	IMAGE Generation: google/pro-image-to-image	{"model": "google/pro-image-to-image", "provider": "kie_ai", "response_id": "e7c4aeabe8c3a5240a9ea983a4131d51", "llm_cost_usd": 0.04, "request_type": "ImageGenerationRequest", "balance_before": 99420, "use_openrouter": false, "actual_cost_usd": 0.04, "credits_deducted": 40, "estimated_cost_usd": 0.04}	99380	\N	2026-01-31 16:44:15.33622+00
55	1	-2	usage	Auto Prompt enhancement (CreateImagePrompt skill)	{"model": "openai/gpt-5.2", "skill": "create-image-prompt", "inputTokens": 281, "outputTokens": 338, "hasReferenceImages": false, "referenceImageCount": 0}	99378	\N	2026-01-31 16:51:28.16943+00
56	1	-40	usage	IMAGE Generation: google/pro-image-to-image	{"model": "google/pro-image-to-image", "provider": "kie_ai", "response_id": "5bc636cc6224482e4305d6d72e92a309", "llm_cost_usd": 0.04, "request_type": "ImageGenerationRequest", "balance_before": 99378, "use_openrouter": false, "actual_cost_usd": 0.04, "credits_deducted": 40, "estimated_cost_usd": 0.04}	99338	\N	2026-01-31 16:52:05.9249+00
57	1	-90	usage	IMAGE Generation: google/pro-image-to-image	{"model": "google/pro-image-to-image", "provider": "kie_ai", "response_id": "f739fb585132dc8396f64f342a3b87a7", "llm_cost_usd": 0.09, "request_type": "ImageGenerationRequest", "balance_before": 99338, "use_openrouter": false, "actual_cost_usd": 0.09, "credits_deducted": 90, "estimated_cost_usd": 0.09}	99248	\N	2026-01-31 17:16:42.208295+00
58	1	-2	usage	Auto Prompt enhancement (CreateImagePrompt skill)	{"model": "openai/gpt-5.2", "skill": "create-image-prompt", "inputTokens": 258, "outputTokens": 248, "hasReferenceImages": false, "referenceImageCount": 0}	99246	\N	2026-01-31 17:35:27.587203+00
59	1	-120	usage	IMAGE Generation: google/pro-image-to-image	{"model": "google/pro-image-to-image", "provider": "kie_ai", "response_id": "42e149ad748e697de170abe12bc06cd7", "llm_cost_usd": 0.12, "request_type": "ImageGenerationRequest", "balance_before": 99246, "use_openrouter": false, "actual_cost_usd": 0.12, "credits_deducted": 120, "estimated_cost_usd": 0.12}	99126	\N	2026-01-31 17:36:50.93034+00
60	1	-120	usage	IMAGE Generation: google/pro-image-to-image	{"model": "google/pro-image-to-image", "provider": "kie_ai", "response_id": "658b494f997f4566236922f7bbf5cf76", "llm_cost_usd": 0.12, "request_type": "ImageGenerationRequest", "balance_before": 99126, "use_openrouter": false, "actual_cost_usd": 0.12, "credits_deducted": 120, "estimated_cost_usd": 0.12}	99006	\N	2026-01-31 17:44:02.792754+00
61	1	-120	usage	IMAGE Generation: google/pro-image-to-image	{"model": "google/pro-image-to-image", "provider": "kie_ai", "response_id": "b71efe3bf400f740809237c22641e100", "llm_cost_usd": 0.12, "request_type": "ImageGenerationRequest", "balance_before": 99006, "use_openrouter": false, "actual_cost_usd": 0.12, "credits_deducted": 120, "estimated_cost_usd": 0.12}	98886	\N	2026-01-31 17:47:57.515345+00
62	1	-4	usage	Chat Alert: ค้นหาข่าวเกี่ยวกับเทคโนโลยี AI ใหม่ ๆ ทุกวันตอนแปดโมงเช้า	{"type": "chat-alert", "model": "openai/gpt-4o-mini", "scheduleId": 1, "inputTokens": 56, "outputTokens": 305}	98882	\N	2026-02-01 16:00:07.356732+00
63	1	-14	usage	LLM usage: openai/gpt-4o-mini	{"model": "openai/gpt-4o-mini", "costUsd": "0.014000", "endpoint": "/v1/chat/completions", "provider": "openrouter", "inputTokens": 0, "outputTokens": 1400}	98868	\N	2026-02-02 03:13:43.284259+00
64	1	-5	usage	LLM usage: openai/gpt-4o-mini	{"model": "openai/gpt-4o-mini", "costUsd": "0.004700", "endpoint": "/v1/chat/completions", "provider": "openrouter", "inputTokens": 0, "outputTokens": 470}	98863	\N	2026-02-02 03:30:14.83253+00
65	1	-4	usage	LLM usage: openai/gpt-4o-mini	{"model": "openai/gpt-4o-mini", "costUsd": "0.003300", "endpoint": "/v1/chat/completions", "provider": "openrouter", "inputTokens": 0, "outputTokens": 330}	98859	\N	2026-02-02 03:34:10.730013+00
66	1	-4	usage	LLM usage: openai/gpt-5.2-chat	{"model": "openai/gpt-5.2-chat", "costUsd": "0.003240", "endpoint": "/v1/chat/completions", "provider": "openrouter", "inputTokens": 0, "outputTokens": 810}	98855	\N	2026-02-02 03:35:06.32675+00
67	1	-6	usage	LLM usage: openai/gpt-5.2-chat	{"model": "openai/gpt-5.2-chat", "costUsd": "0.005200", "endpoint": "/v1/chat/completions", "provider": "openrouter", "inputTokens": 0, "outputTokens": 1300}	98849	\N	2026-02-02 03:35:45.073856+00
68	1	-5	usage	LLM usage: openai/gpt-5.2-chat	{"model": "openai/gpt-5.2-chat", "costUsd": "0.004240", "endpoint": "/v1/chat/completions", "provider": "openrouter", "inputTokens": 0, "outputTokens": 1060}	98844	\N	2026-02-02 03:35:59.785476+00
69	1	-6	usage	LLM usage: openai/gpt-4o-mini	{"model": "openai/gpt-4o-mini", "costUsd": "0.005700", "endpoint": "/v1/chat/completions", "provider": "openrouter", "inputTokens": 0, "outputTokens": 570}	98838	\N	2026-02-02 03:51:54.215427+00
70	1	-5	usage	LLM usage: openai/gpt-4o-mini	{"model": "openai/gpt-4o-mini", "costUsd": "0.004900", "endpoint": "/v1/chat/completions", "provider": "openrouter", "inputTokens": 0, "outputTokens": 490}	98833	\N	2026-02-02 03:52:12.446114+00
71	1	-7	usage	LLM usage: openai/gpt-5.2-chat	{"model": "openai/gpt-5.2-chat", "costUsd": "0.006640", "endpoint": "/v1/chat/completions", "provider": "openrouter", "inputTokens": 0, "outputTokens": 1660}	98826	\N	2026-02-02 03:52:59.017162+00
72	1	-6	usage	LLM usage: openai/gpt-5.2-chat	{"model": "openai/gpt-5.2-chat", "costUsd": "0.005866", "endpoint": "/v1/chat/completions", "provider": "openrouter", "inputTokens": 896, "outputTokens": 307}	98820	\N	2026-02-02 03:59:27.59761+00
73	1	-4	usage	LLM usage: openai/o4-mini	{"model": "openai/o4-mini", "costUsd": "0.003441", "endpoint": "/v1/chat/completions", "provider": "openrouter", "inputTokens": 1224, "outputTokens": 476}	98816	\N	2026-02-02 04:02:34.255829+00
74	1	-100	usage	IMAGE Generation: google/imagen4-ultra	{"model": "google/imagen4-ultra", "provider": "kie_ai", "response_id": "094f481f940de2ecc9c62974d4a5a665", "llm_cost_usd": 0.1, "request_type": "ImageGenerationRequest", "balance_before": 98816, "use_openrouter": false, "actual_cost_usd": 0.1, "credits_deducted": 100, "estimated_cost_usd": 0.1}	98716	\N	2026-02-02 07:21:26.381963+00
75	1	-1	usage	LLM usage: openai/gpt-4o-mini	{"model": "openai/gpt-4o-mini", "costUsd": "0.000147", "endpoint": "/v1/chat/completions", "provider": "openrouter", "inputTokens": 655, "outputTokens": 82}	98715	\N	2026-02-02 08:39:06.057574+00
76	1	-1	usage	LLM usage: openai/gpt-4o-mini	{"model": "openai/gpt-4o-mini", "costUsd": "0.000165", "endpoint": "/v1/chat/completions", "provider": "openrouter", "inputTokens": 763, "outputTokens": 85}	98714	\N	2026-02-02 09:02:32.564481+00
77	1	-100	usage	IMAGE Generation: google/imagen4-ultra	{"model": "google/imagen4-ultra", "provider": "kie_ai", "response_id": "ed106cd99bb06f35bd3c5e7ef136f217", "llm_cost_usd": 0.1, "request_type": "ImageGenerationRequest", "balance_before": 98714, "use_openrouter": false, "actual_cost_usd": 0.1, "credits_deducted": 100, "estimated_cost_usd": 0.1}	98614	\N	2026-02-02 09:03:38.789078+00
78	1	-1	usage	LLM usage: openai/gpt-4o-mini	{"model": "openai/gpt-4o-mini", "costUsd": "0.000127", "endpoint": "/v1/chat/completions", "provider": "openrouter", "inputTokens": 296, "outputTokens": 138}	98613	\N	2026-02-02 09:10:06.58035+00
79	1	-1	usage	LLM usage: openai/gpt-4o-mini	{"model": "openai/gpt-4o-mini", "costUsd": "0.000223", "endpoint": "/v1/chat/completions", "provider": "openrouter", "inputTokens": 1089, "outputTokens": 99}	98612	\N	2026-02-02 09:12:53.368596+00
80	1	-1	usage	LLM usage: openai/gpt-4o-mini	{"model": "openai/gpt-4o-mini", "costUsd": "0.000168", "endpoint": "/v1/chat/completions", "provider": "openrouter", "inputTokens": 1226, "outputTokens": 101}	98611	\N	2026-02-02 09:14:54.412992+00
81	1	-1	usage	LLM usage: openai/gpt-4o-mini	{"model": "openai/gpt-4o-mini", "costUsd": "0.000262", "endpoint": "/v1/chat/completions", "provider": "openrouter", "inputTokens": 1366, "outputTokens": 96}	98610	\N	2026-02-02 10:03:27.177608+00
82	1	-1	usage	LLM usage: openai/gpt-4o-mini	{"model": "openai/gpt-4o-mini", "costUsd": "0.000287", "endpoint": "/v1/chat/completions", "provider": "openrouter", "inputTokens": 1502, "outputTokens": 102}	98609	\N	2026-02-02 10:09:47.892113+00
83	1	-1	usage	LLM usage: openai/gpt-4o-mini	{"model": "openai/gpt-4o-mini", "costUsd": "0.000315", "endpoint": "/v1/chat/completions", "provider": "openrouter", "inputTokens": 1662, "outputTokens": 110}	98608	\N	2026-02-02 12:48:36.895054+00
84	1	-90	usage	IMAGE Generation: google/pro-image-to-image	{"model": "google/pro-image-to-image", "provider": "kie_ai", "response_id": "78d74c3c73749bb6d1cd8a07efac3cae", "llm_cost_usd": 0.09, "request_type": "ImageGenerationRequest", "balance_before": 98608, "use_openrouter": false, "actual_cost_usd": 0.09, "credits_deducted": 90, "estimated_cost_usd": 0.09}	98518	\N	2026-02-02 12:50:07.342629+00
85	1	-1	usage	LLM usage: openai/gpt-4o-mini	{"model": "openai/gpt-4o-mini", "costUsd": "0.000279", "endpoint": "/v1/chat/completions", "provider": "openrouter", "inputTokens": 1266, "outputTokens": 148}	98517	\N	2026-02-02 12:53:32.909868+00
86	1	-1	usage	LLM usage: openai/gpt-4o-mini	{"model": "openai/gpt-4o-mini", "costUsd": "0.000227", "endpoint": "/v1/chat/completions", "provider": "openrouter", "inputTokens": 1470, "outputTokens": 154}	98516	\N	2026-02-02 12:54:36.697247+00
\.


--
-- Data for Name: custom_skill_prompts; Type: TABLE DATA; Schema: public; Owner: smartspec
--

COPY public.custom_skill_prompts (id, user_id, skill_id, custom_system_prompt, template_variables, is_active, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: device_fingerprints; Type: TABLE DATA; Schema: public; Owner: smartspec
--

COPY public.device_fingerprints (id, "userId", "fingerprintHash", "firstSeenAt", "lastSeenAt", "seenCount") FROM stdin;
\.


--
-- Data for Name: direct_messages; Type: TABLE DATA; Schema: public; Owner: smartspec
--

COPY public.direct_messages (id, "senderId", "receiverId", content, "isUrgent", "isRead", "createdAt") FROM stdin;
\.


--
-- Data for Name: email_verification_tokens; Type: TABLE DATA; Schema: public; Owner: smartspec
--

COPY public.email_verification_tokens (id, "userId", email, code, "expiresAt", "usedAt", "createdAt", channel) FROM stdin;
1	22	testuser3@test.com	525815	2026-02-01 02:01:43.917+00	2026-02-01 01:46:53.655+00	2026-02-01 01:46:43.918414+00	email
2	22	testuser3@test.com	864584	2026-02-01 02:17:04.908+00	2026-02-01 02:02:18.879+00	2026-02-01 02:02:04.914042+00	email
3	23	pruksacharttk@gmail.com	877858	2026-02-01 02:22:13.289+00	\N	2026-02-01 02:07:13.289936+00	email
4	23	pruksacharttk@gmail.com	446802	2026-02-01 02:56:27.821+00	2026-02-01 02:41:51.917+00	2026-02-01 02:41:27.822319+00	email
\.


--
-- Data for Name: embedding_jobs; Type: TABLE DATA; Schema: public; Owner: smartspec
--

COPY public.embedding_jobs (id, collection_id, status, total_documents, processed_documents, failed_documents, embedding_model, batch_size, error_message, errors, created_at, started_at, completed_at) FROM stdin;
\.


--
-- Data for Name: entity_memories; Type: TABLE DATA; Schema: public; Owner: smartspec
--

COPY public.entity_memories (id, "userId", "entityType", "entityName", facts, "sourceConversationId", confidence, "lastAccessedAt", "reinforcementCount", "createdAt", "updatedAt", importance, source, "projectId") FROM stdin;
2	1	preference	คุยกันเรื่องอะไร	["Authentication ใน Context7/Framework7 – คุณขอแนวทางในการสร้างระบบล็อกอินและการปกป้องเส้นทางในแอปพลิเคชัน Framework7\\nการสร้าง Skill ใน Claude – คุณถามเกี่ยวกับการสร้าง Skill และวิธีการค้นหา Skill ที่มีคนพัฒนาไว้แล้วใน Claude"]	\N	0.80	2026-01-30 17:05:09.089+00	1	2026-01-30 10:14:53.120362+00	2026-01-30 10:14:53.120362+00	5	manual	Project001
1	1	project	Project001 — context carried over	["Previous conversation summaries:","Key points from 2 messages:","USER: Coding AuthenTicaition use Context7","Recent messages:","ASSISTANT: It seems like you're asking for help with authentication using Context7, which is likely in the context of the framework Framework7. Framework7 is a popular JavaScript framework for building mobile applications.","Here’s a basic approach to implementing authentication in a Framework7 (Context7) application. This example will assume that you're building a simple app that checks user credentials against a hypothetical API.","### Step 1: Set Up Your Project","Make sure you have a Framework7 project se","USER: ค้นหา Agent Skill ใน Context7","ASSISTANT: การค้นหา \\"Agent Skill\\" ใน Context7 (ซึ่งมักหมายถึง Framework7) อาจหมายถึงการสร้างชุดทักษะหรือฟังก์ชั่นที่ใช้สำหรับเอเจนท์ (Agents) ในแอปพลิเคชันที่สร้างขึ้น แต่ไม่แน่ใจว่านี่คือสิ่งที่คุณต้องการจริง ๆ หรือไม่ หากคำถามของคุณเกี่ยวข้องกับแนวคิดหรือฟีเจอร์เฉพาะในซอฟต์แวร์หรือแพลตฟอร์มใด ๆ กรุณาให้รายละเอียดเพิ่มเติม","### แนวทางการสร้าง Agent Skill ใน Framework7","1. **สร้างแอปพลิเคชันใหม่**:","สร้างแอปพลิเคชันใหม่ด้วย Framework7 หากคุณยังไม่มี:","```bash","framework7 create","```","2. **ตั้ง","USER: การสร้าง skill ใน claude ทำอย่างไรได้บ้าง หรือ หา skill ที่มีคนพัฒนาไว้แล้วที่ไหนดี"]	\N	0.80	2026-01-30 16:20:37.583+00	2	2026-01-30 09:59:09.979179+00	2026-01-30 10:11:57.507+00	8	auto	Project001
3	1	project	Project 002 — context carried over	["Recent messages:","ASSISTANT: [Model B – Round 3]","Here are further provocations and niche tactics to round out the playbook:","1. Optimize Thai Market Dominance","Geo-Targeted Pricing: Offer tiered “SME vs Enterprise” bundles with local payment gateways (PromptPay, bank transfers).","Embedded Local Compliance: Market the Thai-specific code library as a “must-have” add-on—sell it as a paid module to boost ARPU.","Peer-to-Peer Workshops: Facilitate in-person “Spec Hack Days” at coworking spaces (e.g., HUBBA) to seed gras","ASSISTANT: ## Brainstorm Summary","การอภิปรายหลายรอบระหว่างแนวทางการตลาดแบบดั้งเดิม (Model A) กับแนวทางเฉพาะกลุ่มและการบริหารความเสี่ยง (Model B) สรุปเป็น **กลยุทธ์เดียวที่เน้น \\"Thai-First Ecosystem\\"** โดยใช้ LINE เป็นช่องทางหลัก สร้างคู่แข่งต่อต่างชาติผ่านฐานข้อมูลกฎหมายไทย (DB/มยผ) ที่อัพเดตแบบ Real-time และขยายจากกลยุทธ์ \\"Shadow IT\\" (Bottom-Up) สู่ Enterprise (Top-Down) ผ่านระบบ Reverse Trial ที่รักษาความสมบูรณ์ของราคา","--","### Key Findings","**1. จุดแข็งหลัก (Unfair Advantage)**","**Thai Building Code M","USER: สรุปแล้ว หลุดออกนอกกรอบ วิธีการโปรโมท ระบบหรือไม่","ASSISTANT: **ใช่ บางส่วนหลุดออกนอกกรอบ \\"การโปรโมท\\" (Promotion) ไปสู่ \\"กลยุทธ์ผลิตภัณฑ์/ธุรกิจ\\"**","ที่หลุดกรอบ:","**Federated Learning / Thai NLP** = สถาปัตยกรรมระบบ (Product Development)","**Reverse Trial / Pricing** = กลยุทธ์ราคา (Pricing Strategy)","**API Ecosystem / White-label** = แผนพัฒนาผลิตภัณฑ์ (Product Roadmap)","**Mobile/Offline App** = ฟีเจอร์ (Feature Development)"]	\N	0.80	2026-01-31 02:11:04.834+00	2	2026-01-30 16:09:13.246248+00	2026-01-30 17:04:44.118+00	8	auto	Project 002
\.


--
-- Data for Name: executions; Type: TABLE DATA; Schema: public; Owner: smartspec
--

COPY public.executions (id, workflow_id, status, steps, current_step, total_steps, files_created, files_modified, files_deleted, outputs, tokens_used, cost, duration_seconds, error, created_at, updated_at, started_at, completed_at) FROM stdin;
\.


--
-- Data for Name: gallery_items; Type: TABLE DATA; Schema: public; Owner: smartspec
--

COPY public.gallery_items (id, "tenantId", type, title, description, "aspectRatio", "fileKey", "fileUrl", "thumbnailKey", "thumbnailUrl", duration, "demoUrl", tags, model, views, likes, downloads, "isPublished", "isFeatured", "authorId", "authorName", "authorAvatar", "sortOrder", "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: invoice_config; Type: TABLE DATA; Schema: public; Owner: smartspec
--

COPY public.invoice_config (id, "tenantId", "companyName", "addressLine1", "addressLine2", city, state, "postalCode", country, "taxId", email, phone, website, "logoUrl", "footerText", "termsText", "bankDetails", "customFields", "isActive", "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: llm_providers; Type: TABLE DATA; Schema: public; Owner: smartspec
--

COPY public.llm_providers (id, "providerName", "displayName", description, "baseUrl", "apiKeyEncrypted", "hasApiKey", "defaultModel", "availableModels", "configJson", "isEnabled", "sortOrder", "createdAt", "updatedAt") FROM stdin;
1	openrouter	OpenRouter	Access 420+ models with unified API (Primary gateway with fallback)	https://openrouter.ai/api/v1	f1d423cab8e382ca1b73c926:285b71a5d0fa8244b7ad55a2db5dede8:975379fdb043bdf15c29642434634073ce69f84cc32c759ddb0103ceaff6e7cea9f4b610ad4485f825ccafe364d80168d78b430aeeb4635ce876b646c81c1131d4fecb01dca8f9e3cf	t	openai/gpt-4o-mini	[{"id":"ai21/jamba-large-1.7","name":"AI21: Jamba Large 1.7","contextLength":256000,"pricing":{"input":2,"output":8}},{"id":"ai21/jamba-mini-1.7","name":"AI21: Jamba Mini 1.7","contextLength":256000,"pricing":{"input":0.19999999999999998,"output":0.39999999999999997}},{"id":"aion-labs/aion-1.0","name":"AionLabs: Aion-1.0","contextLength":131072,"pricing":{"input":4,"output":8}},{"id":"aion-labs/aion-1.0-mini","name":"AionLabs: Aion-1.0-Mini","contextLength":131072,"pricing":{"input":0.7,"output":1.4}},{"id":"aion-labs/aion-rp-llama-3.1-8b","name":"AionLabs: Aion-RP 1.0 (8B)","contextLength":32768,"pricing":{"input":0.7999999999999999,"output":1.5999999999999999}},{"id":"alfredpros/codellama-7b-instruct-solidity","name":"AlfredPros: CodeLLaMa 7B Instruct Solidity","contextLength":4096,"pricing":{"input":0.7999999999999999,"output":1.2}},{"id":"allenai/molmo-2-8b:free","name":"AllenAI: Molmo2 8B (free)","contextLength":36864,"pricing":{"input":0,"output":0}},{"id":"allenai/olmo-2-0325-32b-instruct","name":"AllenAI: Olmo 2 32B Instruct","contextLength":128000,"pricing":{"input":0.049999999999999996,"output":0.19999999999999998}},{"id":"allenai/olmo-3-32b-think","name":"AllenAI: Olmo 3 32B Think","contextLength":65536,"pricing":{"input":0.15,"output":0.5}},{"id":"allenai/olmo-3-7b-instruct","name":"AllenAI: Olmo 3 7B Instruct","contextLength":65536,"pricing":{"input":0.09999999999999999,"output":0.19999999999999998}},{"id":"allenai/olmo-3-7b-think","name":"AllenAI: Olmo 3 7B Think","contextLength":65536,"pricing":{"input":0.12,"output":0.19999999999999998}},{"id":"allenai/olmo-3.1-32b-instruct","name":"AllenAI: Olmo 3.1 32B Instruct","contextLength":65536,"pricing":{"input":0.19999999999999998,"output":0.6}},{"id":"allenai/olmo-3.1-32b-think","name":"AllenAI: Olmo 3.1 32B Think","contextLength":65536,"pricing":{"input":0.15,"output":0.5}},{"id":"amazon/nova-2-lite-v1","name":"Amazon: Nova 2 Lite","contextLength":1000000,"pricing":{"input":0.3,"output":2.5}},{"id":"amazon/nova-lite-v1","name":"Amazon: Nova Lite 1.0","contextLength":300000,"pricing":{"input":0.06,"output":0.24}},{"id":"amazon/nova-micro-v1","name":"Amazon: Nova Micro 1.0","contextLength":128000,"pricing":{"input":0.035,"output":0.14}},{"id":"amazon/nova-premier-v1","name":"Amazon: Nova Premier 1.0","contextLength":1000000,"pricing":{"input":2.5,"output":12.5}},{"id":"amazon/nova-pro-v1","name":"Amazon: Nova Pro 1.0","contextLength":300000,"pricing":{"input":0.7999999999999999,"output":3.1999999999999997}},{"id":"anthropic/claude-3-haiku","name":"Anthropic: Claude 3 Haiku","contextLength":200000,"pricing":{"input":0.25,"output":1.25}},{"id":"anthropic/claude-3.5-haiku","name":"Anthropic: Claude 3.5 Haiku","contextLength":200000,"pricing":{"input":0.7999999999999999,"output":4}},{"id":"anthropic/claude-3.5-sonnet","name":"Anthropic: Claude 3.5 Sonnet","contextLength":200000,"pricing":{"input":6,"output":30}},{"id":"anthropic/claude-3.7-sonnet","name":"Anthropic: Claude 3.7 Sonnet","contextLength":200000,"pricing":{"input":3,"output":15}},{"id":"anthropic/claude-3.7-sonnet:thinking","name":"Anthropic: Claude 3.7 Sonnet (thinking)","contextLength":200000,"pricing":{"input":3,"output":15}},{"id":"anthropic/claude-haiku-4.5","name":"Anthropic: Claude Haiku 4.5","contextLength":200000,"pricing":{"input":1,"output":5}},{"id":"anthropic/claude-opus-4","name":"Anthropic: Claude Opus 4","contextLength":200000,"pricing":{"input":15,"output":75}},{"id":"anthropic/claude-opus-4.1","name":"Anthropic: Claude Opus 4.1","contextLength":200000,"pricing":{"input":15,"output":75}},{"id":"anthropic/claude-opus-4.5","name":"Anthropic: Claude Opus 4.5","contextLength":200000,"pricing":{"input":5,"output":25}},{"id":"anthropic/claude-sonnet-4","name":"Anthropic: Claude Sonnet 4","contextLength":1000000,"pricing":{"input":3,"output":15}},{"id":"anthropic/claude-sonnet-4.5","name":"Anthropic: Claude Sonnet 4.5","contextLength":1000000,"pricing":{"input":3,"output":15}},{"id":"arcee-ai/coder-large","name":"Arcee AI: Coder Large","contextLength":32768,"pricing":{"input":0.5,"output":0.7999999999999999}},{"id":"arcee-ai/maestro-reasoning","name":"Arcee AI: Maestro Reasoning","contextLength":131072,"pricing":{"input":0.8999999999999999,"output":3.3000000000000003}},{"id":"arcee-ai/spotlight","name":"Arcee AI: Spotlight","contextLength":131072,"pricing":{"input":0.18,"output":0.18}},{"id":"arcee-ai/trinity-large-preview:free","name":"Arcee AI: Trinity Large Preview (free)","contextLength":131000,"pricing":{"input":0,"output":0}},{"id":"arcee-ai/trinity-mini","name":"Arcee AI: Trinity Mini","contextLength":131072,"pricing":{"input":0.045,"output":0.15}},{"id":"arcee-ai/trinity-mini:free","name":"Arcee AI: Trinity Mini (free)","contextLength":131072,"pricing":{"input":0,"output":0}},{"id":"arcee-ai/virtuoso-large","name":"Arcee AI: Virtuoso Large","contextLength":131072,"pricing":{"input":0.75,"output":1.2}},{"id":"openrouter/auto","name":"Auto Router","contextLength":2000000,"pricing":{"input":-1000000,"output":-1000000}},{"id":"baidu/ernie-4.5-21b-a3b","name":"Baidu: ERNIE 4.5 21B A3B","contextLength":120000,"pricing":{"input":0.07,"output":0.28}},{"id":"baidu/ernie-4.5-21b-a3b-thinking","name":"Baidu: ERNIE 4.5 21B A3B Thinking","contextLength":131072,"pricing":{"input":0.07,"output":0.28}},{"id":"baidu/ernie-4.5-300b-a47b","name":"Baidu: ERNIE 4.5 300B A47B ","contextLength":123000,"pricing":{"input":0.28,"output":1.1}},{"id":"baidu/ernie-4.5-vl-28b-a3b","name":"Baidu: ERNIE 4.5 VL 28B A3B","contextLength":30000,"pricing":{"input":0.14,"output":0.56}},{"id":"baidu/ernie-4.5-vl-424b-a47b","name":"Baidu: ERNIE 4.5 VL 424B A47B ","contextLength":123000,"pricing":{"input":0.42,"output":1.25}},{"id":"openrouter/bodybuilder","name":"Body Builder (beta)","contextLength":128000,"pricing":{"input":-1000000,"output":-1000000}},{"id":"bytedance-seed/seed-1.6","name":"ByteDance Seed: Seed 1.6","contextLength":262144,"pricing":{"input":0.25,"output":2}},{"id":"bytedance-seed/seed-1.6-flash","name":"ByteDance Seed: Seed 1.6 Flash","contextLength":262144,"pricing":{"input":0.075,"output":0.3}},{"id":"bytedance/ui-tars-1.5-7b","name":"ByteDance: UI-TARS 7B ","contextLength":128000,"pricing":{"input":0.09999999999999999,"output":0.19999999999999998}},{"id":"deepcogito/cogito-v2-preview-llama-109b-moe","name":"Cogito V2 Preview Llama 109B","contextLength":32767,"pricing":{"input":0.18,"output":0.59}},{"id":"cohere/command-a","name":"Cohere: Command A","contextLength":256000,"pricing":{"input":2.5,"output":10}},{"id":"cohere/command-r-08-2024","name":"Cohere: Command R (08-2024)","contextLength":128000,"pricing":{"input":0.15,"output":0.6}},{"id":"cohere/command-r-plus-08-2024","name":"Cohere: Command R+ (08-2024)","contextLength":128000,"pricing":{"input":2.5,"output":10}},{"id":"cohere/command-r7b-12-2024","name":"Cohere: Command R7B (12-2024)","contextLength":128000,"pricing":{"input":0.0375,"output":0.15}},{"id":"deepcogito/cogito-v2-preview-llama-405b","name":"Deep Cogito: Cogito V2 Preview Llama 405B","contextLength":32768,"pricing":{"input":3.5,"output":3.5}},{"id":"deepcogito/cogito-v2-preview-llama-70b","name":"Deep Cogito: Cogito V2 Preview Llama 70B","contextLength":32768,"pricing":{"input":0.88,"output":0.88}},{"id":"deepcogito/cogito-v2.1-671b","name":"Deep Cogito: Cogito v2.1 671B","contextLength":128000,"pricing":{"input":1.25,"output":1.25}},{"id":"deepseek/deepseek-chat","name":"DeepSeek: DeepSeek V3","contextLength":163840,"pricing":{"input":0.3,"output":1.2}},{"id":"deepseek/deepseek-chat-v3-0324","name":"DeepSeek: DeepSeek V3 0324","contextLength":163840,"pricing":{"input":0.19,"output":0.87}},{"id":"deepseek/deepseek-chat-v3.1","name":"DeepSeek: DeepSeek V3.1","contextLength":32768,"pricing":{"input":0.15,"output":0.75}},{"id":"deepseek/deepseek-v3.1-terminus","name":"DeepSeek: DeepSeek V3.1 Terminus","contextLength":163840,"pricing":{"input":0.21,"output":0.7899999999999999}},{"id":"deepseek/deepseek-v3.1-terminus:exacto","name":"DeepSeek: DeepSeek V3.1 Terminus (exacto)","contextLength":163840,"pricing":{"input":0.21,"output":0.7899999999999999}},{"id":"deepseek/deepseek-v3.2","name":"DeepSeek: DeepSeek V3.2","contextLength":163840,"pricing":{"input":0.25,"output":0.38}},{"id":"deepseek/deepseek-v3.2-exp","name":"DeepSeek: DeepSeek V3.2 Exp","contextLength":163840,"pricing":{"input":0.21,"output":0.32}},{"id":"deepseek/deepseek-v3.2-speciale","name":"DeepSeek: DeepSeek V3.2 Speciale","contextLength":163840,"pricing":{"input":0.27,"output":0.41}},{"id":"deepseek/deepseek-r1","name":"DeepSeek: R1","contextLength":64000,"pricing":{"input":0.7,"output":2.5}},{"id":"deepseek/deepseek-r1-0528","name":"DeepSeek: R1 0528","contextLength":163840,"pricing":{"input":0.39999999999999997,"output":1.75}},{"id":"deepseek/deepseek-r1-0528:free","name":"DeepSeek: R1 0528 (free)","contextLength":163840,"pricing":{"input":0,"output":0}},{"id":"deepseek/deepseek-r1-distill-llama-70b","name":"DeepSeek: R1 Distill Llama 70B","contextLength":131072,"pricing":{"input":0.03,"output":0.11}},{"id":"deepseek/deepseek-r1-distill-qwen-32b","name":"DeepSeek: R1 Distill Qwen 32B","contextLength":32768,"pricing":{"input":0.29,"output":0.29}},{"id":"eleutherai/llemma_7b","name":"EleutherAI: Llemma 7b","contextLength":4096,"pricing":{"input":0.7999999999999999,"output":1.2}},{"id":"essentialai/rnj-1-instruct","name":"EssentialAI: Rnj 1 Instruct","contextLength":32768,"pricing":{"input":0.15,"output":0.15}},{"id":"alpindale/goliath-120b","name":"Goliath 120B","contextLength":6144,"pricing":{"input":3.75,"output":7.5}},{"id":"google/gemini-2.0-flash-001","name":"Google: Gemini 2.0 Flash","contextLength":1048576,"pricing":{"input":0.09999999999999999,"output":0.39999999999999997}},{"id":"google/gemini-2.0-flash-exp:free","name":"Google: Gemini 2.0 Flash Experimental (free)","contextLength":1048576,"pricing":{"input":0,"output":0}},{"id":"google/gemini-2.0-flash-lite-001","name":"Google: Gemini 2.0 Flash Lite","contextLength":1048576,"pricing":{"input":0.075,"output":0.3}},{"id":"google/gemini-2.5-flash","name":"Google: Gemini 2.5 Flash","contextLength":1048576,"pricing":{"input":0.3,"output":2.5}},{"id":"google/gemini-2.5-flash-image","name":"Google: Gemini 2.5 Flash Image (Nano Banana)","contextLength":32768,"pricing":{"input":0.3,"output":2.5}},{"id":"google/gemini-2.5-flash-lite","name":"Google: Gemini 2.5 Flash Lite","contextLength":1048576,"pricing":{"input":0.09999999999999999,"output":0.39999999999999997}},{"id":"google/gemini-2.5-flash-lite-preview-09-2025","name":"Google: Gemini 2.5 Flash Lite Preview 09-2025","contextLength":1048576,"pricing":{"input":0.09999999999999999,"output":0.39999999999999997}},{"id":"google/gemini-2.5-flash-preview-09-2025","name":"Google: Gemini 2.5 Flash Preview 09-2025","contextLength":1048576,"pricing":{"input":0.3,"output":2.5}},{"id":"google/gemini-2.5-pro","name":"Google: Gemini 2.5 Pro","contextLength":1048576,"pricing":{"input":1.25,"output":10}},{"id":"google/gemini-2.5-pro-preview-05-06","name":"Google: Gemini 2.5 Pro Preview 05-06","contextLength":1048576,"pricing":{"input":1.25,"output":10}},{"id":"google/gemini-2.5-pro-preview","name":"Google: Gemini 2.5 Pro Preview 06-05","contextLength":1048576,"pricing":{"input":1.25,"output":10}},{"id":"google/gemini-3-flash-preview","name":"Google: Gemini 3 Flash Preview","contextLength":1048576,"pricing":{"input":0.5,"output":3}},{"id":"google/gemini-3-pro-preview","name":"Google: Gemini 3 Pro Preview","contextLength":1048576,"pricing":{"input":2,"output":12}},{"id":"google/gemma-2-27b-it","name":"Google: Gemma 2 27B","contextLength":8192,"pricing":{"input":0.65,"output":0.65}},{"id":"google/gemma-2-9b-it","name":"Google: Gemma 2 9B","contextLength":8192,"pricing":{"input":0.03,"output":0.09}},{"id":"google/gemma-3-12b-it","name":"Google: Gemma 3 12B","contextLength":131072,"pricing":{"input":0.03,"output":0.09999999999999999}},{"id":"google/gemma-3-12b-it:free","name":"Google: Gemma 3 12B (free)","contextLength":32768,"pricing":{"input":0,"output":0}},{"id":"google/gemma-3-27b-it","name":"Google: Gemma 3 27B","contextLength":96000,"pricing":{"input":0.04,"output":0.15}},{"id":"google/gemma-3-27b-it:free","name":"Google: Gemma 3 27B (free)","contextLength":131072,"pricing":{"input":0,"output":0}},{"id":"google/gemma-3-4b-it","name":"Google: Gemma 3 4B","contextLength":96000,"pricing":{"input":0.01703012,"output":0.0681536}},{"id":"google/gemma-3-4b-it:free","name":"Google: Gemma 3 4B (free)","contextLength":32768,"pricing":{"input":0,"output":0}},{"id":"google/gemma-3n-e2b-it:free","name":"Google: Gemma 3n 2B (free)","contextLength":8192,"pricing":{"input":0,"output":0}},{"id":"google/gemma-3n-e4b-it","name":"Google: Gemma 3n 4B","contextLength":32768,"pricing":{"input":0.02,"output":0.04}},{"id":"google/gemma-3n-e4b-it:free","name":"Google: Gemma 3n 4B (free)","contextLength":8192,"pricing":{"input":0,"output":0}},{"id":"google/gemini-3-pro-image-preview","name":"Google: Nano Banana Pro (Gemini 3 Pro Image Preview)","contextLength":65536,"pricing":{"input":2,"output":12}},{"id":"ibm-granite/granite-4.0-h-micro","name":"IBM: Granite 4.0 Micro","contextLength":131000,"pricing":{"input":0.017,"output":0.11}},{"id":"inception/mercury","name":"Inception: Mercury","contextLength":128000,"pricing":{"input":0.25,"output":1}},{"id":"inception/mercury-coder","name":"Inception: Mercury Coder","contextLength":128000,"pricing":{"input":0.25,"output":1}},{"id":"inflection/inflection-3-pi","name":"Inflection: Inflection 3 Pi","contextLength":8000,"pricing":{"input":2.5,"output":10}},{"id":"inflection/inflection-3-productivity","name":"Inflection: Inflection 3 Productivity","contextLength":8000,"pricing":{"input":2.5,"output":10}},{"id":"kwaipilot/kat-coder-pro","name":"Kwaipilot: KAT-Coder-Pro V1","contextLength":256000,"pricing":{"input":0.207,"output":0.828}},{"id":"liquid/lfm-2.2-6b","name":"LiquidAI: LFM2-2.6B","contextLength":32768,"pricing":{"input":0.01,"output":0.02}},{"id":"liquid/lfm2-8b-a1b","name":"LiquidAI: LFM2-8B-A1B","contextLength":32768,"pricing":{"input":0.01,"output":0.02}},{"id":"liquid/lfm-2.5-1.2b-instruct:free","name":"LiquidAI: LFM2.5-1.2B-Instruct (free)","contextLength":32768,"pricing":{"input":0,"output":0}},{"id":"liquid/lfm-2.5-1.2b-thinking:free","name":"LiquidAI: LFM2.5-1.2B-Thinking (free)","contextLength":32768,"pricing":{"input":0,"output":0}},{"id":"meta-llama/llama-guard-3-8b","name":"Llama Guard 3 8B","contextLength":131072,"pricing":{"input":0.02,"output":0.06}},{"id":"anthracite-org/magnum-v4-72b","name":"Magnum v4 72B","contextLength":16384,"pricing":{"input":3,"output":5}},{"id":"mancer/weaver","name":"Mancer: Weaver (alpha)","contextLength":8000,"pricing":{"input":0.75,"output":1}},{"id":"meituan/longcat-flash-chat","name":"Meituan: LongCat Flash Chat","contextLength":131072,"pricing":{"input":0.19999999999999998,"output":0.7999999999999999}},{"id":"meta-llama/llama-3-70b-instruct","name":"Meta: Llama 3 70B Instruct","contextLength":8192,"pricing":{"input":0.51,"output":0.74}},{"id":"meta-llama/llama-3-8b-instruct","name":"Meta: Llama 3 8B Instruct","contextLength":8192,"pricing":{"input":0.03,"output":0.06}},{"id":"meta-llama/llama-3.1-405b","name":"Meta: Llama 3.1 405B (base)","contextLength":32768,"pricing":{"input":4,"output":4}},{"id":"meta-llama/llama-3.1-405b-instruct","name":"Meta: Llama 3.1 405B Instruct","contextLength":10000,"pricing":{"input":3.5,"output":3.5}},{"id":"meta-llama/llama-3.1-405b-instruct:free","name":"Meta: Llama 3.1 405B Instruct (free)","contextLength":131072,"pricing":{"input":0,"output":0}},{"id":"meta-llama/llama-3.1-70b-instruct","name":"Meta: Llama 3.1 70B Instruct","contextLength":131072,"pricing":{"input":0.39999999999999997,"output":0.39999999999999997}},{"id":"meta-llama/llama-3.1-8b-instruct","name":"Meta: Llama 3.1 8B Instruct","contextLength":16384,"pricing":{"input":0.02,"output":0.049999999999999996}},{"id":"meta-llama/llama-3.2-11b-vision-instruct","name":"Meta: Llama 3.2 11B Vision Instruct","contextLength":131072,"pricing":{"input":0.049,"output":0.049}},{"id":"meta-llama/llama-3.2-1b-instruct","name":"Meta: Llama 3.2 1B Instruct","contextLength":60000,"pricing":{"input":0.027,"output":0.19999999999999998}},{"id":"meta-llama/llama-3.2-3b-instruct","name":"Meta: Llama 3.2 3B Instruct","contextLength":131072,"pricing":{"input":0.02,"output":0.02}},{"id":"meta-llama/llama-3.2-3b-instruct:free","name":"Meta: Llama 3.2 3B Instruct (free)","contextLength":131072,"pricing":{"input":0,"output":0}},{"id":"meta-llama/llama-3.3-70b-instruct","name":"Meta: Llama 3.3 70B Instruct","contextLength":131072,"pricing":{"input":0.09999999999999999,"output":0.32}},{"id":"meta-llama/llama-3.3-70b-instruct:free","name":"Meta: Llama 3.3 70B Instruct (free)","contextLength":131072,"pricing":{"input":0,"output":0}},{"id":"meta-llama/llama-4-maverick","name":"Meta: Llama 4 Maverick","contextLength":1048576,"pricing":{"input":0.15,"output":0.6}},{"id":"meta-llama/llama-4-scout","name":"Meta: Llama 4 Scout","contextLength":327680,"pricing":{"input":0.08,"output":0.3}},{"id":"meta-llama/llama-guard-4-12b","name":"Meta: Llama Guard 4 12B","contextLength":163840,"pricing":{"input":0.18,"output":0.18}},{"id":"meta-llama/llama-guard-2-8b","name":"Meta: LlamaGuard 2 8B","contextLength":8192,"pricing":{"input":0.19999999999999998,"output":0.19999999999999998}},{"id":"microsoft/phi-4","name":"Microsoft: Phi 4","contextLength":16384,"pricing":{"input":0.06,"output":0.14}},{"id":"minimax/minimax-m1","name":"MiniMax: MiniMax M1","contextLength":1000000,"pricing":{"input":0.39999999999999997,"output":2.2}},{"id":"minimax/minimax-m2","name":"MiniMax: MiniMax M2","contextLength":196608,"pricing":{"input":0.19999999999999998,"output":1}},{"id":"minimax/minimax-m2-her","name":"MiniMax: MiniMax M2-her","contextLength":65536,"pricing":{"input":0.3,"output":1.2}},{"id":"minimax/minimax-m2.1","name":"MiniMax: MiniMax M2.1","contextLength":196608,"pricing":{"input":0.27,"output":1.1}},{"id":"minimax/minimax-01","name":"MiniMax: MiniMax-01","contextLength":1000192,"pricing":{"input":0.19999999999999998,"output":1.1}},{"id":"mistralai/mistral-large","name":"Mistral Large","contextLength":128000,"pricing":{"input":2,"output":6}},{"id":"mistralai/mistral-large-2407","name":"Mistral Large 2407","contextLength":131072,"pricing":{"input":2,"output":6}},{"id":"mistralai/mistral-large-2411","name":"Mistral Large 2411","contextLength":131072,"pricing":{"input":2,"output":6}},{"id":"mistralai/mistral-tiny","name":"Mistral Tiny","contextLength":32768,"pricing":{"input":0.25,"output":0.25}},{"id":"mistralai/codestral-2508","name":"Mistral: Codestral 2508","contextLength":256000,"pricing":{"input":0.3,"output":0.8999999999999999}},{"id":"mistralai/devstral-2512","name":"Mistral: Devstral 2 2512","contextLength":262144,"pricing":{"input":0.049999999999999996,"output":0.22}},{"id":"mistralai/devstral-medium","name":"Mistral: Devstral Medium","contextLength":131072,"pricing":{"input":0.39999999999999997,"output":2}},{"id":"mistralai/devstral-small","name":"Mistral: Devstral Small 1.1","contextLength":131072,"pricing":{"input":0.09999999999999999,"output":0.3}},{"id":"mistralai/ministral-14b-2512","name":"Mistral: Ministral 3 14B 2512","contextLength":262144,"pricing":{"input":0.19999999999999998,"output":0.19999999999999998}},{"id":"mistralai/ministral-3b-2512","name":"Mistral: Ministral 3 3B 2512","contextLength":131072,"pricing":{"input":0.09999999999999999,"output":0.09999999999999999}},{"id":"mistralai/ministral-8b-2512","name":"Mistral: Ministral 3 8B 2512","contextLength":262144,"pricing":{"input":0.15,"output":0.15}},{"id":"mistralai/ministral-3b","name":"Mistral: Ministral 3B","contextLength":131072,"pricing":{"input":0.04,"output":0.04}},{"id":"mistralai/ministral-8b","name":"Mistral: Ministral 8B","contextLength":131072,"pricing":{"input":0.09999999999999999,"output":0.09999999999999999}},{"id":"mistralai/mistral-7b-instruct","name":"Mistral: Mistral 7B Instruct","contextLength":32768,"pricing":{"input":0.19999999999999998,"output":0.19999999999999998}},{"id":"mistralai/mistral-7b-instruct-v0.1","name":"Mistral: Mistral 7B Instruct v0.1","contextLength":2824,"pricing":{"input":0.11,"output":0.19}},{"id":"mistralai/mistral-7b-instruct-v0.2","name":"Mistral: Mistral 7B Instruct v0.2","contextLength":32768,"pricing":{"input":0.19999999999999998,"output":0.19999999999999998}},{"id":"mistralai/mistral-7b-instruct-v0.3","name":"Mistral: Mistral 7B Instruct v0.3","contextLength":32768,"pricing":{"input":0.19999999999999998,"output":0.19999999999999998}},{"id":"mistralai/mistral-large-2512","name":"Mistral: Mistral Large 3 2512","contextLength":262144,"pricing":{"input":0.5,"output":1.5}},{"id":"mistralai/mistral-medium-3","name":"Mistral: Mistral Medium 3","contextLength":131072,"pricing":{"input":0.39999999999999997,"output":2}},{"id":"mistralai/mistral-medium-3.1","name":"Mistral: Mistral Medium 3.1","contextLength":131072,"pricing":{"input":0.39999999999999997,"output":2}},{"id":"mistralai/mistral-nemo","name":"Mistral: Mistral Nemo","contextLength":131072,"pricing":{"input":0.02,"output":0.04}},{"id":"mistralai/mistral-small-24b-instruct-2501","name":"Mistral: Mistral Small 3","contextLength":32768,"pricing":{"input":0.03,"output":0.11}},{"id":"mistralai/mistral-small-3.1-24b-instruct","name":"Mistral: Mistral Small 3.1 24B","contextLength":131072,"pricing":{"input":0.03,"output":0.11}},{"id":"mistralai/mistral-small-3.1-24b-instruct:free","name":"Mistral: Mistral Small 3.1 24B (free)","contextLength":128000,"pricing":{"input":0,"output":0}},{"id":"mistralai/mistral-small-3.2-24b-instruct","name":"Mistral: Mistral Small 3.2 24B","contextLength":131072,"pricing":{"input":0.06,"output":0.18}},{"id":"mistralai/mistral-small-creative","name":"Mistral: Mistral Small Creative","contextLength":32768,"pricing":{"input":0.09999999999999999,"output":0.3}},{"id":"mistralai/mixtral-8x22b-instruct","name":"Mistral: Mixtral 8x22B Instruct","contextLength":65536,"pricing":{"input":2,"output":6}},{"id":"mistralai/mixtral-8x7b-instruct","name":"Mistral: Mixtral 8x7B Instruct","contextLength":32768,"pricing":{"input":0.54,"output":0.54}},{"id":"mistralai/pixtral-12b","name":"Mistral: Pixtral 12B","contextLength":32768,"pricing":{"input":0.09999999999999999,"output":0.09999999999999999}},{"id":"mistralai/pixtral-large-2411","name":"Mistral: Pixtral Large 2411","contextLength":131072,"pricing":{"input":2,"output":6}},{"id":"mistralai/mistral-saba","name":"Mistral: Saba","contextLength":32768,"pricing":{"input":0.19999999999999998,"output":0.6}},{"id":"mistralai/voxtral-small-24b-2507","name":"Mistral: Voxtral Small 24B 2507","contextLength":32000,"pricing":{"input":0.09999999999999999,"output":0.3}},{"id":"moonshotai/kimi-dev-72b","name":"MoonshotAI: Kimi Dev 72B","contextLength":131072,"pricing":{"input":0.29,"output":1.15}},{"id":"moonshotai/kimi-k2","name":"MoonshotAI: Kimi K2 0711","contextLength":131072,"pricing":{"input":0.5,"output":2.4}},{"id":"moonshotai/kimi-k2:free","name":"MoonshotAI: Kimi K2 0711 (free)","contextLength":32768,"pricing":{"input":0,"output":0}},{"id":"moonshotai/kimi-k2-0905","name":"MoonshotAI: Kimi K2 0905","contextLength":262144,"pricing":{"input":0.39,"output":1.9}},{"id":"moonshotai/kimi-k2-0905:exacto","name":"MoonshotAI: Kimi K2 0905 (exacto)","contextLength":262144,"pricing":{"input":0.6,"output":2.5}},{"id":"moonshotai/kimi-k2-thinking","name":"MoonshotAI: Kimi K2 Thinking","contextLength":262144,"pricing":{"input":0.39999999999999997,"output":1.75}},{"id":"moonshotai/kimi-k2.5","name":"MoonshotAI: Kimi K2.5","contextLength":262144,"pricing":{"input":0.5,"output":2.5}},{"id":"morph/morph-v3-fast","name":"Morph: Morph V3 Fast","contextLength":81920,"pricing":{"input":0.7999999999999999,"output":1.2}},{"id":"morph/morph-v3-large","name":"Morph: Morph V3 Large","contextLength":262144,"pricing":{"input":0.8999999999999999,"output":1.9}},{"id":"gryphe/mythomax-l2-13b","name":"MythoMax 13B","contextLength":4096,"pricing":{"input":0.06,"output":0.06}},{"id":"neversleep/llama-3.1-lumimaid-8b","name":"NeverSleep: Lumimaid v0.2 8B","contextLength":32768,"pricing":{"input":0.09,"output":0.6}},{"id":"nex-agi/deepseek-v3.1-nex-n1","name":"Nex AGI: DeepSeek V3.1 Nex N1","contextLength":131072,"pricing":{"input":0.27,"output":1}},{"id":"neversleep/noromaid-20b","name":"Noromaid 20B","contextLength":4096,"pricing":{"input":1,"output":1.75}},{"id":"nousresearch/deephermes-3-mistral-24b-preview","name":"Nous: DeepHermes 3 Mistral 24B Preview","contextLength":32768,"pricing":{"input":0.02,"output":0.09999999999999999}},{"id":"nousresearch/hermes-3-llama-3.1-405b","name":"Nous: Hermes 3 405B Instruct","contextLength":131072,"pricing":{"input":1,"output":1}},{"id":"nousresearch/hermes-3-llama-3.1-405b:free","name":"Nous: Hermes 3 405B Instruct (free)","contextLength":131072,"pricing":{"input":0,"output":0}},{"id":"nousresearch/hermes-3-llama-3.1-70b","name":"Nous: Hermes 3 70B Instruct","contextLength":65536,"pricing":{"input":0.3,"output":0.3}},{"id":"nousresearch/hermes-4-405b","name":"Nous: Hermes 4 405B","contextLength":131072,"pricing":{"input":1,"output":3}},{"id":"nousresearch/hermes-4-70b","name":"Nous: Hermes 4 70B","contextLength":131072,"pricing":{"input":0.11,"output":0.38}},{"id":"nousresearch/hermes-2-pro-llama-3-8b","name":"NousResearch: Hermes 2 Pro - Llama-3 8B","contextLength":8192,"pricing":{"input":0.14,"output":0.14}},{"id":"nvidia/llama-3.1-nemotron-70b-instruct","name":"NVIDIA: Llama 3.1 Nemotron 70B Instruct","contextLength":131072,"pricing":{"input":1.2,"output":1.2}},{"id":"nvidia/llama-3.1-nemotron-ultra-253b-v1","name":"NVIDIA: Llama 3.1 Nemotron Ultra 253B v1","contextLength":131072,"pricing":{"input":0.6,"output":1.7999999999999998}},{"id":"nvidia/llama-3.3-nemotron-super-49b-v1.5","name":"NVIDIA: Llama 3.3 Nemotron Super 49B V1.5","contextLength":131072,"pricing":{"input":0.09999999999999999,"output":0.39999999999999997}},{"id":"nvidia/nemotron-3-nano-30b-a3b","name":"NVIDIA: Nemotron 3 Nano 30B A3B","contextLength":262144,"pricing":{"input":0.049999999999999996,"output":0.19999999999999998}},{"id":"nvidia/nemotron-3-nano-30b-a3b:free","name":"NVIDIA: Nemotron 3 Nano 30B A3B (free)","contextLength":256000,"pricing":{"input":0,"output":0}},{"id":"nvidia/nemotron-nano-12b-v2-vl","name":"NVIDIA: Nemotron Nano 12B 2 VL","contextLength":131072,"pricing":{"input":0.19999999999999998,"output":0.6}},{"id":"nvidia/nemotron-nano-12b-v2-vl:free","name":"NVIDIA: Nemotron Nano 12B 2 VL (free)","contextLength":128000,"pricing":{"input":0,"output":0}},{"id":"nvidia/nemotron-nano-9b-v2","name":"NVIDIA: Nemotron Nano 9B V2","contextLength":131072,"pricing":{"input":0.04,"output":0.16}},{"id":"nvidia/nemotron-nano-9b-v2:free","name":"NVIDIA: Nemotron Nano 9B V2 (free)","contextLength":128000,"pricing":{"input":0,"output":0}},{"id":"openai/chatgpt-4o-latest","name":"OpenAI: ChatGPT-4o","contextLength":128000,"pricing":{"input":5,"output":15}},{"id":"openai/gpt-audio","name":"OpenAI: GPT Audio","contextLength":128000,"pricing":{"input":2.5,"output":10}},{"id":"openai/gpt-audio-mini","name":"OpenAI: GPT Audio Mini","contextLength":128000,"pricing":{"input":0.6,"output":2.4}},{"id":"openai/gpt-3.5-turbo","name":"OpenAI: GPT-3.5 Turbo","contextLength":16385,"pricing":{"input":0.5,"output":1.5}},{"id":"openai/gpt-3.5-turbo-0613","name":"OpenAI: GPT-3.5 Turbo (older v0613)","contextLength":4095,"pricing":{"input":1,"output":2}},{"id":"openai/gpt-3.5-turbo-16k","name":"OpenAI: GPT-3.5 Turbo 16k","contextLength":16385,"pricing":{"input":3,"output":4}},{"id":"openai/gpt-3.5-turbo-instruct","name":"OpenAI: GPT-3.5 Turbo Instruct","contextLength":4095,"pricing":{"input":1.5,"output":2}},{"id":"openai/gpt-4","name":"OpenAI: GPT-4","contextLength":8191,"pricing":{"input":30,"output":60}},{"id":"openai/gpt-4-0314","name":"OpenAI: GPT-4 (older v0314)","contextLength":8191,"pricing":{"input":30,"output":60}},{"id":"openai/gpt-4-turbo","name":"OpenAI: GPT-4 Turbo","contextLength":128000,"pricing":{"input":10,"output":30}},{"id":"openai/gpt-4-1106-preview","name":"OpenAI: GPT-4 Turbo (older v1106)","contextLength":128000,"pricing":{"input":10,"output":30}},{"id":"openai/gpt-4-turbo-preview","name":"OpenAI: GPT-4 Turbo Preview","contextLength":128000,"pricing":{"input":10,"output":30}},{"id":"openai/gpt-4.1","name":"OpenAI: GPT-4.1","contextLength":1047576,"pricing":{"input":2,"output":8}},{"id":"openai/gpt-4.1-mini","name":"OpenAI: GPT-4.1 Mini","contextLength":1047576,"pricing":{"input":0.39999999999999997,"output":1.5999999999999999}},{"id":"openai/gpt-4.1-nano","name":"OpenAI: GPT-4.1 Nano","contextLength":1047576,"pricing":{"input":0.09999999999999999,"output":0.39999999999999997}},{"id":"openai/gpt-4o","name":"OpenAI: GPT-4o","contextLength":128000,"pricing":{"input":2.5,"output":10}},{"id":"openai/gpt-4o-2024-05-13","name":"OpenAI: GPT-4o (2024-05-13)","contextLength":128000,"pricing":{"input":5,"output":15}},{"id":"openai/gpt-4o-2024-08-06","name":"OpenAI: GPT-4o (2024-08-06)","contextLength":128000,"pricing":{"input":2.5,"output":10}},{"id":"openai/gpt-4o-2024-11-20","name":"OpenAI: GPT-4o (2024-11-20)","contextLength":128000,"pricing":{"input":2.5,"output":10}},{"id":"openai/gpt-4o:extended","name":"OpenAI: GPT-4o (extended)","contextLength":128000,"pricing":{"input":6,"output":18}},{"id":"openai/gpt-4o-audio-preview","name":"OpenAI: GPT-4o Audio","contextLength":128000,"pricing":{"input":2.5,"output":10}},{"id":"openai/gpt-4o-search-preview","name":"OpenAI: GPT-4o Search Preview","contextLength":128000,"pricing":{"input":2.5,"output":10}},{"id":"openai/gpt-4o-mini","name":"OpenAI: GPT-4o-mini","contextLength":128000,"pricing":{"input":0.15,"output":0.6}},{"id":"openai/gpt-4o-mini-2024-07-18","name":"OpenAI: GPT-4o-mini (2024-07-18)","contextLength":128000,"pricing":{"input":0.15,"output":0.6}},{"id":"openai/gpt-4o-mini-search-preview","name":"OpenAI: GPT-4o-mini Search Preview","contextLength":128000,"pricing":{"input":0.15,"output":0.6}},{"id":"openai/gpt-5","name":"OpenAI: GPT-5","contextLength":400000,"pricing":{"input":1.25,"output":10}},{"id":"openai/gpt-5-chat","name":"OpenAI: GPT-5 Chat","contextLength":128000,"pricing":{"input":1.25,"output":10}},{"id":"openai/gpt-5-codex","name":"OpenAI: GPT-5 Codex","contextLength":400000,"pricing":{"input":1.25,"output":10}},{"id":"openai/gpt-5-image","name":"OpenAI: GPT-5 Image","contextLength":400000,"pricing":{"input":10,"output":10}},{"id":"openai/gpt-5-image-mini","name":"OpenAI: GPT-5 Image Mini","contextLength":400000,"pricing":{"input":2.5,"output":2}},{"id":"openai/gpt-5-mini","name":"OpenAI: GPT-5 Mini","contextLength":400000,"pricing":{"input":0.25,"output":2}},{"id":"openai/gpt-5-nano","name":"OpenAI: GPT-5 Nano","contextLength":400000,"pricing":{"input":0.049999999999999996,"output":0.39999999999999997}},{"id":"openai/gpt-5-pro","name":"OpenAI: GPT-5 Pro","contextLength":400000,"pricing":{"input":15,"output":120}},{"id":"openai/gpt-5.1","name":"OpenAI: GPT-5.1","contextLength":400000,"pricing":{"input":1.25,"output":10}},{"id":"openai/gpt-5.1-chat","name":"OpenAI: GPT-5.1 Chat","contextLength":128000,"pricing":{"input":1.25,"output":10}},{"id":"openai/gpt-5.1-codex","name":"OpenAI: GPT-5.1-Codex","contextLength":400000,"pricing":{"input":1.25,"output":10}},{"id":"openai/gpt-5.1-codex-max","name":"OpenAI: GPT-5.1-Codex-Max","contextLength":400000,"pricing":{"input":1.25,"output":10}},{"id":"openai/gpt-5.1-codex-mini","name":"OpenAI: GPT-5.1-Codex-Mini","contextLength":400000,"pricing":{"input":0.25,"output":2}},{"id":"openai/gpt-5.2","name":"OpenAI: GPT-5.2","contextLength":400000,"pricing":{"input":1.75,"output":14}},{"id":"openai/gpt-5.2-chat","name":"OpenAI: GPT-5.2 Chat","contextLength":128000,"pricing":{"input":1.75,"output":14}},{"id":"openai/gpt-5.2-pro","name":"OpenAI: GPT-5.2 Pro","contextLength":400000,"pricing":{"input":21,"output":168}},{"id":"openai/gpt-5.2-codex","name":"OpenAI: GPT-5.2-Codex","contextLength":400000,"pricing":{"input":1.75,"output":14}},{"id":"openai/gpt-oss-120b","name":"OpenAI: gpt-oss-120b","contextLength":131072,"pricing":{"input":0.039,"output":0.19}},{"id":"openai/gpt-oss-120b:exacto","name":"OpenAI: gpt-oss-120b (exacto)","contextLength":131072,"pricing":{"input":0.039,"output":0.19}},{"id":"openai/gpt-oss-120b:free","name":"OpenAI: gpt-oss-120b (free)","contextLength":131072,"pricing":{"input":0,"output":0}},{"id":"openai/gpt-oss-20b","name":"OpenAI: gpt-oss-20b","contextLength":131072,"pricing":{"input":0.02,"output":0.09999999999999999}},{"id":"openai/gpt-oss-20b:free","name":"OpenAI: gpt-oss-20b (free)","contextLength":131072,"pricing":{"input":0,"output":0}},{"id":"openai/gpt-oss-safeguard-20b","name":"OpenAI: gpt-oss-safeguard-20b","contextLength":131072,"pricing":{"input":0.075,"output":0.3}},{"id":"openai/o1","name":"OpenAI: o1","contextLength":200000,"pricing":{"input":15,"output":60}},{"id":"openai/o1-pro","name":"OpenAI: o1-pro","contextLength":200000,"pricing":{"input":150,"output":600}},{"id":"openai/o3","name":"OpenAI: o3","contextLength":200000,"pricing":{"input":2,"output":8}},{"id":"openai/o3-deep-research","name":"OpenAI: o3 Deep Research","contextLength":200000,"pricing":{"input":10,"output":40}},{"id":"openai/o3-mini","name":"OpenAI: o3 Mini","contextLength":200000,"pricing":{"input":1.1,"output":4.4}},{"id":"openai/o3-mini-high","name":"OpenAI: o3 Mini High","contextLength":200000,"pricing":{"input":1.1,"output":4.4}},{"id":"openai/o3-pro","name":"OpenAI: o3 Pro","contextLength":200000,"pricing":{"input":20,"output":80}},{"id":"openai/o4-mini","name":"OpenAI: o4 Mini","contextLength":200000,"pricing":{"input":1.1,"output":4.4}},{"id":"openai/o4-mini-deep-research","name":"OpenAI: o4 Mini Deep Research","contextLength":200000,"pricing":{"input":2,"output":8}},{"id":"openai/o4-mini-high","name":"OpenAI: o4 Mini High","contextLength":200000,"pricing":{"input":1.1,"output":4.4}},{"id":"opengvlab/internvl3-78b","name":"OpenGVLab: InternVL3 78B","contextLength":32768,"pricing":{"input":0.09999999999999999,"output":0.39}},{"id":"perplexity/sonar","name":"Perplexity: Sonar","contextLength":127072,"pricing":{"input":1,"output":1}},{"id":"perplexity/sonar-deep-research","name":"Perplexity: Sonar Deep Research","contextLength":128000,"pricing":{"input":2,"output":8}},{"id":"perplexity/sonar-pro","name":"Perplexity: Sonar Pro","contextLength":200000,"pricing":{"input":3,"output":15}},{"id":"perplexity/sonar-pro-search","name":"Perplexity: Sonar Pro Search","contextLength":200000,"pricing":{"input":3,"output":15}},{"id":"perplexity/sonar-reasoning-pro","name":"Perplexity: Sonar Reasoning Pro","contextLength":128000,"pricing":{"input":2,"output":8}},{"id":"prime-intellect/intellect-3","name":"Prime Intellect: INTELLECT-3","contextLength":131072,"pricing":{"input":0.19999999999999998,"output":1.1}},{"id":"qwen/qwen-plus-2025-07-28","name":"Qwen: Qwen Plus 0728","contextLength":1000000,"pricing":{"input":0.39999999999999997,"output":1.2}},{"id":"qwen/qwen-plus-2025-07-28:thinking","name":"Qwen: Qwen Plus 0728 (thinking)","contextLength":1000000,"pricing":{"input":0.39999999999999997,"output":4}},{"id":"qwen/qwen-vl-max","name":"Qwen: Qwen VL Max","contextLength":131072,"pricing":{"input":0.7999999999999999,"output":3.1999999999999997}},{"id":"qwen/qwen-vl-plus","name":"Qwen: Qwen VL Plus","contextLength":7500,"pricing":{"input":0.21,"output":0.63}},{"id":"qwen/qwen-max","name":"Qwen: Qwen-Max ","contextLength":32768,"pricing":{"input":1.5999999999999999,"output":6.3999999999999995}},{"id":"qwen/qwen-plus","name":"Qwen: Qwen-Plus","contextLength":131072,"pricing":{"input":0.39999999999999997,"output":1.2}},{"id":"qwen/qwen-turbo","name":"Qwen: Qwen-Turbo","contextLength":1000000,"pricing":{"input":0.049999999999999996,"output":0.19999999999999998}},{"id":"qwen/qwen-2.5-7b-instruct","name":"Qwen: Qwen2.5 7B Instruct","contextLength":32768,"pricing":{"input":0.04,"output":0.09999999999999999}},{"id":"qwen/qwen2.5-coder-7b-instruct","name":"Qwen: Qwen2.5 Coder 7B Instruct","contextLength":32768,"pricing":{"input":0.03,"output":0.09}},{"id":"qwen/qwen2.5-vl-32b-instruct","name":"Qwen: Qwen2.5 VL 32B Instruct","contextLength":16384,"pricing":{"input":0.049999999999999996,"output":0.22}},{"id":"qwen/qwen2.5-vl-72b-instruct","name":"Qwen: Qwen2.5 VL 72B Instruct","contextLength":32768,"pricing":{"input":0.15,"output":0.6}},{"id":"qwen/qwen-2.5-vl-7b-instruct","name":"Qwen: Qwen2.5-VL 7B Instruct","contextLength":32768,"pricing":{"input":0.19999999999999998,"output":0.19999999999999998}},{"id":"qwen/qwen-2.5-vl-7b-instruct:free","name":"Qwen: Qwen2.5-VL 7B Instruct (free)","contextLength":32768,"pricing":{"input":0,"output":0}},{"id":"qwen/qwen3-14b","name":"Qwen: Qwen3 14B","contextLength":40960,"pricing":{"input":0.049999999999999996,"output":0.22}},{"id":"qwen/qwen3-235b-a22b","name":"Qwen: Qwen3 235B A22B","contextLength":40960,"pricing":{"input":0.19999999999999998,"output":0.6}},{"id":"qwen/qwen3-235b-a22b-2507","name":"Qwen: Qwen3 235B A22B Instruct 2507","contextLength":262144,"pricing":{"input":0.071,"output":0.463}},{"id":"qwen/qwen3-235b-a22b-thinking-2507","name":"Qwen: Qwen3 235B A22B Thinking 2507","contextLength":262144,"pricing":{"input":0.11,"output":0.6}},{"id":"qwen/qwen3-30b-a3b","name":"Qwen: Qwen3 30B A3B","contextLength":40960,"pricing":{"input":0.06,"output":0.22}},{"id":"qwen/qwen3-30b-a3b-instruct-2507","name":"Qwen: Qwen3 30B A3B Instruct 2507","contextLength":262144,"pricing":{"input":0.08,"output":0.33}},{"id":"qwen/qwen3-30b-a3b-thinking-2507","name":"Qwen: Qwen3 30B A3B Thinking 2507","contextLength":32768,"pricing":{"input":0.051,"output":0.33999999999999997}},{"id":"qwen/qwen3-32b","name":"Qwen: Qwen3 32B","contextLength":40960,"pricing":{"input":0.08,"output":0.24}},{"id":"qwen/qwen3-4b:free","name":"Qwen: Qwen3 4B (free)","contextLength":40960,"pricing":{"input":0,"output":0}},{"id":"qwen/qwen3-8b","name":"Qwen: Qwen3 8B","contextLength":32000,"pricing":{"input":0.049999999999999996,"output":0.25}},{"id":"qwen/qwen3-coder-30b-a3b-instruct","name":"Qwen: Qwen3 Coder 30B A3B Instruct","contextLength":160000,"pricing":{"input":0.07,"output":0.27}},{"id":"qwen/qwen3-coder","name":"Qwen: Qwen3 Coder 480B A35B","contextLength":262144,"pricing":{"input":0.22,"output":0.95}},{"id":"qwen/qwen3-coder:exacto","name":"Qwen: Qwen3 Coder 480B A35B (exacto)","contextLength":262144,"pricing":{"input":0.22,"output":1.7999999999999998}},{"id":"qwen/qwen3-coder:free","name":"Qwen: Qwen3 Coder 480B A35B (free)","contextLength":262000,"pricing":{"input":0,"output":0}},{"id":"qwen/qwen3-coder-flash","name":"Qwen: Qwen3 Coder Flash","contextLength":128000,"pricing":{"input":0.3,"output":1.5}},{"id":"qwen/qwen3-coder-plus","name":"Qwen: Qwen3 Coder Plus","contextLength":128000,"pricing":{"input":1,"output":5}},{"id":"qwen/qwen3-max","name":"Qwen: Qwen3 Max","contextLength":256000,"pricing":{"input":1.2,"output":6}},{"id":"qwen/qwen3-next-80b-a3b-instruct","name":"Qwen: Qwen3 Next 80B A3B Instruct","contextLength":262144,"pricing":{"input":0.09,"output":1.1}},{"id":"qwen/qwen3-next-80b-a3b-instruct:free","name":"Qwen: Qwen3 Next 80B A3B Instruct (free)","contextLength":262144,"pricing":{"input":0,"output":0}},{"id":"qwen/qwen3-next-80b-a3b-thinking","name":"Qwen: Qwen3 Next 80B A3B Thinking","contextLength":128000,"pricing":{"input":0.15,"output":1.2}},{"id":"qwen/qwen3-vl-235b-a22b-instruct","name":"Qwen: Qwen3 VL 235B A22B Instruct","contextLength":262144,"pricing":{"input":0.19999999999999998,"output":1.2}},{"id":"qwen/qwen3-vl-235b-a22b-thinking","name":"Qwen: Qwen3 VL 235B A22B Thinking","contextLength":262144,"pricing":{"input":0.44999999999999996,"output":3.5}},{"id":"qwen/qwen3-vl-30b-a3b-instruct","name":"Qwen: Qwen3 VL 30B A3B Instruct","contextLength":262144,"pricing":{"input":0.15,"output":0.6}},{"id":"qwen/qwen3-vl-30b-a3b-thinking","name":"Qwen: Qwen3 VL 30B A3B Thinking","contextLength":131072,"pricing":{"input":0.19999999999999998,"output":1}},{"id":"qwen/qwen3-vl-32b-instruct","name":"Qwen: Qwen3 VL 32B Instruct","contextLength":262144,"pricing":{"input":0.5,"output":1.5}},{"id":"qwen/qwen3-vl-8b-instruct","name":"Qwen: Qwen3 VL 8B Instruct","contextLength":131072,"pricing":{"input":0.08,"output":0.5}},{"id":"qwen/qwen3-vl-8b-thinking","name":"Qwen: Qwen3 VL 8B Thinking","contextLength":256000,"pricing":{"input":0.18,"output":2.0999999999999996}},{"id":"qwen/qwq-32b","name":"Qwen: QwQ 32B","contextLength":32768,"pricing":{"input":0.15,"output":0.39999999999999997}},{"id":"qwen/qwen-2.5-72b-instruct","name":"Qwen2.5 72B Instruct","contextLength":32768,"pricing":{"input":0.12,"output":0.39}},{"id":"qwen/qwen-2.5-coder-32b-instruct","name":"Qwen2.5 Coder 32B Instruct","contextLength":32768,"pricing":{"input":0.03,"output":0.11}},{"id":"relace/relace-apply-3","name":"Relace: Relace Apply 3","contextLength":256000,"pricing":{"input":0.85,"output":1.25}},{"id":"relace/relace-search","name":"Relace: Relace Search","contextLength":256000,"pricing":{"input":1,"output":3}},{"id":"undi95/remm-slerp-l2-13b","name":"ReMM SLERP 13B","contextLength":6144,"pricing":{"input":0.44999999999999996,"output":0.65}},{"id":"sao10k/l3-lunaris-8b","name":"Sao10K: Llama 3 8B Lunaris","contextLength":8192,"pricing":{"input":0.04,"output":0.049999999999999996}},{"id":"sao10k/l3-euryale-70b","name":"Sao10k: Llama 3 Euryale 70B v2.1","contextLength":8192,"pricing":{"input":1.48,"output":1.48}},{"id":"sao10k/l3.1-70b-hanami-x1","name":"Sao10K: Llama 3.1 70B Hanami x1","contextLength":16000,"pricing":{"input":3,"output":3}},{"id":"sao10k/l3.1-euryale-70b","name":"Sao10K: Llama 3.1 Euryale 70B v2.2","contextLength":32768,"pricing":{"input":0.65,"output":0.75}},{"id":"sao10k/l3.3-euryale-70b","name":"Sao10K: Llama 3.3 Euryale 70B","contextLength":131072,"pricing":{"input":0.65,"output":0.75}},{"id":"raifle/sorcererlm-8x22b","name":"SorcererLM 8x22B","contextLength":16000,"pricing":{"input":4.5,"output":4.5}},{"id":"stepfun-ai/step3","name":"StepFun: Step3","contextLength":65536,"pricing":{"input":0.5700000000000001,"output":1.42}},{"id":"switchpoint/router","name":"Switchpoint Router","contextLength":131072,"pricing":{"input":0.85,"output":3.4}},{"id":"tencent/hunyuan-a13b-instruct","name":"Tencent: Hunyuan A13B Instruct","contextLength":131072,"pricing":{"input":0.14,"output":0.5700000000000001}},{"id":"thedrummer/cydonia-24b-v4.1","name":"TheDrummer: Cydonia 24B V4.1","contextLength":131072,"pricing":{"input":0.3,"output":0.5}},{"id":"thedrummer/rocinante-12b","name":"TheDrummer: Rocinante 12B","contextLength":32768,"pricing":{"input":0.16999999999999998,"output":0.43}},{"id":"thedrummer/skyfall-36b-v2","name":"TheDrummer: Skyfall 36B V2","contextLength":32768,"pricing":{"input":0.55,"output":0.7999999999999999}},{"id":"thedrummer/unslopnemo-12b","name":"TheDrummer: UnslopNemo 12B","contextLength":32768,"pricing":{"input":0.39999999999999997,"output":0.39999999999999997}},{"id":"tngtech/deepseek-r1t-chimera","name":"TNG: DeepSeek R1T Chimera","contextLength":163840,"pricing":{"input":0.3,"output":1.2}},{"id":"tngtech/deepseek-r1t-chimera:free","name":"TNG: DeepSeek R1T Chimera (free)","contextLength":163840,"pricing":{"input":0,"output":0}},{"id":"tngtech/deepseek-r1t2-chimera","name":"TNG: DeepSeek R1T2 Chimera","contextLength":163840,"pricing":{"input":0.25,"output":0.85}},{"id":"tngtech/deepseek-r1t2-chimera:free","name":"TNG: DeepSeek R1T2 Chimera (free)","contextLength":163840,"pricing":{"input":0,"output":0}},{"id":"tngtech/tng-r1t-chimera","name":"TNG: R1T Chimera","contextLength":163840,"pricing":{"input":0.25,"output":0.85}},{"id":"tngtech/tng-r1t-chimera:free","name":"TNG: R1T Chimera (free)","contextLength":163840,"pricing":{"input":0,"output":0}},{"id":"alibaba/tongyi-deepresearch-30b-a3b","name":"Tongyi DeepResearch 30B A3B","contextLength":131072,"pricing":{"input":0.09,"output":0.39999999999999997}},{"id":"upstage/solar-pro-3:free","name":"Upstage: Solar Pro 3 (free)","contextLength":128000,"pricing":{"input":0,"output":0}},{"id":"cognitivecomputations/dolphin-mistral-24b-venice-edition:free","name":"Venice: Uncensored (free)","contextLength":32768,"pricing":{"input":0,"output":0}},{"id":"microsoft/wizardlm-2-8x22b","name":"WizardLM-2 8x22B","contextLength":65536,"pricing":{"input":0.48,"output":0.48}},{"id":"writer/palmyra-x5","name":"Writer: Palmyra X5","contextLength":1040000,"pricing":{"input":0.6,"output":6}},{"id":"x-ai/grok-3","name":"xAI: Grok 3","contextLength":131072,"pricing":{"input":3,"output":15}},{"id":"x-ai/grok-3-beta","name":"xAI: Grok 3 Beta","contextLength":131072,"pricing":{"input":3,"output":15}},{"id":"x-ai/grok-3-mini","name":"xAI: Grok 3 Mini","contextLength":131072,"pricing":{"input":0.3,"output":0.5}},{"id":"x-ai/grok-3-mini-beta","name":"xAI: Grok 3 Mini Beta","contextLength":131072,"pricing":{"input":0.3,"output":0.5}},{"id":"x-ai/grok-4","name":"xAI: Grok 4","contextLength":256000,"pricing":{"input":3,"output":15}},{"id":"x-ai/grok-4-fast","name":"xAI: Grok 4 Fast","contextLength":2000000,"pricing":{"input":0.19999999999999998,"output":0.5}},{"id":"x-ai/grok-4.1-fast","name":"xAI: Grok 4.1 Fast","contextLength":2000000,"pricing":{"input":0.19999999999999998,"output":0.5}},{"id":"x-ai/grok-code-fast-1","name":"xAI: Grok Code Fast 1","contextLength":256000,"pricing":{"input":0.19999999999999998,"output":1.5}},{"id":"xiaomi/mimo-v2-flash","name":"Xiaomi: MiMo-V2-Flash","contextLength":262144,"pricing":{"input":0.09,"output":0.29}},{"id":"z-ai/glm-4-32b","name":"Z.AI: GLM 4 32B ","contextLength":128000,"pricing":{"input":0.09999999999999999,"output":0.09999999999999999}},{"id":"z-ai/glm-4.5","name":"Z.AI: GLM 4.5","contextLength":131072,"pricing":{"input":0.35,"output":1.55}},{"id":"z-ai/glm-4.5-air","name":"Z.AI: GLM 4.5 Air","contextLength":131072,"pricing":{"input":0.049999999999999996,"output":0.22}},{"id":"z-ai/glm-4.5-air:free","name":"Z.AI: GLM 4.5 Air (free)","contextLength":131072,"pricing":{"input":0,"output":0}},{"id":"z-ai/glm-4.5v","name":"Z.AI: GLM 4.5V","contextLength":65536,"pricing":{"input":0.6,"output":1.7999999999999998}},{"id":"z-ai/glm-4.6","name":"Z.AI: GLM 4.6","contextLength":202752,"pricing":{"input":0.35,"output":1.5}},{"id":"z-ai/glm-4.6:exacto","name":"Z.AI: GLM 4.6 (exacto)","contextLength":204800,"pricing":{"input":0.44,"output":1.76}},{"id":"z-ai/glm-4.6v","name":"Z.AI: GLM 4.6V","contextLength":131072,"pricing":{"input":0.3,"output":0.8999999999999999}},{"id":"z-ai/glm-4.7","name":"Z.AI: GLM 4.7","contextLength":202752,"pricing":{"input":0.39999999999999997,"output":1.5}},{"id":"z-ai/glm-4.7-flash","name":"Z.AI: GLM 4.7 Flash","contextLength":200000,"pricing":{"input":0.07,"output":0.39999999999999997}}]	\N	t	1	2026-01-27 16:10:43.570453+00	2026-01-29 14:57:11.760028+00
\.


--
-- Data for Name: marketplace_templates; Type: TABLE DATA; Schema: public; Owner: smartspec
--

COPY public.marketplace_templates (id, creator_id, name, slug, tagline, description, category, tags, tech_stack, price_credits, status, is_featured, template_file_url, preview_images, demo_video_url, version, readme_content, changelog, min_smartspec_version, dependencies, download_count, purchase_count, rating_average, rating_count, view_count, total_revenue_credits, platform_commission_credits, submitted_at, reviewed_at, reviewed_by, review_notes, rejection_reason, created_at, updated_at, published_at) FROM stdin;
\.


--
-- Data for Name: media_models; Type: TABLE DATA; Schema: public; Owner: smartspec
--

COPY public.media_models (id, "modelId", name, description, "modelType", provider, aliases, "creditCost", "aspectRatios", sizes, durations, voices, "configJson", "isEnabled", priority, "sortOrder", "createdAt", "updatedAt") FROM stdin;
303	veo3/generate-veo-3-video	Veo 3.1	Google Veo 3.1 - High-quality video with synchronized audio. Best for final production.	video	kie.ai	"[\\"veo3\\",\\"veo-3.1\\",\\"google-veo\\"]"	2000	\N	\N	\N	\N	"{\\"apiEndpoint\\":\\"/api/v1/veo/generate\\",\\"apiPayloadFormat\\":\\"veo\\",\\"kieModelId\\":\\"veo3\\",\\"generateType\\":\\"text-to-video\\",\\"hasAudio\\":true,\\"maxDuration\\":8,\\"inputFields\\":[{\\"key\\":\\"aspect_ratio\\",\\"label\\":\\"Aspect Ratio\\",\\"type\\":\\"select\\",\\"options\\":[{\\"value\\":\\"16:9\\",\\"label\\":\\"16:9\\"},{\\"value\\":\\"9:16\\",\\"label\\":\\"9:16\\"},{\\"value\\":\\"1:1\\",\\"label\\":\\"1:1\\"}],\\"default\\":\\"16:9\\"}],\\"pricingTiers\\":{\\"default\\":2000},\\"pricingFormula\\":\\"flat\\"}"	t	5	5	2026-01-31 12:39:56.717989+00	2026-01-31 12:39:56.717989+00
304	veo3/generate-veo-3-video-fast	Veo 3.1 Fast	Google Veo 3.1 Fast - Quick video generation with audio. Best for prototyping.	video	kie.ai	"[\\"veo3-fast\\",\\"veo-fast\\"]"	300	\N	\N	\N	\N	"{\\"apiEndpoint\\":\\"/api/v1/veo/generate\\",\\"apiPayloadFormat\\":\\"veo\\",\\"kieModelId\\":\\"veo3_fast\\",\\"generateType\\":\\"text-to-video\\",\\"hasAudio\\":true,\\"maxDuration\\":8,\\"inputFields\\":[{\\"key\\":\\"aspect_ratio\\",\\"label\\":\\"Aspect Ratio\\",\\"type\\":\\"select\\",\\"options\\":[{\\"value\\":\\"16:9\\",\\"label\\":\\"16:9\\"},{\\"value\\":\\"9:16\\",\\"label\\":\\"9:16\\"},{\\"value\\":\\"1:1\\",\\"label\\":\\"1:1\\"}],\\"default\\":\\"16:9\\"}],\\"pricingTiers\\":{\\"default\\":300},\\"pricingFormula\\":\\"flat\\"}"	t	10	10	2026-01-31 12:39:56.725695+00	2026-01-31 12:39:56.725695+00
305	veo3/extend-video	Veo 3.1 Extend	Extend existing videos with Veo 3.1 technology.	video	kie.ai	"[\\"veo-extend\\"]"	1250	\N	\N	\N	\N	"{\\"apiEndpoint\\":\\"/api/v1/veo/generate\\",\\"apiPayloadFormat\\":\\"veo\\",\\"kieModelId\\":\\"veo3\\",\\"generateType\\":\\"video-extend\\",\\"inputFields\\":[{\\"key\\":\\"video_urls\\",\\"label\\":\\"Source Video\\",\\"type\\":\\"video_urls\\",\\"required\\":true}],\\"pricingTiers\\":{\\"default\\":1250},\\"pricingFormula\\":\\"flat\\"}"	t	15	15	2026-01-31 12:39:56.727491+00	2026-01-31 12:39:56.727491+00
306	sora2/sora-2-pro-text-to-video	Sora 2 Pro	OpenAI Sora 2 Pro - Premium video generation with realistic motion and native audio.	video	kie.ai	"[\\"sora\\",\\"sora-2-pro\\",\\"openai-sora\\"]"	825	\N	\N	\N	\N	"{\\"apiEndpoint\\":\\"/api/v1/jobs/createTask\\",\\"apiPayloadFormat\\":\\"market\\",\\"kieModelId\\":\\"sora2/sora-2-pro-text-to-video\\",\\"generateType\\":\\"text-to-video\\",\\"hasAudio\\":true,\\"maxDuration\\":15,\\"inputFields\\":[{\\"key\\":\\"duration\\",\\"label\\":\\"Duration\\",\\"type\\":\\"select\\",\\"options\\":[{\\"value\\":\\"5\\",\\"label\\":\\"5s\\"},{\\"value\\":\\"10\\",\\"label\\":\\"10s\\"},{\\"value\\":\\"15\\",\\"label\\":\\"15s\\"}],\\"default\\":\\"5\\",\\"affectsPricing\\":true},{\\"key\\":\\"resolution\\",\\"label\\":\\"Resolution\\",\\"type\\":\\"select\\",\\"options\\":[{\\"value\\":\\"720p\\",\\"label\\":\\"720p\\"},{\\"value\\":\\"1080p\\",\\"label\\":\\"1080p\\"}],\\"default\\":\\"720p\\",\\"affectsPricing\\":true}],\\"pricingTiers\\":{\\"720p-5s\\":375,\\"720p-10s\\":750,\\"720p-15s\\":1350,\\"1080p-5s\\":825,\\"1080p-10s\\":1650,\\"1080p-15s\\":3150},\\"pricingFormula\\":\\"matrix\\"}"	t	3	3	2026-01-31 12:39:56.729047+00	2026-01-31 12:39:56.729047+00
307	sora2/sora-2-text-to-video	Sora 2	OpenAI Sora 2 - High-quality text-to-video generation.	video	kie.ai	"[\\"sora-2\\",\\"sora-standard\\"]"	75	\N	\N	\N	\N	"{\\"apiEndpoint\\":\\"/api/v1/jobs/createTask\\",\\"apiPayloadFormat\\":\\"market\\",\\"kieModelId\\":\\"sora2/sora-2-text-to-video\\",\\"generateType\\":\\"text-to-video\\",\\"hasAudio\\":false,\\"maxDuration\\":10,\\"inputFields\\":[{\\"key\\":\\"duration\\",\\"label\\":\\"Duration\\",\\"type\\":\\"select\\",\\"options\\":[{\\"value\\":\\"5\\",\\"label\\":\\"5s\\"},{\\"value\\":\\"10\\",\\"label\\":\\"10s\\"}],\\"default\\":\\"5\\",\\"affectsPricing\\":true},{\\"key\\":\\"resolution\\",\\"label\\":\\"Resolution\\",\\"type\\":\\"select\\",\\"options\\":[{\\"value\\":\\"720p\\",\\"label\\":\\"720p\\"},{\\"value\\":\\"1080p\\",\\"label\\":\\"1080p\\"}],\\"default\\":\\"720p\\",\\"affectsPricing\\":true}],\\"pricingTiers\\":{\\"720p-5s\\":75,\\"720p-10s\\":150,\\"1080p-5s\\":375,\\"1080p-10s\\":750},\\"pricingFormula\\":\\"matrix\\"}"	t	8	8	2026-01-31 12:39:56.730596+00	2026-01-31 12:39:56.730596+00
308	sora2/sora-2-pro-image-to-video	Sora 2 Pro Image-to-Video	OpenAI Sora 2 Pro - Transform images into videos with motion.	video	kie.ai	"[\\"sora-i2v\\",\\"sora-image-to-video\\"]"	375	\N	\N	\N	\N	"{\\"apiEndpoint\\":\\"/api/v1/jobs/createTask\\",\\"apiPayloadFormat\\":\\"market\\",\\"kieModelId\\":\\"sora2/sora-2-pro-image-to-video\\",\\"generateType\\":\\"image-to-video\\",\\"inputFields\\":[{\\"key\\":\\"image_urls\\",\\"label\\":\\"Source Image\\",\\"type\\":\\"image_urls\\",\\"required\\":true},{\\"key\\":\\"duration\\",\\"label\\":\\"Duration\\",\\"type\\":\\"select\\",\\"options\\":[{\\"value\\":\\"5\\",\\"label\\":\\"5s\\"},{\\"value\\":\\"10\\",\\"label\\":\\"10s\\"}],\\"default\\":\\"5\\",\\"affectsPricing\\":true}],\\"pricingTiers\\":{\\"5s\\":375,\\"10s\\":750},\\"pricingFormula\\":\\"per_duration\\"}"	t	6	6	2026-01-31 12:39:56.732175+00	2026-01-31 12:39:56.732175+00
309	sora2/sora-2-characters	Sora 2 Characters	Create consistent character videos with Sora 2.	video	kie.ai	"[\\"sora-characters\\"]"	750	\N	\N	\N	\N	"{\\"apiEndpoint\\":\\"/api/v1/jobs/createTask\\",\\"apiPayloadFormat\\":\\"market\\",\\"kieModelId\\":\\"sora2/sora-2-characters\\",\\"generateType\\":\\"text-to-video\\",\\"inputFields\\":[{\\"key\\":\\"image_urls\\",\\"label\\":\\"Character Reference\\",\\"type\\":\\"image_urls\\"},{\\"key\\":\\"duration\\",\\"label\\":\\"Duration\\",\\"type\\":\\"select\\",\\"options\\":[{\\"value\\":\\"5\\",\\"label\\":\\"5s\\"},{\\"value\\":\\"10\\",\\"label\\":\\"10s\\"}],\\"default\\":\\"5\\",\\"affectsPricing\\":true}],\\"pricingTiers\\":{\\"5s\\":750,\\"10s\\":1500},\\"pricingFormula\\":\\"per_duration\\"}"	t	4	4	2026-01-31 12:39:56.733778+00	2026-01-31 12:39:56.733778+00
310	runway/generate-ai-video	Runway Gen-3 Alpha	Runway Gen-3 Alpha - Industry-leading cinematic video generation.	video	kie.ai	"[\\"runway\\",\\"runway-gen3\\",\\"gen3-alpha\\"]"	125	\N	\N	\N	\N	"{\\"apiEndpoint\\":\\"/api/v1/runway/generate\\",\\"apiPayloadFormat\\":\\"runway\\",\\"kieModelId\\":null,\\"generateType\\":\\"text-to-video\\",\\"maxDuration\\":10,\\"inputFields\\":[{\\"key\\":\\"duration\\",\\"label\\":\\"Duration\\",\\"type\\":\\"select\\",\\"options\\":[{\\"value\\":\\"5\\",\\"label\\":\\"5s\\"},{\\"value\\":\\"10\\",\\"label\\":\\"10s\\"}],\\"default\\":\\"5\\",\\"affectsPricing\\":true},{\\"key\\":\\"quality\\",\\"label\\":\\"Quality\\",\\"type\\":\\"select\\",\\"options\\":[{\\"value\\":\\"720p\\",\\"label\\":\\"720p\\"},{\\"value\\":\\"1080p\\",\\"label\\":\\"1080p (5s only)\\"}],\\"default\\":\\"720p\\",\\"affectsPricing\\":true},{\\"key\\":\\"aspectRatio\\",\\"label\\":\\"Aspect Ratio\\",\\"type\\":\\"select\\",\\"options\\":[{\\"value\\":\\"16:9\\",\\"label\\":\\"16:9\\"},{\\"value\\":\\"9:16\\",\\"label\\":\\"9:16\\"},{\\"value\\":\\"1:1\\",\\"label\\":\\"1:1\\"}],\\"default\\":\\"16:9\\"}],\\"pricingTiers\\":{\\"720p-5s\\":125,\\"720p-10s\\":250,\\"1080p-5s\\":200},\\"pricingFormula\\":\\"matrix\\"}"	t	12	12	2026-01-31 12:39:56.735238+00	2026-01-31 12:39:56.735238+00
311	runway/extend-ai-video	Runway Extend	Extend existing videos with Runway AI.	video	kie.ai	"[\\"runway-extend\\"]"	125	\N	\N	\N	\N	"{\\"apiEndpoint\\":\\"/api/v1/runway/generate\\",\\"apiPayloadFormat\\":\\"runway\\",\\"kieModelId\\":null,\\"generateType\\":\\"video-extend\\",\\"inputFields\\":[{\\"key\\":\\"video_urls\\",\\"label\\":\\"Source Video\\",\\"type\\":\\"video_urls\\",\\"required\\":true},{\\"key\\":\\"duration\\",\\"label\\":\\"Extend Duration\\",\\"type\\":\\"select\\",\\"options\\":[{\\"value\\":\\"5\\",\\"label\\":\\"5s\\"},{\\"value\\":\\"10\\",\\"label\\":\\"10s\\"}],\\"default\\":\\"5\\",\\"affectsPricing\\":true}],\\"pricingTiers\\":{\\"5s\\":125,\\"10s\\":250},\\"pricingFormula\\":\\"per_duration\\"}"	t	18	18	2026-01-31 12:39:56.736807+00	2026-01-31 12:39:56.736807+00
321	hailuo/02-text-to-video-pro	Hailuo Pro	Hailuo Pro - Professional video generation.	video	kie.ai	"[\\"hailuo\\",\\"hailuo-pro\\"]"	125	\N	\N	\N	\N	"{\\"apiEndpoint\\":\\"/api/v1/jobs/createTask\\",\\"apiPayloadFormat\\":\\"market\\",\\"kieModelId\\":\\"hailuo/02-text-to-video-pro\\",\\"generateType\\":\\"text-to-video\\",\\"inputFields\\":[{\\"key\\":\\"duration\\",\\"label\\":\\"Duration\\",\\"type\\":\\"select\\",\\"options\\":[{\\"value\\":\\"5\\",\\"label\\":\\"5s\\"},{\\"value\\":\\"10\\",\\"label\\":\\"10s\\"}],\\"default\\":\\"5\\",\\"affectsPricing\\":true}],\\"pricingTiers\\":{\\"5s\\":125,\\"10s\\":250},\\"pricingFormula\\":\\"per_duration\\"}"	t	25	25	2026-01-31 12:39:56.753428+00	2026-01-31 12:39:56.753428+00
312	runway/generate-aleph-video	Runway Aleph	Runway Aleph - In-context video editing with scene reasoning.	video	kie.ai	"[\\"runway-aleph\\",\\"aleph\\"]"	200	\N	\N	\N	\N	"{\\"apiEndpoint\\":\\"/api/v1/runway/generate\\",\\"apiPayloadFormat\\":\\"runway\\",\\"kieModelId\\":null,\\"generateType\\":\\"text-to-video\\",\\"inputFields\\":[{\\"key\\":\\"duration\\",\\"label\\":\\"Duration\\",\\"type\\":\\"select\\",\\"options\\":[{\\"value\\":\\"5\\",\\"label\\":\\"5s\\"},{\\"value\\":\\"10\\",\\"label\\":\\"10s\\"}],\\"default\\":\\"5\\",\\"affectsPricing\\":true},{\\"key\\":\\"aspectRatio\\",\\"label\\":\\"Aspect Ratio\\",\\"type\\":\\"select\\",\\"options\\":[{\\"value\\":\\"16:9\\",\\"label\\":\\"16:9\\"},{\\"value\\":\\"9:16\\",\\"label\\":\\"9:16\\"},{\\"value\\":\\"1:1\\",\\"label\\":\\"1:1\\"}],\\"default\\":\\"16:9\\"}],\\"pricingTiers\\":{\\"5s\\":200,\\"10s\\":400},\\"pricingFormula\\":\\"per_duration\\"}"	t	11	11	2026-01-31 12:39:56.738246+00	2026-01-31 12:39:56.738246+00
313	kling/text-to-video	Kling 2.6	Kling 2.6 - High-quality video with native audio support.	video	kie.ai	"[\\"kling\\",\\"kling-2.6\\"]"	100	\N	\N	\N	\N	"{\\"apiEndpoint\\":\\"/api/v1/jobs/createTask\\",\\"apiPayloadFormat\\":\\"market\\",\\"kieModelId\\":\\"kling/text-to-video\\",\\"generateType\\":\\"text-to-video\\",\\"hasAudio\\":true,\\"inputFields\\":[{\\"key\\":\\"duration\\",\\"label\\":\\"Duration\\",\\"type\\":\\"select\\",\\"options\\":[{\\"value\\":\\"5\\",\\"label\\":\\"5s\\"},{\\"value\\":\\"10\\",\\"label\\":\\"10s\\"}],\\"default\\":\\"5\\",\\"affectsPricing\\":true},{\\"key\\":\\"resolution\\",\\"label\\":\\"Resolution\\",\\"type\\":\\"select\\",\\"options\\":[{\\"value\\":\\"720p\\",\\"label\\":\\"720p\\"},{\\"value\\":\\"1080p\\",\\"label\\":\\"1080p\\"}],\\"default\\":\\"720p\\",\\"affectsPricing\\":true}],\\"pricingTiers\\":{\\"720p-5s\\":100,\\"720p-10s\\":200,\\"1080p-5s\\":150,\\"1080p-10s\\":300},\\"pricingFormula\\":\\"matrix\\"}"	t	14	14	2026-01-31 12:39:56.741705+00	2026-01-31 12:39:56.741705+00
314	kling/image-to-video	Kling 2.6 Image-to-Video	Transform images into videos with Kling 2.6.	video	kie.ai	"[\\"kling-i2v\\"]"	100	\N	\N	\N	\N	"{\\"apiEndpoint\\":\\"/api/v1/jobs/createTask\\",\\"apiPayloadFormat\\":\\"market\\",\\"kieModelId\\":\\"kling/image-to-video\\",\\"generateType\\":\\"image-to-video\\",\\"inputFields\\":[{\\"key\\":\\"image_urls\\",\\"label\\":\\"Source Image\\",\\"type\\":\\"image_urls\\",\\"required\\":true},{\\"key\\":\\"duration\\",\\"label\\":\\"Duration\\",\\"type\\":\\"select\\",\\"options\\":[{\\"value\\":\\"5\\",\\"label\\":\\"5s\\"},{\\"value\\":\\"10\\",\\"label\\":\\"10s\\"}],\\"default\\":\\"5\\",\\"affectsPricing\\":true}],\\"pricingTiers\\":{\\"5s\\":100,\\"10s\\":200},\\"pricingFormula\\":\\"per_duration\\"}"	t	16	16	2026-01-31 12:39:56.743098+00	2026-01-31 12:39:56.743098+00
315	kling/v2-5-turbo-text-to-video-pro	Kling 2.5 Turbo Pro	Kling 2.5 Turbo Pro - Fast high-quality video generation.	video	kie.ai	"[\\"kling-turbo\\",\\"kling-2.5\\"]"	75	\N	\N	\N	\N	"{\\"apiEndpoint\\":\\"/api/v1/jobs/createTask\\",\\"apiPayloadFormat\\":\\"market\\",\\"kieModelId\\":\\"kling/v2-5-turbo-text-to-video-pro\\",\\"generateType\\":\\"text-to-video\\",\\"inputFields\\":[{\\"key\\":\\"duration\\",\\"label\\":\\"Duration\\",\\"type\\":\\"select\\",\\"options\\":[{\\"value\\":\\"5\\",\\"label\\":\\"5s\\"},{\\"value\\":\\"10\\",\\"label\\":\\"10s\\"}],\\"default\\":\\"5\\",\\"affectsPricing\\":true}],\\"pricingTiers\\":{\\"5s\\":75,\\"10s\\":150},\\"pricingFormula\\":\\"per_duration\\"}"	t	17	17	2026-01-31 12:39:56.74458+00	2026-01-31 12:39:56.74458+00
316	kling/v2-1-master-text-to-video	Kling 2.1 Master	Kling 2.1 Master - Premium quality video generation.	video	kie.ai	"[\\"kling-master\\"]"	125	\N	\N	\N	\N	"{\\"apiEndpoint\\":\\"/api/v1/jobs/createTask\\",\\"apiPayloadFormat\\":\\"market\\",\\"kieModelId\\":\\"kling/v2-1-master-text-to-video\\",\\"generateType\\":\\"text-to-video\\",\\"inputFields\\":[{\\"key\\":\\"duration\\",\\"label\\":\\"Duration\\",\\"type\\":\\"select\\",\\"options\\":[{\\"value\\":\\"5\\",\\"label\\":\\"5s\\"},{\\"value\\":\\"10\\",\\"label\\":\\"10s\\"}],\\"default\\":\\"5\\",\\"affectsPricing\\":true},{\\"key\\":\\"resolution\\",\\"label\\":\\"Resolution\\",\\"type\\":\\"select\\",\\"options\\":[{\\"value\\":\\"720p\\",\\"label\\":\\"720p\\"},{\\"value\\":\\"1080p\\",\\"label\\":\\"1080p\\"}],\\"default\\":\\"1080p\\",\\"affectsPricing\\":true}],\\"pricingTiers\\":{\\"720p-5s\\":125,\\"720p-10s\\":250,\\"1080p-5s\\":200,\\"1080p-10s\\":400},\\"pricingFormula\\":\\"matrix\\"}"	t	13	13	2026-01-31 12:39:56.746012+00	2026-01-31 12:39:56.746012+00
317	kling/ai-avatar-pro	Kling AI Avatar Pro	Create AI avatar videos with Kling.	video	kie.ai	"[\\"kling-avatar\\"]"	150	\N	\N	\N	\N	"{\\"apiEndpoint\\":\\"/api/v1/jobs/createTask\\",\\"apiPayloadFormat\\":\\"market\\",\\"kieModelId\\":\\"kling/ai-avatar-pro\\",\\"generateType\\":\\"avatar\\",\\"inputFields\\":[{\\"key\\":\\"image_urls\\",\\"label\\":\\"Avatar Reference\\",\\"type\\":\\"image_urls\\",\\"required\\":true},{\\"key\\":\\"audio_urls\\",\\"label\\":\\"Audio Source\\",\\"type\\":\\"audio_urls\\"}],\\"pricingTiers\\":{\\"default\\":150},\\"pricingFormula\\":\\"flat\\"}"	t	19	19	2026-01-31 12:39:56.74763+00	2026-01-31 12:39:56.74763+00
318	wan/2-6-text-to-video	Wan 2.6	Wan 2.6 - Multi-shot HD video with native audio.	video	kie.ai	"[\\"wan\\",\\"wan-2.6\\"]"	75	\N	\N	\N	\N	"{\\"apiEndpoint\\":\\"/api/v1/jobs/createTask\\",\\"apiPayloadFormat\\":\\"market\\",\\"kieModelId\\":\\"wan/2-6-text-to-video\\",\\"generateType\\":\\"text-to-video\\",\\"hasAudio\\":true,\\"maxDuration\\":15,\\"inputFields\\":[{\\"key\\":\\"duration\\",\\"label\\":\\"Duration\\",\\"type\\":\\"select\\",\\"options\\":[{\\"value\\":\\"5\\",\\"label\\":\\"5s\\"},{\\"value\\":\\"10\\",\\"label\\":\\"10s\\"},{\\"value\\":\\"15\\",\\"label\\":\\"15s\\"}],\\"default\\":\\"5\\",\\"affectsPricing\\":true},{\\"key\\":\\"resolution\\",\\"label\\":\\"Resolution\\",\\"type\\":\\"select\\",\\"options\\":[{\\"value\\":\\"720p\\",\\"label\\":\\"720p\\"},{\\"value\\":\\"1080p\\",\\"label\\":\\"1080p\\"}],\\"default\\":\\"720p\\",\\"affectsPricing\\":true},{\\"key\\":\\"multi_shots\\",\\"label\\":\\"Multi-shot\\",\\"type\\":\\"boolean\\",\\"default\\":false}],\\"pricingTiers\\":{\\"720p-5s\\":75,\\"720p-10s\\":150,\\"720p-15s\\":225,\\"1080p-5s\\":110,\\"1080p-10s\\":220,\\"1080p-15s\\":330},\\"pricingFormula\\":\\"matrix\\"}"	t	20	20	2026-01-31 12:39:56.749006+00	2026-01-31 12:39:56.749006+00
319	wan/2-6-image-to-video	Wan 2.6 Image-to-Video	Transform images into videos with Wan 2.6.	video	kie.ai	"[\\"wan-i2v\\"]"	75	\N	\N	\N	\N	"{\\"apiEndpoint\\":\\"/api/v1/jobs/createTask\\",\\"apiPayloadFormat\\":\\"market\\",\\"kieModelId\\":\\"wan/2-6-image-to-video\\",\\"generateType\\":\\"image-to-video\\",\\"maxDuration\\":15,\\"inputFields\\":[{\\"key\\":\\"image_urls\\",\\"label\\":\\"Source Image\\",\\"type\\":\\"image_urls\\",\\"required\\":true},{\\"key\\":\\"duration\\",\\"label\\":\\"Duration\\",\\"type\\":\\"select\\",\\"options\\":[{\\"value\\":\\"5\\",\\"label\\":\\"5s\\"},{\\"value\\":\\"10\\",\\"label\\":\\"10s\\"},{\\"value\\":\\"15\\",\\"label\\":\\"15s\\"}],\\"default\\":\\"5\\",\\"affectsPricing\\":true},{\\"key\\":\\"resolution\\",\\"label\\":\\"Resolution\\",\\"type\\":\\"select\\",\\"options\\":[{\\"value\\":\\"720p\\",\\"label\\":\\"720p\\"},{\\"value\\":\\"1080p\\",\\"label\\":\\"1080p\\"}],\\"default\\":\\"720p\\",\\"affectsPricing\\":true}],\\"pricingTiers\\":{\\"720p-5s\\":75,\\"720p-10s\\":150,\\"720p-15s\\":225,\\"1080p-5s\\":110,\\"1080p-10s\\":220,\\"1080p-15s\\":330},\\"pricingFormula\\":\\"matrix\\"}"	t	22	22	2026-01-31 12:39:56.750328+00	2026-01-31 12:39:56.750328+00
320	wan/2-2-a14b-text-to-video-turbo	Wan 2.2 Turbo	Wan 2.2 A14B Turbo - Fast video generation.	video	kie.ai	"[\\"wan-turbo\\",\\"wan-2.2\\"]"	50	\N	\N	\N	\N	"{\\"apiEndpoint\\":\\"/api/v1/jobs/createTask\\",\\"apiPayloadFormat\\":\\"market\\",\\"kieModelId\\":\\"wan/2-2-a14b-text-to-video-turbo\\",\\"generateType\\":\\"text-to-video\\",\\"inputFields\\":[{\\"key\\":\\"duration\\",\\"label\\":\\"Duration\\",\\"type\\":\\"select\\",\\"options\\":[{\\"value\\":\\"5\\",\\"label\\":\\"5s\\"},{\\"value\\":\\"10\\",\\"label\\":\\"10s\\"}],\\"default\\":\\"5\\",\\"affectsPricing\\":true}],\\"pricingTiers\\":{\\"5s\\":50,\\"10s\\":100},\\"pricingFormula\\":\\"per_duration\\"}"	t	24	24	2026-01-31 12:39:56.752043+00	2026-01-31 12:39:56.752043+00
367	elevenlabs/audio-isolation	Audio Isolation	ElevenLabs Audio Isolation - Remove background noise.	audio	kie.ai	"[\\"noise-removal\\",\\"audio-clean\\"]"	15	\N	\N	\N	"[]"	"{\\"apiEndpoint\\":\\"/api/v1/jobs/createTask\\",\\"apiPayloadFormat\\":\\"elevenlabs\\",\\"kieModelId\\":\\"elevenlabs/audio-isolation\\",\\"generateType\\":\\"audio-isolation\\",\\"inputFields\\":[{\\"key\\":\\"audio_urls\\",\\"label\\":\\"Source Audio\\",\\"type\\":\\"audio_urls\\",\\"required\\":true}],\\"pricingTiers\\":{\\"default\\":15},\\"pricingFormula\\":\\"flat\\"}"	t	16	16	2026-01-31 12:39:56.814401+00	2026-01-31 12:39:56.814401+00
322	hailuo/2-3-text-to-video	Hailuo 2.3	Hailuo 2.3 - Latest version with improved quality.	video	kie.ai	"[\\"hailuo-2.3\\"]"	150	\N	\N	\N	\N	"{\\"apiEndpoint\\":\\"/api/v1/jobs/createTask\\",\\"apiPayloadFormat\\":\\"market\\",\\"kieModelId\\":\\"hailuo/2-3-text-to-video\\",\\"generateType\\":\\"text-to-video\\",\\"inputFields\\":[{\\"key\\":\\"duration\\",\\"label\\":\\"Duration\\",\\"type\\":\\"select\\",\\"options\\":[{\\"value\\":\\"5\\",\\"label\\":\\"5s\\"},{\\"value\\":\\"10\\",\\"label\\":\\"10s\\"}],\\"default\\":\\"5\\",\\"affectsPricing\\":true}],\\"pricingTiers\\":{\\"5s\\":150,\\"10s\\":300},\\"pricingFormula\\":\\"per_duration\\"}"	t	23	23	2026-01-31 12:39:56.7548+00	2026-01-31 12:39:56.7548+00
323	grok-imagine/text-to-video	Grok Imagine Video	xAI Grok Imagine - Text-to-video generation.	video	kie.ai	"[\\"grok-video\\",\\"grok-imagine-video\\"]"	100	\N	\N	\N	\N	"{\\"apiEndpoint\\":\\"/api/v1/jobs/createTask\\",\\"apiPayloadFormat\\":\\"market\\",\\"kieModelId\\":\\"grok-imagine/text-to-video\\",\\"generateType\\":\\"text-to-video\\",\\"inputFields\\":[{\\"key\\":\\"duration\\",\\"label\\":\\"Duration\\",\\"type\\":\\"select\\",\\"options\\":[{\\"value\\":\\"5\\",\\"label\\":\\"5s\\"},{\\"value\\":\\"10\\",\\"label\\":\\"10s\\"}],\\"default\\":\\"5\\",\\"affectsPricing\\":true}],\\"pricingTiers\\":{\\"5s\\":100,\\"10s\\":200},\\"pricingFormula\\":\\"per_duration\\"}"	t	26	26	2026-01-31 12:39:56.757029+00	2026-01-31 12:39:56.757029+00
324	grok-imagine/image-to-video	Grok Imagine I2V	xAI Grok Imagine - Image-to-video generation.	video	kie.ai	"[\\"grok-i2v\\"]"	75	\N	\N	\N	\N	"{\\"apiEndpoint\\":\\"/api/v1/jobs/createTask\\",\\"apiPayloadFormat\\":\\"market\\",\\"kieModelId\\":\\"grok-imagine/image-to-video\\",\\"generateType\\":\\"image-to-video\\",\\"inputFields\\":[{\\"key\\":\\"image_urls\\",\\"label\\":\\"Source Image\\",\\"type\\":\\"image_urls\\",\\"required\\":true},{\\"key\\":\\"mode\\",\\"label\\":\\"Mode\\",\\"type\\":\\"select\\",\\"options\\":[{\\"value\\":\\"natural\\",\\"label\\":\\"Natural\\"},{\\"value\\":\\"cinematic\\",\\"label\\":\\"Cinematic\\"}],\\"default\\":\\"natural\\"}],\\"pricingTiers\\":{\\"default\\":75},\\"pricingFormula\\":\\"flat\\"}"	t	27	27	2026-01-31 12:39:56.75843+00	2026-01-31 12:39:56.75843+00
325	bytedance/seedance-1.5-pro	Seedance 1.5 Pro	Bytedance Seedance 1.5 Pro - Professional video generation.	video	kie.ai	"[\\"seedance\\",\\"seedance-pro\\"]"	150	\N	\N	\N	\N	"{\\"apiEndpoint\\":\\"/api/v1/jobs/createTask\\",\\"apiPayloadFormat\\":\\"market\\",\\"kieModelId\\":\\"bytedance/seedance-1.5-pro\\",\\"generateType\\":\\"text-to-video\\",\\"inputFields\\":[{\\"key\\":\\"duration\\",\\"label\\":\\"Duration\\",\\"type\\":\\"select\\",\\"options\\":[{\\"value\\":\\"5\\",\\"label\\":\\"5s\\"},{\\"value\\":\\"10\\",\\"label\\":\\"10s\\"}],\\"default\\":\\"5\\",\\"affectsPricing\\":true}],\\"pricingTiers\\":{\\"5s\\":150,\\"10s\\":300},\\"pricingFormula\\":\\"per_duration\\"}"	t	28	28	2026-01-31 12:39:56.759739+00	2026-01-31 12:39:56.759739+00
326	bytedance/v1-pro-text-to-video	Bytedance V1 Pro	Bytedance V1 Pro - High-quality video generation.	video	kie.ai	"[\\"bytedance-pro\\"]"	125	\N	\N	\N	\N	"{\\"apiEndpoint\\":\\"/api/v1/jobs/createTask\\",\\"apiPayloadFormat\\":\\"market\\",\\"kieModelId\\":\\"bytedance/v1-pro-text-to-video\\",\\"generateType\\":\\"text-to-video\\",\\"inputFields\\":[{\\"key\\":\\"duration\\",\\"label\\":\\"Duration\\",\\"type\\":\\"select\\",\\"options\\":[{\\"value\\":\\"5\\",\\"label\\":\\"5s\\"},{\\"value\\":\\"10\\",\\"label\\":\\"10s\\"}],\\"default\\":\\"5\\",\\"affectsPricing\\":true}],\\"pricingTiers\\":{\\"5s\\":125,\\"10s\\":250},\\"pricingFormula\\":\\"per_duration\\"}"	t	29	29	2026-01-31 12:39:56.761074+00	2026-01-31 12:39:56.761074+00
327	luma-modify	Luma Modify	Luma Modify - Video-to-video transformation.	video	kie.ai	"[\\"luma\\",\\"luma-modify\\"]"	100	\N	\N	\N	\N	"{\\"apiEndpoint\\":\\"/api/v1/jobs/createTask\\",\\"apiPayloadFormat\\":\\"market\\",\\"kieModelId\\":\\"luma-modify\\",\\"generateType\\":\\"video-to-video\\",\\"inputFields\\":[{\\"key\\":\\"video_urls\\",\\"label\\":\\"Source Video\\",\\"type\\":\\"video_urls\\",\\"required\\":true}],\\"pricingTiers\\":{\\"default\\":100},\\"pricingFormula\\":\\"flat\\"}"	t	30	30	2026-01-31 12:39:56.762448+00	2026-01-31 12:39:56.762448+00
328	topaz/video-upscale	Topaz Video Upscale	Upscale videos to higher resolution with AI.	video	kie.ai	"[\\"video-upscale\\",\\"topaz-video\\"]"	50	\N	\N	\N	\N	"{\\"apiEndpoint\\":\\"/api/v1/jobs/createTask\\",\\"apiPayloadFormat\\":\\"market\\",\\"kieModelId\\":\\"topaz/video-upscale\\",\\"generateType\\":\\"upscale\\",\\"inputFields\\":[{\\"key\\":\\"video_urls\\",\\"label\\":\\"Source Video\\",\\"type\\":\\"video_urls\\",\\"required\\":true}],\\"pricingTiers\\":{\\"default\\":50},\\"pricingFormula\\":\\"flat\\"}"	t	50	50	2026-01-31 12:39:56.763711+00	2026-01-31 12:39:56.763711+00
330	gpt-image/1.5-text-to-image	GPT Image 1.5	OpenAI GPT Image 1.5 - Enhanced text-to-image generation.	image	kie.ai	"[\\"gpt-image-1.5\\"]"	70	"[\\"1:1\\",\\"2:3\\",\\"3:2\\"]"	\N	\N	\N	"{\\"apiEndpoint\\":\\"/api/v1/jobs/createTask\\",\\"apiPayloadFormat\\":\\"market\\",\\"kieModelId\\":\\"gpt-image/1.5-text-to-image\\",\\"generateType\\":\\"text-to-image\\",\\"inputFields\\":[{\\"key\\":\\"aspect_ratio\\",\\"label\\":\\"Aspect Ratio\\",\\"type\\":\\"select\\",\\"options\\":[{\\"value\\":\\"1:1\\",\\"label\\":\\"1:1\\"},{\\"value\\":\\"2:3\\",\\"label\\":\\"2:3 (Portrait)\\"},{\\"value\\":\\"3:2\\",\\"label\\":\\"3:2 (Landscape)\\"}],\\"default\\":\\"1:1\\"}],\\"pricingTiers\\":{\\"default\\":70},\\"pricingFormula\\":\\"flat\\"}"	t	6	6	2026-01-31 12:39:56.766821+00	2026-01-31 12:39:56.766821+00
331	google/imagen4	Google Imagen 4	Google Imagen 4 - Latest Google image generation model.	image	kie.ai	"[\\"imagen4\\",\\"google-imagen\\"]"	50	"[\\"1:1\\",\\"16:9\\",\\"9:16\\",\\"4:3\\",\\"3:4\\"]"	\N	\N	\N	"{\\"apiEndpoint\\":\\"/api/v1/jobs/createTask\\",\\"apiPayloadFormat\\":\\"market\\",\\"kieModelId\\":\\"google/imagen4\\",\\"generateType\\":\\"text-to-image\\",\\"inputFields\\":[{\\"key\\":\\"aspect_ratio\\",\\"label\\":\\"Aspect Ratio\\",\\"type\\":\\"select\\",\\"options\\":[{\\"value\\":\\"1:1\\",\\"label\\":\\"1:1\\"},{\\"value\\":\\"16:9\\",\\"label\\":\\"16:9\\"},{\\"value\\":\\"9:16\\",\\"label\\":\\"9:16\\"},{\\"value\\":\\"4:3\\",\\"label\\":\\"4:3\\"},{\\"value\\":\\"3:4\\",\\"label\\":\\"3:4\\"}],\\"default\\":\\"1:1\\"}],\\"pricingTiers\\":{\\"default\\":50},\\"pricingFormula\\":\\"flat\\"}"	t	7	7	2026-01-31 12:39:56.768134+00	2026-01-31 12:39:56.768134+00
332	google/imagen4-fast	Google Imagen 4 Fast	Google Imagen 4 Fast - Quick image generation.	image	kie.ai	"[\\"imagen4-fast\\"]"	25	"[\\"1:1\\",\\"16:9\\",\\"9:16\\"]"	\N	\N	\N	"{\\"apiEndpoint\\":\\"/api/v1/jobs/createTask\\",\\"apiPayloadFormat\\":\\"market\\",\\"kieModelId\\":\\"google/imagen4-fast\\",\\"generateType\\":\\"text-to-image\\",\\"inputFields\\":[{\\"key\\":\\"aspect_ratio\\",\\"label\\":\\"Aspect Ratio\\",\\"type\\":\\"select\\",\\"options\\":[{\\"value\\":\\"1:1\\",\\"label\\":\\"1:1\\"},{\\"value\\":\\"16:9\\",\\"label\\":\\"16:9\\"},{\\"value\\":\\"9:16\\",\\"label\\":\\"9:16\\"}],\\"default\\":\\"1:1\\"}],\\"pricingTiers\\":{\\"default\\":25},\\"pricingFormula\\":\\"flat\\"}"	t	12	12	2026-01-31 12:39:56.769475+00	2026-01-31 12:39:56.769475+00
333	google/imagen4-ultra	Google Imagen 4 Ultra	Google Imagen 4 Ultra - Highest quality.	image	kie.ai	"[\\"imagen4-ultra\\"]"	100	"[\\"1:1\\",\\"16:9\\",\\"9:16\\",\\"4:3\\",\\"3:4\\"]"	\N	\N	\N	"{\\"apiEndpoint\\":\\"/api/v1/jobs/createTask\\",\\"apiPayloadFormat\\":\\"market\\",\\"kieModelId\\":\\"google/imagen4-ultra\\",\\"generateType\\":\\"text-to-image\\",\\"inputFields\\":[{\\"key\\":\\"aspect_ratio\\",\\"label\\":\\"Aspect Ratio\\",\\"type\\":\\"select\\",\\"options\\":[{\\"value\\":\\"1:1\\",\\"label\\":\\"1:1\\"},{\\"value\\":\\"16:9\\",\\"label\\":\\"16:9\\"},{\\"value\\":\\"9:16\\",\\"label\\":\\"9:16\\"},{\\"value\\":\\"4:3\\",\\"label\\":\\"4:3\\"},{\\"value\\":\\"3:4\\",\\"label\\":\\"3:4\\"}],\\"default\\":\\"1:1\\"}],\\"pricingTiers\\":{\\"default\\":100},\\"pricingFormula\\":\\"flat\\"}"	t	4	4	2026-01-31 12:39:56.770686+00	2026-01-31 12:39:56.770686+00
334	google/nano-banana	Nano Banana	Google Nano Banana - Fast and precise AI image generation with realistic physics.	image	kie.ai	"[\\"nano-banana\\",\\"banana\\"]"	20	"[\\"1:1\\",\\"16:9\\",\\"9:16\\"]"	\N	\N	\N	"{\\"apiEndpoint\\":\\"/api/v1/jobs/createTask\\",\\"apiPayloadFormat\\":\\"market\\",\\"kieModelId\\":\\"nano-banana\\",\\"generateType\\":\\"text-to-image\\",\\"inputFields\\":[{\\"key\\":\\"resolution\\",\\"label\\":\\"Resolution\\",\\"type\\":\\"select\\",\\"options\\":[{\\"value\\":\\"1K\\",\\"label\\":\\"1K\\"},{\\"value\\":\\"2K\\",\\"label\\":\\"2K\\"}],\\"default\\":\\"1K\\",\\"affectsPricing\\":true},{\\"key\\":\\"aspect_ratio\\",\\"label\\":\\"Aspect Ratio\\",\\"type\\":\\"select\\",\\"options\\":[{\\"value\\":\\"1:1\\",\\"label\\":\\"1:1\\"},{\\"value\\":\\"16:9\\",\\"label\\":\\"16:9\\"},{\\"value\\":\\"9:16\\",\\"label\\":\\"9:16\\"}],\\"default\\":\\"1:1\\"}],\\"pricingTiers\\":{\\"1K\\":20,\\"2K\\":20},\\"pricingFormula\\":\\"flat\\"}"	t	15	15	2026-01-31 12:39:56.771752+00	2026-01-31 12:39:56.771752+00
336	google/nano-banana-edit	Nano Banana Edit	Nano Banana Edit - AI-powered image editing.	image	kie.ai	"[\\"nano-banana-edit\\",\\"banana-edit\\"]"	40	"[\\"1:1\\",\\"16:9\\",\\"9:16\\"]"	\N	\N	\N	"{\\"apiEndpoint\\":\\"/api/v1/jobs/createTask\\",\\"apiPayloadFormat\\":\\"market\\",\\"kieModelId\\":\\"nano-banana-edit\\",\\"generateType\\":\\"edit\\",\\"inputFields\\":[{\\"key\\":\\"image_input\\",\\"label\\":\\"Source Image\\",\\"type\\":\\"image_urls\\",\\"required\\":true},{\\"key\\":\\"resolution\\",\\"label\\":\\"Resolution\\",\\"type\\":\\"select\\",\\"options\\":[{\\"value\\":\\"1K\\",\\"label\\":\\"1K\\"},{\\"value\\":\\"2K\\",\\"label\\":\\"2K\\"}],\\"default\\":\\"1K\\"}],\\"pricingTiers\\":{\\"default\\":40},\\"pricingFormula\\":\\"flat\\"}"	t	14	14	2026-01-31 12:39:56.775323+00	2026-01-31 12:39:56.775323+00
337	flux-kontext	Flux Kontext	Flux Kontext - Context-aware image editing and generation by Black Forest Labs.	image	kie.ai	"[\\"flux-kontext\\",\\"kontext\\"]"	50	"[\\"1:1\\",\\"16:9\\",\\"9:16\\",\\"4:3\\",\\"3:4\\"]"	\N	\N	\N	"{\\"apiEndpoint\\":\\"/api/v1/jobs/createTask\\",\\"apiPayloadFormat\\":\\"market\\",\\"kieModelId\\":\\"flux-kontext\\",\\"generateType\\":\\"text-to-image\\",\\"inputFields\\":[{\\"key\\":\\"aspect_ratio\\",\\"label\\":\\"Aspect Ratio\\",\\"type\\":\\"select\\",\\"options\\":[{\\"value\\":\\"1:1\\",\\"label\\":\\"1:1\\"},{\\"value\\":\\"16:9\\",\\"label\\":\\"16:9\\"},{\\"value\\":\\"9:16\\",\\"label\\":\\"9:16\\"},{\\"value\\":\\"4:3\\",\\"label\\":\\"4:3\\"},{\\"value\\":\\"3:4\\",\\"label\\":\\"3:4\\"}],\\"default\\":\\"1:1\\"},{\\"key\\":\\"image_input\\",\\"label\\":\\"Reference Image\\",\\"type\\":\\"image_urls\\"}],\\"pricingTiers\\":{\\"default\\":50},\\"pricingFormula\\":\\"flat\\"}"	t	8	8	2026-01-31 12:39:56.776808+00	2026-01-31 12:39:56.776808+00
338	flux-2/pro-text-to-image	Flux 2 Pro	Flux 2 Pro - Latest professional image generation.	image	kie.ai	"[\\"flux-2-pro\\",\\"flux2-pro\\"]"	45	"[\\"1:1\\",\\"16:9\\",\\"9:16\\",\\"4:3\\",\\"3:4\\"]"	\N	\N	\N	"{\\"apiEndpoint\\":\\"/api/v1/jobs/createTask\\",\\"apiPayloadFormat\\":\\"market\\",\\"kieModelId\\":\\"flux-2/pro-text-to-image\\",\\"generateType\\":\\"text-to-image\\",\\"inputFields\\":[{\\"key\\":\\"aspect_ratio\\",\\"label\\":\\"Aspect Ratio\\",\\"type\\":\\"select\\",\\"options\\":[{\\"value\\":\\"1:1\\",\\"label\\":\\"1:1\\"},{\\"value\\":\\"16:9\\",\\"label\\":\\"16:9\\"},{\\"value\\":\\"9:16\\",\\"label\\":\\"9:16\\"},{\\"value\\":\\"4:3\\",\\"label\\":\\"4:3\\"},{\\"value\\":\\"3:4\\",\\"label\\":\\"3:4\\"}],\\"default\\":\\"1:1\\"}],\\"pricingTiers\\":{\\"default\\":45},\\"pricingFormula\\":\\"flat\\"}"	t	9	9	2026-01-31 12:39:56.778021+00	2026-01-31 12:39:56.778021+00
339	flux-2/flex-text-to-image	Flux 2 Flex	Flux 2 Flex - Flexible text-to-image generation.	image	kie.ai	"[\\"flux-2-flex\\",\\"flux2\\"]"	30	"[\\"1:1\\",\\"16:9\\",\\"9:16\\"]"	\N	\N	\N	"{\\"apiEndpoint\\":\\"/api/v1/jobs/createTask\\",\\"apiPayloadFormat\\":\\"market\\",\\"kieModelId\\":\\"flux-2/flex-text-to-image\\",\\"generateType\\":\\"text-to-image\\",\\"inputFields\\":[{\\"key\\":\\"aspect_ratio\\",\\"label\\":\\"Aspect Ratio\\",\\"type\\":\\"select\\",\\"options\\":[{\\"value\\":\\"1:1\\",\\"label\\":\\"1:1\\"},{\\"value\\":\\"16:9\\",\\"label\\":\\"16:9\\"},{\\"value\\":\\"9:16\\",\\"label\\":\\"9:16\\"}],\\"default\\":\\"1:1\\"}],\\"pricingTiers\\":{\\"default\\":30},\\"pricingFormula\\":\\"flat\\"}"	t	16	16	2026-01-31 12:39:56.77927+00	2026-01-31 12:39:56.77927+00
340	grok-imagine/text-to-image	Grok Imagine	xAI Grok Imagine - Text-to-image generation.	image	kie.ai	"[\\"grok\\",\\"grok-imagine\\",\\"grok-image\\"]"	40	"[\\"1:1\\",\\"16:9\\",\\"9:16\\"]"	\N	\N	\N	"{\\"apiEndpoint\\":\\"/api/v1/jobs/createTask\\",\\"apiPayloadFormat\\":\\"market\\",\\"kieModelId\\":\\"grok-imagine/text-to-image\\",\\"generateType\\":\\"text-to-image\\",\\"inputFields\\":[{\\"key\\":\\"aspect_ratio\\",\\"label\\":\\"Aspect Ratio\\",\\"type\\":\\"select\\",\\"options\\":[{\\"value\\":\\"1:1\\",\\"label\\":\\"1:1\\"},{\\"value\\":\\"16:9\\",\\"label\\":\\"16:9\\"},{\\"value\\":\\"9:16\\",\\"label\\":\\"9:16\\"}],\\"default\\":\\"1:1\\"}],\\"pricingTiers\\":{\\"default\\":40},\\"pricingFormula\\":\\"flat\\"}"	t	11	11	2026-01-31 12:39:56.780449+00	2026-01-31 12:39:56.780449+00
341	grok-imagine/image-to-image	Grok Imagine I2I	xAI Grok Imagine - Image-to-image transformation.	image	kie.ai	"[\\"grok-i2i\\"]"	35	"[\\"1:1\\",\\"16:9\\",\\"9:16\\"]"	\N	\N	\N	"{\\"apiEndpoint\\":\\"/api/v1/jobs/createTask\\",\\"apiPayloadFormat\\":\\"market\\",\\"kieModelId\\":\\"grok-imagine/image-to-image\\",\\"generateType\\":\\"image-to-image\\",\\"inputFields\\":[{\\"key\\":\\"image_input\\",\\"label\\":\\"Source Image\\",\\"type\\":\\"image_urls\\",\\"required\\":true},{\\"key\\":\\"aspect_ratio\\",\\"label\\":\\"Aspect Ratio\\",\\"type\\":\\"select\\",\\"options\\":[{\\"value\\":\\"1:1\\",\\"label\\":\\"1:1\\"},{\\"value\\":\\"16:9\\",\\"label\\":\\"16:9\\"},{\\"value\\":\\"9:16\\",\\"label\\":\\"9:16\\"}],\\"default\\":\\"1:1\\"}],\\"pricingTiers\\":{\\"default\\":35},\\"pricingFormula\\":\\"flat\\"}"	t	17	17	2026-01-31 12:39:56.781439+00	2026-01-31 12:39:56.781439+00
342	grok-imagine/upscale	Grok Upscale	xAI Grok - Image upscaling.	image	kie.ai	"[\\"grok-upscale\\"]"	20	"[\\"1:1\\"]"	\N	\N	\N	"{\\"apiEndpoint\\":\\"/api/v1/jobs/createTask\\",\\"apiPayloadFormat\\":\\"market\\",\\"kieModelId\\":\\"grok-imagine/upscale\\",\\"generateType\\":\\"upscale\\",\\"inputFields\\":[{\\"key\\":\\"image_input\\",\\"label\\":\\"Source Image\\",\\"type\\":\\"image_urls\\",\\"required\\":true}],\\"pricingTiers\\":{\\"default\\":20},\\"pricingFormula\\":\\"flat\\"}"	t	40	40	2026-01-31 12:39:56.78234+00	2026-01-31 12:39:56.78234+00
343	seedream	Seedream 3.0	Seedream 3.0 - Dreamlike image generation.	image	kie.ai	"[\\"seedream-3\\",\\"seedream3\\"]"	25	"[\\"1:1\\",\\"16:9\\",\\"9:16\\"]"	\N	\N	\N	"{\\"apiEndpoint\\":\\"/api/v1/jobs/createTask\\",\\"apiPayloadFormat\\":\\"market\\",\\"kieModelId\\":\\"seedream\\",\\"generateType\\":\\"text-to-image\\",\\"inputFields\\":[{\\"key\\":\\"aspect_ratio\\",\\"label\\":\\"Aspect Ratio\\",\\"type\\":\\"select\\",\\"options\\":[{\\"value\\":\\"1:1\\",\\"label\\":\\"1:1\\"},{\\"value\\":\\"16:9\\",\\"label\\":\\"16:9\\"},{\\"value\\":\\"9:16\\",\\"label\\":\\"9:16\\"}],\\"default\\":\\"1:1\\"}],\\"pricingTiers\\":{\\"default\\":25},\\"pricingFormula\\":\\"flat\\"}"	t	20	20	2026-01-31 12:39:56.783221+00	2026-01-31 12:39:56.783221+00
344	seedream/seedream-v4-text-to-image	Seedream 4.0	Seedream 4.0 - Enhanced dreamlike image generation.	image	kie.ai	"[\\"seedream-4\\",\\"seedream4\\"]"	35	"[\\"1:1\\",\\"16:9\\",\\"9:16\\",\\"4:3\\",\\"3:4\\"]"	\N	\N	\N	"{\\"apiEndpoint\\":\\"/api/v1/jobs/createTask\\",\\"apiPayloadFormat\\":\\"market\\",\\"kieModelId\\":\\"seedream/seedream-v4-text-to-image\\",\\"generateType\\":\\"text-to-image\\",\\"inputFields\\":[{\\"key\\":\\"aspect_ratio\\",\\"label\\":\\"Aspect Ratio\\",\\"type\\":\\"select\\",\\"options\\":[{\\"value\\":\\"1:1\\",\\"label\\":\\"1:1\\"},{\\"value\\":\\"16:9\\",\\"label\\":\\"16:9\\"},{\\"value\\":\\"9:16\\",\\"label\\":\\"9:16\\"},{\\"value\\":\\"4:3\\",\\"label\\":\\"4:3\\"},{\\"value\\":\\"3:4\\",\\"label\\":\\"3:4\\"}],\\"default\\":\\"1:1\\"}],\\"pricingTiers\\":{\\"default\\":35},\\"pricingFormula\\":\\"flat\\"}"	t	18	18	2026-01-31 12:39:56.785114+00	2026-01-31 12:39:56.785114+00
345	seedream/4.5-text-to-image	Seedream 4.5	Seedream 4.5 - Latest version with best quality.	image	kie.ai	"[\\"seedream-4.5\\",\\"seedream45\\"]"	45	"[\\"1:1\\",\\"16:9\\",\\"9:16\\",\\"4:3\\",\\"3:4\\"]"	\N	\N	\N	"{\\"apiEndpoint\\":\\"/api/v1/jobs/createTask\\",\\"apiPayloadFormat\\":\\"market\\",\\"kieModelId\\":\\"seedream/4.5-text-to-image\\",\\"generateType\\":\\"text-to-image\\",\\"inputFields\\":[{\\"key\\":\\"aspect_ratio\\",\\"label\\":\\"Aspect Ratio\\",\\"type\\":\\"select\\",\\"options\\":[{\\"value\\":\\"1:1\\",\\"label\\":\\"1:1\\"},{\\"value\\":\\"16:9\\",\\"label\\":\\"16:9\\"},{\\"value\\":\\"9:16\\",\\"label\\":\\"9:16\\"},{\\"value\\":\\"4:3\\",\\"label\\":\\"4:3\\"},{\\"value\\":\\"3:4\\",\\"label\\":\\"3:4\\"}],\\"default\\":\\"1:1\\"}],\\"pricingTiers\\":{\\"default\\":45},\\"pricingFormula\\":\\"flat\\"}"	t	13	13	2026-01-31 12:39:56.786142+00	2026-01-31 12:39:56.786142+00
346	ideogram/character	Ideogram Character	Ideogram Character - Consistent character generation with excellent text rendering.	image	kie.ai	"[\\"ideogram\\",\\"ideogram-character\\"]"	50	"[\\"1:1\\",\\"16:9\\",\\"9:16\\",\\"4:3\\",\\"3:4\\"]"	\N	\N	\N	"{\\"apiEndpoint\\":\\"/api/v1/jobs/createTask\\",\\"apiPayloadFormat\\":\\"market\\",\\"kieModelId\\":\\"ideogram/character\\",\\"generateType\\":\\"text-to-image\\",\\"inputFields\\":[{\\"key\\":\\"aspect_ratio\\",\\"label\\":\\"Aspect Ratio\\",\\"type\\":\\"select\\",\\"options\\":[{\\"value\\":\\"1:1\\",\\"label\\":\\"1:1\\"},{\\"value\\":\\"16:9\\",\\"label\\":\\"16:9\\"},{\\"value\\":\\"9:16\\",\\"label\\":\\"9:16\\"},{\\"value\\":\\"4:3\\",\\"label\\":\\"4:3\\"},{\\"value\\":\\"3:4\\",\\"label\\":\\"3:4\\"}],\\"default\\":\\"1:1\\"},{\\"key\\":\\"image_input\\",\\"label\\":\\"Character Reference\\",\\"type\\":\\"image_urls\\"}],\\"pricingTiers\\":{\\"default\\":50},\\"pricingFormula\\":\\"flat\\"}"	t	19	19	2026-01-31 12:39:56.787333+00	2026-01-31 12:39:56.787333+00
347	ideogram/v3-reframe	Ideogram V3 Reframe	Ideogram V3 Reframe - Reframe and extend images.	image	kie.ai	"[\\"ideogram-reframe\\"]"	40	"[\\"1:1\\",\\"16:9\\",\\"9:16\\",\\"4:3\\",\\"3:4\\"]"	\N	\N	\N	"{\\"apiEndpoint\\":\\"/api/v1/jobs/createTask\\",\\"apiPayloadFormat\\":\\"market\\",\\"kieModelId\\":\\"ideogram/v3-reframe\\",\\"generateType\\":\\"reframe\\",\\"inputFields\\":[{\\"key\\":\\"image_input\\",\\"label\\":\\"Source Image\\",\\"type\\":\\"image_urls\\",\\"required\\":true},{\\"key\\":\\"aspect_ratio\\",\\"label\\":\\"Target Aspect Ratio\\",\\"type\\":\\"select\\",\\"options\\":[{\\"value\\":\\"1:1\\",\\"label\\":\\"1:1\\"},{\\"value\\":\\"16:9\\",\\"label\\":\\"16:9\\"},{\\"value\\":\\"9:16\\",\\"label\\":\\"9:16\\"},{\\"value\\":\\"4:3\\",\\"label\\":\\"4:3\\"},{\\"value\\":\\"3:4\\",\\"label\\":\\"3:4\\"}],\\"default\\":\\"16:9\\"}],\\"pricingTiers\\":{\\"default\\":40},\\"pricingFormula\\":\\"flat\\"}"	t	25	25	2026-01-31 12:39:56.788347+00	2026-01-31 12:39:56.788347+00
348	qwen/text-to-image	Qwen Image	Alibaba Qwen - Text-to-image generation.	image	kie.ai	"[\\"qwen\\",\\"qwen-image\\"]"	30	"[\\"1:1\\",\\"16:9\\",\\"9:16\\"]"	\N	\N	\N	"{\\"apiEndpoint\\":\\"/api/v1/jobs/createTask\\",\\"apiPayloadFormat\\":\\"market\\",\\"kieModelId\\":\\"qwen/text-to-image\\",\\"generateType\\":\\"text-to-image\\",\\"inputFields\\":[{\\"key\\":\\"aspect_ratio\\",\\"label\\":\\"Aspect Ratio\\",\\"type\\":\\"select\\",\\"options\\":[{\\"value\\":\\"1:1\\",\\"label\\":\\"1:1\\"},{\\"value\\":\\"16:9\\",\\"label\\":\\"16:9\\"},{\\"value\\":\\"9:16\\",\\"label\\":\\"9:16\\"}],\\"default\\":\\"1:1\\"}],\\"pricingTiers\\":{\\"default\\":30},\\"pricingFormula\\":\\"flat\\"}"	t	22	22	2026-01-31 12:39:56.78926+00	2026-01-31 12:39:56.78926+00
349	qwen/image-edit	Qwen Image Edit	Alibaba Qwen - AI image editing.	image	kie.ai	"[\\"qwen-edit\\"]"	25	"[\\"1:1\\",\\"16:9\\",\\"9:16\\"]"	\N	\N	\N	"{\\"apiEndpoint\\":\\"/api/v1/jobs/createTask\\",\\"apiPayloadFormat\\":\\"market\\",\\"kieModelId\\":\\"qwen/image-edit\\",\\"generateType\\":\\"edit\\",\\"inputFields\\":[{\\"key\\":\\"image_input\\",\\"label\\":\\"Source Image\\",\\"type\\":\\"image_urls\\",\\"required\\":true}],\\"pricingTiers\\":{\\"default\\":25},\\"pricingFormula\\":\\"flat\\"}"	t	26	26	2026-01-31 12:39:56.790175+00	2026-01-31 12:39:56.790175+00
350	z-image	Z-Image	Z-Image - High quality image generation.	image	kie.ai	"[\\"z-image\\",\\"zimage\\"]"	35	"[\\"1:1\\",\\"16:9\\",\\"9:16\\",\\"4:3\\",\\"3:4\\"]"	\N	\N	\N	"{\\"apiEndpoint\\":\\"/api/v1/jobs/createTask\\",\\"apiPayloadFormat\\":\\"market\\",\\"kieModelId\\":\\"z-image\\",\\"generateType\\":\\"text-to-image\\",\\"inputFields\\":[{\\"key\\":\\"aspect_ratio\\",\\"label\\":\\"Aspect Ratio\\",\\"type\\":\\"select\\",\\"options\\":[{\\"value\\":\\"1:1\\",\\"label\\":\\"1:1\\"},{\\"value\\":\\"16:9\\",\\"label\\":\\"16:9\\"},{\\"value\\":\\"9:16\\",\\"label\\":\\"9:16\\"},{\\"value\\":\\"4:3\\",\\"label\\":\\"4:3\\"},{\\"value\\":\\"3:4\\",\\"label\\":\\"3:4\\"}],\\"default\\":\\"1:1\\"}],\\"pricingTiers\\":{\\"default\\":35},\\"pricingFormula\\":\\"flat\\"}"	t	21	21	2026-01-31 12:39:56.791097+00	2026-01-31 12:39:56.791097+00
351	recraft/crisp-upscale	Recraft Upscale	Recraft Crisp Upscale - Professional image upscaling.	image	kie.ai	"[\\"recraft-upscale\\",\\"crisp-upscale\\"]"	25	"[\\"1:1\\"]"	\N	\N	\N	"{\\"apiEndpoint\\":\\"/api/v1/jobs/createTask\\",\\"apiPayloadFormat\\":\\"market\\",\\"kieModelId\\":\\"recraft/crisp-upscale\\",\\"generateType\\":\\"upscale\\",\\"inputFields\\":[{\\"key\\":\\"image_input\\",\\"label\\":\\"Source Image\\",\\"type\\":\\"image_urls\\",\\"required\\":true}],\\"pricingTiers\\":{\\"default\\":25},\\"pricingFormula\\":\\"flat\\"}"	t	35	35	2026-01-31 12:39:56.792061+00	2026-01-31 12:39:56.792061+00
352	recraft/remove-background	Background Removal	Recraft - AI background removal.	image	kie.ai	"[\\"remove-bg\\",\\"bg-remove\\"]"	10	"[\\"1:1\\"]"	\N	\N	\N	"{\\"apiEndpoint\\":\\"/api/v1/jobs/createTask\\",\\"apiPayloadFormat\\":\\"market\\",\\"kieModelId\\":\\"recraft/remove-background\\",\\"generateType\\":\\"remove-background\\",\\"inputFields\\":[{\\"key\\":\\"image_input\\",\\"label\\":\\"Source Image\\",\\"type\\":\\"image_urls\\",\\"required\\":true}],\\"pricingTiers\\":{\\"default\\":10},\\"pricingFormula\\":\\"flat\\"}"	t	36	36	2026-01-31 12:39:56.793724+00	2026-01-31 12:39:56.793724+00
353	topaz/image-upscale	Topaz Image Upscale	Topaz - Professional AI image upscaling.	image	kie.ai	"[\\"topaz-upscale\\",\\"topaz\\"]"	30	"[\\"1:1\\"]"	\N	\N	\N	"{\\"apiEndpoint\\":\\"/api/v1/jobs/createTask\\",\\"apiPayloadFormat\\":\\"market\\",\\"kieModelId\\":\\"topaz/image-upscale\\",\\"generateType\\":\\"upscale\\",\\"inputFields\\":[{\\"key\\":\\"image_input\\",\\"label\\":\\"Source Image\\",\\"type\\":\\"image_urls\\",\\"required\\":true}],\\"pricingTiers\\":{\\"default\\":30},\\"pricingFormula\\":\\"flat\\"}"	t	34	34	2026-01-31 12:39:56.795054+00	2026-01-31 12:39:56.795054+00
354	suno/generate-music	Suno V4.5 Plus	Suno V4.5 Plus - Premium AI music generation with enhanced vocals, up to 8 minutes.	audio	kie.ai	"[\\"suno\\",\\"suno-plus\\",\\"suno-4.5\\"]"	60	\N	\N	\N	"[\\"default\\"]"	"{\\"apiEndpoint\\":\\"/api/v1/generate\\",\\"apiPayloadFormat\\":\\"suno\\",\\"kieModelId\\":\\"V4_5PLUS\\",\\"generateType\\":\\"music-generation\\",\\"maxDuration\\":480,\\"inputFields\\":[{\\"key\\":\\"instrumental\\",\\"label\\":\\"Instrumental Only\\",\\"type\\":\\"boolean\\",\\"default\\":false},{\\"key\\":\\"customMode\\",\\"label\\":\\"Custom Mode\\",\\"type\\":\\"boolean\\",\\"default\\":false},{\\"key\\":\\"style\\",\\"label\\":\\"Music Style\\",\\"type\\":\\"text\\"},{\\"key\\":\\"title\\",\\"label\\":\\"Track Title\\",\\"type\\":\\"text\\"}],\\"pricingTiers\\":{\\"default\\":60},\\"pricingFormula\\":\\"flat\\"}"	t	2	2	2026-01-31 12:39:56.796505+00	2026-01-31 12:39:56.796505+00
355	suno/extend-music	Suno Extend	Extend existing songs with Suno AI.	audio	kie.ai	"[\\"suno-extend\\"]"	60	\N	\N	\N	"[\\"default\\"]"	"{\\"apiEndpoint\\":\\"/api/v1/generate\\",\\"apiPayloadFormat\\":\\"suno\\",\\"kieModelId\\":\\"V4_5PLUS\\",\\"generateType\\":\\"music-extend\\",\\"inputFields\\":[{\\"key\\":\\"audio_urls\\",\\"label\\":\\"Source Audio\\",\\"type\\":\\"audio_urls\\",\\"required\\":true}],\\"pricingTiers\\":{\\"default\\":60},\\"pricingFormula\\":\\"flat\\"}"	t	8	8	2026-01-31 12:39:56.798791+00	2026-01-31 12:39:56.798791+00
356	suno/cover-suno	Suno Music Cover	Create AI covers of songs with different voices.	audio	kie.ai	"[\\"suno-cover\\",\\"music-cover\\"]"	60	\N	\N	\N	"[\\"various\\"]"	"{\\"apiEndpoint\\":\\"/api/v1/generate\\",\\"apiPayloadFormat\\":\\"suno\\",\\"kieModelId\\":null,\\"generateType\\":\\"music-cover\\",\\"inputFields\\":[{\\"key\\":\\"audio_urls\\",\\"label\\":\\"Source Audio\\",\\"type\\":\\"audio_urls\\",\\"required\\":true}],\\"pricingTiers\\":{\\"default\\":60},\\"pricingFormula\\":\\"flat\\"}"	t	6	6	2026-01-31 12:39:56.800021+00	2026-01-31 12:39:56.800021+00
357	suno/add-vocals	Suno Add Vocals	Add vocals to instrumental tracks.	audio	kie.ai	"[\\"add-vocals\\"]"	60	\N	\N	\N	"[\\"various\\"]"	"{\\"apiEndpoint\\":\\"/api/v1/generate\\",\\"apiPayloadFormat\\":\\"suno\\",\\"kieModelId\\":null,\\"generateType\\":\\"add-vocals\\",\\"inputFields\\":[{\\"key\\":\\"audio_urls\\",\\"label\\":\\"Instrumental Track\\",\\"type\\":\\"audio_urls\\",\\"required\\":true}],\\"pricingTiers\\":{\\"default\\":60},\\"pricingFormula\\":\\"flat\\"}"	t	10	10	2026-01-31 12:39:56.801448+00	2026-01-31 12:39:56.801448+00
358	suno/add-instrumental	Suno Add Instrumental	Add instrumental to vocal tracks.	audio	kie.ai	"[\\"add-instrumental\\"]"	60	\N	\N	\N	"[]"	"{\\"apiEndpoint\\":\\"/api/v1/generate\\",\\"apiPayloadFormat\\":\\"suno\\",\\"kieModelId\\":null,\\"generateType\\":\\"add-instrumental\\",\\"inputFields\\":[{\\"key\\":\\"audio_urls\\",\\"label\\":\\"Vocal Track\\",\\"type\\":\\"audio_urls\\",\\"required\\":true}],\\"pricingTiers\\":{\\"default\\":60},\\"pricingFormula\\":\\"flat\\"}"	t	11	11	2026-01-31 12:39:56.802423+00	2026-01-31 12:39:56.802423+00
359	suno/separate-vocals	Vocal & Instrument Separation	Separate vocals from instrumentals (karaoke maker).	audio	kie.ai	"[\\"vocal-removal\\",\\"karaoke\\",\\"stem-split\\"]"	50	\N	\N	\N	"[]"	"{\\"apiEndpoint\\":\\"/api/v1/generate\\",\\"apiPayloadFormat\\":\\"suno\\",\\"kieModelId\\":null,\\"generateType\\":\\"vocal-separation\\",\\"inputFields\\":[{\\"key\\":\\"audio_urls\\",\\"label\\":\\"Source Audio\\",\\"type\\":\\"audio_urls\\",\\"required\\":true}],\\"pricingTiers\\":{\\"default\\":50},\\"pricingFormula\\":\\"flat\\"}"	t	12	12	2026-01-31 12:39:56.803454+00	2026-01-31 12:39:56.803454+00
360	suno/generate-lyrics	AI Lyrics Generator	Generate song lyrics with AI.	audio	kie.ai	"[\\"lyrics\\",\\"generate-lyrics\\"]"	5	\N	\N	\N	"[]"	"{\\"apiEndpoint\\":\\"/api/v1/generate\\",\\"apiPayloadFormat\\":\\"suno\\",\\"kieModelId\\":null,\\"generateType\\":\\"lyrics\\",\\"inputFields\\":[{\\"key\\":\\"style\\",\\"label\\":\\"Music Style\\",\\"type\\":\\"text\\"},{\\"key\\":\\"title\\",\\"label\\":\\"Song Title\\",\\"type\\":\\"text\\"}],\\"pricingTiers\\":{\\"default\\":5},\\"pricingFormula\\":\\"flat\\"}"	t	15	15	2026-01-31 12:39:56.804518+00	2026-01-31 12:39:56.804518+00
361	suno/generate-midi	MIDI Generation	Convert audio to MIDI or generate MIDI from prompts.	audio	kie.ai	"[\\"midi\\",\\"audio-to-midi\\"]"	5	\N	\N	\N	"[]"	"{\\"apiEndpoint\\":\\"/api/v1/generate\\",\\"apiPayloadFormat\\":\\"suno\\",\\"kieModelId\\":null,\\"generateType\\":\\"midi\\",\\"inputFields\\":[{\\"key\\":\\"audio_urls\\",\\"label\\":\\"Source Audio (optional)\\",\\"type\\":\\"audio_urls\\"}],\\"pricingTiers\\":{\\"default\\":5},\\"pricingFormula\\":\\"flat\\"}"	t	18	18	2026-01-31 12:39:56.805524+00	2026-01-31 12:39:56.805524+00
362	suno/create-music-video	AI Music Video	Create AI-generated music videos.	audio	kie.ai	"[\\"music-video\\"]"	60	\N	\N	\N	"[]"	"{\\"apiEndpoint\\":\\"/api/v1/generate\\",\\"apiPayloadFormat\\":\\"suno\\",\\"kieModelId\\":null,\\"generateType\\":\\"music-video\\",\\"inputFields\\":[{\\"key\\":\\"audio_urls\\",\\"label\\":\\"Music Track\\",\\"type\\":\\"audio_urls\\"},{\\"key\\":\\"style\\",\\"label\\":\\"Visual Style\\",\\"type\\":\\"text\\"}],\\"pricingTiers\\":{\\"default\\":60},\\"pricingFormula\\":\\"flat\\"}"	t	5	5	2026-01-31 12:39:56.806444+00	2026-01-31 12:39:56.806444+00
363	elevenlabs/text-to-speech-multilingual-v2	ElevenLabs TTS	ElevenLabs Text-to-Speech - Ultra-realistic multilingual voice synthesis.	audio	kie.ai	"[\\"elevenlabs\\",\\"tts\\",\\"text-to-speech\\"]"	15	\N	\N	\N	"[\\"rachel\\",\\"adam\\",\\"antoni\\",\\"bella\\",\\"domi\\",\\"elli\\",\\"josh\\"]"	"{\\"apiEndpoint\\":\\"/api/v1/jobs/createTask\\",\\"apiPayloadFormat\\":\\"elevenlabs\\",\\"kieModelId\\":\\"elevenlabs/text-to-speech-multilingual-v2\\",\\"generateType\\":\\"text-to-speech\\",\\"inputFields\\":[{\\"key\\":\\"voice\\",\\"label\\":\\"Voice\\",\\"type\\":\\"select\\",\\"options\\":[{\\"value\\":\\"rachel\\",\\"label\\":\\"Rachel\\"},{\\"value\\":\\"adam\\",\\"label\\":\\"Adam\\"},{\\"value\\":\\"antoni\\",\\"label\\":\\"Antoni\\"},{\\"value\\":\\"bella\\",\\"label\\":\\"Bella\\"},{\\"value\\":\\"domi\\",\\"label\\":\\"Domi\\"},{\\"value\\":\\"elli\\",\\"label\\":\\"Elli\\"},{\\"value\\":\\"josh\\",\\"label\\":\\"Josh\\"}],\\"default\\":\\"rachel\\"},{\\"key\\":\\"speed\\",\\"label\\":\\"Speed\\",\\"type\\":\\"number\\",\\"default\\":1}],\\"pricingTiers\\":{\\"default\\":15},\\"pricingFormula\\":\\"flat\\"}"	t	3	3	2026-01-31 12:39:56.807459+00	2026-01-31 12:39:56.807459+00
364	elevenlabs/text-to-speech-turbo-2-5	ElevenLabs TTS Turbo	ElevenLabs TTS Turbo 2.5 - Fast text-to-speech.	audio	kie.ai	"[\\"elevenlabs-turbo\\",\\"tts-fast\\"]"	10	\N	\N	\N	"[\\"default\\"]"	"{\\"apiEndpoint\\":\\"/api/v1/jobs/createTask\\",\\"apiPayloadFormat\\":\\"elevenlabs\\",\\"kieModelId\\":\\"elevenlabs/text-to-speech-turbo-2-5\\",\\"generateType\\":\\"text-to-speech\\",\\"inputFields\\":[{\\"key\\":\\"voice\\",\\"label\\":\\"Voice\\",\\"type\\":\\"select\\",\\"options\\":[{\\"value\\":\\"default\\",\\"label\\":\\"Default\\"}],\\"default\\":\\"default\\"}],\\"pricingTiers\\":{\\"default\\":10},\\"pricingFormula\\":\\"flat\\"}"	t	7	7	2026-01-31 12:39:56.808901+00	2026-01-31 12:39:56.808901+00
365	elevenlabs/text-to-dialogue-v3	ElevenLabs Dialogue	ElevenLabs Text-to-Dialogue - Generate multi-speaker conversations.	audio	kie.ai	"[\\"dialogue\\",\\"multi-speaker\\"]"	25	\N	\N	\N	"[\\"multiple\\"]"	"{\\"apiEndpoint\\":\\"/api/v1/jobs/createTask\\",\\"apiPayloadFormat\\":\\"elevenlabs\\",\\"kieModelId\\":\\"elevenlabs/text-to-dialogue-v3\\",\\"generateType\\":\\"dialogue\\",\\"inputFields\\":[],\\"pricingTiers\\":{\\"default\\":25},\\"pricingFormula\\":\\"flat\\"}"	t	9	9	2026-01-31 12:39:56.810419+00	2026-01-31 12:39:56.810419+00
366	elevenlabs/sound-effect-v2	AI Sound Effects	ElevenLabs Sound Effects V2 - Generate custom sound effects.	audio	kie.ai	"[\\"sfx\\",\\"sound-effects\\"]"	20	\N	\N	\N	"[]"	"{\\"apiEndpoint\\":\\"/api/v1/jobs/createTask\\",\\"apiPayloadFormat\\":\\"elevenlabs\\",\\"kieModelId\\":\\"elevenlabs/sound-effect-v2\\",\\"generateType\\":\\"sound-effects\\",\\"maxDuration\\":30,\\"inputFields\\":[],\\"pricingTiers\\":{\\"default\\":20},\\"pricingFormula\\":\\"flat\\"}"	t	14	14	2026-01-31 12:39:56.812377+00	2026-01-31 12:39:56.812377+00
368	elevenlabs/speech-to-text	Speech to Text	ElevenLabs Speech-to-Text - Accurate transcription.	audio	kie.ai	"[\\"stt\\",\\"transcribe\\"]"	10	\N	\N	\N	"[]"	"{\\"apiEndpoint\\":\\"/api/v1/jobs/createTask\\",\\"apiPayloadFormat\\":\\"elevenlabs\\",\\"kieModelId\\":\\"elevenlabs/speech-to-text\\",\\"generateType\\":\\"speech-to-text\\",\\"inputFields\\":[{\\"key\\":\\"audio_urls\\",\\"label\\":\\"Audio File\\",\\"type\\":\\"audio_urls\\",\\"required\\":true}],\\"pricingTiers\\":{\\"default\\":10},\\"pricingFormula\\":\\"flat\\"}"	t	17	17	2026-01-31 12:39:56.816409+00	2026-01-31 12:39:56.816409+00
369	infinitalk/from-audio	Infinitalk	Infinitalk - AI conversation and audio processing.	audio	kie.ai	"[\\"infinitalk\\"]"	30	\N	\N	\N	"[]"	"{\\"apiEndpoint\\":\\"/api/v1/jobs/createTask\\",\\"apiPayloadFormat\\":\\"market\\",\\"kieModelId\\":\\"infinitalk/from-audio\\",\\"generateType\\":\\"audio-processing\\",\\"inputFields\\":[{\\"key\\":\\"audio_urls\\",\\"label\\":\\"Source Audio\\",\\"type\\":\\"audio_urls\\",\\"required\\":true}],\\"pricingTiers\\":{\\"default\\":30},\\"pricingFormula\\":\\"flat\\"}"	t	20	20	2026-01-31 12:39:56.81906+00	2026-01-31 12:39:56.81906+00
329	gpt-4o-image	GPT-4o Image	OpenAI GPT-4o native image generation with excellent instruction following.	image	kie.ai	"[\\"4o-image\\",\\"gpt4o-image\\",\\"openai-image\\"]"	60	"[\\"1:1\\",\\"16:9\\",\\"9:16\\"]"	\N	\N	\N	"{\\"apiEndpoint\\":\\"/api/v1/jobs/createTask\\",\\"apiPayloadFormat\\":\\"market\\",\\"kieModelId\\":\\"gpt-4o-image\\",\\"generateType\\":\\"text-to-image\\",\\"inputFields\\":[{\\"key\\":\\"aspect_ratio\\",\\"label\\":\\"Aspect Ratio\\",\\"type\\":\\"select\\",\\"options\\":[{\\"value\\":\\"1:1\\",\\"label\\":\\"1:1\\"},{\\"value\\":\\"16:9\\",\\"label\\":\\"16:9\\"},{\\"value\\":\\"9:16\\",\\"label\\":\\"9:16\\"}],\\"default\\":\\"1:1\\"}],\\"pricingTiers\\":{\\"default\\":60},\\"pricingFormula\\":\\"flat\\"}"	t	5	5	2026-01-31 12:39:56.76499+00	2026-01-31 12:39:56.76499+00
335	google/pro-image-to-image	Nano Banana Pro	Nano Banana Pro - Advanced image editing and generation with 1K/2K/4K output.	image	kie.ai	["nano-banana-pro","banana-pro"]	90	["1:1","16:9","9:16","4:3","3:4","2:3","3:2","4:5","5:4","21:9"]	\N	\N	\N	{"apiEndpoint":"/api/v1/jobs/createTask","apiPayloadFormat":"market","kieModelId":"nano-banana-pro","generateType":"image-to-image","inputFields":[{"key":"resolution","label":"Resolution","type":"select","options":[{"value":"1K","label":"1K"},{"value":"2K","label":"2K"},{"value":"4K","label":"4K"}],"default":"1K","affectsPricing":true},{"key":"aspect_ratio","label":"Aspect Ratio","type":"select","options":[{"value":"1:1","label":"1:1"},{"value":"2:3","label":"2:3"},{"value":"3:2","label":"3:2"},{"value":"3:4","label":"3:4"},{"value":"4:3","label":"4:3"},{"value":"4:5","label":"4:5"},{"value":"5:4","label":"5:4"},{"value":"9:16","label":"9:16"},{"value":"16:9","label":"16:9"},{"value":"21:9","label":"21:9"},{"value":"auto","label":"Auto"}],"default":"1:1"},{"key":"output_format","label":"Format","type":"select","options":[{"value":"png","label":"PNG"},{"value":"jpg","label":"JPG"}],"default":"png"},{"key":"image_input","label":"Reference Images","type":"image_urls"}],"pricingTiers":{"1K":90,"2K":90,"4K":120},"pricingFormula":"flat"}	t	10	10	2026-01-31 12:39:56.77373+00	2026-01-31 17:02:46.362+00
\.


--
-- Data for Name: media_providers; Type: TABLE DATA; Schema: public; Owner: smartspec
--

COPY public.media_providers (id, "providerName", "displayName", description, "providerType", "baseUrl", "callbackUrl", "apiKeyEncrypted", "hasApiKey", "availableModels", "defaultModel", "configJson", "isEnabled", "isPrimary", priority, "sortOrder", "lastTestedAt", "lastTestResult", "createdAt", "updatedAt") FROM stdin;
2	fal_ai	fal.ai	Fast inference platform for generative AI - supports real-time image and video generation with optimized latency	multimodal	https://fal.run	\N	\N	f	"[{\\"id\\":\\"fal-ai/flux/schnell\\",\\"name\\":\\"Flux Schnell\\",\\"type\\":\\"image\\",\\"description\\":\\"Ultra-fast image generation\\"},{\\"id\\":\\"fal-ai/flux/dev\\",\\"name\\":\\"Flux Dev\\",\\"type\\":\\"image\\",\\"description\\":\\"High quality image generation\\"},{\\"id\\":\\"fal-ai/flux-pro\\",\\"name\\":\\"Flux Pro\\",\\"type\\":\\"image\\",\\"description\\":\\"Professional image generation\\"},{\\"id\\":\\"fal-ai/stable-diffusion-v3-medium\\",\\"name\\":\\"SD3 Medium\\",\\"type\\":\\"image\\",\\"description\\":\\"Stable Diffusion 3\\"},{\\"id\\":\\"fal-ai/minimax-video-01\\",\\"name\\":\\"MiniMax Video\\",\\"type\\":\\"video\\",\\"description\\":\\"Video generation\\"}]"	fal-ai/flux/schnell	\N	f	f	10	1	\N	\N	2026-01-28 16:33:49.387802+00	2026-01-28 16:33:49.387802+00
3	replicate	Replicate	Run open-source AI models with a cloud API - supports thousands of community models	multimodal	https://api.replicate.com/v1	\N	\N	f	"[{\\"id\\":\\"stability-ai/sdxl\\",\\"name\\":\\"Stable Diffusion XL\\",\\"type\\":\\"image\\",\\"description\\":\\"High quality image generation\\"},{\\"id\\":\\"black-forest-labs/flux-schnell\\",\\"name\\":\\"Flux Schnell\\",\\"type\\":\\"image\\",\\"description\\":\\"Fast image generation\\"},{\\"id\\":\\"lucataco/animate-diff\\",\\"name\\":\\"AnimateDiff\\",\\"type\\":\\"video\\",\\"description\\":\\"Animation generation\\"}]"	stability-ai/sdxl	\N	f	f	20	2	\N	\N	2026-01-28 16:33:49.389588+00	2026-01-28 16:33:49.389588+00
1	kie_ai	Kie AI	Unified API marketplace for AI generation - supports image, video, and audio generation with 100+ models including DALL-E, Midjourney, Sora, and more	multimodal	https://api.kie.ai/api/v1	\N	d73b659e4ea74dce4fd00bb6:8853a51e44004d2b95329f176f683975:4895741f7de15fe50d72e2383d4acd36576d9d30779e3d7d5146c4e61bafed9c	t	[{"id":"flux-pro-v1.1","name":"Flux Pro 1.1","type":"image","description":"High-quality image generation"},{"id":"midjourney-v6.1","name":"Midjourney V6.1","type":"image","description":"Premium artistic image generation"},{"id":"dall-e-3","name":"DALL-E 3","type":"image","description":"OpenAI's latest image model"},{"id":"gpt-4o-image","name":"GPT-4o Image","type":"image","description":"OpenAI GPT-4o image generation"},{"id":"stable-diffusion-3.5-large","name":"SD 3.5 Large","type":"image","description":"Stability AI's latest model"},{"id":"veo-3-fast","name":"Veo 3 Fast","type":"video","description":"Google's fast video generation"},{"id":"veo-3-quality","name":"Veo 3 Quality","type":"video","description":"Google's high-quality video"},{"id":"runway-gen-3-turbo","name":"Runway Gen-3 Turbo","type":"video","description":"Fast video generation"},{"id":"sora-2-pro","name":"Sora 2 Pro","type":"video","description":"OpenAI's video model"},{"id":"kling-1.6-standard","name":"Kling 1.6","type":"video","description":"Kuaishou video generation"},{"id":"suno-v4.5-plus","name":"Suno V4.5 Plus","type":"audio","description":"AI music generation"},{"id":"elevenlabs-tts-v3","name":"ElevenLabs TTS V3","type":"audio","description":"Text-to-speech"},{"id":"elevenlabs-sound-effects","name":"Sound Effects","type":"audio","description":"Sound effect generation"}]	flux-pro-v1.1	\N	t	t	0	0	\N	\N	2026-01-28 16:33:49.378226+00	2026-01-31 14:04:17.495+00
\.


--
-- Data for Name: media_tasks; Type: TABLE DATA; Schema: public; Owner: smartspec
--

COPY public.media_tasks (id, task_id, user_id, media_type, status, model, prompt, parameters, result_url, result_data, error_message, credits_used, credits_balance, created_at, started_at, completed_at) FROM stdin;
55447c2e-4a8c-44c9-9954-ce96ebebb8a4	\N	1	image	failed	google/pro-image-to-image	Create a photorealistic vertical street portrait of a 3-year-old Thai boy walking hand-in-hand with his 18-year-old mother in a modern city pedestrian area. The mother wears trendy, contemporary fashion—a stylish oversized jacket or cropped outerwear layered over a simple top, high-waisted jeans or a sleek skirt, clean sneakers, a small crossbody bag, and subtle jewelry—looking youthful and confident while gently guiding her child. The boy wears a coordinated modern outfit—soft cotton T-shirt, light jacket, comfy shorts or joggers, and small sneakers—looking curious and happy as he takes small steps beside her. Set the scene on a sunlit sidewalk with realistic urban details (storefront glass, street signs, soft greenery, and distant pedestrians). Use natural late-afternoon light with warm highlights and soft shadows; the camera is at adult waist height, slightly angled down to include both subjects full-body, with the child appearing naturally smaller in scale. Background should be softly blurred with realistic depth of field while keeping faces and hands sharp. Add subtle realism imperfections: a few stray hairs, slight fabric creases and wrinkles, tiny scuffs on shoes, gentle motion blur in one foot step, and a faint lens flare or sensor grain. Color grading should be natural and clean, not overly saturated, with true-to-life skin tones and accurate proportions.	{"size": null, "quality": null, "style": null, "n": 1, "response_format": "url", "user": null, "aspect_ratio": "9:16", "negative_prompt": null, "seed": null, "cfg_scale": null, "steps": null, "resolution": null, "output_format": null, "reference_image_urls": null, "reference_style_url": null, "api_config": null, "extra_params": null}	\N	\N	Kie.ai not configured. Please add API key in Admin > Media Providers.	\N	\N	2026-01-31 14:03:32.956914	2026-01-31 14:03:32.966814	2026-01-31 14:03:33.023144
adffbe00-4a07-49d4-82d3-6894f6430b0e	\N	1	image	failed	google/pro-image-to-image	Create a photorealistic vertical street portrait of a 3-year-old Thai boy walking hand-in-hand with his 18-year-old mother in a modern city pedestrian area. The mother wears trendy, contemporary fashion—a stylish oversized jacket or cropped outerwear layered over a simple top, high-waisted jeans or a sleek skirt, clean sneakers, a small crossbody bag, and subtle jewelry—looking youthful and confident while gently guiding her child. The boy wears a coordinated modern outfit—soft cotton T-shirt, light jacket, comfy shorts or joggers, and small sneakers—looking curious and happy as he takes small steps beside her. Set the scene on a sunlit sidewalk with realistic urban details (storefront glass, street signs, soft greenery, and distant pedestrians). Use natural late-afternoon light with warm highlights and soft shadows; the camera is at adult waist height, slightly angled down to include both subjects full-body, with the child appearing naturally smaller in scale. Background should be softly blurred with realistic depth of field while keeping faces and hands sharp. Add subtle realism imperfections: a few stray hairs, slight fabric creases and wrinkles, tiny scuffs on shoes, gentle motion blur in one foot step, and a faint lens flare or sensor grain. Color grading should be natural and clean, not overly saturated, with true-to-life skin tones and accurate proportions.	{"size": null, "quality": null, "style": null, "n": 1, "response_format": "url", "user": null, "aspect_ratio": "9:16", "negative_prompt": null, "seed": null, "cfg_scale": null, "steps": null, "resolution": null, "output_format": null, "reference_image_urls": null, "reference_style_url": null, "api_config": null, "extra_params": null}	\N	\N	Kie.ai not configured. Please add API key in Admin > Media Providers.	\N	\N	2026-01-31 14:04:34.722224	2026-01-31 14:04:34.730041	2026-01-31 14:04:34.744844
c0926c44-c38a-46c6-a4e5-95ab62242bc9	\N	1	image	failed	google/pro-image-to-image	Create a photorealistic vertical street portrait of a 3-year-old Thai boy walking hand-in-hand with his 18-year-old mother in a modern city pedestrian area. The mother wears trendy, contemporary fashion—a stylish oversized jacket or cropped outerwear layered over a simple top, high-waisted jeans or a sleek skirt, clean sneakers, a small crossbody bag, and subtle jewelry—looking youthful and confident while gently guiding her child. The boy wears a coordinated modern outfit—soft cotton T-shirt, light jacket, comfy shorts or joggers, and small sneakers—looking curious and happy as he takes small steps beside her. Set the scene on a sunlit sidewalk with realistic urban details (storefront glass, street signs, soft greenery, and distant pedestrians). Use natural late-afternoon light with warm highlights and soft shadows; the camera is at adult waist height, slightly angled down to include both subjects full-body, with the child appearing naturally smaller in scale. Background should be softly blurred with realistic depth of field while keeping faces and hands sharp. Add subtle realism imperfections: a few stray hairs, slight fabric creases and wrinkles, tiny scuffs on shoes, gentle motion blur in one foot step, and a faint lens flare or sensor grain. Color grading should be natural and clean, not overly saturated, with true-to-life skin tones and accurate proportions.	{"size": null, "quality": null, "style": null, "n": 1, "response_format": "url", "user": null, "aspect_ratio": "9:16", "negative_prompt": null, "seed": null, "cfg_scale": null, "steps": null, "resolution": null, "output_format": null, "reference_image_urls": null, "reference_style_url": null, "api_config": null, "extra_params": null}	\N	\N	Image generation failed: 'NoneType' object has no attribute 'get'	\N	\N	2026-01-31 14:15:41.554059	2026-01-31 14:15:41.564071	2026-01-31 14:15:41.967033
ce4da5e9-bdce-48d5-ab1f-1b17174d8e52	\N	1	image	failed	google/pro-image-to-image	Create a photorealistic vertical street portrait of a 3-year-old Thai boy walking hand-in-hand with his 18-year-old mother in a modern city pedestrian area. The mother wears trendy, contemporary fashion—a stylish oversized jacket or cropped outerwear layered over a simple top, high-waisted jeans or a sleek skirt, clean sneakers, a small crossbody bag, and subtle jewelry—looking youthful and confident while gently guiding her child. The boy wears a coordinated modern outfit—soft cotton T-shirt, light jacket, comfy shorts or joggers, and small sneakers—looking curious and happy as he takes small steps beside her. Set the scene on a sunlit sidewalk with realistic urban details (storefront glass, street signs, soft greenery, and distant pedestrians). Use natural late-afternoon light with warm highlights and soft shadows; the camera is at adult waist height, slightly angled down to include both subjects full-body, with the child appearing naturally smaller in scale. Background should be softly blurred with realistic depth of field while keeping faces and hands sharp. Add subtle realism imperfections: a few stray hairs, slight fabric creases and wrinkles, tiny scuffs on shoes, gentle motion blur in one foot step, and a faint lens flare or sensor grain. Color grading should be natural and clean, not overly saturated, with true-to-life skin tones and accurate proportions.	{"size": null, "quality": null, "style": null, "n": 1, "response_format": "url", "user": null, "aspect_ratio": "9:16", "negative_prompt": null, "seed": null, "cfg_scale": null, "steps": null, "resolution": null, "output_format": null, "reference_image_urls": null, "reference_style_url": null, "api_config": null, "extra_params": null}	\N	\N	Image generation failed: 'NoneType' object has no attribute 'get'	\N	\N	2026-01-31 14:25:17.521222	2026-01-31 14:25:17.530091	2026-01-31 14:25:17.90724
5007d690-a0cf-473e-a802-65ade78b127d	\N	1	image	failed	google/pro-image-to-image	Create a photorealistic vertical street portrait of a 3-year-old Thai boy walking hand-in-hand with his 18-year-old mother in a modern city pedestrian area. The mother wears trendy, contemporary fashion—a stylish oversized jacket or cropped outerwear layered over a simple top, high-waisted jeans or a sleek skirt, clean sneakers, a small crossbody bag, and subtle jewelry—looking youthful and confident while gently guiding her child. The boy wears a coordinated modern outfit—soft cotton T-shirt, light jacket, comfy shorts or joggers, and small sneakers—looking curious and happy as he takes small steps beside her. Set the scene on a sunlit sidewalk with realistic urban details (storefront glass, street signs, soft greenery, and distant pedestrians). Use natural late-afternoon light with warm highlights and soft shadows; the camera is at adult waist height, slightly angled down to include both subjects full-body, with the child appearing naturally smaller in scale. Background should be softly blurred with realistic depth of field while keeping faces and hands sharp. Add subtle realism imperfections: a few stray hairs, slight fabric creases and wrinkles, tiny scuffs on shoes, gentle motion blur in one foot step, and a faint lens flare or sensor grain. Color grading should be natural and clean, not overly saturated, with true-to-life skin tones and accurate proportions.	{"size": null, "quality": null, "style": null, "n": 1, "response_format": "url", "user": null, "aspect_ratio": "9:16", "negative_prompt": null, "seed": null, "cfg_scale": null, "steps": null, "resolution": null, "output_format": null, "reference_image_urls": null, "reference_style_url": null, "api_config": null, "extra_params": null}	\N	\N	Image generation failed: Kie.ai did not return a task ID: {'code': 422, 'msg': 'The model name you specified is not supported. Please verify your input and use one of the supported models provided by KIE.', 'data': None}	\N	\N	2026-01-31 14:34:37.75273	2026-01-31 14:34:37.762471	2026-01-31 14:34:38.282025
ad577476-cdcd-4ce6-a1a9-febdcaca05d9	20265af96599d727f64a48ddd5b0f0ef	1	image	completed	google/pro-image-to-image	แมวกับหมาวิ่งไล่กันในห้องนั่งเล่น มีเด็กยืนมองอยู่	{"size": null, "quality": null, "style": null, "n": 1, "response_format": "url", "user": null, "aspect_ratio": "9:16", "negative_prompt": null, "seed": null, "cfg_scale": null, "steps": null, "resolution": null, "output_format": null, "reference_image_urls": null, "reference_style_url": null, "api_config": {"endpoint": "/api/v1/jobs/createTask", "payload_format": "market", "kie_model_id": "nano-banana-pro"}, "extra_params": null}	https://tempfile.aiquickdraw.com/images/1769870502640-bwl8iqzkl7w.png	{"response": {"id": "20265af96599d727f64a48ddd5b0f0ef", "model": "google/pro-image-to-image", "provider": "kie_ai", "created": 1769870505, "data": [{"url": "https://tempfile.aiquickdraw.com/images/1769870502640-bwl8iqzkl7w.png"}], "credits_used": 10, "credits_balance": 99469, "task_id": null}, "data": [{"url": "https://tempfile.aiquickdraw.com/images/1769870502640-bwl8iqzkl7w.png"}]}	\N	10	99469	2026-01-31 14:41:17.010043	2026-01-31 14:41:17.018685	2026-01-31 14:41:45.240628
7ba6c8df-0ac3-45ed-b427-d687c0086aa0	8dc7e2b038100647c6e197e1ecaa87f5	1	image	completed	google/pro-image-to-image	A photorealistic, vertical 9:16 scene of a fluffy white long‑haired cat and a large long‑haired dog with a mix of gray and brown fur lying on a living room rug, cuddling closely with the dog’s front leg gently draped over the cat, both relaxed and sleepy. The living room feels warm and lived‑in: a soft fabric sofa in the background, a low wooden coffee table slightly out of focus, a knitted throw and a couple of cushions, subtle indoor plants near a window. Late‑afternoon sunlight streams through sheer curtains, casting soft window‑frame shadows across the rug and highlighting individual strands of fur; realistic global illumination and gentle ambient bounce light, shallow depth of field with crisp focus on their faces and paws. Natural scale and placement: the dog takes up most of the foreground while the cat nestles against its chest, both centered slightly lower in frame. Add realistic imperfections: a few loose fur clumps on the rug, minor paw‑print smudges on the floor near the rug edge, slight lens dust/bokeh specks in bright areas, faint fabric pilling on the sofa, and a small wrinkle in the curtain. Ultra‑detailed fur texture, accurate anatomy, natural color grading, high resolution, cinematic yet natural realism.	{"size": null, "quality": null, "style": null, "n": 1, "response_format": "url", "user": null, "aspect_ratio": "9:16", "negative_prompt": null, "seed": null, "cfg_scale": null, "steps": null, "resolution": null, "output_format": null, "reference_image_urls": null, "reference_style_url": null, "api_config": {"endpoint": "/api/v1/jobs/createTask", "payload_format": "market", "kie_model_id": "nano-banana-pro"}, "extra_params": null}	https://tempfile.aiquickdraw.com/workers/nano/image_1769870861818_kbkkxv.png	{"response": {"id": "8dc7e2b038100647c6e197e1ecaa87f5", "model": "google/pro-image-to-image", "provider": "kie_ai", "created": 1769870863, "data": [{"url": "https://tempfile.aiquickdraw.com/workers/nano/image_1769870861818_kbkkxv.png"}], "credits_used": 10, "credits_balance": 99444, "task_id": null}, "data": [{"url": "https://tempfile.aiquickdraw.com/workers/nano/image_1769870861818_kbkkxv.png"}]}	\N	10	99444	2026-01-31 14:46:52.939519	2026-01-31 14:46:52.967858	2026-01-31 14:47:43.713078
53e84005-b9a1-493c-9d57-fb1385f25098	74738a8d3dc2880751b21c90de19f1c6	1	image	completed	google/pro-image-to-image	Photorealistic vertical 9:16 scene inside a cozy modern living room: a 6-year-old Thai child is lying on a soft rug, gently hugging two pets who are cuddled close—an all-white fluffy longhair cat and a very large long-haired dog with mottled gray and warm brown fur. The child’s small body is nestled between the animals, arms wrapped comfortably, faces relaxed as if napping; the cat’s fur looks airy and slightly tousled, and the big dog’s coat shows layered strands and subtle color variation. Warm late-afternoon window light pours in from the side, creating soft shadows, realistic skin highlights, and a calm domestic atmosphere; include a sofa and a low coffee table softly out of focus in the background. Use natural human scale (child clearly smaller than the dog), realistic fabric textures on the rug and cushions, and shallow depth of field for intimacy. Add 3–5 subtle realistic imperfections: a few stray hairs on the rug, slight pet fur clumps and flyaways, minor wrinkles in the child’s clothing, faint smudges on the coffee table surface, and a slightly uneven light gradient from the window. High detail, true-to-life colors, gentle mood, candid composition.	{"size": null, "quality": null, "style": null, "n": 1, "response_format": "url", "user": null, "aspect_ratio": "9:16", "negative_prompt": null, "seed": null, "cfg_scale": null, "steps": null, "resolution": null, "output_format": null, "reference_image_urls": null, "reference_style_url": null, "api_config": {"endpoint": "/api/v1/jobs/createTask", "payload_format": "market", "kie_model_id": "nano-banana-pro"}, "extra_params": null}	https://tempfile.aiquickdraw.com/images/1769874435422-nvs4j78u91.png	{"response": {"id": "74738a8d3dc2880751b21c90de19f1c6", "model": "google/pro-image-to-image", "provider": "kie_ai", "created": 1769874438, "data": [{"url": "https://tempfile.aiquickdraw.com/images/1769874435422-nvs4j78u91.png"}], "credits_used": 10, "credits_balance": 99422, "task_id": null}, "data": [{"url": "https://tempfile.aiquickdraw.com/images/1769874435422-nvs4j78u91.png"}]}	\N	10	99422	2026-01-31 15:46:43.420636	2026-01-31 15:46:43.431084	2026-01-31 15:47:18.34378
8681c3cd-42d5-4eb3-8b4f-944aff8f50ac	ed106cd99bb06f35bd3c5e7ef136f217	1	image	completed	google/imagen4-ultra	A 2-year-old girl playing in a cozy living room, filled with soft toys and colorful furnishings, gentle sunlight streaming through a window, warm and inviting atmosphere, high detail, photorealistic	{"size": null, "quality": null, "style": null, "n": 1, "response_format": "url", "user": null, "aspect_ratio": "16:9", "negative_prompt": null, "seed": null, "cfg_scale": null, "steps": null, "resolution": null, "output_format": null, "reference_image_urls": null, "reference_style_url": null, "api_config": {"endpoint": "/api/v1/jobs/createTask", "payload_format": "market", "kie_model_id": "google/imagen4-ultra"}, "extra_params": null}	https://tempfile.aiquickdraw.com/f/a0fb8ef4-20e4-4093-b87c-dce151e65065_0.png	{"response": {"id": "ed106cd99bb06f35bd3c5e7ef136f217", "model": "google/imagen4-ultra", "provider": "kie_ai", "created": 1770023018, "data": [{"url": "https://tempfile.aiquickdraw.com/f/a0fb8ef4-20e4-4093-b87c-dce151e65065_0.png"}], "credits_used": 100, "credits_balance": 98614, "task_id": null}, "data": [{"url": "https://tempfile.aiquickdraw.com/f/a0fb8ef4-20e4-4093-b87c-dce151e65065_0.png"}]}	\N	100	98614	2026-02-02 09:02:33.252518	2026-02-02 09:02:33.271925	2026-02-02 09:03:38.853026
108c43b3-d209-4f26-a58b-45f817f4cd0a	5bc636cc6224482e4305d6d72e92a309	1	image	completed	google/pro-image-to-image	A photorealistic vertical 9:16 scene of an 18-year-old Thai woman lounging on a soft fabric sofa in a cozy modern living room, gently cuddling a fluffy white cat and a large long-haired dog with a gray-and-brown coat. The woman lies on her side with relaxed posture, one arm wrapped around the cat pressed against her chest while the dog is curled up close against her legs, their bodies naturally compressing the cushions and slightly wrinkling the throw blanket beneath them. Warm late-afternoon sunlight streams through a nearby window with sheer curtains, creating soft directional highlights on the animals’ fur and subtle shadow falloff across the room; background includes a coffee table, a floor lamp, and a few indoor plants slightly out of focus for depth. Capture fine fur detail, skin texture, and realistic reflections, with a natural shallow depth of field and true-to-life color. Include realistic imperfections: a few stray pet hairs on the sofa, mild lens grain, faint under-eye shadows, slight fabric pilling on the couch, and a couple of tiny smudges on the coffee table surface. High-resolution, naturalistic composition, gentle intimate mood, no text, no watermark.	{"size": null, "quality": null, "style": null, "n": 1, "response_format": "url", "user": null, "aspect_ratio": "9:16", "negative_prompt": null, "seed": null, "cfg_scale": null, "steps": null, "resolution": null, "output_format": null, "reference_image_urls": null, "reference_style_url": null, "api_config": {"endpoint": "/api/v1/jobs/createTask", "payload_format": "market", "kie_model_id": "nano-banana-pro"}, "extra_params": null}	https://tempfile.aiquickdraw.com/images/1769878323624-eh4jqqfqqaw.png	{"response": {"id": "5bc636cc6224482e4305d6d72e92a309", "model": "google/pro-image-to-image", "provider": "kie_ai", "created": 1769878325, "data": [{"url": "https://tempfile.aiquickdraw.com/images/1769878323624-eh4jqqfqqaw.png"}], "credits_used": 40, "credits_balance": 99338, "task_id": null}, "data": [{"url": "https://tempfile.aiquickdraw.com/images/1769878323624-eh4jqqfqqaw.png"}]}	\N	40	99338	2026-01-31 16:51:31.65116	2026-01-31 16:51:31.667954	2026-01-31 16:52:05.992474
6b92d74c-f07a-4595-b22b-cf8db0a054c0	e7c4aeabe8c3a5240a9ea983a4131d51	1	image	completed	google/pro-image-to-image	A photorealistic vertical 9:16 scene of an 18-year-old Thai woman resting on a cozy sofa in a modern living room, gently cuddling with a fluffy white long-haired cat and a large long-haired dog with a mottled gray-and-brown coat. The three are lying close together in a relaxed embrace, the woman’s arms softly around both pets, the cat nestled near her chest and the big dog curled alongside her legs, conveying warmth and calm companionship. Soft late-afternoon window light pours in from the side, creating natural highlights in the fur and subtle shadows across the couch; realistic bounce light from pale walls, shallow depth of field with the background slightly blurred (coffee table, a few houseplants, a floor lamp). Accurate fur physics with individual strands catching the light; natural skin texture and gentle fabric folds in casual loungewear. Include subtle realistic imperfections: a few stray cat hairs on the sofa, slight paw smudges on the cushion, minor lens grain, faint under-eye shadows, and a slightly rumpled throw blanket. Shot at eye level with a 35mm look, crisp focus on faces and fur, high dynamic range, natural color grading, no text, no watermark.	{"size": null, "quality": null, "style": null, "n": 1, "response_format": "url", "user": null, "aspect_ratio": "9:16", "negative_prompt": null, "seed": null, "cfg_scale": null, "steps": null, "resolution": null, "output_format": null, "reference_image_urls": null, "reference_style_url": null, "api_config": {"endpoint": "/api/v1/jobs/createTask", "payload_format": "market", "kie_model_id": "nano-banana-pro"}, "extra_params": null}	https://tempfile.aiquickdraw.com/images/1769877852614-d9p8r0sceq5.png	{"response": {"id": "e7c4aeabe8c3a5240a9ea983a4131d51", "model": "google/pro-image-to-image", "provider": "kie_ai", "created": 1769877855, "data": [{"url": "https://tempfile.aiquickdraw.com/images/1769877852614-d9p8r0sceq5.png"}], "credits_used": 40, "credits_balance": 99380, "task_id": null}, "data": [{"url": "https://tempfile.aiquickdraw.com/images/1769877852614-d9p8r0sceq5.png"}]}	\N	40	99380	2026-01-31 16:43:40.926408	2026-01-31 16:43:40.937143	2026-01-31 16:44:15.385526
8904a580-22bb-4fe0-b041-5f9b20345dd7	f739fb585132dc8396f64f342a3b87a7	1	image	completed	google/pro-image-to-image	ผู้หญิงสวยหน้าเกาหลี แต่งแฟชั่นทันสมัยอายุ 18 ปีกับแมวสีขาวขนปุย กับสุนัขตัวใหญ่ขนยาวสีเทาและน้ำตาล นอนกอดกันอยู่ในห้องนั่งเล่น	{"size": null, "quality": null, "style": null, "n": 1, "response_format": "url", "user": null, "aspect_ratio": "9:16", "negative_prompt": null, "seed": null, "cfg_scale": null, "steps": null, "resolution": null, "output_format": null, "reference_image_urls": null, "reference_style_url": null, "api_config": {"endpoint": "/api/v1/jobs/createTask", "payload_format": "market", "kie_model_id": "nano-banana-pro"}, "extra_params": null}	https://tempfile.aiquickdraw.com/images/1769879800898-7f6c5zrrq45.png	{"response": {"id": "f739fb585132dc8396f64f342a3b87a7", "model": "google/pro-image-to-image", "provider": "kie_ai", "created": 1769879802, "data": [{"url": "https://tempfile.aiquickdraw.com/images/1769879800898-7f6c5zrrq45.png"}], "credits_used": 90, "credits_balance": 99248, "task_id": null}, "data": [{"url": "https://tempfile.aiquickdraw.com/images/1769879800898-7f6c5zrrq45.png"}]}	\N	90	99248	2026-01-31 17:16:12.243499	2026-01-31 17:16:12.25332	2026-01-31 17:16:42.25482
aeb46536-97b6-4015-a827-6df96e2b2ca0	658b494f997f4566236922f7bbf5cf76	1	image	completed	google/pro-image-to-image	A photorealistic vertical 9:16 scene of a cozy modern living room in the late afternoon, where a 6-year-old girl and her 15-year-old older sister sit close together on a soft fabric sofa, chatting and laughing naturally. The younger child swings her legs slightly, holding a small plush toy, while the teenager leans in with a warm smile, relaxed posture, one hand gesturing mid-conversation. Warm window light from the left creates gentle highlights on their faces and soft shadows across the room; practical lamps in the background add subtle ambient glow. Include realistic home details: a low coffee table with a couple of slightly messy notebooks and crayons, a folded blanket, a few scattered toys near the rug, framed photos on a shelf, and indoor plants near the window. Camera at eye level, 35mm lens look, shallow depth of field with the background softly blurred, crisp skin texture and natural color grading. Add 3–5 subtle imperfections for realism: slight motion blur on a gesturing hand, faint fabric wrinkles on clothing, a few stray flyaway hairs, mild noise in shadow areas, and a small smudge on the coffee table surface.	{"size": null, "quality": null, "style": null, "n": 1, "response_format": "url", "user": null, "aspect_ratio": "9:16", "negative_prompt": null, "seed": null, "cfg_scale": null, "steps": null, "resolution": "4K", "output_format": null, "reference_image_urls": null, "reference_style_url": null, "api_config": {"endpoint": "/api/v1/jobs/createTask", "payload_format": "market", "kie_model_id": "nano-banana-pro"}, "extra_params": {"resolution": "4K", "output_format": "png"}}	https://tempfile.aiquickdraw.com/images/1769881440228-v6ynm7lk8nm.png	{"response": {"id": "658b494f997f4566236922f7bbf5cf76", "model": "google/pro-image-to-image", "provider": "kie_ai", "created": 1769881442, "data": [{"url": "https://tempfile.aiquickdraw.com/images/1769881440228-v6ynm7lk8nm.png"}], "credits_used": 120, "credits_balance": 99006, "task_id": null}, "data": [{"url": "https://tempfile.aiquickdraw.com/images/1769881440228-v6ynm7lk8nm.png"}]}	\N	120	99006	2026-01-31 17:42:16.446886	2026-01-31 17:42:16.457681	2026-01-31 17:44:02.829789
fc851ed8-516b-4ce7-92ef-d210abde6543	42e149ad748e697de170abe12bc06cd7	1	image	completed	google/pro-image-to-image	A photorealistic vertical 9:16 scene of a cozy modern living room in the late afternoon, where a 6-year-old girl and her 15-year-old older sister sit close together on a soft fabric sofa, chatting and laughing naturally. The younger child swings her legs slightly, holding a small plush toy, while the teenager leans in with a warm smile, relaxed posture, one hand gesturing mid-conversation. Warm window light from the left creates gentle highlights on their faces and soft shadows across the room; practical lamps in the background add subtle ambient glow. Include realistic home details: a low coffee table with a couple of slightly messy notebooks and crayons, a folded blanket, a few scattered toys near the rug, framed photos on a shelf, and indoor plants near the window. Camera at eye level, 35mm lens look, shallow depth of field with the background softly blurred, crisp skin texture and natural color grading. Add 3–5 subtle imperfections for realism: slight motion blur on a gesturing hand, faint fabric wrinkles on clothing, a few stray flyaway hairs, mild noise in shadow areas, and a small smudge on the coffee table surface.	{"size": null, "quality": null, "style": null, "n": 1, "response_format": "url", "user": null, "aspect_ratio": "9:16", "negative_prompt": null, "seed": null, "cfg_scale": null, "steps": null, "resolution": "4K", "output_format": null, "reference_image_urls": null, "reference_style_url": null, "api_config": {"endpoint": "/api/v1/jobs/createTask", "payload_format": "market", "kie_model_id": "nano-banana-pro"}, "extra_params": {"resolution": "4K", "output_format": "png"}}	https://tempfile.aiquickdraw.com/images/1769881005295-xrrchh9xqif.png	{"response": {"id": "42e149ad748e697de170abe12bc06cd7", "model": "google/pro-image-to-image", "provider": "kie_ai", "created": 1769881010, "data": [{"url": "https://tempfile.aiquickdraw.com/images/1769881005295-xrrchh9xqif.png"}], "credits_used": 120, "credits_balance": 99126, "task_id": null}, "data": [{"url": "https://tempfile.aiquickdraw.com/images/1769881005295-xrrchh9xqif.png"}]}	\N	120	99126	2026-01-31 17:35:33.582899	2026-01-31 17:35:33.592815	2026-01-31 17:36:50.996798
331930d5-c073-469a-ab76-c27d969a4e61	b71efe3bf400f740809237c22641e100	1	image	completed	google/pro-image-to-image	A photorealistic vertical 9:16 scene of a cozy modern living room in the late afternoon, where a 6-year-old girl and her 15-year-old older sister sit close together on a soft fabric sofa, chatting and laughing naturally. The younger child swings her legs slightly, holding a small plush toy, while the teenager leans in with a warm smile, relaxed posture, one hand gesturing mid-conversation. Warm window light from the left creates gentle highlights on their faces and soft shadows across the room; practical lamps in the background add subtle ambient glow. Include realistic home details: a low coffee table with a couple of slightly messy notebooks and crayons, a folded blanket, a few scattered toys near the rug, framed photos on a shelf, and indoor plants near the window. Camera at eye level, 35mm lens look, shallow depth of field with the background softly blurred, crisp skin texture and natural color grading. Add 3–5 subtle imperfections for realism: slight motion blur on a gesturing hand, faint fabric wrinkles on clothing, a few stray flyaway hairs, mild noise in shadow areas, and a small smudge on the coffee table surface.	{"size": null, "quality": null, "style": null, "n": 1, "response_format": "url", "user": null, "aspect_ratio": "9:16", "negative_prompt": null, "seed": null, "cfg_scale": null, "steps": null, "resolution": "4K", "output_format": null, "reference_image_urls": null, "reference_style_url": null, "api_config": {"endpoint": "/api/v1/jobs/createTask", "payload_format": "market", "kie_model_id": "nano-banana-pro"}, "extra_params": {"resolution": "4K", "output_format": "png"}}	https://tempfile.aiquickdraw.com/images/1769881673979-neddhsomdqo.png	{"response": {"id": "b71efe3bf400f740809237c22641e100", "model": "google/pro-image-to-image", "provider": "kie_ai", "created": 1769881677, "data": [{"url": "https://tempfile.aiquickdraw.com/images/1769881673979-neddhsomdqo.png"}], "credits_used": 120, "credits_balance": 98886, "task_id": null}, "data": [{"url": "https://tempfile.aiquickdraw.com/images/1769881673979-neddhsomdqo.png"}]}	\N	120	98886	2026-01-31 17:46:32.750613	2026-01-31 17:46:32.757756	2026-01-31 17:47:57.563471
203b280d-8310-44b2-bee5-059f0e54e57e	094f481f940de2ecc9c62974d4a5a665	1	image	completed	google/imagen4-ultra	ผู้หญิงชาวไทยอายุ 20 ปี เดินอยู่ในสวนหลังบ้าน	{"size": null, "quality": null, "style": null, "n": 1, "response_format": "url", "user": null, "aspect_ratio": null, "negative_prompt": null, "seed": null, "cfg_scale": null, "steps": null, "resolution": null, "output_format": null, "reference_image_urls": null, "reference_style_url": null, "api_config": {"endpoint": "/api/v1/jobs/createTask", "payload_format": "market", "kie_model_id": "google/imagen4-ultra"}, "extra_params": null}	https://tempfile.aiquickdraw.com/f/a0fb6aaa-9898-4dfc-9a44-ffdbdc5400db_0.png	{"response": {"id": "094f481f940de2ecc9c62974d4a5a665", "model": "google/imagen4-ultra", "provider": "kie_ai", "created": 1770016886, "data": [{"url": "https://tempfile.aiquickdraw.com/f/a0fb6aaa-9898-4dfc-9a44-ffdbdc5400db_0.png"}], "credits_used": 100, "credits_balance": 98716, "task_id": null}, "data": [{"url": "https://tempfile.aiquickdraw.com/f/a0fb6aaa-9898-4dfc-9a44-ffdbdc5400db_0.png"}]}	\N	100	98716	2026-02-02 07:21:04.849446	2026-02-02 07:21:04.925424	2026-02-02 07:21:26.486363
6388fac8-085a-42d2-85df-6e786e624e96	\N	1	image	failed	gpt-4o-image	A 15-year-old Thai girl with long hair, styled in a modern fashion, sitting in a contemporary living room. The room is decorated with stylish furniture, soft lighting, and personal touches that reflect her personality, creating a warm and inviting atmosphere, high detail, photorealistic	{"size": null, "quality": null, "style": null, "n": 1, "response_format": "url", "user": null, "aspect_ratio": "16:9", "negative_prompt": null, "seed": null, "cfg_scale": null, "steps": null, "resolution": null, "output_format": null, "reference_image_urls": null, "reference_style_url": null, "api_config": {"endpoint": "/api/v1/jobs/createTask", "payload_format": "market", "kie_model_id": "gpt-4o-image"}, "extra_params": null}	\N	\N	Image generation failed: Kie.ai did not return a task ID: {'code': 422, 'msg': 'The model name you specified is not supported. Please verify your input and use one of the supported models provided by KIE.', 'data': None}	\N	\N	2026-02-02 10:09:48.560558	2026-02-02 10:09:48.611684	2026-02-02 10:09:49.063066
aa9e84ce-a2d1-40e2-9a2f-7323af3da52b	78d74c3c73749bb6d1cd8a07efac3cae	1	image	completed	google/pro-image-to-image	A 15-year-old Thai girl with long hair, dressed in modern fashion, sitting alongside a 14-year-old Thai boy also in trendy attire, in a stylish living room. The space is decorated with contemporary furniture, warm lighting, and personal items that create a cozy and inviting atmosphere, high detail, photorealistic	{"size": null, "quality": null, "style": null, "n": 1, "response_format": "url", "user": null, "aspect_ratio": "16:9", "negative_prompt": null, "seed": null, "cfg_scale": null, "steps": null, "resolution": null, "output_format": null, "reference_image_urls": null, "reference_style_url": null, "api_config": {"endpoint": "/api/v1/jobs/createTask", "payload_format": "market", "kie_model_id": "nano-banana-pro"}, "extra_params": null}	https://tempfile.aiquickdraw.com/images/1770036603383-fe63ytnafka.png	{"response": {"id": "78d74c3c73749bb6d1cd8a07efac3cae", "model": "google/pro-image-to-image", "provider": "kie_ai", "created": 1770036607, "data": [{"url": "https://tempfile.aiquickdraw.com/images/1770036603383-fe63ytnafka.png"}], "credits_used": 90, "credits_balance": 98518, "task_id": null}, "data": [{"url": "https://tempfile.aiquickdraw.com/images/1770036603383-fe63ytnafka.png"}]}	\N	90	98518	2026-02-02 12:48:37.665391	2026-02-02 12:48:37.691951	2026-02-02 12:50:07.422713
\.


--
-- Data for Name: messages; Type: TABLE DATA; Schema: public; Owner: smartspec
--

COPY public.messages (id, "conversationId", role, content, "inputTokens", "outputTokens", "creditsUsed", "modelUsed", attachments, artifacts, "skillUsed", "skillArgs", error, "isRegenerated", "parentMessageId", "createdAt") FROM stdin;
1	1	user	Coding AuthenTicaition use Context7	0	0	0.0000	\N	[]	[]	\N	\N	\N	f	\N	2026-01-29 05:13:49.555371+00
2	1	user	Coding AuthenTicaition use Context7	0	0	0.0000	\N	[]	[]	\N	\N	\N	f	\N	2026-01-29 05:14:42.819314+00
3	1	user	Coding AuthenTicaition use Context7	0	0	0.0000	\N	[]	[]	\N	\N	\N	f	\N	2026-01-29 05:15:55.499422+00
4	1	user	Coding AuthenTicaition use Context7	0	0	0.0000	\N	[]	[]	\N	\N	\N	f	\N	2026-01-29 12:19:31.236373+00
5	1	assistant	It seems like you're asking for help with authentication using Context7, which is likely in the context of the framework Framework7. Framework7 is a popular JavaScript framework for building mobile applications.\n\nHere’s a basic approach to implementing authentication in a Framework7 (Context7) application. This example will assume that you're building a simple app that checks user credentials against a hypothetical API.\n\n### Step 1: Set Up Your Project\n\nMake sure you have a Framework7 project set up. If you haven’t created one yet, you can create it easily using the Framework7 CLI:\n\n```bash\nnpm install -g framework7-cli\nframework7 create\n```\n\n### Step 2: Create an Authentication Page\n\nIn your `src/pages`, create a new page called `login.f7.html` (or `.vue` if you're using Vue). Here’s a simple login form example:\n\n```html\n<!-- login.f7.html -->\n<template>\n  <div class="page" data-name="login">\n    <div class="page-content">\n      <form id="login-form">\n        <div class="list">\n          <ul>\n            <li>\n              <div class="item-content">\n                <div class="item-inner">\n                  <div class="item-input">\n                    <input type="text" placeholder="Email" name="email" required>\n                  </div>\n                </div>\n              </div>\n            </li>\n            <li>\n              <div class="item-content">\n                <div class="item-inner">\n                  <div class="item-input">\n                    <input type="password" placeholder="Password" name="password" required>\n                  </div>\n                </div>\n              </div>\n            </li>\n          </ul>\n        </div>\n        <div class="block">\n          <button type="submit" class="button">Login</button>\n        </div>\n      </form>\n    </div>\n  </div>\n</template>\n```\n\n### Step 3: Handle Login Logic\n\nIn your JavaScript file, typically in `src/routes.js` or wherever you're handling the logic, add event listeners to handle form submission and authentication. Here’s an example using Fetch to authenticate:\n\n```javascript\n// Assuming you're using vanilla JavaScript or the Framework7 method to handle routing\n\ndocument.getElementById('login-form').addEventListener('submit', async function (e) {\n  e.preventDefault();\n  \n  const formData = new FormData(this);\n  const email = formData.get('email');\n  const password = formData.get('password');\n\n  try {\n    const response = await fetch('https://your-api-url.com/auth/login', {\n      method: 'POST',\n      headers: {\n        'Content-Type': 'application/json',\n      },\n      body: JSON.stringify({ email, password }),\n    });\n\n    const result = await response.json();\n\n    if (response.ok) {\n      // Assuming the server sends back a JWT or session token\n      localStorage.setItem('authToken', result.token); // Store in local storage\n      // Redirect to a protected page\n      mainView.router.navigate('/home/');\n    } else {\n      // Handle errors - show feedback to the user\n      app.dialog.alert(result.message || 'Login failed');\n    }\n  } catch (error) {\n    app.dialog.alert('An error occurred: ' + error.message);\n  }\n});\n```\n\n### Step 4: Protect Routes\n\nTo enforce authentication on certain routes, you can check the existence of the token in localStorage before allowing access to those routes:\n\n```javascript\nconst routes = [\n  {\n    path: '/home/',\n    component: HomePage,\n    beforeEnter: (to, from, next) => {\n      const token = localStorage.getItem('authToken');\n      if (!token) {\n        return next('/login/');\n      }\n      next();\n    }\n  },\n  // other routes...\n];\n```\n\n### Step 5: Logout Functionality\n\nYou should also create a logout function to clear the authentication token when the user logs out:\n\n```javascript\nfunction logout() {\n  localStorage.removeItem('authToken');\n  mainView.router.navigate('/login/');\n}\n```\n\n### Conclusion\n\nThis setup is a simple starting point for implementing authentication in a Framework7 application using Context7. Make sure to handle things like error messages, loading indicators, and form validations as you enhance your app.\n\nAdditionally, consider using secure practices for storing your authentication tokens, and always communicate with the server over HTTPS to protect user credentials.	0	5620	4.0000	gpt-4o-mini	[]	[]	code-docs-assistant	\N	\N	f	\N	2026-01-29 12:19:49.623793+00
6	1	user	ค้นหา Agent Skill ใน Context7	0	0	0.0000	\N	[]	[]	\N	\N	\N	f	\N	2026-01-29 12:21:01.858839+00
7	1	assistant	การค้นหา "Agent Skill" ใน Context7 (ซึ่งมักหมายถึง Framework7) อาจหมายถึงการสร้างชุดทักษะหรือฟังก์ชั่นที่ใช้สำหรับเอเจนท์ (Agents) ในแอปพลิเคชันที่สร้างขึ้น แต่ไม่แน่ใจว่านี่คือสิ่งที่คุณต้องการจริง ๆ หรือไม่ หากคำถามของคุณเกี่ยวข้องกับแนวคิดหรือฟีเจอร์เฉพาะในซอฟต์แวร์หรือแพลตฟอร์มใด ๆ กรุณาให้รายละเอียดเพิ่มเติม\n\n### แนวทางการสร้าง Agent Skill ใน Framework7\n\n1. **สร้างแอปพลิเคชันใหม่**:\n    สร้างแอปพลิเคชันใหม่ด้วย Framework7 หากคุณยังไม่มี:\n\n    ```bash\n    framework7 create\n    ```\n\n2. **ตั้งค่าโครงสร้าง**:\n   จัดโครงสร้างแอปพลิเคชันของคุณให้รองรับหน้าหรือฟังก์ชันที่จำเป็นสำหรับการจัดการ Agent Skill\n\n3. **หน้าสำหรับการจัดการ Agent Skill**:\n   สร้างหน้าสำหรับแสดงและจัดการ Agent Skills. ตัวอย่างหน้าสามารถทำได้ดังนี้:\n\n   ```html\n   <!-- agent-skills.f7.html -->\n   <template>\n       <div class="page" data-name="agent-skills">\n           <div class="page-content">\n               <h1>Agent Skills</h1>\n               <div class="list">\n                   <ul>\n                       <!-- รายการทักษะสามารถดึงข้อมูลจาก API หรือฐานข้อมูล -->\n                       <li>\n                           <div class="item-content">\n                               <div class="item-inner">\n                                   <div class="item-title">Skill 1</div>\n                                   <div class="item-after"><button class="button">Edit</button></div>\n                               </div>\n                           </div>\n                       </li>\n                       <!-- ทักษะเพิ่มเติมที่นี่ -->\n                   </ul>\n               </div>\n               <button class="button button-fill" id="add-skill">Add Skill</button>\n           </div>\n       </div>\n   </template>\n   ```\n\n4. **การจัดการข้อมูล**:\n   คุณสามารถใช้ JavaScript เพื่อจัดการข้อมูล Agent Skills โดยการดึงข้อมูลจาก API และแสดงผลในหน้า Agent Skills:\n\n   ```javascript\n   // ดึงข้อมูล Skills จาก API (ตัวอย่าง)\n   async function fetchAgentSkills() {\n       const response = await fetch('https://your-api-url.com/agent-skills');\n       const skills = await response.json();\n       // แสดงผลใน UI\n       // สามารถใช้ rendering library เช่น Vue.js หรือ React เพื่อช่วยในการจัดการ UI\n   }\n\n   document.addEventListener('page:init', (event) => {\n       if (event.detail.page.name === 'agent-skills') {\n           fetchAgentSkills();\n       }\n   });\n   ```\n\n5. **การเพิ่ม Skill**:\n   คุณสามารถสร้างฟอร์มในการเพิ่มทักษะใหม่และเชื่อมต่อ API เพื่อส่งข้อมูลไปยังเซิร์ฟเวอร์:\n\n   ```javascript\n   document.getElementById('add-skill').addEventListener('click', async () => {\n       const skillName = prompt('Enter new skill name:');\n       if (skillName) {\n           const response = await fetch('https://your-api-url.com/agent-skills', {\n               method: 'POST',\n               headers: {\n                   'Content-Type': 'application/json',\n               },\n               body: JSON.stringify({ name: skillName }),\n           });\n           if (response.ok) {\n               // รีเฟรชรายการ Skills\n               fetchAgentSkills();\n           } else {\n               alert('Failed to add skill');\n           }\n       }\n   });\n   ```\n\n### สรุป\n\nการสร้าง "Agent Skill" ใน Framework7 จะรวมไปถึงการสร้าง UI ที่เหมาะสมในการแสดงและจัดการทักษะที่เกี่ยวข้องกับเอเจนท์ของคุณ รวมถึงโค้ด JavaScript ที่ช่วยให้การติดต่อกับเซิร์ฟเวอร์และการจัดการข้อมูลเป็นไปได้อย่างราบรื่น ขอให้คุณให้รายละเอียดเพิ่มเติมเกี่ยวกับคำถามดังกล่าวเพื่อที่ฉันจะได้ให้ข้อมูลที่เหมาะสมมากยิ่งขึ้น!	0	5440	4.0000	gpt-4o-mini	[]	[]	code-docs-assistant	\N	\N	f	\N	2026-01-29 12:21:23.109607+00
8	1	user	การสร้าง skill ใน claude ทำอย่างไรได้บ้าง หรือ หา skill ที่มีคนพัฒนาไว้แล้วที่ไหนดี	0	0	0.0000	\N	[]	[]	\N	\N	\N	f	\N	2026-01-29 16:53:53.697077+00
9	1	user	การสร้าง skill ใน claude ทำอย่างไรได้บ้าง หรือ หา skill ที่มีคนพัฒนาไว้แล้วที่ไหนดี	0	0	0.0000	\N	[]	[]	\N	\N	\N	f	\N	2026-01-29 17:01:49.224087+00
10	1	user	การสร้าง skill ใน claude ทำอย่างไรได้บ้าง หรือ หา skill ที่มีคนพัฒนาไว้แล้วที่ไหนดี	0	0	0.0000	\N	[]	[]	\N	\N	\N	f	\N	2026-01-29 17:07:40.522617+00
11	1	user	วันนี้คุยกันเรื่องอะไร	0	0	0.0000	\N	[]	[]	\N	\N	\N	f	\N	2026-01-29 17:11:44.067671+00
12	1	user	วันนี้คุยกันเรื่องอะไร	0	0	0.0000	\N	[]	[]	\N	\N	\N	f	\N	2026-01-30 05:00:49.675058+00
13	1	user	การสร้าง skill ใน claude ทำอย่างไรได้บ้าง หรือ หา skill ที่มีคนพัฒนาไว้แล้วที่ไหนดี	0	0	0.0000	\N	[]	[]	\N	\N	\N	f	\N	2026-01-30 09:01:01.85246+00
14	1	assistant	วันนี้เราคุยกันหลัก ๆ 2 เรื่อง:\n\n1) **“Context7/Framework7”** – คุณขอแนวทางทำ **Authentication (ล็อกอิน/ปกป้อง route)** และถามเรื่อง **การค้นหา/ทำ Agent Skill ใน Context7**  \n2) ตอนนี้คุณเปลี่ยนมาถามเรื่อง **“Skill ใน Claude”** ว่าจะสร้างเองได้ยังไง และจะไปหา “skill” ที่คนอื่นทำไว้แล้วที่ไหน\n\n---\n\n## การสร้าง “skill” ใน Claude ทำได้แบบไหนบ้าง\nคำว่า “skill” ในโลกของ Claude มักจะหมายถึงการ **เพิ่มความสามารถให้ Claude เรียกใช้งานเครื่องมือภายนอกได้** ซึ่งทำได้หลัก ๆ 2 แนวทาง (ขึ้นกับว่าคุณใช้ Claude แบบไหน)\n\n### A) ทำเป็น “Tools / Function calling” (กรณีใช้ Claude ผ่าน API)\nแนวคิดคือ:\n1. คุณ **ประกาศ tool** (ชื่อ, คำอธิบาย, รูปแบบ input เป็น JSON schema)\n2. Claude จะ “ขอเรียก tool” เมื่อเหมาะสม\n3. ระบบของคุณ **เป็นคนรันโค้ดจริง** (เรียก DB, API, ทำงานต่าง ๆ)\n4. ส่งผลลัพธ์กลับไปให้ Claude เพื่อสรุป/ตอบผู้ใช้\n\nเหมาะกับทำ skill แบบ: ค้นหาข้อมูลลูกค้า, ออกบิล, เช็คสต็อก, เรียก API ภายในบริษัท ฯลฯ\n\n### B) ทำเป็น “MCP Server (Model Context Protocol)” (นิยมมากในช่วงนี้)\nMCP คือมาตรฐานที่ทำให้ Claude ต่อกับ “เครื่องมือ/แหล่งข้อมูล” ได้เป็นระบบ โดยคุณทำ “server” ที่ประกาศ tools/resources ให้ Claude เรียกใช้\n\nเหมาะกับ:\n- อยากให้ Claude ใช้เครื่องมือหลายตัวแบบเป็นแพ็ก\n- อยากแชร์ให้คนอื่นใช้ต่อ (แบบโอเพ่นซอร์ส)\n- ใช้กับ Claude Desktop/แอปที่รองรับ MCP (ขึ้นกับสภาพแวดล้อมที่คุณใช้อยู่)\n\n---\n\n## แล้วจะไปหา “skill ที่คนอื่นทำไว้แล้ว” ได้ที่ไหน\nปัจจุบัน “ตลาดกลาง skill” แบบทางการอาจขึ้นกับแพลตฟอร์มที่คุณใช้อยู่ แต่แหล่งที่หาได้จริงและเจอบ่อยคือ:\n\n1) **GitHub (แหล่งหลัก)**\n- ค้นคำว่า: `mcp server`, `model context protocol`, `anthropic mcp`\n- มักมี repo รวมลิสต์แนว “awesome-…” เช่น `awesome mcp servers` (ลิสต์รวม MCP servers/community tools)\n\n2) **เอกสาร/ตัวอย่างจาก Anthropic**\n- หน้า docs ของ Anthropic มักมีตัวอย่างการทำ tool use และตัวอย่าง MCP\n\n3) **ชุมชน dev**\n- โพสต์รวมลิสต์/ตัวอย่างในบล็อก, Hacker News, Reddit ฯลฯ (ค้นด้วยคีย์เวิร์ด “MCP server list”)\n\n---\n\n## คำถามสั้น ๆ เพื่อชี้ทางให้ตรง (ตอบมา 2 ข้อก็พอ)\n1) คุณใช้ **Claude แบบไหน**: Claude API, Claude Desktop, หรือผ่านแพลตฟอร์มอื่น?\n2) “skill” ที่ต้องการคือแนวไหน: เรียก API ภายใน, ต่อฐานข้อมูล, ค้นหาเอกสาร, ทำงานอัตโนมัติ (เช่น สร้าง ticket/ส่งอีเมล) ?\n\nถ้าบอก 2 ข้อนี้ได้ ผมจะจัด “ทางเลือกที่เหมาะสุด” พร้อมตัวอย่างโครงสร้าง skill (Tools หรือ MCP) และตัวอย่าง repo/คำค้นสำหรับไปหา skill ที่มีคนทำไว้แล้วให้ตรงงานคุณได้เลยครับ.	0	7790	32.0000	openai/gpt-5.2	[]	[]	\N	\N	\N	f	\N	2026-01-30 09:01:35.495821+00
15	5	user	คุยกันเรื่องอะไร	0	0	0.0000	\N	[]	[]	\N	\N	\N	f	\N	2026-01-30 10:14:24.494535+00
16	5	assistant	วันนี้เราคุยกันหลัก ๆ 2 เรื่อง:\n\n1. **Authentication ใน Context7/Framework7** – คุณขอแนวทางในการสร้างระบบล็อกอินและการปกป้องเส้นทางในแอปพลิเคชัน Framework7\n2. **การสร้าง Skill ใน Claude** – คุณถามเกี่ยวกับการสร้าง Skill และวิธีการค้นหา Skill ที่มีคนพัฒนาไว้แล้วใน Claude \n\nหากคุณมีคำถามเพิ่มเติมเกี่ยวกับเรื่องใดเรื่องหนึ่ง หรือมีหัวข้อใหม่ที่สนใจ คุยกันได้เลย!	0	880	9.0000	openai/gpt-4o-mini	[]	[]	\N	\N	\N	f	\N	2026-01-30 10:14:28.256882+00
17	5	user	ขอรายละเอียดการเพิ่มความปลอดภัย การ Register จาก User เดิม ๆ ซ้ำ ๆ แต่อาศัยเปลี่ยน Email ไปเรื่อย ๆ	0	0	0.0000	\N	[]	[]	\N	\N	\N	f	\N	2026-01-30 10:22:44.094056+00
18	5	assistant	เรื่องนี้เป็น **"Duplicate Account Prevention"** หรือ **"Multi-Accounting Protection"** ซึ่งเป็นปัญหาคลาสสิกที่ระบบ Authentication ต้องเจอ โดยเฉพาะแอปที่มีสิทธิประโยชน์ (แต้มสะสม, ทดลองใช้ฟรี, ส่วนลดเดือนแรก) \n\nนี่คือ **ระบบป้องกันแบบ Layered Defense** ที่ควรใช้ผสมกัน:\n\n---\n\n## 1. Detection Layer (จับผิดก่อน/หลังสมัคร)\n\n### A. Device Fingerprinting (ดีที่สุดสำหรับ Mobile)\nตรวจจับฮาร์ดแวร์/ซอฟต์แวร์ที่ไม่เปลี่ยนง่าย แม้จะเปลี่ยน Email:\n```javascript\n// ตัวอย่างใน Framework7 + Cordova/Capacitor\nconst deviceInfo = {\n  deviceId: device.uuid,           // UUID ของเครื่อง (ถ้ามี)\n  model: device.model,\n  platform: device.platform,\n  version: device.version,\n  manufacturer: device.manufacturer,\n  screen: `${window.screen.width}x${window.screen.height}`,\n  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,\n  fonts: getAvailableFonts(),      // ฟอนต์ที่ติดตั้ง\n  canvas: getCanvasFingerprint()   // Canvas fingerprinting\n};\n```\n**เก็บใน DB**: `device_fingerprints` table พร้อม hash ค่าเหล่านี้ → ถ้า hash ซ้ำแต่คนละ email → แจ้งเตือน/บล็อก\n\n### B. IP Analysis + Rate Limiting\n```javascript\n// Backend (Node.js/Express ตัวอย่าง)\nconst registerAttempts = new Map();\n\napp.post('/register', (req, res) => {\n  const ip = req.ip;\n  const now = Date.now();\n  \n  // 1 IP = สมัครได้ไม่เกิน 3 บัญชี/วัน\n  if (getRecentRegistrationsFromIP(ip, 24) >= 3) {\n    return res.status(429).json({\n      error: "กรุณารอ 24 ชั่วโมง หรือติดต่อ Support"\n    });\n  }\n});\n```\n\n### C. Email Pattern Analysis\nตรวจจับ "Disposable Email" และ "Email Variation":\n- **Block list**: temp-mail.org, guerrillamail.com, 10minutemail\n- **Normalization**: `user+1@gmail.com` = `user+2@gmail.com` (Gmail ถือว่าเป็นคนเดียวกัน)\n- **Similarity check**: Levenshtein distance ของชื่อก่อน @ ถ้าคล้ายกันมาก → รีวิว manual\n\n---\n\n## 2. Verification Layer (ยืนยันตัวตน)\n\n### A. Progressive Verification (ยืนยันทีละขั้น)\nไม่ให้สิทธิ์ทันทีหลังสมัคร แต่ต้องผ่านด่านก่อน:\n1. **Email Verification** (ขั้นพื้นฐาน)\n2. **Phone OTP** (ขั้นสำคัญ) - ซื้อซิมใหม่ยากกว่าสร้าง Email\n3. **ID Verification** (KYC) - ถ้าเป็นแอป FinTech\n\n```javascript\n// ตัวอย่าง Logic\nif (newDevice || suspiciousIP) {\n  requirePhoneVerification();  // บังคับยืนบัตรประชาชน/เบอร์โทร\n}\n```\n\n### B. "Cooling Off" Period\nบัญชีใหม่ต้องรอ 24-48 ชั่วโมง ก่อนใช้ฟีเจอร์สำคัญ (เช่น ถอนเงิน, ใช้โค้ดส่วนลด)\n\n---\n\n## 3. Behavioral Analysis (AI/Heuristic)\n\n### A. Typing Pattern / Biometrics\nจับรูปแบบการพิมพ์ (Keystroke dynamics) หรือการใช้ Touchscreen:\n- ความเร็วการพิมพ์ชื่อ\n- ลายนิ้วมือบนมือถือ (ถ้าเก็บได้)\n- แพทเทิร์นการกรอกฟอร์ม (บอทมักกรอกเร็วเกินไป)\n\n### B. Graph Analysis (สำหรับ Backend)\nวิเคราะห์ความสัมพันธ์:\n- **Same IP + Same Device + Different Email** = High Risk\n- **Same Name + Same Phone prefix + Different Email** = Medium Risk\n- **Same Payment Method** (บัตรเดียวกัน) = 100% คนเดียวกัน\n\n---\n\n## 4. Technical Implementation ใน Framework7\n\n### ฝั่ง Client (App)\n```javascript\n// เก็บ Fingerprint แบบง่าย\nfunction getDeviceFingerprint() {\n  const components = [\n    navigator.userAgent,\n    navigator.language,\n    new Date().getTimezoneOffset(),\n    navigator.hardwareConcurrency,\n    navigator.platform\n  ];\n  return btoa(components.join('|')); // ส่งไป Backend\n}\n\n// ส่งพร้อม Register\napp.request.post('/api/register', {\n  email: email,\n  password: password,\n  deviceFingerprint: getDeviceFingerprint(),\n  installationId: localStorage.getItem('app_install_id') || generateUUID()\n});\n```\n\n### ฝั่ง Server (Database Schema)\n```sql\nCREATE TABLE user_devices (\n  id INT PRIMARY KEY,\n  user_id INT,\n  device_hash VARCHAR(255) UNIQUE,  --  hash ของ fingerprint\n  email_used VARCHAR(255),\n  ip_address VARCHAR(45),\n  created_at TIMESTAMP,\n  trust_score INT,  -- 0-100 ยิ่งต่ำยิ่งน่าสงสัย\n  INDEX idx_device_hash (device_hash),\n  INDEX idx_ip (ip_address)\n);\n\n-- Query หา User เดิมที่มาใหม่\nSELECT user_id, COUNT(*) as account_count \nFROM user_devices \nWHERE device_hash = ? OR ip_address = ?\nGROUP BY device_hash \nHAVING account_count > 2;\n```\n\n---\n\n## 5. Soft Prevention (ไม่บล็อกแต่จำกัดสิทธิ)\n\nแทนที่จะบล็อกทันที (ซึ่งอาจบล็อกคนจริง ๆ ที่ใช้ WiFi สาธารณะ):\n1. **Shadow Ban**: ให้ใช้งานได้ แต่ไม่ได้สิทธิประโยชน์จริงจัง\n2. **CAPTCHA Challenge**: ถ้าตรวจพบรูปแบบซ้ำ ให้กรอก CAPTCHA ยาก ๆ\n3. **Manual Review Queue**: ส่งไปให้คนเช็คถ้าผิดปกติ\n\n---\n\n## 6. Legal & Policy\n\n1. **Device ID Permission**: ขอสิทธิ์ใน Mobile App (iOS/Android) ต้องระบุใน Privacy Policy\n2. **GDPR Compliance**: ถ้าเก็บ Fingerprint ต้องมีวันหมดอายุ และต้องลบเมื่อ User ขอลบบัญชี\n3. **Terms of Service**: ระบุชัดว่าห้ามสร้างหลายบัญชี และมีสิทธิ์ระงับบัญชีซ้ำโดยไม่คืนเงิน\n\n---\n\n## สรุปสิ่งที่ควรทำตามลำดับความสำคัญ:\n\n1. **Phone Verification** (SMS OTP) - มีต้นทุนแต่ได้ผลดีสุด\n2. **Device Fingerprinting** - จับคนใช้เครื่องเดิมสมัครใหม่\n3. **IP Rate Limiting** - ป้องกันการสมัครถี่\n4. **Payment Method Binding** - ถ้าเป็นระบบเสียเงิน ให้ผูกบัตร/พร้อมเพย์ 1 อันต่อ 1 บัญชีเท่านั้น\n5. **Behavioral Check** - ใช้ reCAPTCHA v3 (Invisible) วิเคราะห์พฤติกรรม\n\nต้องการโค้ดตัวอย่างส่วนไหนเพิ่มเติมเป็นพิเศษไหมครับ? (เช่น การทำ Device Fingerprint แบบละเอียด หรือการเชื่อมต่อกับ AWS WAF)	0	12640	51.0000	moonshotai/kimi-k2.5	[]	[]	\N	\N	\N	f	\N	2026-01-30 10:23:37.4521+00
19	6	user	วางแผนโปรโมท ระบบ Smart AI Hub (Smart Spec Pro) ที่ใช้งานอยู่นี้ ให้รู้จักแพร่หลาย วางแผนระยะสั้น ระยะกลาง ระยะยาว	0	0	0.0000	\N	[]	[]	\N	\N	\N	f	\N	2026-01-30 14:42:08.405798+00
20	6	user	วางแผนโปรโมท ระบบ Smart AI Hub (Smart Spec Pro) ที่ใช้งานอยู่นี้ ให้รู้จักแพร่หลาย วางแผนระยะสั้น ระยะกลาง ระยะยาว แบบแผนงานสรุปแบบสั้นเน้นเฉพาะหัวข้อก่อน	0	0	0.0000	\N	[]	[]	\N	\N	\N	f	\N	2026-01-30 14:51:32.490617+00
21	6	user	วางแผนโปรโมท ระบบ Smart AI Hub (Smart Spec Pro) ที่ใช้งานอยู่นี้ ให้รู้จักแพร่หลาย วางแผนระยะสั้น ระยะกลาง ระยะยาว แบบแผนงานสรุปแบบสั้นเน้นเฉพาะหัวข้อก่อน	0	0	0.0000	\N	[]	[]	\N	\N	\N	f	\N	2026-01-30 15:10:24.332243+00
22	6	user	วางแผนโปรโมท ระบบ Smart AI Hub (Smart Spec Pro) ที่ใช้งานอยู่นี้ ให้รู้จักแพร่หลาย วางแผนระยะสั้น ระยะกลาง ระยะยาว แบบแผนงานสรุปแบบสั้นเน้นเฉพาะหัวข้อก่อน	0	0	0.0000	\N	[]	[]	\N	\N	\N	f	\N	2026-01-30 15:36:40.312431+00
23	6	user	วางแผนโปรโมท ระบบ Smart AI Hub (Smart Spec Pro) ที่ใช้งานอยู่นี้ ให้รู้จักแพร่หลาย วางแผนระยะสั้น ระยะกลาง ระยะยาว แบบแผนงานสรุปแบบสั้นเน้นเฉพาะหัวข้อก่อน	0	0	0.0000	\N	[]	[]	\N	\N	\N	f	\N	2026-01-30 15:37:32.390653+00
24	6	assistant	**แผนโปรโมท Smart AI Hub (Smart Spec Pro)**  \n*เน้นหัวข้อหลัก แบ่งตามระยะเวลา*\n\n---\n\n### **ระยะสั้น (0-3 เดือน): ปูพื้นฐาน + Early Traction**\n\n**Digital Foundation**\n- สร้าง Landing Page ที่เน้น Value Proposition "AI สำหรับงาน Spec/เอกสารเฉพาะทาง"\n- ตั้งค่า SEO คีย์เวิร์ด: "Smart Spec", "AI ช่วยเขียน Spec", "Automated Specification"\n\n**Quick Wins**\n- Soft Launch กับกลุ่ม User ปัจจุบัน (Referral Program: แนะนำเพื่อนได้เครดิตฟรี)\n- Demo Video สั้น 30-60 วินาที โชว์จุดเด่น (Speed, Accuracy, Collaboration)\n- ลงทะเบียน Product Hunt / BetaList สำหรับ Early Adopters\n\n**Content Seed**\n- Case Study 3-5 ตัวอย่างจากลูกค้าต้นแบบ (Before/After ใช้ Smart Spec Pro)\n- Template Library ฟรี ดึง Traffic (เข้ามาโหลด → ลองใช้ระบบ)\n\n---\n\n### **ระยะกลาง (3-12 เดือน): Scale + Community**\n\n**Partnership & Integration**\n- Integration กับแพลตฟอร์มสถาปนิก/วิศวกร (AutoCAD, Revit, SketchUp Marketplace)\n- จับมือสมาคมวิชาชีพ (ASA, EIT, สมาคมผู้รับเหมา) จัด Webinar "AI x Construction"\n\n**Content Marketing**\n- YouTube Series: "Spec Master ใน 5 นาที" (Tutorial ต่อเนื่อง)\n- Podcast/Clubhouse: รายการ "Future of Specification" เชิญผู้เชี่ยวชาญ\n- บทความ SEO Long-tail: "วิธีเขียน Spec ยางพารา", "AI ช่วย BOQ"\n\n**Community Building**\n- สร้าง Facebook Group/Discord: "Smart Spec Community" แลกเปลี่ยน Template\n- User-generated Content แคมเปญ: #MySmartSpec แชร์ผลงานที่ทำด้วยระบบ\n\n**Paid Growth**\n- LinkedIn Ads เป้าหมาย: Project Manager, Architect, Quantity Surveyor\n- Google Ads คีย์เวิร์ด High Intent: "โปรแกรมเขียน Spec อัตโนมัติ"\n\n---\n\n### **ระยะยาว (12-36 เดือน): Market Leader + Ecosystem**\n\n**Enterprise Expansion**\n- Smart AI Hub Enterprise: White-label สำหรับบริษัทก่อสร้างใหญ่\n- API เปิดให้ Third-party พัฒนา Plugin บน Platform (Marketplace)\n\n**Geographic Expansion**\n- ขยายไปตลาด ASEAN (ภาษาอังกฤษ, อินโดนีเซีย, เวียดนาม)\n- จัดตั้ง Regional Training Center/Reseller Network\n\n**Thought Leadership**\n- จัด Smart Spec Summit (งานประจำปี) รวมผู้เล่นในอุตสาหกรรมก่อสร้าง\n- ตีพิมพ์ White Paper: "AI Specification Standards" กำหนดมาตรฐานอุตสาหกรรม\n- Certification Program: "Smart Spec Certified Professional" (สร้าง Barrier to Entry)\n\n**Platform Dominance**\n- Freemium Model: Free Tier จำกัด ดึง User Mass Market → Convert เป็น Pro\n- Strategic Acquisition: ซื้อ Startup ที่ทำ Document Management หรือ Cost Estimation\n- IPO หรือ Exit Strategy กับ Tech Giant (Autodesk, Trimble, Procore)\n\n---\n\n**KPIs หลักที่ต้องจับตา:**\n- **ระยะสั้น:** Active Users 1,000+, NPS Score >40\n- **ระยะกลาง:** MRR (Monthly Recurring Revenue) โต 20% MoM, Market Share ในวงการสถาปัตย์ 15%\n- **ระยะยาว:** เป็น Defacto Standard ของวงการเขียน Spec ในอาเซียน, Valuation >100M USD	1044	1489	7.0000	moonshotai/kimi-k2.5	[]	[]	brainstorm	{"brainstormRound":1,"brainstormRole":"model_a"}	\N	f	\N	2026-01-30 15:38:10.132162+00
25	6	assistant	Here are additional angles and blind-spot checks to sharpen Model A’s roadmap:\n\n1. Messaging & Competitive Positioning  \n• Define your unique “why”: is it speed, accuracy, pre-built templates or collaboration?  \n• Map competitors’ strengths/weaknesses (e.g., Procore, Autodesk) and craft a “blue ocean” angle.  \n• Test taglines with A/B copy on ads and landing pages before full rollout.\n\n2. Pricing & Packaging  \n• Pilot tiered plans: per-seat, per-project, usage-based or hybrid.  \n• Offer time-limited “pilot licences” for larger firms to minimize procurement friction.  \n• Build in-app upsell prompts—e.g., usage thresholds that unlock Pro features.\n\n3. Customer Acquisition & Retention  \n• Beyond referral: run targeted micro-campaigns on industry forums (Thai Civil Engineers Facebook, Pantip’s Architecture zones).  \n• Embed in-app onboarding tours, tooltips and “first-spec” checklists to boost activation.  \n• Track cohort retention, churn reasons; set up in-product surveys at key milestones.\n\n4. Developer & Partner Ecosystem  \n• Launch a “Smart Spec Hackathon” inviting plugin ideas; award winners with marketing support.  \n• Publish APIs early with SDK samples to seed integrations beyond Revit/AutoCAD.  \n• Create a “Partner Program” with revenue-share incentives for resellers, consultants.\n\n5. PR, Media & Thought Leadership  \n• Secure bylines in trade journals (Construction+Pro, ArchDaily).  \n• Conduct quarterly “State of AI Spec” surveys and publicize insights.  \n• Pitch speaking slots at regional expos (BEX Asia, ASEAN Built Environment Series).\n\n6. Academic & Training Partnerships  \n• Collaborate with engineering/architecture faculties: incorporate Smart Spec into coursework.  \n• Offer certification “teaching kits” and faculty discounts to seed future professionals.\n\n7. Risks & Mitigations  \n• Adoption inertia among legacy firms → emphasize low-code, familiar UI.  \n• Over-reliance on platform marketplace → guard margins with direct sales.  \n• Quality concerns on GUC (user-generated content) → implement curation and rating.\n\nThese slices complement the initial 3-phase plan by tightening go-to-market tactics, shoring up retention, and de-risking enterprise scale.	1480	1059	6.0000	openai/o4-mini	[]	[]	brainstorm	{"brainstormRound":1,"brainstormRole":"model_b"}	\N	f	\N	2026-01-30 15:38:21.85935+00
26	6	assistant	**Model A – Round 2: Refining the Strategy**\n\n**Acknowledging Valid Points**\n- **Academic Pipeline**: Model B’s university partnership idea is critical—capturing students before they form vendor loyalties creates lifelong lock-in.  \n- **Content Cadence**: Quarterly “State of AI Spec” reports establish data authority; this feeds directly into the long-term thought leadership goal.  \n- **Risk Mitigation**: The warning about GUC (user-generated content) quality is spot-on; without curation, template marketplace becomes a race to the bottom.\n\n**Challenging Weak Points**\n- **Pilot Licenses**: Offering free pilots to large firms often trains procurement to expect discounts. Instead, use **“Reverse Trials”**—pay upfront but 100% refund if ROI not proven in 30 days. This signals confidence while protecting price integrity.  \n- **Hackathon Timing**: Running a developer hackathon in Year 1 is premature. API ecosystem needs critical mass of users first; otherwise developers build for ghosts. Delay until 6-month active user base >5,000.  \n- **“Low-Code” Positioning**: Framing Smart Spec as “low-code” undermines the AI premium. Legacy firms need **“Invisible AI”** messaging—emphasize that AI does the work *without* them learning new interfaces, not that it’s simplified coding.\n\n**New Strategic Insights**\n- **Data Moat Defense**: Accumulated spec data becomes the true barrier to entry. Implement **“Federated Learning”**—clients’ proprietary specs train models locally, but aggregated pattern insights improve global accuracy. Market this as “AI that learns from the industry while keeping your secrets.”  \n- **Viral Loop Mechanics**: Embed **“Spec Sharing Links”**—when User A shares a spec with User B (who doesn’t have account), B can view but must sign up to edit. This turns every collaboration into acquisition.  \n- **Vertical Expansion**: Beyond architecture, target **Interior Fit-Out** and **M&E Engineering**—niches with high spec turnover but low software penetration, offering faster sales cycles than massive construction firms.  \n- **Regulatory Automation**: Partner with **DPT (กรมโยธาธิการ)** to pre-load Thai Building Code updates. When regulations change, Smart Spec auto-flags affected projects. This turns compliance from cost center into retention hook.	2696	987	7.0000	moonshotai/kimi-k2.5	[]	[]	brainstorm	{"brainstormRound":2,"brainstormRole":"model_a"}	\N	f	\N	2026-01-30 15:38:46.258653+00
27	6	assistant	[Model B - Round 2]\n\nBuilding on Model A’s refinements, here’re further provocations and niche tactics to supercharge Smart AI Hub’s traction:\n\n1. Incentive Engineering  \n• Dynamic Referral Rewards: Scale referral bonuses based on referrer status—e.g., Bronze (1–5 users): $50 credit each; Gold (>50 users): $100.  \n• “Spec Credits” gamification—users earn points for actions (upload, review, share) redeemable for premium features or swag.\n\n2. Micro-Influencer & Niche Channels  \n• Engage Thai-speaking micro-influencers in architecture/engineering on TikTok/Instagram for bite-sized demos—quick ROI hooks (e.g., “Write a spec in 1 min”).  \n• Host “Lunch & Learn” virtual meetups for local SMEs: free 20-minute crash courses in Spec AI, feeding a constant lead gen funnel.\n\n3. Enterprise Sales Orchestration  \n• Create an “Enterprise Playbook” with objection-handling scripts, ROI calculators, procurement templates tailored by segment (contractors, consultancies, developers).  \n• Dinner + Roundtable events: invite key decision-makers for exclusive dinners paired with live demos, positioned as thought leadership gatherings.\n\n4. Customer Success-Led Expansion  \n• Assign CSMs to high-potential mid-market accounts, offering quarterly business reviews and spec optimization clinics.  \n• Launch a “Spec Champions” internal certification—empower power users to evangelize within their org, with recognition (badges, Spotlight stories).\n\n5. Data-Driven Content & SEO  \n• Automate SEO: crawl user-generated spec titles, extract long-tail keywords to feed blog + landing page topics daily.  \n• Build an interactive Spec Benchmark dashboard—anonymous aggregated metrics (“Avg spec length for M&E projects, by region”), gated for email capture.\n\n6. Sustainability & CSR Angle  \n• Position AI-driven spec efficiency as green building enabler—less rework, fewer materials wasted.  \n• Partner with LEED or Thai Green Building Institute for co-branded content/webinars, tapping into ESG budgets.\n\n7. Exit & Investor Signals  \n• Regularly publish “Growth Milestones” (user growth, integration partners, feature releases) in a public roadmap format to attract inbound interest from VCs/strategic buyers.  \n• Host annual investor days/demo days—showcase top-third startup integrations, cementing Smart AI Hub’s ecosystem gravity.\n\nBy layering incentive dynamics, micro-influencer outreach, rigorous enterprise orchestration and a sustainability narrative, you’ll turbo-charge both adoption velocity and defensibility.	2468	531	5.0000	openai/o4-mini	[]	[]	brainstorm	{"brainstormRound":2,"brainstormRole":"model_b"}	\N	f	\N	2026-01-30 15:38:52.188771+00
28	6	assistant	[Model A – Round 3]\n\n**Acknowledging Valid Points**\n- **Sustainability/CSR**: จับประเด็น ESG ได้ถูกต้อง—กองทุนก่อสร้างและรัฐวิสาหกิจ (การไฟฟ้า การประปา) มีงบสำหรับ “Green Procurement” ที่ Smart Spec สามารถขายได้ว่าช่วยลด Waste จากการแก้ไข Spec ซ้ำ\n- **Spec Champions**: การสร้าง “แชมป์ภายในองค์กร” มีประสิทธิภาพกว่าการขาย Top-down ในอุตสาหกรรมก่อสร้างไทยที่ซื้อขายผ่านความสัมพันธ์ส่วนตัว\n- **Micro-Influencers**: TikTok/IG Reels สำหรับสถาปนิกรุ่นใหม่ (Gen Z) เป็นช่องทางที่ถูกมองข้าม แต่ต้องเป็น “Educational Entertainment” ไม่ใช่ขายตรง\n\n**Challenging Weak Points**\n- **Dynamic Referral Tiers**: ระบบ Bronze/Gold ซับซ้อนเกินไปสำหรับตลาด B2B ไทยที่ต้องการความเรียบง่าย ให้เป็น “แนะนำเพื่อน ได้ฟรี 1 โครงการ” ต่อการ Convert 1 ราย จะง่ายกว่าและวัดผลชัดเจนกว่า\n- **Dinner Events**: ต้นทุนสูง (CAC แพง) และ Scale ยากในระยะสั้น แทนที่จะจัด Dinner ให้เป็น “Executive Virtual Briefing” พร้อมรายงานสูตรลับ “Cost Saving Benchmark 2024” ที่กรอกเบอร์โทรถึงดาวน์โหลดได้\n- **CSMs สำหรับ Mid-Market**: ในตลาดราคา SaaS ไทย การมี CSM แบบ 1:1 ทำให้ Unit Economics พัง ใช้ “Product-led CSM” แทน—in-app checklist, LINE Bot ตอบคำถาม และ Community ที่มี Super User ช่วยตอบ\n\n**New Strategic Insights**\n- **Thai Building Code Moat**: รวมระเบียบ กฎกระทรวง (DB 101/103) และ มาตรฐาน มยผ. เข้าไว้ในระบบแบบ Real-time Update ต่างชาติทำไม่ได้—นี่คือ Killer Feature ที่ป้องกันการถูกแทนที่ด้วย Notion หรือ ChatGPT\n- **Bottom-Up “Shadow IT” Strategy**: เป้าหมายแรกไม่ใช่บริษัทใหญ่ แต่เป็น “วิศวกรคนเดียว” ในแผนกที่ซื้อเองแล้วเอาเข้าไปใช้ในโครงการจริง (Land-and-Expand) สร้าง Playbook “How to convince your boss” ให้ User ใช้ต่อสู้ในองค์กรแทนเรา\n- **Thai NLP Fine-Tuning**: สร้าง Language Model ที่เข้าใจศัพท์เทคนิคไทยเฉพาะทาง (เช่น “คอนกรีตกำลังอัด”, “เหล็กข้ออ้อย”) ผ่าน Transfer Learning จากข้อมูล Spec เก่า ความแม่นยำจะสูงกว่า GPT-4 ทั่วไปใน Context ไทย\n- **Line Official Account (OA) เป็น Primary Channel**: การตัดสินใจซื้อ B2B ในไทยเกิดใน “LINE Group สถาปนิก” หรือ “กลุ่มไลน์ผู้รับเหมา” มากกว่า LinkedIn ต้องสร้าง LINE OA ที่แจก Template Spec ฟรี และมี “Share to LINE” เป็นปุ่มหลักในแอป\n- **EIT/สภาสถาปนิก Endorsement**: ขอรับรองจากสมาคมวิชาชีพว่าเป็น “เครื่องมือมาตรฐาน” จะสร้าง Trust Barrier สูง—เหมือนกับที่ AutoCAD เคยเป็นมาตรฐานในวงการ แต่ต้องใช้เวลา 6-12 เดือนในการเจรจา ควรเริ่มต้นตั้งแต่ตอนนี้	3740	1872	12.0000	moonshotai/kimi-k2.5	[]	[]	brainstorm	{"brainstormRound":3,"brainstormRole":"model_a"}	\N	f	\N	2026-01-30 15:39:32.25889+00
29	6	assistant	[Model B – Round 3]\n\nHere are further provocations and niche tactics to round out the playbook:\n\n1. Optimize Thai Market Dominance  \n• Geo-Targeted Pricing: Offer tiered “SME vs Enterprise” bundles with local payment gateways (PromptPay, bank transfers).  \n• Embedded Local Compliance: Market the Thai-specific code library as a “must-have” add-on—sell it as a paid module to boost ARPU.  \n• Peer-to-Peer Workshops: Facilitate in-person “Spec Hack Days” at coworking spaces (e.g., HUBBA) to seed grassroots adoption.\n\n2. Enterprise & Channel Sales  \n• Account-Based Marketing (ABM): Identify top 50 construction firms, craft personalized executive briefs highlighting “project cost saved with Smart Spec.” Use LinkedIn Sales Navigator + LINE outreach.  \n• Channel Partners: Formalize reseller agreements with CAD/BIM consultancies—bundle Smart Spec Pro in their standard service packages.  \n• Co-Sell with ERP/PM vendors: Embed Smart Spec into project management tools (e.g., VHome, SAP B1), sharing commissions on seat license upsells.\n\n3. Product Differentiation & Trust  \n• Explainable AI Module: Expose “why” each spec clause was suggested (source document, code citation) to satisfy audit/regulatory needs.  \n• Version Control & Audit Trail: Promote immutable spec histories—critical when disputes arise on large public-works contracts.  \n• Offline & Mobile Support: Deliver a “Spec Review” mobile app so supervisors can make quick edits on site without full desktop access.\n\n4. Risk & Mitigation  \n• Data Privacy & IP Safeguards: Publish transparent Data Handling Policy; offer on-prem/docker options for highly sensitive government projects.  \n• Competitive Threat: With giants (Microsoft, Autodesk) entering generative spec AI, secure exclusivity pilots with key Thai agencies (e.g., กรมโยธา) to build sticky use cases.  \n• Channel Conflict: Prevent reseller undercutting by enforcing minimum advertised price (MAP) policies and volume-based rebates.\n\n5. Long-Tail Upsell & Retention  \n• Spec Analytics Dashboard: Show customers how many clauses reused, time saved, cost variances avoided—create quarterly ROI reports within the app.  \n• Certification & Badges: Gamify ongoing learning—users earn badges for mastering new modules, then share badges on LinkedIn to drive inbound leads.\n\nThese additional levers tighten your grip on Thailand’s ecosystem, reinforce defensibility, and prepare for both enterprise scale and looming competitive threats.	3776	904	8.0000	openai/o4-mini	[]	[]	brainstorm	{"brainstormRound":3,"brainstormRole":"model_b"}	\N	f	\N	2026-01-30 15:39:41.260851+00
30	6	assistant	## Brainstorm Summary\n\nการอภิปรายหลายรอบระหว่างแนวทางการตลาดแบบดั้งเดิม (Model A) กับแนวทางเฉพาะกลุ่มและการบริหารความเสี่ยง (Model B) สรุปเป็น **กลยุทธ์เดียวที่เน้น "Thai-First Ecosystem"** โดยใช้ LINE เป็นช่องทางหลัก สร้างคู่แข่งต่อต่างชาติผ่านฐานข้อมูลกฎหมายไทย (DB/มยผ) ที่อัพเดตแบบ Real-time และขยายจากกลยุทธ์ "Shadow IT" (Bottom-Up) สู่ Enterprise (Top-Down) ผ่านระบบ Reverse Trial ที่รักษาความสมบูรณ์ของราคา\n\n---\n\n### Key Findings\n\n**1. จุดแข็งหลัก (Unfair Advantage)**\n- **Thai Building Code Moat**: การผนวกระเบียบ กฎกระทรวง (DB 101/103) และ มาตรฐาน มยผ. แบบ Real-time ที่ GPT-4 หรือ Notion ทำไม่ได้ เป็นฟีเจอร์ป้องกันการถูกแทนที่ (Defensibility)\n- **Federated Learning**: การ Train AI แบบกระจายศูนย์ที่ให้ข้อมูล Spec ของลูกค้าฝึกโมเดลในเครื่องตัวเอง แต่ส่ง Pattern กลับมาปรับปรุงระบบรวม ทำให้ได้ข้อมูลอุตสาหกรรมโดยไม่ละเมิด IP\n- **LINE Ecosystem Dominance**: ตลาด B2B ไทยตัดสินใจใน LINE Group มากกว่า LinkedIn ต้องใช้ LINE OA เป็น Primary Channel ไม่ใช่ Secondary\n\n**2. กลยุทธ์การเข้าตลาด (Go-to-Market)**\n- **Bottom-Up Land & Expand**: เป้าหมายแรกคือ "วิศวกร/สถาปนิกคนเดียว" ที่ซื้อใช้เอง (Shadow IT) แล้วค่อยขยายเป็นใบเสนอราคาบริษัท\n- **Reverse Trial สำหรับ Enterprise**: ไม่ใช่ Pilot ฟรี (สร้างพฤติกรรมรอส่วนลด) แต่ให้จ่ายเงินก่อนแล้วคืน 100% หากไม่เห็นผลใน 30 วัน\n- **Product-Led CSM**: ใช้ In-app Checklist, LINE Bot, และ Community Super Users แทน CSM 1:1 ในตลาด Mid-Market เพื่อรักษา Unit Economics**3. การขยายตัว (Growth Mechanics)**\n- **Viral Loop จาก Spec Sharing**: ลิงก์แชร์ Spec ที่ให้ดูฟรีแต่ต้องสมัครเพื่อแก้ไข เปลี่ยนทุกการ Collaboration เป็นการ Acquisition\n- **Academic Pipeline**: จับมือคณะวิศวะ/สถาปัตย์ฯ ให้เป็นเครื่องมือเรียนการสอน สร้าง Loyalty ตั้งแต่นักศึกษา\n- **ESG Angle**: ขายว่า AI ช่วยลด Rework/ขยะวัสดุ ตรงกับงบประมาณ Green Procurement ของรัฐวิสาหกิจ\n\n---\n\n### Detailed Analysis\n\n#### Phase 1: ระยะสั้น (0-3 เดือน) — Foundation & Quick Wins\n**เป้าหมาย**: สร้าง Traction 1,000+ Active Users, NPS >40\n\n| หัวข้อ | รายละเอียด | ที่มาจาก |\n|--------|-----------|----------|\n| **Thai NLP Foundation** | Fine-tune Model ให้เข้าใจศัพท์เทคนิคไทย (คอนกรีตกำลังอัด, เหล็กข้ออ้อย) ผ่าน Transfer Learning จาก Spec เก่า | Model A R3 |\n| **LINE OA as Hub** | สร้าง LINE Official Account แจก Template Spec ฟรี มีปุ่ม "Share to LINE" หลักในแอป ไม่ใช่แค่ LinkedIn | Model A R3, Model B R3 |\n| **Reverse Trial** | สำหรับ Enterprise: จ่ายเงินก่อน คืนเงิน 100% หากไม่เห็นผล 30 วัน (ป้องกันการรอส่วนลด) | Model A R2 |\n| **Shadow IT Playbook** | สร้างคู่มือ "How to convince your boss" ให้ User คนเดียวใช้ต่อสู้ในองค์กรแทนเรา | Model A R3 |\n| **Viral Spec Links** | ระบบแชร์ Spec ที่ View ฟรี แต่ Edit ต้อง Sign-up | Model A R2 |\n| **SEO Auto-Content** |  Crawl User-generated Spec Titles สร้าง Long-tail Content (e.g., "วิธีเขียน Spec ยางพารา") อัตโนมัติ | Model B R2 |\n| **Community Seed** | เปิด LINE Group/Discord "Smart Spec Community" เน้นแลกเปลี่ยน Template | Model A R1, Model B R1 |\n\n#### Phase 2: ระยะกลาง (3-12 เดือน) — Scale & Vertical Expansion\n**เป้าหมาย**: MRR โต 20% MoM, Market Share 15% ในวงการสถาปัตย์\n\n| หัวข้อ | รายละเอียด | รายละเอียดเพิ่มเติม |\n|--------|-----------|-------------------|\n| **Thai Code Integration** | ผนวก DB, มยผ., กฎกระทรวง เข้าระบบแบบ Auto-update | สร้าง "Compliance Alert" เมื่อกฎหมายเปลี่ยน แจ้งเตือนโครงการที่ได้รับผลกระทบ |\n| **Vertical Expansion** | ขยายไป Interior Fit-Out และ M&E Engineering | กลุ่มที่มี Spec เปลี่ยนบ่อยแต่ Software Penetration ต่ำ |\n| **Partnership Tier** | • ASA/EIT Endorsement (เริ่มเจรจาตั้งแต่เดือน 3)<br>• Integration Revit/AutoCAD<br>• Co-sell กับ ERP ไทย (VHome, SAP B1) | ใช้ Endorsement สร้าง Trust Barrier |\n| **Product-Led CSM** | • In-app Onboarding Tour<br>• LINE Bot ตอบคำถาม<br>• Super Users ช่วยตอบใน Community | ไม่ใช้ CSM 1:1 กับ Mid-Market เพื่อรักษา Unit Economics |\n| **ESG Marketing** | จับมือ LEED/Thai Green Building Institute ทำ Webinar "AI for Green Spec" | เข้าถึงงบ ESG ของการไฟฟ้า/การประปา |\n| **Explainable AI** | แสดงที่มาของแต่ละ Clause (อ้างอิงมาตรฐานใด, กฎหมายข้อไหน) | สำคัญสำหรับ Audit และ Dispute Resolution ในโครงการรัฐ |\n| **Mobile/Offline App** | App บนมือถือสำหรับ Supervisor แก้ Spec หน้างาน ไม่ต้องเปิด Desktop | Model B R3 |\n\n#### Phase 3: ระยะยาว (12-36 เดือน) — Ecosystem & Market Dominance\n**เป้าหมาย**: เป็น Defacto Standard อาเซียน, Valuation >100M USD\n\n| หัวข้อ | รายละเอียด | กลยุทธ์ |\n|--------|-----------|---------|\n| **API Ecosystem** | เปิด API ให้ Third-party สร้าง Plugin บน Marketplace | เริ่มหลังมี Active Users >5,000 (ไม่เร็วเกินไป) |\n| **Enterprise White-label** | Smart Spec Enterprise สำหรับบริษัทก่อสร้างใหญ่ | On-prem Option สำหรับโครงการรัฐที่กังวล Data Privacy |\n| **ASEAN Expansion** | ภาษาอังกฤษ, อินโดนีเซีย, เวียดนาม | ใช้ Thai Success Story เป็นตัวอย่าง |\n| **Smart Spec Summit** | งานประจำปีรวมผู้เล่นในอุตสาหกรรม | สร้าง Thought Leadership |\n| **Certification Program** | "Smart Spec Certified Professional" | สร้าง Barrier to Entry และ Loyalty |\n| **Strategic Acquisition** | ซื้อ Startup ด้าน Document Management หรือ Cost Estimation | เตรียม Exit Strategy กับ Tech Giant (Autodesk, Trimble) |\n| **Data Moat Defense** | Federated Learning ที่สะสม Pattern ของอุตสาหกรรมโดยไม่เก็บข้อมูลจริงของลูกค้า | ป้องกันการถูกลอกเลียนแบบโดยผู้เล่นใหญ่ |\n\n---\n\n### Recommendations\n\n**Immediate Actions (สัปดาห์นี้)**\n1. **Register LINE OA** และสร้างระบบแจก Template ฟรี 5 รายการยอดนิยม (สถาปัตย์, โยธา, M&E)\n2. **Develop Thai NLP PoC** ทดสอบความแม่นยำกับ Spec ภาษาไทย 10 ชุด เทียบกับ GPT-4\n3. **Draft "Shadow IT" Playbook** ชุดสไลด์สำหรับวิศวกรคนเดียวใช้อธิบายหัวหน้างาน\n\n**90-Day Sprint**\n1. **Launch Reverse Trial** กับ 3 บริษัทก่อสร้างกลาง (ไม่ใหญ่เกินไป) เพื่อทดสอบ Pricing Power\n2. **Submit Proposal** ขอ Endorsement จากสมาคมสถาปนิก/วิศวกร (ใช้เวลา 6-12 เดือน ต้องเริ่มเดี๋ยวนี้)\n3. **Implement Spec Sharing Viral Loop** ในแอปพลิเคชัน\n\n**Critical Success Factors**\n- **อย่าทำ Pilot ฟรี** สำหรับ Enterprise (สร้างพฤติกรรมรอส่วนลด) ให้ใช้ Reverse Trial แทน\n- **อย่าจ้าง CSM 1:1** สำหรับลูกค้า <50 Seats ให้ใช้ Product + Community + LINE Bot\n- **อย่าจัด Hackathon เร็วเกินไป** รอให้ถึง 5,000 Active Users ก่อน มิฉะนั้น Developer จะไม่สนใจ\n\n**KPIs ที่ต้อง Track**\n- **North Star**: Weekly Active Spec Editors (ไม่ใช่แค่ Sign-ups)\n- **Viral Coefficient**: จำนวน New Users จาก Spec Sharing Links / จำนวน Sharing\n- **Thai Code Accuracy**: % ของ Spec ที่ผ่านการตรวจสอบกฎหมายอัตโนมัติถูกต้อง (เทียบกับผู้เชี่ยวชาญ)	5518	4654	25.0000	moonshotai/kimi-k2.5	[]	[]	brainstorm	{"brainstormRound":0,"brainstormRole":"summary"}	\N	f	\N	2026-01-30 15:41:12.624217+00
31	6	user	สรุปแล้ว หลุดออกนอกกรอบ วิธีการโปรโมท ระบบหรือไม่	0	0	0.0000	\N	[]	[]	\N	\N	\N	f	\N	2026-01-30 15:42:01.789814+00
34	6	assistant	**Acknowledging Valid Points**  \nModel B’s categorization clarifies scope effectively—การแยกแยะว่าอะไรเป็น Product Dev กับ Promotion ช่วยให้ทีมไม่ปนเปื้อนงาน การเสนอ 90-day promo-only calendar เป็นเครื่องมือปฏิบัติจริงที่วัดผลได้\n\n**Challenging Weak Points**  \n• **Product-Led Growth (PLG) ข้ามเส้น**: Viral loop (เช่น Spec Sharing) เป็น Feature แต่ก็คือ Promotion ในตัว การแบ่งแยกสุดโต่งอาจทำให้ทีมสูญเสีย “Growth Hacking” ที่ต้องออกแบบ Product เพื่อให้ตลาดขยายตัวเอง  \n• **Reverse Trial คือ Promotional Message**: แม้เป็น Pricing แต่การนำเสนอว่า “ลองแล้วไม่ชอบ คืนเงินเต็ม” คือ Risk Reversal Tactics ในสื่อโฆษณา ควรอยู่ในกรอบ Promotion ด้านข้อความ (Copy Strategy)  \n• **Dark Social Blind Spot**: Model B ระบุ LINE แต่ไม่ได้แก้ Pain Point เรื่อง Attribution—การแชร์ใน LINE Group/สติกเกอร์ส่วนตัว ติดตามยาก ทำให้ CAC คำนวณคลาดเคลื่อน\n\n**New Insights: Promotion-Only Tactics**  \n\n• **Dark Social Attribution**: ใช้ “Unique Referral Codes” แทนลิงก์ธรรมดา (เช่น LINE แชร์โค้ด #SMART123 แทน URL) สร้าง Tracking ที่มองเห็นได้ในระบบ CRM แม้ข้อมูลอยู่ในแชทส่วนตัว  \n\n• **“Guru” > Influencer**: ใน B2B ก่อสร้องไทย “อาจารย์คณะสถาปัตย์ฯ” หรือ “CEO บริษัทรับเหมาระดับ Top 30” มี Authority สูงกว่า Influencer ทั่วไป กลยุทธ์คือ “Executive Interview Series” ที่เชิญกูรูมาพูดคุยแล้ว Smart AI Hub เป็นสปอนเซอร์เนื้อหา (Native Advertising)  \n\n• **Competitive Conquesting**: ซื้อ Google Ads คีย์เวิร์ดคู่แข่ง (เช่น “Procore Thailand”, “AutoCAD Spec”) พร้อม Landing Page เปรียบเทียบ “Smart Spec vs คู่แข่ง” ตรงๆ ดักลูกค้าที่กำลัง Compare อยู่  \n\n• **B2B Retargeting Sequence 90 วัน**: สร้าง Funnel ยาวสำหรับวงการก่อสร้าง (Sales Cycle นาน)  \n  – Week 1-2: Demo Video (Awareness)  \n  – Week 4-6: Case Study บริษัทคล้ายกัน (Consideration)  \n  – Week 8-10: ROI Calculator + Webinar Invite (Decision)  \n\n• **Employee Advocacy Program**: ให้ทีมงานภายใน (สถาปนิก/วิศวกรที่อยู่ในทีม) โพสต์ “Behind the Scene” การพัฒนา Spec ลง LinkedIn ส่วนตัว ใช้ Personal Brand สร้าง Trust มากกว่า Corporate Account  \n\n• **“Spec Battle” Live Campaign**: จัด Event ถ่ายทอดสด “มนุษย์ vs AI” แข่งเขียน Spec ชิ้นงานจริงใน 30 นาที สร้าง FOMO และ Engagement แบบ Real-time ผ่าน Facebook/YouTube Live พร้อมโหวตผู้ชม  \n\n**Conclusion**: Promotion ที่มีประสิทธิภาพต้องผสม **Communication Tactics** (Ads, PR) กับ **Product-Designed Virality** (Share Feature) โดยไม่ต้องกลัวเส้นแบ่งที่คลุมเครือ ขอให้วัดผลที่ Acquisition Cost ต่อ Channel ชัดเจนก็พอ	10053	2130	19.0000	moonshotai/kimi-k2.5	[]	[]	brainstorm	{"brainstormRound":2,"brainstormRole":"model_a"}	\N	f	\N	2026-01-30 15:43:50.277434+00
35	6	assistant	[Model B – Round 2]\n\nBuilding on the refined “Promotion-only” framework:\n\n1. Dark Social Attribution  \n   • Unique Tracking Codes: Integrate “Referral Code” field during sign-up. Codes auto-generated per user and embed in shared templates.  \n   • QR Code Sharing: Generate QR for each spec/template—scan = landing page + code, trackable from printed docs or slides.\n\n2. Guru-led Native Advertising  \n   • Executive Interview Series: Produce 10-minute OTT videos on LinkedIn/YouTube with leading architects/contractors sharing AI spec wins. Smart Spec logo and “product demo” inserted subtly.  \n   • Sponsored Columns: Place 500-word op-eds in ASA Journal or Engineering Today with co-authored credits (“in partnership with Smart AI Hub”).\n\n3. Competitive Conquesting  \n   • Paid Search: Bid on competitor terms, direct to “Smart Spec vs X” microsite with interactive comparison chart.  \n   • Retargeting Ads: Show “Still Comparing? 5 Rapid AI Spec Wins” to visitors who bounce from that comparison page.\n\n4. B2B 90-day Nurture Sequence  \n   – Days 0–2: Welcome Email + 60-sec GIF  \n   – Days 3–7: Case Study PDF (local peer)  \n   – Days 8–14: Invite to “Spec Battle” live event  \n   – Days 15–30: ROI Calculator + 1:1 Demo Offer  \n   – Days 31–60: Webinar Replay + User Testimonials  \n   – Days 61–90: Discount Code / Pilot Offer Reminder  \n\n5. Employee Advocacy  \n   • Content Kits: Pre-written LinkedIn posts + visuals for internal champions. Gamify with monthly leaderboards and small rewards (swag, recognition).  \n   • Internal Hackathon Snippets: Share behind-the-scenes videos of devs testing Spec AI, highlighting team expertise and product quality.\n\n6. Spec Battle Live Event  \n   • Format: 2 teams (Human vs AI) writing a mini spec for real project. Judges (industry VIPs) rate accuracy, speed, readability.  \n   • Live Polling: Viewers vote on “Best spec”—engagement metric and lead gen (collect emails for voting).  \n   • Post-Event Follow-Up: Replay + “Best practices” PDF sent to attendees, CTAs for trial.\n\n**Ensuring Boundaries**  \n- All tactics listed are **Promotion/Communication-focused**.  \n- Ownership: Marketing team drives ads, content, events, advocacy.  \n- Metrics: Track CAC, MQL → SQL conversion per channel, engagement rates, social shares, event attendance.\n\nThis layered promo strategy keeps “in-scope” activities tightly aligned with marketing objectives, while still leveraging product features (tracking codes, share links) for efficient growth loops.	8145	595	11.0000	openai/o4-mini	[]	[]	brainstorm	{"brainstormRound":2,"brainstormRole":"model_b"}	\N	f	\N	2026-01-30 15:43:58.779341+00
36	6	assistant	**Round 3: Promotion Tactics Refinement**\n\n### **Challenging Previous Points**\n\n**Model B’s 90-Day Nurture Sequence**: Too slow for Thai construction B2B. ตลาดไทยตัดสินใจจาก “ความสัมพันธ์” มากกว่า “Drip Campaign” แทนที่จะส่ง Email 90 วัน ให้ใช้ **“3-Touch Rule”** ผ่านช่องทางที่แตกต่าง: วันที่ 1 โทรนัดเจอ, วันที่ 3 ส่ง VDO สั้นใน LINE, วันที่ 7 เข้าพรีเซนต์ตัวจริง ถ้าไม่ปิดภายใน 7 วัน ให้เก็บ Lead ไว้รอ Event หน้า ไม่ต้องตามตื๊ด\n\n**Model A’s “Guru” Strategy**: ในอุตสาหกรรมก่อสร้างไทย Trust มาจาก “รุ่นพี่ที่รู้จักกัน” มากกว่า “Celebrity” แทนการเชิญ CEO บริษัทใหญ่ ให้ใช้ **“Peer-to-Peer Testimonial”** – ถ่ายวิดีโอสถาปนิกระดับ Senior ที่จบจากมหาวิทยาลัยเดียวกับ Target Audience (เช่น จุฬาฯ, เกษตรฯ) พูดว่า “รุ่นน้องควรใช้” จะ Convert สูงกว่า\n\n---\n\n### **New Promotional Insights**\n\n**Category Design Marketing**\n- ไม่ขายว่าเป็น “โปรแกรมเขียน Spec ที่ดีกว่า” แต่สร้างหมวดใหม่ว่า **“Post-AI Specification”** หรือ “ยุคหลัง AI ช่วยเขียน Spec” \n- จัดแคมเปญ **“The Last Manual Spec”** รณรงค์ให้สถาปนิกแชร์ Spec ที่เขียนด้วยมือครั้งสุดท้าย ก่อนเปลี่ยนมาใช้ AI สร้าง FOMO และ Narrative ว่ากำลังพลาดยุคสมัยใหม่\n\n**Regulatory FUD as Opportunity**\n- ช่วงที่รัฐบาลไทยกำลังร่างกฎหมาย AI ให้โปรโมทว่า **“First Compliant AI Spec Platform”** (ใส่คำว่า “ถูกต้องตาม มยผ.” ให้ชัด) \n- สร้าง Whitepaper ฟรี “การใช้ AI เขียน Spec ให้ถูกกฎหมายไทย” ดึง Lead จากความกลัว (Fear) ว่าใช้ ChatGPT แล้วอาจผิดมาตรฐาน\n\n**Lighthouse Project Strategy**\n- เลือก **1 โครงการไอคอนิก** (เช่น คอนโดดัง หรืออาคารรัฐบาล) ให้ใช้ฟรีหรือลด 80% แล้วขอสิทธิ์ใช้เป็นตัวอย่างโปรโมต **เอ็กซ์คลูซีฟ 6 เดือน** ก่อนเปิดเผยต่อสาธารณะ สร้าง Scarcity ว่า “สถาปนิก X ใช้แล้วดี แต่ยังเป็นความลับ”\n\n**Trade Credit as Promo Tool**\n- ใน SaaS ไทยมักเก็บเงินก่อน ให้เสนอ **“Net 30/60”** (ใช้ก่อน จ่ายทีหลัง 30-60 วัน) เป็นสิทธิพิเศษเฉพาะสมาชิกสมาคม ลดแรงต้านทาง Procurement ของบริษัทใหญ่ที่ติดขั้นตอนการเงิน\n\n**National Pride PR Angle**\n- Pitch ข่าว **“Thai AI บุกตลาดโลก”** กับ Thai PBS, Workpoint Money, Spring News ไม่ใช่ขายซอฟต์แวร์ แต่ขายว่าเป็นผลิตภัณฑ์ AI ไทยที่ส่งออกได้ กระตุ้นการสนับสนุนจากภาครัฐและภาคีเครือข่าย (Soft Power อุตสาหกรรม)	11818	2150	21.0000	moonshotai/kimi-k2.5	[]	[]	brainstorm	{"brainstormRound":3,"brainstormRole":"model_a"}	\N	f	\N	2026-01-30 15:44:51.332352+00
32	6	assistant	**ใช่ บางส่วนหลุดออกนอกกรอบ "การโปรโมท" (Promotion) ไปสู่ "กลยุทธ์ผลิตภัณฑ์/ธุรกิจ"**\n\nที่หลุดกรอบ:\n- **Federated Learning / Thai NLP** = สถาปัตยกรรมระบบ (Product Development)\n- **Reverse Trial / Pricing** = กลยุทธ์ราคา (Pricing Strategy) \n- **API Ecosystem / White-label** = แผนพัฒนาผลิตภัณฑ์ (Product Roadmap)\n- **Mobile/Offline App** = ฟีเจอร์ (Feature Development)\n\n---\n\n### **กรอบการโปรโมทที่ถูกต้อง (Marketing Communications Only)**\n\n#### **ระยะสั้น (0-3 เดือน): Awareness & Acquisition**\n- **Content Marketing**: SEO คีย์เวิร์ด "เขียน Spec อัตโนมัติ", Blog เปรียบเทียบ Before/After\n- **Viral Mechanics**: ระบบแชร์ Spec ผ่าน LINE (ดูฟรี/แก้ไขต้องสมัคร)\n- **Paid Ads**: LinkedIn Ads เป้า Project Manager + Facebook/IG สถาปนิกรุ่นใหม่\n- **Referral Program**: แนะนำเพื่อนได้เครดิตใช้งานฟรี\n- **Soft Launch**: ลง Product Hunt, BetaList, จัด Webinar เปิดตัวกับสมาคมวิชาชีพ\n\n#### **ระยะกลาง (3-12 เดือน): Engagement & Scale**\n- **Event Marketing**: \n  - Lunch & Learn (อาหารกลางวัน + Demo 30 นาที)\n  - Webinar รายเดือนกับสมาคม ASA/EIT\n  - Booth ในงานสถาปัตย์/ก่อสร้าง (Architect Expo, BEX Asia)\n- **Influencer Marketing**: Micro-influencer สถาปนิก/วิศวกรบน TikTok/IG Reels\n- **Partnership Marketing**: Co-marketing กับบริษัทซอฟต์แวร์ BIM (แลกลิงก์/ร่วมจัด Event)\n- **PR**: ส่ง Press Release สู่สื่อวงการ (Construction+Pro, นิตยสาร ASA Journal)\n- **Community**: สร้าง LINE Group/Discord "Smart Spec Community" แจก Template ฟรี\n\n#### **ระยะยาว (12-36 เดือน): Brand Leadership**\n- **Thought Leadership**: \n  - จัด "Smart Spec Summit" ประจำปี\n  - ตีพิมพ์ "State of AI Spec Report" ประจำปี\n  - บทความใน Harvard Business Review Thailand/Forbes\n- **Academic Marketing**: สปอนเซอร์การแข่งขันออกแบบมหาวิทยาลัย (ติดแบรนด์ในโจทย์)\n- **CSR Campaign**: แคมเปญ "Green Spec Challenge" รณรงค์ลดขยายก่อสร้างผ่าน Spec ที่แม่นยำ\n- **Certification Marketing**: โปรโมท "Smart Spec Certified" ให้เป็น Credential ที่วิศวกรอวดบน LinkedIn\n\n**สรุป**: การโปรโมทที่ถูกต้องควรอยู่ในกรอบ **การสื่อสาร (Communication)** และ **การกระจายข่าวสาร (Promotion)** ไม่ใช่การสร้างฟีเจอร์หรือกำหนดราคา	8566	2046	17.0000	moonshotai/kimi-k2.5	[]	[]	brainstorm	{"brainstormRound":1,"brainstormRole":"model_a"}	\N	f	\N	2026-01-30 15:42:51.414199+00
33	6	assistant	Here’s a quick check:\n\n1. Off-Scope (“ไม่ใช่ Promotion”)  \n   • Product Architecture (Federated Learning, Thai NLP fine-tuning)  \n   • Feature Roadmap (Offline/Mobile apps, API Marketplace)  \n   • Pricing & Trials (Reverse Trial, tiered bundles)  \n   • Enterprise Sales Process (CSMs, ABM playbooks)\n\n2. True Promotion (“Marketing Communications”)  \n   • Messaging & Positioning: taglines, value propositions, A/B test copy  \n   • Channels & Tactics: paid ads, organic SEO, content, PR, events, influencers  \n   • Viral & Referral: sharing links, referral credits, community seeding  \n   • Thought Leadership: reports, summits, certification visibility  \n\n3. Refocused Framework  \n   A. Awareness (0–3 mo)  \n     – SEO-optimized blogs: “เขียน Spec ด้วย AI ใน 5 นาที”  \n     – Paid Social: LinkedIn for PMs; TikTok/IG Reels for Gen Z architects  \n     – Referral Drive: “แนะนำเพื่อน ได้ 1 โปรเจ็คฟรี” via LINE OA  \n   B. Engagement (3–12 mo)  \n     – Monthly Webinars with ASA/EIT, “Lunch & Learn” roadshows  \n     – Micro-influencer campaigns: short demos, challenge hashtags  \n     – PR Blitz: press releases in Construction+Pro, ASA Journal  \n   C. Leadership (12–36 mo)  \n     – Annual “Smart Spec Summit” + State of AI Spec Report  \n     – University design competitions (brand in brief)  \n     – CSR “Green Spec” challenge: co-marketing with Thai Green Building  \n\n4. Next Steps  \n   1. Audit all current initiatives—mark each as “Promo” vs. “Product/Pricing”  \n   2. Drop or reassign off-scope items to the product team roadmap  \n   3. Build a 90-day “Promo Only” calendar mapping each channel, KPI and budget  \n\nBy strictly separating “what we build” from “how we promote,” we ensure every tactic remains squarely in the Promotion bucket.	6927	775	11.0000	openai/o4-mini	[]	[]	brainstorm	{"brainstormRound":1,"brainstormRole":"model_b"}	\N	f	\N	2026-01-30 15:43:01.309219+00
37	6	assistant	สรุปสั้นๆ: เรามีไอเดียบางส่วน “หลุดกรอบ” จากงาน Promotion (การสื่อสาร) ไปสู่ Product/Price/Sales (การพัฒนาระบบ, ฟีเจอร์, ราคา, ช่องทางจำหน่าย) ดังนี้  \n\n1. ไอเดียที่ “หลุดกรอบ Promotion”  \n   • Federated Learning, Thai NLP Fine-tuning (Product Dev)  \n   • Reverse Trial, Net 30/60 (Pricing & Finance)  \n   • API Marketplace, Whitelabel, Mobile App (Product Roadmap)  \n   • CSM 1:1, ABM Playbooks (Sales Process)  \n\n2. ไอเดียที่ “อยู่ในกรอบ Promotion จริงๆ”  \n   • Viral Mechanics: Spec-sharing links, QR/referral codes  \n   • Paid & SEO: Competitive conquesting, long-tail blogs, Google/LinkedIn ads  \n   • Content & Events: Guru-led native ads, “Spec Battle” live, webinars, lunch-and-learn  \n   • Community & Advocacy: LINE OA, employee advocacy kits, peer testimonials  \n   • Thought Leadership: State of AI Spec Report, Smart Spec Summit, CSR “Green Spec”  \n\n3. Next Step:  \n   a. จัดทำ “Promotion-Only Roadmap” (90-day calendar + KPI)  \n   b. ตีกรอบทุกแคมเปญว่าเป็น “Comm-Only” ก่อน เร่งรัดและวัดผลเฉพาะช่องทางสื่อสาร  \n   c. ส่งมอบไอเดีย Product/Price/Sales ให้ทีมอื่นรับไปทำต่อ  \n\n– ด้วยการแยกชัดระหว่าง Promotion กับงานอื่นๆ เราจะโฟกัสสร้างการรับรู้และการมีส่วนร่วมได้ตรงเป้า –	9486	762	13.0000	openai/o4-mini	[]	[]	brainstorm	{"brainstormRound":3,"brainstormRole":"model_b"}	\N	f	\N	2026-01-30 15:45:01.11752+00
38	6	assistant	## สรุป: มีส่วนที่หลุดกรอบจริง\n\n**ใช่** สรุปก่อนหน้ามีส่วนที่หลุดออกนอกกรอบ **"การโปรโมท" (Promotion/Communication)** ไปสู่ **Product Development, Pricing Strategy และ Sales Process** ดังนี้:\n\n### ส่วนที่หลุดกรอบ (Off-Topic)\n| หัวข้อที่กล่าวถึง | ที่จริงคือ (Category) | ทำไมไม่ใช่ Promotion |\n|---|---|---|\n| Federated Learning / Thai NLP Fine-tuning | **Product/Technology** | เป็นการพัฒนาสถาปัตยกรรมระบบและ AI Model |\n| Reverse Trial / Net 30/60 | **Pricing & Finance** | เป็นเงื่อนไขการชำระเงินและกลยุทธ์ราคา ไม่ใช่การสื่อสาร |\n| API Ecosystem / White-label / Mobile App | **Product Roadmap** | เป็นแผนพัฒนาฟีเจอร์และแพลตฟอร์ม |\n| CSM 1:1 / ABM Playbooks | **Sales Process** | เป็นกระบวนการขายและดูแลลูกค้าหลังการตลาด |\n| Data Moat / Regulatory Automation | **Business Strategy** | เป็นกลยุทธ์แข่งขันเชิงกลยุทธ์ระยะยาว |\n\n---\n\n### กรอบ "การโปรโมท" ที่ถูกต้อง (Promotion-Only Framework)\n**Promotion** คือ **กิจกรรมสื่อสารการตลาด (Marketing Communications)** เท่านั้น ประกอบด้วย:\n- **Advertising**: โฆษณาจ่าย (LinkedIn, Google, Facebook)\n- **Public Relations**: การประชาสัมพันธ์ สื่อ งานแถลงข่าว\n- **Sales Promotion**: กิจกรรมกระตุ้นยอดขายระยะสั้น (แต่ไม่ใช่โครงสร้างราคา)\n- **Events & Experiences**: สัมมนา งานแสดงสินค้า กิจกรรมออนไลน์\n- **Content Marketing**: SEO, Blog, Video, Whitepaper\n- **Social & Community**: LINE OA, Facebook Group, Discord\n- **Influencer Marketing**: การใช้ผู้มีอิทธิพลกระจายข่าวสาร\n\n---\n\n### แผนโปรโมทที่แก้ไขแล้ว (Promotion-Only)\n\n#### ระยะสั้น (0-3 เดือน): Awareness & Acquisition\n- **Paid Ads**: LinkedIn Ads เป้า Project Manager/Architect + Facebook/IG Reels สถาปนิกรุ่นใหม่\n- **SEO/Content**: Blog "เขียน Spec ด้วย AI ใน 5 นาที" + เปรียบเทียบ Before/After\n- **PR**: Soft Launch บน Product Hunt, BetaList + แถลงข่าวสู่ Construction+Pro, ASA Journal\n- **Sales Promotion**: Referral Campaign "แนะนำเพื่อนได้เครดิตฟรี 1 โครงการ"\n- **Community Seeding**: เปิด LINE OA แจก Template Spec ฟรี 5 รายการ + สร้าง LINE Group "Smart Spec Community"\n- **Viral Mechanics**: แคมเปญ "Share to LINE" (ดู Spec ฟรี แต่แก้ไขต้องสมัคร) - *หมายเหตุ: ตัวฟีเจอร์เป็น Product แต่แคมเปญขับเคลื่อนเป็น Promotion*\n\n#### ระยะกลาง (3-12 เดือน): Engagement & Scale\n- **Events**: \n  - Lunch & Learn (อาหารกลางวัน+Demo 30 นาที)\n  - Webinar รายเดือนร่วมกับ ASA/EIT\n  - **"Spec Battle" Live**: ถ่ายทอดสดแข่ง "มนุษย์ vs AI" เขียน Spec ผ่าน Facebook/YouTube Live + โหวตผู้ชม\n- **Influencer**: Micro-influencer สถาปนิก/วิศวกรบน TikTok/IG Reels (Educational Entertainment)\n- **Content**: \n  - ซีรี่ส์ "Guru Interview" เชิญสถาปนิกรุ่นใหญ่พูดถึงการใช้ AI\n  - Whitepaper "การใช้ AI เขียน Spec ให้ถูกกฎหมายไทย" (ใช้ Fear เรื่องผิดมาตรฐานดึง Lead)\n- **Competitive Conquesting**: ซื้อ Google Ads คีย์เวิร์ดคู่แข่ง (Procore, AutoCAD) พร้อม Landing Page เปรียบเทียบ\n- **Employee Advocacy**: ชุด Content Kit ให้ทีมงานโพสต์ LinkedIn ส่วนตัว (Behind the Scene)\n\n#### ระยะยาว (12-36 เดือน): Brand Leadership\n- **Thought Leadership Events**: จัด "Smart Spec Summit" ประจำปี\n- **Content Authority**: ตีพิมพ์ "State of AI Spec Report" ประจำปี + บทความใน HBR Thailand/Forbes\n- **Cause Marketing**: แคมเปญ CSR "Green Spec Challenge" รณรงค์ลด Waste ผ่าน Spec แม่นยำ (ร่วมกับ Thai Green Building Institute)\n- **Academic Marketing**: สปอนเซอร์การแข่งขันออกแบบมหาวิทยาลัย (ติดแบรนด์ในโจทย์)\n- **National Pride PR**: Pitch ข่าว "Thai AI บุกตลาดโลก" สู่ Thai PBS, Workpoint Money (Soft Power อุตสาหกรรม)\n\n---\n\n### ข้อควรระวังเรื่องเส้นแบ่ง (Nuance)\nบางกลยุทธ์อยู่บน **"เส้นแบ่ง"** ระหว่าง Product กับ Promotion โดยเฉพาะ **Product-Led Growth (PLG)**:\n- **Viral Spec Links**: การ *สร้างฟีเจอร์* เป็นงาน Product แต่การ *ออกแคมเปญ "แชร์แล้วได้เครดิต"* เป็นงาน Promotion\n- **Thai Code Integration**: การ *พัฒนาระบบ* เป็น Product แต่การ *สื่อสารว่า "แพลตฟอร์มเดียวที่อัพเดต มยผ. อัตโนมัติ"* เป็น Promotion\n\n**คำแนะนำ**: แยกทีมให้ชัดเจน\n- **ทีม Product**: รับผิดชอบ Federated Learning, API, Mobile App, NLP\n- **ทีม Pricing**: รับผิดชอบ Reverse Trial, Net 30/60, โครงสร้างราคา\n- **ทีม Promotion**: รับผิดชอบตารางบนนี้เท่านั้น โดยใช้ **CAC (Customer Acquisition Cost) per Channel** เป็นตัววัดผลหลัก\n\nหากต้องการแผนเฉพาะ Promotion แบบละเอียดพร้อม Timeline และ Budget ระบุมาได้เลยครับ	13556	3362	28.0000	moonshotai/kimi-k2.5	[]	[]	brainstorm	{"brainstormRound":0,"brainstormRole":"summary"}	\N	f	\N	2026-01-30 15:46:16.709825+00
39	7	user	ไก่กับไข่ใครเกิดก่อนกัน	0	0	0.0000	\N	[]	[]	\N	\N	\N	f	\N	2026-01-30 15:49:13.465626+00
40	7	assistant	### การวิเคราะห์คำถาม: ไก่กับไข่ใครเกิดก่อนกัน\n\n#### แนวทางการพิจารณา\n- **คำถามในเชิงปรัชญา**: คำถามนี้เป็นเรื่องเก่าแก่ที่ชวนให้คิดเกี่ยวกับการเกิดและวิวัฒนาการของสิ่งมีชีวิต ซึ่งไม่สามารถตอบได้อย่างชัดเจนในเชิงวิทยาศาสตร์หรือปรัชญาเด่นชัด\n- **มุมมองทางวิทยาศาสตร์**:\n  - ตามทฤษฎีวิวัฒนาการ ไก่สามารถถูกมองว่าเป็นผลมาจากการเปลี่ยนแปลงทางพันธุกรรมจากสัตว์ชนิดอื่นๆ ที่ไม่ใช่ไก่ \n  - การเกิดไข่ที่มีโอกาสเกิดไก่ใหม่อาจเกิดจากไก่ที่มีบรรพบุรุษแตกต่าง ซึ่งทำให้ไข่ที่ได้รับการปฏิสนธิจากสัตว์อื่นกลายเป็นไข่ไก่\n- **มุมมองทางปรัชญา**: มากกว่าการหาคำตอบที่ชัดเจน คำถามนี้มักใช้เพื่อกระตุ้นให้เกิดการตั้งคำถามเกี่ยวกับการเริ่มต้นสิ่งต่าง ๆ และความไม่แน่นอนของการวิวัฒนาการ\n\n#### ข้อสรุป\n- การตอบคำถามนี้จึงไม่เพียงแค่การยกตัวอย่างสิ่งที่เกิดก่อน แต่ยังเกี่ยวข้องกับการที่เราต้องมองปัญหาจากหลายมุมมอง ทั้งทางวิทยาศาสตร์และทางปรัชญา \n- หากมองในแง่ของวิวัฒนาการ ไข่อาจเกิดก่อนเนื่องจากเป็นกระบวนการที่นำไปสู่การเกิดของไก่ในลักษณะของการเปลี่ยนแปลงทางพันธุกรรม แต่ในขณะเดียวกัน ไก่ที่เราเห็นในปัจจุบันก็ถือเป็นผลิตผลจากกระบวนการนั้นเช่นกัน \n\nการอภิปรายเพิ่มเติมเกี่ยวกับคำถามนี้จะต้องพิจารณามุมมองที่หลากหลายเพื่อเข้าใจปัญหาในเชิงลึกมากขึ้น	267	477	6.0000	openai/gpt-4o-mini	[]	[]	brainstorm	{"brainstormRound":1,"brainstormRole":"model_a"}	\N	f	\N	2026-01-30 15:49:25.342946+00
41	7	assistant	**ข้อตกลงและมุมมองเพิ่มเติมจาก Model A**\n\nModel A วิเคราะห์ทางวิวัฒนาการได้ถูกต้อง แต่มี **จุดบอดเชิงนิยาม** (definitional blind spot) ที่สำคัญ:\n\n### 1. ปัญหาการนิยาม "ไข่"\n- **ไข่ไก่ (Chicken egg)** หมายถึงอะไร?\n  - *นิยาม A*: ไข่ที่ไก่ออกมา → ไข่เกิดทีหลัง (ไก่ตัวแรกฟักจากไข่ของสัตว์คล้ายไก่)\n  - *นิยาม B*: ไข่ที่ฟักเป็นไก่ → ไข่เกิดก่อน (สัตว์คล้ายไก่ที่เกือบเป็นไก่ออกไข่ที่กลายเป็นไก่)\n\n### 2. มุมมองธรณีวิทยา (Devil's Advocate)\n- **ไข่มีก่อนไก่นับร้อยล้านปี**: สัตว์เลื้อยคลานและไดโนเสาร์วางไข่ก่อนไก่มีวิวัฒนาการ 40 ล้านปี\n- คำถามที่ถูกต้องควรเป็น: "ไข่ไก่กับไก่ อะไรก่อน?" ไม่ใช่ "ไข่กับไก่"\n\n### 3. วงจรเหตุ-ผล (Circular Causality)\n- ปัญหานี้เป็น **Causal Loop** ไม่ใช่เส้นตรง:\n  - ไก่ → ไข่ → ไก่ → ไข่ (ระบบเกิดซ้ำ)\n  - การหา "จุดเริ่มต้น" ในวงกลมเป็น **Category Error** (ความผิดพลาดเชิงหมวดหมู่)\n\n### 4. ความต่อเนื่องทางชีวภาพ\n- ไม่มี "ไก่ตัวแรก" หรือ "ไข่ใบแรก" อย่างชัดเจน\n- การเปลี่ยนสายพันธุ์เป็น **gradient** (ไล่ระดับ) ไม่ใช่การกระโดดข้าม\n\n**บทสรุป**: หากตอบตรง ๆ — **ไข่เกิดก่อน** (ในมุมธรณีวิทยาและวิวัฒนาก) แต่ **คำถามนี้ไร้สาระ** (nonsensical) หากมองว่าสปีชีส์เป็นหมวดหมู่ที่เปลี่ยนแปลงต่อเนื่อง ไม่ใช่สิ่งคงทีถ่านรุ่นกันได้ชัดเจน	1179	1440	7.0000	moonshotai/kimi-k2.5	[]	[]	brainstorm	{"brainstormRound":1,"brainstormRole":"model_b"}	\N	f	\N	2026-01-30 15:49:59.175338+00
42	7	assistant	[Model A - Round 2]: ### การเสริมแนวคิดจาก Model B\n\nModel B ได้เสนอแนวคิดที่น่าสนใจหลายจุดและได้ชี้ให้เห็นถึงปัญหาการนิยามที่ชัดเจน ดังนี้:\n\n#### 1. การนิยามไข่\n- **มุมมองด้านชนิดไข่**: การแบ่งแยกระหว่างไข่โดยทั่วไปและไข่ไก่เฉพาะเจาะจงจริง ๆ เป็นสิ่งสำคัญ เพื่อตอบคำถามให้ชัดเจน ควรคำนึงถึงความแตกต่างนี้ในการตอบคำถาม\n\n#### 2. ประวัติศาสตร์ทางชีววิทยา\n- **วิวัฒนาการไม่ได้เป็นแนวเส้นตรง**: ควรมีการเสริมข้อมูลเกี่ยวกับวิวัฒนาการของสัตว์ต่าง ๆ ที่มีการวางไข่และการวิจัยทางพันธุกรรมในปัจจุบันเพื่อยืนยันเหตุการณ์ประวัติศาสตร์ \n- ควรคำนึงถึงหลักฐานดีเอ็นเอที่ได้มาจากการศึกษาเกี่ยวกับสัตว์ที่มีบรรพบุรุษร่วมกันกับไก่\n\n#### 3. กรอบปรัชญาและภาษา\n- **ความหมายของคำถาม**: คำถามนี้สามารถดูได้จากหลายมุม เช่น ตั้งคำถามเกี่ยวกับการเกิดขึ้นของสิ่งมีชีวิตในจักรวาล เช่น เมื่อเปรียบเทียบกับความคิดในปรัชญาแบบพุทธศาสตร์ที่มองว่าวงจรของการกำเนิดไม่มีจุดเริ่มต้นหรือจุดสิ้นสุด \n\n### ข้อควรพิจารณาเพิ่มเติม\n- **บทบาทของปัจจัยภายนอก**: เช่น สภาพแวดล้อมที่อาจส่งผลต่อการพัฒนาของไก่และไข่ ทั้งในแง่ของการปรับตัวเชิงวิวัฒนาการและการเลือกสรรตามธรรมชาติ ซึ่งอาจส่งผลต่อวิธีการฟักไข่และการปรับเปลี่ยนในอนาคต\n- **ถามต่อไป**: ถ้าหากคำถามเกิดขึ้นในบริบทอื่น เช่น สิ่งมีชีวิตทางทะเล อาจจะทำให้เกิดความสับสนในความเชื่อมโยงระหว่างไข่และสัตว์เลี้ยงลูกด้วยนม\n\n**สรุป**: คำถามนี้ไม่เพียงแต่ควรให้ความสำคัญด้านวิทยาศาสตร์และปรัชญา แต่ยังต้องการการแสดงออกทางภาษาและแนวคิดต่าง ๆ ออกมา เพื่อเล็งเห็นมุมมองที่มีความซับซ้อนที่มากขึ้นเกี่ยวกับการเกิดและวิวัฒนาการของชีวิตบนโลก	1320	597	10.0000	openai/gpt-4o-mini	[]	[]	brainstorm	{"brainstormRound":2,"brainstormRole":"model_a"}	\N	f	\N	2026-01-30 15:50:13.440161+00
43	7	assistant	[Model B - Round 2]: การตอบโต้และมุมมองเพิ่มเติม\n\n**ข้อตกลงกับจุดแข็งของ Model A**\nModel A ชี้ให้เห็นประเด็น **วงจรเหตุ-ผลแบบพุทธศาสตร์** และ **ปัจจัยภายนอก** ได้อย่างลึกซึ้ง การเติมมิติเชิงระบบนิเวศน์ (ecological context) เข้ามาทำให้เห็นว่าไม่มีสิ่งมีชีวิตใดเกิดขึ้นโดดเดี่ยว\n\n**จุดบอดเชิงตรรกะ: Loaded Question Fallacy**\nคำถามนี้เป็น **"คำถามบรรจุ"** (loaded question) ที่สมมติว่ามีคำตอบเป็นระดับเดียว (A หรือ B) ในขณะที่ความเป็นจริงคือ **Continuum**:\n- ไม่มี "จุด" ที่สัตว์ตัวหนึ่งกระโดดจาก "ไม่ใช่ไก่" เป็น "ไก่" ในขณะวิวัฒนาการ\n- การถามว่าใครเกิดก่อน เสมือนถามว่า "คุณเลิกตีภรรยาหรือยัง" — สมมติว่ามีความสัมพันธ์แบบเส้นตรงที่อาจไม่มีอยู่จริง\n\n**มุมมองใหม่ 1: ปัญญาณนิยม vs Realism**\n- **Nominalism**: "ไก่" เป็นชื่อที่มนุษย์ตั้งให้ความต่อเนื่องของสารชีวภาพ ธรรมชาติไม่รู้จัก "ไก่" ธรรมชาติรู้จักแค่ DNA ที่ถ่ายทอดกัน\n- คำถามนี้จึงสะท้อน **ข้อจำกัดของภาษา** ในการตัดต่อความต่อเนื่อง (Language carving nature at its joints)\n\n**มุมมองใหม่ 2: สมบัติเกิดขึ้น (Emergence)**\n- **Embryology**: ไก่ไม่ได้อยู่ในไข่ตั้งแต่เริ่ม แต่เกิดจากการ differentiation ของเซลล์\n- ถามว่า "เมื่อไหร่ไข่กลายเป็นไก่" คล้ายถามว่า "ทรายกี่เม็ดจึงเรียกว่ากองทราย" (Sorites paradox)\n\n**มุมมองใหม่ 3: มีม (Memetics)**\n- คำถามนี้เป็น **"Deepity"** (ตาม Dennett): ฟังดูลึกซึ้ง แต่จริงๆ คือการเล่นคำที่ว่างเปล่า หรือเป็น **ไวรัสทางความคิด** ที่รอดมาได้เพราะกระตุ้นความสนใจ ไม่ใช่เพราะมีคุณค่าความจริง\n\n**สรุป**: คำถามนี้ไม่ใช่ปัญหาทางชีววิทยา แต่เป็น **ปัญหาทางภาษาและการรู้คิด** (epistemological puzzle) ที่เผยให้เห็นว่ามนุษย์ชอบแบ่งโลกเป็นหมวดหมู่แบบไบนารี ทั้งที่ธรรมชาติทำงานแบบสเปกตรัม	3072	3029	16.0000	moonshotai/kimi-k2.5	[]	[]	brainstorm	{"brainstormRound":2,"brainstormRole":"model_b"}	\N	f	\N	2026-01-30 15:51:10.979539+00
44	7	assistant	[Model A - Round 3]: ### การเสริมมุมมองจาก Model B\n\nModel B นำเสนอแนวคิดที่ลึกซึ้งเกี่ยวกับปัญหาของการแบ่งประเภทในคำถามนี้ และชี้ให้เห็นถึงข้อจำกัดของการใช้ภาษาในการอธิบายมิติของการเกิดและวิวัฒนาการ นอกจากนี้ยังมีข้อคิดเห็นต่อไปนี้:\n\n#### 1. วงจรของคำถามเป็น "คำถามบรรจุ"\n- การมองคำถามนี้ในฐานะ **คำถามที่มีข้อกำหนด** ลงในกรอบของการเลือกที่ผิดประเภท ทำให้การอภิปรายนี้เกินพ้นความจริงที่อาจจะซับซ้อนมากขึ้น\n\n#### 2. วิกฤตแห่งการนิยามและภาษา\n- ใช้แนวทาง **Ontological question** (คำถามเส้นแบ่งระหว่างสิ่งที่มีอยู่กับสิ่งที่ไม่มีอยู่) เพื่อเข้าใจว่าคำว่า "ไก่" และ "ไข่" ไม่เคยมีขอบเขตที่แน่นอน การพยายามหาคำตอบที่พิสูจน์ได้ในคำถามนั้นๆ อาจจะนำไปสู่ความเข้าใจที่ไม่ถูกต้องเกี่ยวกับการวิเคราะห์ความหมายและแนวคิดพื้นฐาน\n\n#### 3. พัฒนาการสตรีม (Stream of Evolution)\n- เราสามารถขยายแนวคิดต่อไปในทาง **ภาวะปฏิสัมพันธ์** ระหว่างสายพันธุ์และสิ่งแวดล้อม คำถามเกี่ยวกับไข่และไก่จึงอาจเกี่ยวข้องกับกระบวนการที่เรียกว่า **Co-evolution** ที่ในระยะเวลาหนึ่ง ไก่และไข่เปลี่ยนแปลงและปรับตัวซึ่งกันและกัน \n\n#### 4. การใช้บิ๊กแดต้าในการวิจัย\n- ในยุคนี้ การศึกษาทางพันธุกรรมสามารถใช้แพลตฟอร์ม **Big Data** เพื่อตรวจสอบการวิวัฒนาการของสิ่งมีชีวิต ผ่านการวิเคราะห์ข้อมูลดีเอ็นเอจากบรรพบุรุษที่เป็นไปได้ แนวทางนี้ช่วยให้เราเข้าใจความสัมพันธ์ระหว่างสายพันธุ์ในอดีตและพัฒนาการที่มีไปในทิศทางแตกต่าง\n\n#### 5. หลักการของอัตถิภาวนิยม\n- หัวข้อเกี่ยวกับ "อะไรเกิดก่อน" ยังสามารถนำเสนอในแบบ **Dialectical Materialism** ที่เน้นความจริงที่ว่าความจริงไม่สามารถเห็นได้จากมุมมองเดียว การมองเห็นทรัพยากรและการเปลี่ยนแปลงในกระบวนการทางสังคมระยะยาวอาจจะสะท้อนให้เห็นว่าสิ่งที่สำคัญคือการเข้าใจวิวัฒนาการสอดคล้องกับบริบททางสังคมที่กว้างขึ้น\n\n### สรุป\nคำถามไก่และไข่นั้นให้ความสำคัญไม่เพียงแต่ในด้านวิทยาศาสตร์ ยังเป็นคำถามเชิงปรัชญาที่เกิดขึ้นจากการพยายามเข้าใจความสัมพันธ์ของสิ่งมีชีวิตในมิติที่กว้างขวาง ควรทำความเข้าใจความสำคัญของการวิเคราะห์การเกิดการเปลี่ยนแปลงในทางสังคมและวิทยาศาสตร์ร่วมกัน เพื่อสร้างคำตอบที่ครอบคลุมและมีความหมายมากขึ้น อาจไม่มีคำตอบที่ชัดเจน แต่การอภิปรายนี้ส่งเสริมความเข้าใจที่ลึกซึ้งเกี่ยวกับการเป็นอยู่และวิวัฒนาการของชีวิต\n\n---\n\n[Model B - Round 3]: **ข้อคิดเห็นเพิ่มเติมจาก Model A**\n\nModel A ได้สร้างการสนทนาในเชิงลึกเกี่ยวกับแง่มุมของภาษาและวิวัฒนาการที่สะท้อนถึงข้อซับซ้อนในการถามคำถาม เข้าข่ายในความเข้าใจเกี่ยวกับการจำแนกประเภทสิ่งมีชีวิต ดิฉันจะเสริมแนวคิดเพื่อกระตุ้นการคิดต่อเนื่องดังนี้:\n\n### 1. มุมมองของความรู้แบบพหุสัณฐาน\n- นอกจากการใช้แค่บิ๊กแดต้าเรายังควรพิจารณา **Knowledge Complexity** ที่จะสามารถปรับให้เข้ากับชุดข้อมูลหรือแนวคิดที่มีอยู่แล้วเพื่อให้ได้ผลที่น่าจะเป็นจริงขึ้น เช่น การรวมการวิเคราะห์ทางพันธุกรรมเข้ากับผลการศึกษาแบบสังคมศาสตร์\n\n### 2. สังคมในวิทยาศาสตร์และเทคโนโลยี\n- เราสามารถสร้างแพลตฟอร์มที่เน้นการแบ่งปันความรู้ เพื่อให้ปัญญาเกิดการเคลื่อนไหวในเชิงสังคมและการเมือง เพื่อเปิดพื้นที่การเสวนาในทิศทางนี้\n\n### 3. ปรับใช้มุมมองในระดับจิตวิทยา\n- การทำความเข้าใจเกี่ยวกับคำถามนี้ให้ภายในทฤษฎีทั่วไปอาจสร้างความตระหนักรู้ในจิตวิทยาและปรัชญา การศึกษาผลกระทบทางจิตใจจากการตอบคำถาม ये और वह\n\n### 4. การจัดการความรู้ในยุคดิจิทัล\n- ในยุคที่ข้อมูลมีให้เลือกมากมาย การรู้จักแยกแยะข้อมูลให้มีความน่าเชื่อถือและสมเหตุสมผลอย่างวิจารณ์เป็นทักษะที่สำคัญมาก หัวข้อสามารถนำไปใช้สอนในรูปแบบใหม่ๆ เพื่อสร้างนิสัยการวิเคราะห์ที่ยั่งยืน\n\n### สรุป\nคำถามเกี่ยวกับไก่และไข่ไม่ได้เพียงแค่ทบทวนมุมมองเดียว มันเปิดเส้นทางให้เราคิดถึงการนำเสนอแนวทางใหม่ๆ การใช้วัสดุทางวิทยาศาสตร์ การสร้างพลวัตการตระหนักรู้ในสังคม และส่งเสริมให้เกิดแนวคิดที่กว้างขึ้นในอนาคตของการเรียนรู้ แสดงความคิดเห็นนี้ จึงสามารถกระตุ้นการสนทนาเพื่อนำไปสู่ความรู้ใหม่ๆ ได้ในที่สุด.	2563	1351	20.0000	openai/gpt-4o-mini	[]	[]	brainstorm	{"brainstormRound":3,"brainstormRole":"model_a"}	\N	f	\N	2026-01-30 15:51:39.864073+00
45	7	assistant	 [Model B - Round 4]: **การปิดบัญชีทางวิทยาศาสตร์**\n\n**ข้อตกลงและคำตอบขั้นสุดท้าย**\nModel A และรอบก่อนหน้าได้วิเคราะห์ปัญหาเชิงตรรกะและภาษาอย่างละเอียด แต่ **ขาดคำตอบที่กระชับ** ต่อผู้ถือครองความสงสัย:\n\n**คำตอบ**: **ไข่เกิดก่อน** — เฉพาะไข่ที่มีสารพันธุกรรมครบชุดของไก่ (สายพันธุ์ *Gallus gallus domesticus*) โดยวางโดยนก proto-chicken ที่ยังไม่ใช่ไก่ 100%\n\n**จุดบอดที่ยังไม่ถูกกล่าวถึง: เวลาทางพัฒนาการ (Developmental Time)**\n- **การสร้างสารพันธุกรรมใหม่เกิดขึ้นที่ไซโกต** (zygote) ภายในไข่ ไม่ใช่ในร่างกายแม่\n- แม่ไม่เปลี่ยนเป็นไก่สายพันธุ์ใหม่ระหว่างชีวิต (Lamarck ผิด) แต่ไข่คือรุ่นที่สองที่มี DNA ใหม่\n- ดังนั้น **รุ่นแรกของสิ่งใหม่อยู่ในไข่เสมอ** กฎนี้ใช้กับสัตว์วางไข่ทั้งหมด\n\n**มุมมองใหม่: ความไม่สมมาตรทางสาเหตุ (Causal Asymmetry)**\n- ไก่ *ต้อง* มาจากไข่ (จำเป็น)\n- แต่ไข่ *ไม่จำเป็น* ต้องมาจากไก่ (มาจากสัตว์อื่นได้)\n- ตรรกะนี้บงบอกว่าไข่มี "ontological priority" สูงกว่าในเชิงสาเหตุ\n\n**ปิดท้าย**: คำถามนี้เป็นอนุมานทางภาษาที่น่าสนใจ แต่คำตอบทางชีววิทยาชัดเจน—วิวัฒนาการไม่สนใจความกลมกลืน (continuity) ที่มนุษย์คิด มันสนใจการคัดเลือกยีนในรุ่นถัดไป ซึ่งเกิดขึ้นในไข่	6582	3292	20.0000	moonshotai/kimi-k2.5	[]	[]	brainstorm	{"brainstormRound":3,"brainstormRole":"model_b"}	\N	f	\N	2026-01-30 15:52:53.050934+00
46	7	assistant	## Brainstorm Summary\n\n### Key Findings\n- The age-old question of "Which came first, the chicken or the egg?" reveals complexities that span biological, philosophical, and linguistic realms.\n- From a biological standpoint, the consensus leans toward the conclusion that the egg, specifically a chicken egg, existed before the first true chicken, due to evolutionary processes.\n- Discussions consider the definitions of "chicken" and "egg," and how they relate to broader themes of lineage and evolution.\n- The question itself can be seen as a circular problem in causality, lacking a straightforward answer when limited to binary classifications.\n\n### Detailed Analysis\n1. **Evolutionary Perspective**:\n   - According to evolutionary biology, contemporary chickens are believed to have evolved from a parental species that was not a true chicken. Hence, the egg containing the genetic material of the modern chicken came before it could be classified as a chicken.\n   - This perspective emphasizes that many predecessors to chickens laid eggs long before chickens as we know them existed, aligning with the notion that eggs have existed far longer than chickens.\n\n2. **Philosophical Implications**:\n   - The question also serves as an exploration of causality and existence. It challenges assumptions about starting points in life forms and biological categories.\n   - The inquiry reveals the limitations of language in structuring such questions, as the terms "chicken" and "egg" can be highly context-dependent and reflect different stages of reproductive cycles.\n\n3. **Symbolism in Cultural Context**:\n   - The debate embodies how societies process questions about beginnings, evolution, and our understanding of life itself. It illustrates the desire to classify and simplify complexities of existence into digestible components.\n   - Furthermore, it speaks to the human tendency to seek clear answers in systems that may inherently be ambiguous and dynamic.\n\n### Recommendations\n- Engage in interdisciplinary discussions that encompass biology, philosophy, linguistics, and social sciences to provide a more nuanced understanding of such questions.\n- Use this inquiry as a pedagogical tool in educational environments to illustrate complex systems, promoting critical thinking and discussions around definitions and categorizations.\n- Foster an appreciation for the continuum of life forms and evolutionary processes, encouraging a move away from binary thinking to embrace complexity and interconnections in biology and beyond.\n\nIn conclusion, while the question of whether the chicken or the egg came first seems straightforward, it encapsulates deeper philosophical and scientific inquiries into the nature of existence, evolution, and knowledge itself.	4349	494	16.0000	openai/gpt-4o-mini	[]	[]	brainstorm	{"brainstormRound":0,"brainstormRole":"summary"}	\N	f	\N	2026-01-30 15:53:03.662327+00
47	7	user	/ultrathink  kimi ตอนนี้เวอร์ชั่นไหน ดีกว่า opus 4.5 หรือไม่	0	0	0.0000	\N	[]	[]	\N	\N	\N	f	\N	2026-01-30 16:06:15.112143+00
48	10	user	แจ้งฉัน ทุกวันตอนแปดโมงเช้า ค้นหาข่าวเกี่ยวกับ เทคโนโลยี AI ใหม่ ๆ ว่ามีเรื่องอะไรใหม่ ๆ ทั่วโลกแปลเป็นภาษาไทย	0	0	0.0000	\N	[]	[]	\N	\N	\N	f	\N	2026-01-30 16:20:37.497161+00
49	10	assistant	ตอนนี้ยังไม่สามารถตั้งเตือนหรือส่งข้อความอัตโนมัได้ แต่คุณสามารถตั้งเวลาเตือนในโทรศัพท์หรือแอปที่คุณใช้เพื่อค้นหาข่าวเกี่ยวกับเทคโนโลยี AI ได้ทุกวันในเวลา 8 โมงเช้า และคุณสามารถใช้บริการแปลภาษาเพื่อแปลข่าวเหล่านั้นเป็นภาษาไทยได้ด้วย หากต้องการให้ฉันช่วยหาข่าวเกี่ยวกับ AI ในเวลานี้หรือในอนาคต แต่แค่ครั้งเดียวก็ยังสามารถทำได้ค่ะ!	0	830	9.0000	openai/gpt-4o-mini	[]	[]	\N	\N	\N	f	\N	2026-01-30 16:20:40.489316+00
50	15	user	คุยเรื่องอะไรกันอยู่	0	0	0.0000	\N	[]	[]	\N	\N	\N	f	\N	2026-01-30 17:05:09.02786+00
51	15	assistant	เรากำลังพูดคุยกันเกี่ยวกับ Authentication ใน Context7/Framework7 และการสร้าง Skill ใน Claude หากคุณสนใจในประเด็นไหนสามารถถามเพิ่มเติมได้เลย!	0	300	3.0000	openai/gpt-4o-mini	[]	[]	\N	\N	\N	f	\N	2026-01-30 17:05:16.180071+00
52	17	user	คุยเรื่องอะไรกันอยู่	0	0	0.0000	\N	[]	[]	\N	\N	\N	f	\N	2026-01-30 17:11:28.488106+00
53	17	assistant	คุณสนใจคุยเรื่องอะไรเป็นพิเศษไหม? ไม่ว่าจะเป็นเรื่องทั่วไป เช่น เทคโนโลยี กีฬา หนังสือ ดนตรี หรือเรื่องเฉพาะ เช่น วิทยาศาสตร์ หรือการศึกษา ก็ยินดีที่จะพูดคุกันครับ!	0	390	4.0000	openai/gpt-4o-mini	[]	[]	\N	\N	\N	f	\N	2026-01-30 17:11:30.348913+00
54	10	user	แจ้งฉัน ทุกวันตอนแปดโมงเช้า ค้นหาข่าวเกี่ยวกับ เทคโนโลยี AI ใหม่ ๆ ว่ามีเรื่องอะไรใหม่ ๆ ทั่วโลกแปลเป็นภาษาไทย	0	0	0.0000	\N	[]	[]	\N	\N	\N	f	\N	2026-01-30 17:34:49.087141+00
55	10	assistant	ตอนนี้ฉันไม่สามารถตั้งการแจ้งเตือนหรือส่งข้อความอัตโนมัติให้คุณได้ แต่คุณสามารถใช้แอปพลิเคชันเตือนความจำหรือฟีเจอร์การตั้งเวลาในโทรศัพท์ของคุณเพื่อเตือนให้ค้นหาข่าวเกี่ยวกับเทคโนโลยี AI ใหม่ ๆ ในเวลา 8 โมงเช้าได้\n\nนอกจากนี้ หากคุณต้องการข้อมูลเกี่ยวกับข่าวล่าสุดในช่วงนี้เกี่ยวกับ AI คุณสามารถถามหรือขอให้ฉันช่วยหาข่าวล่าสุดได้ในเวลานี้ หรือเลือกวันที่คุณต้องการให้ฉันค้นหาให้ในอนาคต!	0	940	10.0000	openai/gpt-4o-mini	[]	[]	\N	\N	\N	f	\N	2026-01-30 17:34:52.749871+00
81	22	user	เป็นภาพอะไร	0	0	0.0000	\N	[]	[]	\N	\N	\N	f	\N	2026-02-02 03:52:04.485676+00
56	18	user	แจ้งฉัน ทุกวันตอนแปดโมงเช้า ค้นหาข่าวเกี่ยวกับ เทคโนโลยี AI ใหม่ ๆ ว่ามีเรื่องอะไรใหม่ ๆ ทั่วโลกแปลเป็นภาษาไทย	0	0	0.0000	\N	[]	[]	\N	\N	\N	f	\N	2026-01-30 17:35:50.15134+00
57	18	assistant	ตอนนี้ฉันไม่สามารถตั้งการแจ้งเตือนหรือทำการค้นหาข่าวในเวลาที่กำหนดได้ แต่ฉันสามารถแนะนำให้คุณใช้แอปหรือบริการข่าวสารที่สามารถปรับตั้งค่าการแจ้งเตือนตามความต้องการของคุณได้ เช่น Google News, Feedly หรือแอปข่าวอื่น ๆ ที่คุณชอบ และคุณสามารถค้นหาข่าวเกี่ยวกับเทคโนโลยี AI ได้ทุกวัน\n\nนอกจากนี้ หากคุณมีคำถามเกี่ยวกับเทคโนโลยี AI หรือต้องการให้ช่วยสรุปข่าวเมื่อไหร่ก็สามารถถามฉันได้ทุกเมื่อเลย!	0	990	10.0000	openai/gpt-4o-mini	[]	[]	\N	\N	\N	f	\N	2026-01-30 17:35:54.090986+00
58	18	user	แจ้งฉัน ทุกวันตอนแปดโมงเช้า ค้นหาข่าวเกี่ยวกับ เทคโนโลยี AI ใหม่ ๆ ว่ามีเรื่องอะไรใหม่ ๆ ทั่วโลกแปลเป็นภาษาไทย	0	0	0.0000	\N	[]	[]	\N	\N	\N	f	\N	2026-01-30 17:39:18.603881+00
59	18	assistant	ขออภัยที่ไม่สามารถทำการแจ้งเตือนหรือค้นหาข่าวให้คุณในเวลาที่กำหนดได้ แต่ฉันสามารถแนะนำวิธีการรวมถึงแหล่งข่าวที่คุณสามารถติดตามได้ด้วยตัวเอง ดังนี้:\n\n1. **ตั้งการแจ้งเตือนด้วยแอปข่าว**: คุณสามารถดาวน์โหลดแอปข่าว เช่น Google News หรือ Flipboard และตั้งค่าการแจ้งเตือนข่าวเกี่ยวกับเทคโนโลยี AI ตามหัวข้อที่คุณสนใจ\n\n2. **ใช้ RSS Feed**: หากคุณมีเว็บที่คุณชื่นชอบเกี่ยวกับเทคโนโลยี AI คุณสามารถใช้บริการ RSS feed เพื่อรับข่าวสารใหม่ ๆ โดยตรง\n\n3. **ติดตามเว็บไซต์ข่าวสาร**: เว็บไซต์เช่น TechCrunch, Wired, หรือ MIT Technology Review มักจะมีข่าวเกี่ยวกับพัฒนาใหม่ ๆ ในวงการ AI\n\n4. **หาข่าวในโซเชียลมีเดีย**: คุณสามารถติดตามแท็กหรือบัญชีที่เกี่ยวข้องกับ AI บน Twitter, Facebook หรือ LinkedIn เพื่อรับข้อมูลล่าสุด\n\nเมื่อคุณพบข่าวใหม่ ๆ ที่ต้องการให้แปล คุณสามารถนำเข้ามาให้ฉันได้เสมอ และฉันยินดีที่จะช่วยแปลและสรุปให้นะ!	0	1690	17.0000	openai/gpt-4o-mini	[]	[]	\N	\N	\N	f	\N	2026-01-30 17:39:26.26613+00
60	18	user	แจ้งฉัน ทุกวันตอนแปดโมงเช้า ค้นหาข่าวเกี่ยวกับ เทคโนโลยี AI ใหม่ ๆ ว่ามีเรื่องอะไรใหม่ ๆ ทั่วโลกแปลเป็นภาษาไทย	0	0	0.0000	\N	[]	[]	\N	\N	\N	f	\N	2026-01-30 17:44:10.123462+00
61	6	user	/translation  "Lunch & Learn"	0	0	0.0000	\N	[]	[]	\N	\N	\N	f	\N	2026-01-31 02:11:04.7009+00
62	6	assistant	**Lunch & Learn** แปลเป็นภาษาไทยได้หลายรูปแบบ ตามบริบท:\n\n**แบบที่ใช้กันทั่วไป (เป็นทางการ):**\n- **สัมมนาอาหารกลางวัน** หรือ **การสัมมนาระหว่างรับประทานอาหารกลางวัน**\n- **การอบรมยามเที่ยง** / **อบรมระหว่างรับประทานอาหาร**\n\n**แบบที่เป็นธรรมชาติ/ไม่เป็นทางการ:**\n- **กิจกรรมแลกเปลี่ยนความรู้ระหว่างมื้อเที่ยง**\n- **นัดพบปะพูดคุยพร้อมอาหารกลางวัน**\n\n**แบบคงศัพท์ภาษาอังกฤษ (นิยมใช้ในองค์กร):**\n- **ลันช์แอนด์เลิร์น** (Lunch & Learn)\n- หรือเขียนเป็นภาษาอังกฤติตามตัวเลย แต่อธิบายว่าเป็น *"กิจกรรมสั้นๆ ที่จัดขึ้นระหว่างมื้อเที่ยง ผสมการรับประทานอาหารกับการเรียนรู้/ฟังบรรยาย"*\n\n**ตัวอย่างประโยค:**\n> "เราจัด **สัมมนาอาหารกลางวัน (Lunch & Learn)** ทุกวันพุธ เพื่อให้ทีมได้อัปเดตเทรนด์ AI โดยไม่เสียเวลาทำงาน"\n\n**เลือกใช้ตามนี้:**\n- ถ้าเป็นเอกสารทางการ → ใช้ **"สัมมนาอาหารกลางวัน"**\n- ถ้าเป็นการพูดคุย/โพสต์โซเชียล → ใช้ **"Lunch & Learn"** หรือ **"อบรมยามเที่ยง"**	0	7400	30.0000	moonshotai/kimi-k2.5	[]	[]	\N	\N	\N	f	\N	2026-01-31 02:11:37.084097+00
63	15	user	/context7-auto-research  agent skill development	0	0	0.0000	\N	[]	[]	\N	\N	\N	f	\N	2026-01-31 06:52:47.894052+00
64	15	assistant	ดูเหมือนว่าคุณกำลังพูดถึงการพัฒนาทักษะของ agent ในบริบทของ Context7 หรือ Framework7 ซึ่งอาจเกี่ยวข้องกับการสร้างแอปพลิเคชันหรือระบบอัตโนมัติ ถ้าคุณสามารถให้ข้อมูลเพิ่มเติมเกี่ยวกับสิ่งที่คุณต้องการรู้หรือสนใจเกี่ยวกับการพัฒนาทักษะของ agent ในบริบทนี้ได้ไหมครับ? เช่น มีคำถามเฉพาะเจาะจงหรือหัวข้อที่คุณต้องการให้ช่วยเหลือ?	0	850	9.0000	openai/gpt-4o-mini	[]	[]	code-docs-assistant	\N	\N	f	\N	2026-01-31 06:52:52.171989+00
65	18	user	[Scheduled] ค้นหาข่าวเกี่ยวกับ เทคโนโลยี AI ใหม่ ๆ ว่ามีเรื่องอะไรใหม่ ๆ ทั่วโลกแปลเป็นภาษาไทย	0	0	0.0000	openai/gpt-4o-mini	[]	[]	\N	\N	\N	f	\N	2026-02-01 16:00:07.38894+00
66	18	assistant	ตอนนี้มีข่าวเกี่ยวกับเทคโนโลยี AI ใหม่ ๆ ที่น่าสนใจมากมาย เช่น:\n\n1. **การพัฒนา AI ที่สามารถสร้างภาพและวิดีโอ**: มีการเปิดตัวโมเดลใหม่ที่สามารถสร้างภาพและวิดีโอที่มีคุณภาพสูงจากข้อความที่ป้อนเข้าไป เช่น DALL-E และ Stable Diffusion ที่ช่วยให้คนสร้างงานศิลปะได้อย่างง่ายดาย.\n\n2. **AI ในการแพทย์**: มีการใช้ AI ในการวิเคราะห์ข้อมูลทางการแพทย์และช่วยในการวินิจฉัยโรคได้เร็วขึ้น เช่น โมเดล AI ที่สามารถประเมินรูปภาพจากการสแกน MRI หรือ CT scan.\n\n3. **การแปลภาษาโดยใช้ AI**: AI ถูกนำมาใช้ในการพัฒนาโปรแกรมแปลภาษาที่สามารถแปลผลได้อย่างรวดเร็วและแม่นยำมากขึ้น ทำให้การสื่อสารข้ามภาษาทำได้ง่ายขึ้น.\n\n4. **การใช้ AI ในการทำธุรกิจ**: หลายบริษัทเริ่มใช้ AI ในการวิเคราะห์ข้อมูลลูกค้าและพัฒนาประสบการณ์ของลูกค้า ทำให้ธุรกิจมีประสิทธิภาพและเพิ่มรายได้ได้มากขึ้น.\n\nหากคุณต้องการข้อมูลเพิ่มเติมเกี่ยวกับหัวข้อใด หรือต้องการข่าวที่เฉพาะเจาะจงมากขึ้น สามารถระบุได้เลย!	56	305	4.0000	openai/gpt-4o-mini	[]	[]	chat-alert	\N	\N	f	\N	2026-02-01 16:00:07.403947+00
67	18	user	แสดงข่าวสาร IT และ AI วันนี้ใน Artifacts	0	0	0.0000	\N	[]	[]	\N	\N	\N	f	\N	2026-02-02 03:13:37.686843+00
82	22	assistant	หากคุณมีภาพที่ต้องการให้ฉันช่วยวิเคราะห์หรือระบุ คุณสามารถบรรยายลักษณะของภาพหรือเนื้อหาที่อยู่ในภาพนั้นให้ฉันฟังได้ ฉันจะพยายามช่วยอธิบายหรือให้ข้อมูลเพิ่มเติมตามที่คุณบอกค่ะ!	0	490	5.0000	openai/gpt-4o-mini	[]	[]	\N	\N	\N	f	\N	2026-02-02 03:52:12.485867+00
83	23	user	[{"type":"text","text":"เป็นภาพอะไร สถานที่น่าจะเป็นที่ไหน"},{"type":"image_url","image_url":{"url":"/uploads/chat/uploads/1/fzb8Ap6K_3-1770004363190.jpg"}}]	0	0	0.0000	\N	[{"type":"image","url":"/uploads/chat/uploads/1/fzb8Ap6K_3-1770004363190.jpg","name":"FB_IMG_1754922287858.jpg"}]	[]	\N	\N	\N	f	\N	2026-02-02 03:52:54.875829+00
68	18	assistant	ขออภัยในความไม่สะดวก ฉันไม่สามารถค้นหาข้อมูลแบบเรียลไทม์หรือเข้าถึง Artifacts หรือแพลตฟอร์มข่าวสารภายนอกได้โดยตรง แต่คุณสามารถค้นหาข่าวสารเกี่ยวกับ IT และ AI ได้จากแหล่งข่าวต่าง ๆ ที่มีอยู่ ซึ่งฉันสามารถแนะนำได้ เช่น:\n\n1. **เว็บไซต์ข่าวเทคโนโลยี**: TechCrunch, Wired, The Verge, MIT Technology Review\n2. **ข่าวจากสำนักข่าวใหญ่**: BBC, CNN, Reuters ก็มีการรายงานข่าวด้านเทคโนโลยีอยู่บ่อยครั้ง\n3. **แพลตฟอร์มโซเชียลมีเดีย**: หาข่าวได้จาก Twitter โดยติดตามแฮชแท็กหรือบัญชีที่เกี่ยวข้องกับ AI และ IT\n\nหากคุณมีข่าวเฉพาะที่ต้องการให้ฉันช่วยอธิบายหรือสรุป คุณสามารถส่งเนื้อหามาให้ฉันได้เลย!	0	1400	14.0000	openai/gpt-4o-mini	[]	[]	\N	\N	\N	f	\N	2026-02-02 03:13:43.305967+00
69	22	user	[{"type":"text","text":"เป็นภาพอะไร"},{"type":"image_url","image_url":{"url":"/uploads/chat/uploads/1/Z6CtX68jbb-1770003006167.png"}}]	0	0	0.0000	\N	[{"type":"image","url":"/uploads/chat/uploads/1/Z6CtX68jbb-1770003006167.png","name":"pruk_3344860_M_0_156225827685953b70f41d1.87275171.png"}]	[]	\N	\N	\N	f	\N	2026-02-02 03:30:12.489303+00
70	22	assistant	ดูเหมือนว่าฉันไม่สามารถเข้าถึงหรือตรวจสอบลิงก์ภาพที่คุณส่งมาได้ หากคุณสามารถบอกลักษณะหรือเนื้อหาของภาพได้ ฉันอาจจะช่วยอธิบายหรือให้ข้อมูลเกี่ยวกับมันได้ค่ะ	0	470	5.0000	openai/gpt-4o-mini	[]	[]	\N	\N	\N	f	\N	2026-02-02 03:30:14.869025+00
71	23	user	[{"type":"text","text":"ภาพอะไร"},{"type":"image_url","image_url":{"url":"/uploads/chat/uploads/1/2CPt8LBuI_-1770003244110.webp"}}]	0	0	0.0000	\N	[{"type":"image","url":"/uploads/chat/uploads/1/2CPt8LBuI_-1770003244110.webp","name":"th-11134201-7rasm-m99p9mbeg6z334.webp"}]	[]	\N	\N	\N	f	\N	2026-02-02 03:34:08.472386+00
72	23	assistant	ภาพที่คุณส่งมาเป็นรูปภาพ แต่ดูเหมือนว่าฉันไม่สามารถดูภาพได้ อย่างไรก็ตาม หากคุณมีคำอธิบายหรือคำถามเกี่ยวกับภาพนั้น ฉันยินดีที่จะช่วยคุณ!	0	330	4.0000	openai/gpt-4o-mini	[]	[]	\N	\N	\N	f	\N	2026-02-02 03:34:10.767567+00
73	23	user	ภาพที่แนบก่อนหน้านี้คือภาพอะไร	0	0	0.0000	\N	[]	[]	\N	\N	\N	f	\N	2026-02-02 03:35:02.610021+00
74	23	assistant	ขออภัยด้วยนะครับ ตอนนี้ฉันไม่เปิดดูหรือเห็นภาพที่แนบมาก่อนหน้านี้ได้จริง ๆ จึงไม่สามารถบอกได้ว่าเป็นภาพอะไร  \n\nถ้าคุณสามารถ:\n- แนบภาพมาใหม่อีกครั้ง หรือ  \n- อธิบายภาพคร่าว ๆ (เช่น เป็นคน สัตว์ สถานที่ หรือสิ่งของอะไร)\n\nฉันจะช่วยอธิบายหรือให้ข้อมูลเกี่ยวกับภาพนั้นได้ทันทีครับ 😊	0	810	4.0000	openai/gpt-5.2-chat	[]	[]	\N	\N	\N	f	\N	2026-02-02 03:35:06.355887+00
75	23	user	[{"type":"text","text":"ภาพผู้หญิงยืนอยู่ที่ไหน"},{"type":"image_url","image_url":{"url":"/uploads/chat/uploads/1/E0SgwnarfP-1770003329222.png"}}]	0	0	0.0000	\N	[{"type":"image","url":"/uploads/chat/uploads/1/E0SgwnarfP-1770003329222.png","name":"Replace_cardigan_wit-3.png"}]	[]	\N	\N	\N	f	\N	2026-02-02 03:35:41.475646+00
76	23	assistant	จากภาพที่แนบมา **ผู้หญิงกำลังยืนอยู่กลางแจ้ง บนทางเดินหรือพื้นที่โล่งใกล้อาคาร**  \nลักษณะโดยรวมคล้ายบริเวณ **หน้าตึกหรือภายในพื้นที่สาธารณะของมหาวิทยาลัย/สถานศึกษา หรืออาคารสำนักงาน**  \nด้านหลังเห็นอาคาร มีต้นไม้ และบรรยากาศภายนอกอาคารชัดเจน\n\nถ้าคุณอยากให้ฉันอธิบายรายละเอียดเพิ่มเติม เช่น การแต่งกาย ท่าทาง หรือสภาพแวดล้อมรอบ ๆ บอกได้เลยนะครับ 😊	0	1300	6.0000	openai/gpt-5.2-chat	[]	[]	\N	\N	\N	f	\N	2026-02-02 03:35:45.102437+00
77	23	user	ภาพก่อนหน้านี้คือภาพอะไร	0	0	0.0000	\N	[]	[]	\N	\N	\N	f	\N	2026-02-02 03:35:56.928241+00
78	23	assistant	ภาพก่อนหน้านี้เป็น **ภาพผู้หญิงยืนอยู่กลางแจ้ง บริเวณทางเดินหรือพื้นที่หน้าอาคาร**  \nรอบ ๆ มีอาคารและต้นไม้ ลักษณะคล้ายพื้นที่สาธารณะ เช่น หน้าอาคารเรียน มหาวิทยาลัย หรืออาคารสำนักงาน  \nเป็นภาพถ่ายบุคคลในสภาพแวดล้อมภายนอกอาคารครับ\n\nถ้าต้องการให้ฉันอธิบายรายละเอียดส่วนใดเพิ่มเติม บอกได้เลยนะครับ 😊	0	1060	5.0000	openai/gpt-5.2-chat	[]	[]	\N	\N	\N	f	\N	2026-02-02 03:35:59.823603+00
79	22	user	[{"type":"text","text":"ในภาพเป็นสถานที่ที่ไหน"},{"type":"image_url","image_url":{"url":"/uploads/chat/uploads/1/9i2n67EMou-1770004300309.png"}}]	0	0	0.0000	\N	[{"type":"image","url":"/uploads/chat/uploads/1/9i2n67EMou-1770004300309.png","name":"pruk_2806473_M_0_74704111967d2f17e9f2932.85253070.png"}]	[]	\N	\N	\N	f	\N	2026-02-02 03:51:51.29191+00
80	22	assistant	ฉันไม่สามารถดูหรือเข้าถึงภาพที่คุณส่งมาได้ ดังนั้นไม่สามารถบอกได้ว่าสถานที่ในภาพคือที่ไหน ถ้าคุณสามารถให้รายละเอียดเกี่ยวกับภาพหรือบอกลักษณะเฉพาะของสถานที่นั้น ๆ ให้ฉันฟัง ฉันจะพยายามช่วยคุณในการระบุสถานที่ค่ะ	0	570	6.0000	openai/gpt-4o-mini	[]	[]	\N	\N	\N	f	\N	2026-02-02 03:51:54.236681+00
84	23	assistant	จากภาพที่แนบมา เป็น **ภาพถ่ายผู้หญิงยืนอยู่กลางแจ้ง**  \n\n**ลักษณะภาพ**\n- เป็นภาพบุคคล 1 คน ยืนถ่ายรูป\n- อยู่ในพื้นที่โล่ง มีอาคารอยู่ด้านหลัง\n- รอบ ๆ มีต้นไม้ ทางเดิน และบรรยากาศภายนอกอาคาร\n- ดูเป็นสถานที่ที่จัดระเบียบเรียบร้อย ไม่ใช่ธรรมชาติล้วน\n\n**สถานที่น่าจะเป็น**\n- น่าจะเป็น **บริเวณหน้าหรือภายในมหาวิทยาลัย / สถานศึกษา**\n- หรืออาจเป็น **อาคารสำนักงาน หน่วยงานราชการ หรือพื้นที่สาธารณะขนาดใหญ่**\n- ไม่สามารถระบุสถานที่เฉพาะเจาะจงได้แน่ชัดจากภาพเพียงอย่างเดียว\n\nถ้าคุณอยากให้ช่วยวิเคราะห์เพิ่ม เช่น ดูว่าเป็นแนวมหาวิทยาลัยหรือสำนักงานมากกว่า บอกได้นะครับ 😊	0	1660	7.0000	openai/gpt-5.2-chat	[]	[]	\N	\N	\N	f	\N	2026-02-02 03:52:59.052581+00
85	23	user	[{"type":"text","text":"วิเคราะว่าเป็นภาพอะไร สถานที่ไหน ช่วงเวลาไหน"},{"type":"image_url","image_url":{"url":"/uploads/chat/uploads/1/xeH1H0PksO-1770004742394.png"}}]	0	0	0.0000	\N	[{"type":"image","url":"/uploads/chat/uploads/1/xeH1H0PksO-1770004742394.png","name":"freepik__a-fullbody-shot-of-joy-a-25yearold-thai-woman-with__8286.png"}]	[]	\N	\N	\N	f	\N	2026-02-02 03:59:23.017152+00
86	23	assistant	จากการวิเคราะห์ภาพที่แนบมา สามารถอธิบายได้ดังนี้ครับ  \n\n**เป็นภาพอะไร**\n- เป็น **ภาพถ่ายผู้หญิง 1 คนยืนโพสถ่ายรูป**\n- เป็นภาพบุคคลถ่ายแบบเต็มตัวหรือเกือบเต็มตัว\n- ลักษณะเป็นภาพถ่ายทั่วไป ไม่ใช่ภาพทางการ\n\n**สถานที่น่าจะเป็น**\n- เป็น **สถานที่กลางแจ้ง**\n- มีอาคารอยู่ด้านหลัง ทางเดิน และต้นไม้\n- บรรยากาศดูเป็นระเบียบ สะอาด\n- มีความเป็นไปได้สูงว่าเป็น  \n  - บริเวณ **มหาวิทยาลัย / สถานศึกษา**  \n  - หรือ **อาคารสำนักงาน / หน่วยงานราชการ / พื้นที่สาธารณะขนาดใหญ่**\n- ไม่สามารถระบุชื่อสถานที่เฉพาะเจาะจงได้จากภาพเพียงอย่างเดียว\n\n**ช่วงเวลา**\n- น่าจะถ่ายใน **เวลากลางวัน**\n- แสงธรรมชาติค่อนข้างสว่าง เงาไม่ยาวมาก\n- คาดว่าเป็นช่วง **สายถึงบ่าย**\n\nถ้าคุณอยากให้ฉันวิเคราะห์เพิ่มเติม เช่น บรรยากาศ ความรู้สึกของภาพ หรือรายละเอียดสภาพแวดล้อม บอกได้เลยนะครับ 😊	896	307	6.0000	openai/gpt-5.2-chat	[]	[]	\N	\N	\N	f	\N	2026-02-02 03:59:27.61638+00
87	23	user	[{"type":"text","text":"เป็นภาพอะไร"},{"type":"image_url","image_url":{"url":"/uploads/chat/uploads/1/gUIDYIkQwE-1770004938090.png"}}]	0	0	0.0000	\N	[{"type":"image","url":"/uploads/chat/uploads/1/gUIDYIkQwE-1770004938090.png","name":"nano-banana_Replace_baby's_outfi.png"}]	[]	\N	\N	\N	f	\N	2026-02-02 04:02:25.20049+00
88	23	assistant	เป็นภาพถ่ายบุคคลหญิง 1 คน ยืนโพสท่าบนทางเดินกลางแจ้ง ด้านหลังเป็นอาคารสูงและต้นไม้ล้อมรอบ ดูเหมือนจะเป็นพื้นที่สาธารณะหรือบริเวณมหาวิทยาลัย/อาคารสำนักงาน ภาพนี้ถ่ายในเวลากลางวัน ให้ความรู้สึกเป็นภาพ Portrait แบบไม่เป็นทางการครับ	1224	476	4.0000	openai/o4-mini	[]	[]	\N	\N	\N	f	\N	2026-02-02 04:02:34.289809+00
89	24	user	สร้างพรอมต์ ภาพผู้หญิงชาวไทยอายุ 20 ปี เดินอยู่ในสวนหลังบ้าน	0	0	0.0000	\N	[]	[]	\N	\N	\N	f	\N	2026-02-02 07:21:04.623259+00
90	19	user	สร้างภาพ เด็กผู้หญิง 2 ขวบเดินเล่นในห้องนั่งเล่น	0	0	0.0000	\N	[]	[]	\N	\N	\N	f	\N	2026-02-02 08:38:51.45918+00
91	19	assistant	```json\n{\n  "prompt": "A 2-year-old girl playing in a cozy living room, surrounded by toys and colorful decorations, natural lighting coming through a window, warm atmosphere, high detail, photorealistic",\n  "aspectRatio": "16:9",\n  "style": "realistic",\n  "numImages": 1,\n  "quality": "high"\n}\n```	655	82	1.0000	openai/gpt-4o-mini	[]	[]	image-creator	\N	\N	f	\N	2026-02-02 08:39:06.100196+00
92	19	user	สร้างภาพ เด็กผู้หญิง 2 ขวบเดินเล่นในห้องนั่งเล่น	0	0	0.0000	\N	[]	[]	\N	\N	\N	f	\N	2026-02-02 09:02:28.490807+00
93	19	assistant	```json\n{\n  "prompt": "A 2-year-old girl playing in a cozy living room, filled with soft toys and colorful furnishings, gentle sunlight streaming through a window, warm and inviting atmosphere, high detail, photorealistic",\n  "aspectRatio": "16:9",\n  "style": "realistic",\n  "numImages": 1,\n  "quality": "high"\n}\n```	763	85	1.0000	openai/gpt-4o-mini	[]	[]	image-creator	\N	\N	f	\N	2026-02-02 09:02:32.582122+00
94	19	user	Generate an image of เด็กผู้หญิงชาวไทย อายุ 15 ปี ผมยาว แต่งตัวทันสมัยนั่งอยู่ห้องนั่งเล่น	0	0	0.0000	\N	[]	[]	\N	\N	\N	f	\N	2026-02-02 09:10:01.083732+00
95	19	assistant	I'm unable to generate images directly, but I can help you visualize the scene.\n\nImagine a 15-year-old Thai girl sitting in a cozy living room. She has long, flowing hair and is dressed in modern, trendy clothing—perhaps a stylish top paired with jeans or a cute skirt. The living room is bright and inviting, decorated with comfortable furniture, colorful cushions, and some personal items like books or photos that reflect a youthful spirit. There might be a soft light filtering in through a window, adding warmth to the scene as she relaxes casually in her surroundings. \n\nIf you would like to create this image using an AI art generator, you can use this description as a prompt.	296	138	1.0000	openai/gpt-4o-mini	[]	[]	\N	\N	\N	f	\N	2026-02-02 09:10:06.600727+00
96	19	user	create image: Generate an image of เด็กผู้หญิงชาวไทย อายุ 15 ปี ผมยาว แต่งตัวทันสมัยนั่งอยู่ห้องนั่งเล่น	0	0	0.0000	\N	[]	[]	\N	\N	\N	f	\N	2026-02-02 09:12:49.828018+00
97	19	assistant	```json\n{\n  "prompt": "A 15-year-old Thai girl with long hair, dressed in modern fashion, sitting in a cozy living room. The room is decorated with comfortable furniture and colorful accents, warm sunlight streaming in through a window, creating an inviting atmosphere, high detail, photorealistic",\n  "aspectRatio": "16:9",\n  "style": "realistic",\n  "numImages": 1,\n  "quality": "high"\n}\n```	1089	99	1.0000	openai/gpt-4o-mini	[]	[]	image-creator	\N	\N	f	\N	2026-02-02 09:12:53.394537+00
98	19	user	create image:  เด็กผู้หญิงชาวไทย อายุ 15 ปี ผมยาว แต่งตัวทันสมัยนั่งอยู่ห้องนั่งเล่น	0	0	0.0000	\N	[]	[]	\N	\N	\N	f	\N	2026-02-02 09:14:49.90358+00
99	19	assistant	```json\n{\n  "prompt": "A 15-year-old Thai girl with long hair, dressed in modern clothing, sitting comfortably in a stylish living room. The space is filled with contemporary furniture and soft decorations, with natural light illuminating the room, creating a warm and inviting atmosphere, high detail, photorealistic",\n  "aspectRatio": "16:9",\n  "style": "realistic",\n  "numImages": 1,\n  "quality": "high"\n}\n```	1226	101	1.0000	openai/gpt-4o-mini	[]	[]	image-creator	\N	\N	f	\N	2026-02-02 09:14:54.441136+00
100	19	user	create image: เด็กผู้หญิงชาวไทย อายุ 15 ปี ผมยาว แต่งตัวทันสมัยนั่งอยู่ห้องนั่งเล่น	0	0	0.0000	\N	[]	[]	\N	\N	\N	f	\N	2026-02-02 10:03:21.433237+00
101	19	assistant	```json\n{\n  "prompt": "A 15-year-old Thai girl with long hair, dressed in trendy modern attire, sitting in a stylish living room. The room features contemporary furniture, warm lighting, and decorative items that create a cozy and inviting atmosphere, high detail, photorealistic",\n  "aspectRatio": "16:9",\n  "style": "realistic",\n  "numImages": 1,\n  "quality": "high"\n}\n```	1366	96	1.0000	openai/gpt-4o-mini	[]	[]	image-creator	\N	\N	f	\N	2026-02-02 10:03:27.225918+00
102	19	user	create image: เด็กผู้หญิงชาวไทย อายุ 15 ปี ผมยาว แต่งตัวทันสมัยนั่งอยู่ห้องนั่งเล่น	0	0	0.0000	\N	[]	[]	\N	\N	\N	f	\N	2026-02-02 10:09:41.073654+00
103	19	assistant	```json\n{\n  "prompt": "A 15-year-old Thai girl with long hair, styled in a modern fashion, sitting in a contemporary living room. The room is decorated with stylish furniture, soft lighting, and personal touches that reflect her personality, creating a warm and inviting atmosphere, high detail, photorealistic",\n  "aspectRatio": "16:9",\n  "style": "realistic",\n  "numImages": 1,\n  "quality": "high"\n}\n```	1502	102	1.0000	openai/gpt-4o-mini	[]	[]	image-creator	\N	\N	f	\N	2026-02-02 10:09:47.91367+00
104	19	user	create image: เด็กผู้หญิงชาวไทย อายุ 15 ปี ผมยาว กับเด็กผู้ชายชาวไทย อายุ14 แต่งตัวทันสมัยนั่งอยู่ห้องนั่งเล่น	0	0	0.0000	\N	[]	[]	\N	\N	\N	f	\N	2026-02-02 12:48:31.723165+00
105	19	assistant	```json\n{\n  "prompt": "A 15-year-old Thai girl with long hair, dressed in modern fashion, sitting alongside a 14-year-old Thai also in trendy attire, in a stylish living room. The space is decorated with contemporary furniture, warm lighting, and personal items that create a cozy and inviting atmosphere, high detail, photorealistic",\n  "aspectRatio": "16:9",\n  "style": "realistic",\n  "numImages": 1,\n  "quality": "high"\n}\n```	1662	110	1.0000	openai/gpt-4o-mini	[]	[]	image-creator	\N	\N	f	\N	2026-02-02 12:48:36.92088+00
106	19	assistant	Generated image:\n\n![Generated Image](https://tempfile.aiquickdraw.com/images/1770036603383-fe63ytnafka.png)\n\n*Credits used: 90*	0	0	90.0000	\N	[{"type":"image","url":"https://tempfile.aiquickdraw.com/images/1770036603383-fe63ytnafka.png","name":"generated-image-1.png"}]	[]	image-creator	\N	\N	f	\N	2026-02-02 12:50:07.441435+00
107	19	user	สร้างพรอมต์ เด็กผู้หญิงชาวไทย อายุ 15 ปี ผมยาว กับเด็กผู้ชายชาวไทย อายุ14 แต่งตัวทันสมัยนั่งอยู่ห้องนั่งเล่น ขนาด 9:16	0	0	0.0000	\N	[]	[]	\N	\N	\N	f	\N	2026-02-02 12:53:25.367833+00
108	19	assistant	นี่คือพรอมต์ที่คุณสามารถใช้สำหรับการสร้างภาพ:\n\n**พรอมต์:**\n"เด็กผู้หญิงชาวไทย อายุ 15 ปี ผมยาว แต่งตัวทันสมัย นั่งข้างเด็กผู้ชายชาวไทย อายุ 14 ปี ที่แต่งตัวทันสมัยเช่นกัน ในห้องนั่งเล่นที่มีบรรยากาศอบอุ่น ห้องถูกตกแต่งด้วยเฟอร์นิเจอร์สมัยใหม่ และแสงธรรมชาติส่องเข้ามา สร้างบรรยากาศที่น่าอยู่ ขนาดภาพ 9:16"\n\nคุณสามารถใช้พรอมต์นี้เมื่อต้องการสร้างภาพที่คุณต้องการ!	1266	148	1.0000	openai/gpt-4o-mini	[]	[]	\N	\N	\N	f	\N	2026-02-02 12:53:32.923039+00
109	19	user	สร้างพรอมต์ เด็กผู้หญิงชาวไทย อายุ 15 ปี ผมยาว กับเด็กผู้ชายชาวไทย อายุ14 แต่งตัวทันสมัยนั่งอยู่ห้องนั่งเล่น ขนาด 9:16	0	0	0.0000	\N	[]	[]	\N	\N	\N	f	\N	2026-02-02 12:54:31.211806+00
110	19	assistant	นี่คือพรอมต์ที่คุณสามารถใช้เพื่อสร้างภาพตามที่ต้องการ:\n\n**พรอมต์:**\n"เด็กผู้หญิงชาวไทย อายุ 15 ปี มีผมยาว แต่งตัวทันสมัย นั่งอยู่ข้างเด็กผู้ชายชาวไทย อายุ 14 ปี ที่แต่งตัวทันสมัยเช่นกัน ในห้องนั่งเล่นที่มีบรรยากาศอบอุ่น ห้องตกแต่งด้วยเฟอร์นิเจอร์สมัยใหม่และของใช้ที่สร้างความสะดวกสบาย มีแสงธรรมชาติส่องเข้ามาเพื่อสร้างบรรยากาศ ขนาดภาพ 9:16"\n\nคุณสามารถใช้พรอมต์นี้ในการสร้างภาพที่คุณต้องการ!	1470	154	1.0000	openai/gpt-4o-mini	[]	[]	\N	\N	\N	f	\N	2026-02-02 12:54:36.735508+00
\.


--
-- Data for Name: model_comparisons; Type: TABLE DATA; Schema: public; Owner: smartspec
--

COPY public.model_comparisons (id, user_id, prompt, models, results, total_cost_usd, total_credits_used, created_at) FROM stdin;
\.


--
-- Data for Name: moderation_logs; Type: TABLE DATA; Schema: public; Owner: smartspec
--

COPY public.moderation_logs (id, user_id, content_type, content, flagged, categories, action_taken, created_at) FROM stdin;
\.


--
-- Data for Name: notifications; Type: TABLE DATA; Schema: public; Owner: smartspec
--

COPY public.notifications (id, user_id, type, title, message, data, is_read, read_at, created_at) FROM stdin;
\.


--
-- Data for Name: oauth_connections; Type: TABLE DATA; Schema: public; Owner: smartspec
--

COPY public.oauth_connections (id, user_id, provider, provider_user_id, access_token, refresh_token, token_expires_at, profile_data, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: opencode_api_key_usage; Type: TABLE DATA; Schema: public; Owner: smartspec
--

COPY public.opencode_api_key_usage (id, api_key_id, endpoint, model, input_tokens, output_tokens, total_tokens, cost, status_code, latency_ms, error, request_id, ip_address, user_agent, created_at) FROM stdin;
\.


--
-- Data for Name: opencode_api_keys; Type: TABLE DATA; Schema: public; Owner: smartspec
--

COPY public.opencode_api_keys (id, user_id, name, key_hash, key_prefix, status, allowed_models, allowed_endpoints, max_tokens_per_request, max_tokens_per_day, max_cost_per_day, tokens_used_today, cost_used_today, total_tokens_used, total_cost, total_requests, last_used_at, last_reset_at, rate_limit_rpm, rate_limit_tpm, description, extra_metadata, created_at, updated_at, expires_at, revoked_at) FROM stdin;
\.


--
-- Data for Name: password_reset_tokens; Type: TABLE DATA; Schema: public; Owner: smartspec
--

COPY public.password_reset_tokens (id, user_id, token_hash, expires_at, used_at, created_at, ip_address, user_agent) FROM stdin;
\.


--
-- Data for Name: payment_transactions; Type: TABLE DATA; Schema: public; Owner: smartspec
--

COPY public.payment_transactions (id, user_id, stripe_session_id, stripe_payment_intent_id, stripe_customer_id, amount_usd, currency, status, credits_amount, credits_added_at, payment_method, metadata, created_at, updated_at, completed_at) FROM stdin;
\.


--
-- Data for Name: permissions; Type: TABLE DATA; Schema: public; Owner: smartspec
--

COPY public.permissions (id, name, display_name, description, resource, action, scope, is_system, created_at) FROM stdin;
\.


--
-- Data for Name: policies; Type: TABLE DATA; Schema: public; Owner: smartspec
--

COPY public.policies (id, name, description, effect, principals, actions, resources, conditions, tenant_id, priority, is_active, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: prompt_templates; Type: TABLE DATA; Schema: public; Owner: smartspec
--

COPY public.prompt_templates (id, user_id, name, description, template, variables, category, is_public, is_favorite, use_count, version, parent_id, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: provider_configs; Type: TABLE DATA; Schema: public; Owner: smartspec
--

COPY public.provider_configs (id, provider_name, display_name, api_key_encrypted, base_url, config_json, is_enabled, description, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: refunds; Type: TABLE DATA; Schema: public; Owner: smartspec
--

COPY public.refunds (id, payment_id, user_id, refund_type, amount_usd, credits_deducted, reason, status, stripe_refund_id, requested_by, requested_at, processed_at, completed_at, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: registration_events; Type: TABLE DATA; Schema: public; Owner: smartspec
--

COPY public.registration_events (id, "userId", email, "normalizedEmail", "ipAddress", "fingerprintHash", "userAgent", "loginMethod", "trustScore", outcome, metadata, "createdAt") FROM stdin;
\.


--
-- Data for Name: role_assignments; Type: TABLE DATA; Schema: public; Owner: smartspec
--

COPY public.role_assignments (id, user_id, role_id, tenant_id, project_id, assigned_by, reason, is_active, expires_at, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: roles; Type: TABLE DATA; Schema: public; Owner: smartspec
--

COPY public.roles (id, name, display_name, description, tenant_id, scope, permissions, is_system, is_default, parent_role_id, priority, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: scheduled_message_logs; Type: TABLE DATA; Schema: public; Owner: smartspec
--

COPY public.scheduled_message_logs (id, "scheduledMessageId", "executedAt", "responseContent", "creditsUsed", status, error) FROM stdin;
1	1	2026-01-31 16:00:11.870749+00	\N	0.0000	failed	Failed query: select "credits", "plan" from "users" where "users"."id" = $1 limit $2\nparams: ,1
2	1	2026-01-31 16:00:23.969006+00	\N	0.0000	failed	Failed query: select "credits", "plan" from "users" where "users"."id" = $1 limit $2\nparams: ,1
3	1	2026-01-31 16:00:42.553325+00	\N	0.0000	failed	Failed query: select "credits", "plan" from "users" where "users"."id" = $1 limit $2\nparams: ,1
4	1	2026-02-01 16:00:07.42302+00	ตอนนี้มีข่าวเกี่ยวกับเทคโนโลยี AI ใหม่ ๆ ที่น่าสนใจมากมาย เช่น:\n\n1. **การพัฒนา AI ที่สามารถสร้างภาพและวิดีโอ**: มีการเปิดตัวโมเดลใหม่ที่สามารถสร้างภาพและวิดีโอที่มีคุณภาพสูงจากข้อความที่ป้อนเข้าไป เช่น DALL-E และ Stable Diffusion ที่ช่วยให้คนสร้างงานศิลปะได้อย่างง่ายดาย.\n\n2. **AI ในการแพทย์**: มีการใช้ AI ในการวิเคราะห์ข้อมูลทางการแพทย์และช่วยในการวินิจฉัยโรคได้เร็วขึ้น เช่น โมเดล AI ที่สามารถประเมินรูปภาพจากการสแกน MRI หรือ CT scan.\n\n3. **การแปลภาษาโดยใช้ AI**: AI ถูกนำมาใช้ในการพัฒนาโปรแกรมแปลภาษาที่สามารถแปลผลได้อย่างรวดเร็วและแม่นยำมากขึ้น ทำให้การสื่อสารข้ามภาษาทำได้ง่ายขึ้น.\n\n4. **การใช้ AI ในการทำธุรกิจ**: หลายบริษัทเริ่มใช้ AI ในการวิเคราะห์ข้อมูลลูกค้าและพัฒนาประสบการณ์ของลูกค้า ทำให้ธุรกิจมีประสิทธิภาพและเพิ่มรายได้ได้มากขึ้น.\n\nหากคุณต้องการข้อมูลเพิ่มเติมเกี่ยวกับหัวข้อใด หรือต้องการข่าวที่เฉพาะเจาะจงมากขึ้น สามารถระบุได้เลย!	4.0000	success	\N
\.


--
-- Data for Name: scheduled_messages; Type: TABLE DATA; Schema: public; Owner: smartspec
--

COPY public.scheduled_messages (id, "userId", "conversationId", "targetUserId", prompt, "cronExpression", timezone, "scheduledAt", "isRecurring", status, "modelId", "skillId", "emailNotify", description, "lastRunAt", "nextRunAt", "bullmqJobId", "createdAt", "updatedAt") FROM stdin;
1	1	18	\N	ค้นหาข่าวเกี่ยวกับ เทคโนโลยี AI ใหม่ ๆ ว่ามีเรื่องอะไรใหม่ ๆ ทั่วโลกแปลเป็นภาษาไทย	0 8 * * *	Asia/Bangkok	\N	t	active	openai/gpt-4o-mini	chat-alert	t	ค้นหาข่าวเกี่ยวกับเทคโนโลยี AI ใหม่ ๆ ทุกวันตอนแปดโมงเช้า	2026-02-01 16:00:07.419+00	\N	schedule-1	2026-01-30 17:44:20.630513+00	2026-02-01 16:00:07.419+00
\.


--
-- Data for Name: secret_versions; Type: TABLE DATA; Schema: public; Owner: smartspec
--

COPY public.secret_versions (id, secret_id, version, encrypted_value, value_hash, created_by, reason, is_current, created_at) FROM stdin;
\.


--
-- Data for Name: secrets; Type: TABLE DATA; Schema: public; Owner: smartspec
--

COPY public.secrets (id, name, description, tenant_id, project_id, secret_type, encrypted_value, value_hash, encryption_key_id, encryption_algorithm, rotation_enabled, rotation_interval_days, last_rotated_at, next_rotation_at, expires_at, allowed_services, created_by, last_accessed_at, access_count, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: semantic_memories; Type: TABLE DATA; Schema: public; Owner: smartspec
--

COPY public.semantic_memories (id, memory_key, memory_type, scope, user_id, project_id, session_id, workflow_id, content, extra_data, importance, access_count, last_accessed_at, source, source_execution_id, created_at, updated_at, expires_at, is_active) FROM stdin;
\.


--
-- Data for Name: seo_metadata; Type: TABLE DATA; Schema: public; Owner: smartspec
--

COPY public.seo_metadata (id, "tenantId", path, title, description, keywords, "canonicalUrl", "ogMetadata", "twitterMetadata", "aiContent", "structuredData", "geoData", "qualitySignals", "isActive", "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: skill_comments; Type: TABLE DATA; Schema: public; Owner: smartspec
--

COPY public.skill_comments (id, "skillId", "userId", content, "createdAt") FROM stdin;
\.


--
-- Data for Name: skill_likes; Type: TABLE DATA; Schema: public; Owner: smartspec
--

COPY public.skill_likes (id, "skillId", "userId", "createdAt") FROM stdin;
1	8	1	2026-01-30 18:52:51.333699+00
\.


--
-- Data for Name: skill_preferences; Type: TABLE DATA; Schema: public; Owner: smartspec
--

COPY public.skill_preferences (id, "conversationId", "skillId", enabled, priority, "customSettings", "createdAt") FROM stdin;
\.


--
-- Data for Name: skill_prompt_templates; Type: TABLE DATA; Schema: public; Owner: smartspec
--

COPY public.skill_prompt_templates (id, skill_id, name, description, system_prompt, template_variables, category, is_public, created_by, usage_count, created_at) FROM stdin;
\.


--
-- Data for Name: skill_repositories; Type: TABLE DATA; Schema: public; Owner: smartspec
--

COPY public.skill_repositories (id, name, git_url, branch, format_type, skills_subdir, last_fetched_at, last_commit_hash, skill_count, status, error_message, created_at, created_by) FROM stdin;
\.


--
-- Data for Name: skills; Type: TABLE DATA; Schema: public; Owner: smartspec
--

COPY public.skills (id, slug, name, description, category, version, author, icon, tags, "folderPath", "isAutoTrigger", "triggerPatterns", "isEnabled", "enabledByDefault", "creditMultiplier", priority, "availableModels", "defaultModel", "systemPrompt", "skillContent", knowledgebase, "configJson", "importSource", "importedFromZip", "createdBy", "createdAt", "updatedAt", "visibleByDefault", "marketplaceContent", "repositoryId", "repositorySlug", "contentHash", "executionMode") FROM stdin;
2	video-prompt-engineer	video-prompt-engineer	Auto-imported from skills/video-prompt-engineer	video_generation	1.0.0	\N	sparkles	[]	skills/video-prompt-engineer	f	[]	t	t	1.00	50	\N	\N	# Video Prompt Engineer v1.0\n\n## 📹 Overview\n\n**Video Prompt Engineer** is a professional AI video prompt generation skill that creates high-quality, cinematic prompts for multiple AI video platforms.\n\n### Supported Platforms\n\n- ✅ **Sora** - OpenAI Sora 2 (detailed, 4-20s)\n- ✅ **Veo** - Google Veo 3.1 (compact, 4-8s, 500 char limit)\n- ✅ **Kling** - Kling AI (cinematic, photorealistic)\n- ✅ **Wan** - Wan Show AI (narrative-focused)\n- ✅ **Seedance** - Seedance (creative, artistic)\n- ✅ **Compatible** - Universal format (all platforms)\n\n### Key Features\n\n- 🎬 **Cinematic Quality** - Professional film terminology and techniques\n- 📐 **Multi-Format** - Vertical (9:16), Horizontal (16:9), Square (1:1)\n- 🎨 **Visual Styles** - 15+ cinematic styles\n- 🎵 **Audio Design** - Comprehensive sound design options\n- 📝 **Script Generation** - Bilingual dialogue/voiceover scripts\n- ⚡ **Platform Optimization** - TikTok, Instagram, YouTube, etc.\n- 🔄 **Smart Defaults** - Intelligent parameter selection\n\n---\n\n## 🎯 Quick Start\n\n### Basic Usage\n\n```json\n{\n  "request": "A woman walking through a busy street market at sunset",\n  "target_platform": "sora",\n  "aspect_ratio": "16:9"\n}\n```\n\n### Fashion Content Example\n\n```json\n{\n  "request": "Fashion transformation - changing 3 outfits",\n  "target_platform": "compatible",\n  "aspect_ratio": "9:16",\n  "content_type": "fashion_content",\n  "montage_style": "fast_cuts",\n  "hook_strategy": "before_after"\n}\n```\n\n### Product Review Example\n\n```json\n{\n  "request": "Unboxing latest smartphone with detailed features",\n  "target_platform": "veo",\n  "aspect_ratio": "9:16",\n  "content_type": "product_review",\n  "sound_design": "balanced",\n  "cta": "like"\n}\n```\n\n---\n\n## 📋 Input Parameters\n\n### Required\n\n| Parameter | Type | Description |\n|-----------|------|-------------|\n| `request` | string | Main video concept/description |\n\n### Core Settings\n\n| Parameter | Type | Default | Options |\n|-----------|------|---------|---------|\n| `target_platform` | string | `compatible` | `sora`, `veo`, `kling`, `wan`, `seedance`, `compatible` |\n| `language` | string | `en` | `en`, `th`, `auto` |\n| `duration` | integer | `8` | 4-60 (platform limits apply) |\n| `aspect_ratio` | string | `9:16` | `9:16`, `16:9`, `1:1`, `4:5`, `21:9` |\n\n### Cinematic Style\n\n| Parameter | Type | Default | Description |\n|-----------|------|---------|-------------|\n| `cinematic_style` | string | `cinematic` | Overall aesthetic (13 options) |\n| `visual_style` | string | `cinematic` | Color grading style (15 options) |\n| `camera_movement` | string | `dynamic` | Primary camera movement (14 options) |\n| `shot_composition` | string | `medium_shot` | Framing (13 options) |\n| `lighting_style` | string | `natural` | Lighting setup (15 options) |\n\n### Audio & Sound\n\n| Parameter | Type | Default | Description |\n|-----------|------|---------|-------------|\n| `audio_language` | string | `english` | Spoken language |\n| `sound_design` | string | `balanced` | Audio mix (12 options) |\n| `music_mood` | string | `none` | Background music (11 options) |\n\n### Content & Engagement\n\n| Parameter | Type | Default | Description |\n|-----------|------|---------|-------------|\n| `content_type` | string | `general` | Content category (11 types) |\n| `hook_strategy` | string | `none` | Opening hook (6 strategies) |\n| `cta` | string | `none` | Call-to-action (9 options) |\n| `emotion` | string | `neutral` | Emotional tone (12 emotions) |\n| `pacing` | string | `medium` | Video rhythm (5 options) |\n\n### Platform & Audience\n\n| Parameter | Type | Default | Description |\n|-----------|------|---------|-------------|\n| `social_platform` | string | `universal` | Social optimization (8 platforms) |\n| `target_audience` | string | `general` | Demographics (8 audiences) |\n\n### Advanced\n\n| Parameter | Type | Default | Description |\n|-----------|------|---------|-------------|\n| `montage_style` | string | `none` | Multi-shot editing (11 styles) |\n| `text_overlay` | boolean | `false` | Include text (Sora only) |\n| `creative_freedom` | integer | `50` | AI creativity (0-100) |\n| `color_grading` | string | `natural` | Color preset (10 options) |\n\n---\n\n## 🎬 Cinematic Styles\n\n### Film Genres\n\n- `cinematic` - Professional film aesthetic\n- `documentary` - Observational, realistic\n- `commercial` - Polished advertising style\n- `music_video` - Dynamic, artistic\n- `noir` - High contrast, shadows\n- `sci_fi` - Futuristic, sleek\n- `horror` - Dark, atmospheric\n- `romance` - Soft, warm\n- `action` - Fast-paced, dynamic\n- `drama` - Emotional, intimate\n\n### Visual Treatments\n\n- `photorealistic` - Ultra-realistic rendering\n- `vibrant` - Saturated colors\n- `minimalist` - Clean, simple\n- `retro` - Vintage aesthetic\n- `neon` - Cyberpunk, neon lights\n- `pastel` - Soft, muted colors\n- `dark` - Low-key, moody\n\n---\n\n## 📐 Camera Techniques\n\n### Camera Movements\n\n```\ndolly_in/out    - Camera moves closer/farther\npan_left/right  - Camera rotates horizontally  \ntilt_up/down    - Camera rotates vertically\ntracking        - Camera follows subject\ncrane           - Camera rises/descends\norbit           - Camera circles subject\nhandheld        - Handheld camera feel\nsteadicam       - Smooth, flowing movement\n```\n\n### Shot Compositions\n\n```\nextreme_close_up    - Very tight on detail\nclose_up            - Face/object detail\nmedium_shot         - Waist up\nwide_shot           - Full body/scene\nextreme_wide        - Vast landscape\npov                 - Point of view\nlow_angle           - Looking up\nhigh_angle          - Looking down\n```\n\n---\n\n## 🎵 Audio Design\n\n### Sound Design Presets\n\n| Preset | Description |\n|--------|-------------|\n| `silent_subtitles` | No audio, text only |\n| `music_only` | Background music dominant |\n| `voiceover_dominant` | Voice-over primary |\n| `balanced` | Equal mix of all elements |\n| `asmr` | Intimate, close sounds |\n| `sfx_heavy` | Strong sound effects |\n| `dramatic` | Orchestral, emotional |\n| `upbeat` | Energetic, positive |\n| `lo_fi` | Chill, relaxed |\n| `epic` | Grand, cinematic |\n\n### Music Moods\n\n- `upbeat_pop` - Energetic, fun\n- `dramatic_orchestral` - Intense, emotional\n- `lo_fi_chill` - Relaxed, casual\n- `epic_cinematic` - Grand, powerful\n- `romantic_piano` - Soft, intimate\n- `suspense_tension` - Mysterious, tense\n- `corporate_motivational` - Professional, inspiring\n- `ambient_nature` - Calm, natural\n\n---\n\n## 📱 Platform Optimization\n\n### TikTok (`aspect_ratio: 9:16`)\n- Hook in first 3 seconds\n- Fast-paced editing\n- Trending sounds\n- Clear visuals\n\n### Instagram Reels (`aspect_ratio: 9:16` or `4:5`)\n- Aesthetic visuals\n- Strong first frame\n- Smooth transitions\n- Branded content\n\n### YouTube Shorts (`aspect_ratio: 9:16`)\n- Attention-grabbing hook\n- Clear value proposition\n- Longer storytelling\n- End screen CTA\n\n### YouTube (`aspect_ratio: 16:9`)\n- Cinematic quality\n- Detailed storytelling\n- Professional production\n- Chapter markers\n\n---\n\n## 🎯 Content Types\n\n### Product Review\n```json\n{\n  "content_type": "product_review",\n  "hook_strategy": "problem_statement",\n  "cta": "product_link",\n  "pacing": "medium"\n}\n```\n\n### Fashion Content\n```json\n{\n  "content_type": "fashion_content",\n  "montage_style": "fast_cuts",\n  "hook_strategy": "before_after",\n  "music_mood": "upbeat_pop"\n}\n```\n\n### Storytelling\n```json\n{\n  "content_type": "storytelling",\n  "pacing": "slow",\n  "emotion": "empathy",\n  "sound_design": "dramatic"\n}\n```\n\n---\n\n## 🔧 Platform-Specific Features\n\n### Sora (OpenAI)\n- **Duration**: 4-20 seconds\n- **Prompt Style**: Detailed, technical\n- **Special Features**: \n  - Text overlay support\n  - Professional terminology\n  - Advanced camera movements\n- **Best For**: Cinematic, high-quality content\n\n### Veo (Google)\n- **Duration**: 4-8 seconds\n- **Char Limit**: 500 characters\n- **Structure**: 5-part (Cinematography + Subject + Action + Context + Style)\n- **Audio Format**: `SFX: [desc] | Character says, "[dialogue]"`\n- **Best For**: Short, impactful clips\n\n### Compatible (Universal)\n- **Duration**: 4-60 seconds\n- **Style**: Balanced approach\n- **Special Features**: Works across all platforms\n- **Best For**: Multi-platform distribution\n\n---\n\n## 📊 Output Format\n\n### Standard Output\n\n```json\n{\n  "prompt": "Cinematic tracking shot follows...",\n  "platform": "sora",\n  "metadata": {\n    "title": "Market Walk",\n    "duration": 12,\n    "aspect_ratio": "16:9",\n    "language": "en"\n  },\n  "structure": {\n    "cinematography": "Tracking shot, 35mm film",\n    "subject": "Young woman",\n    "action": "Walking through market",\n    "setting": "Tokyo street market",\n    "lighting": "Golden hour",\n    "movement": "Smooth tracking"\n  },\n  "script": {\n    "dialogue": "The best moments...",\n    "translation": "The best moments..."\n  },\n  "technical_specs": {\n    "camera": "35mm film camera",\n    "lens": "50mm f/1.4",\n    "fps": 24\n  }\n}\n```\n\n---\n\n## 💡 Best Practices\n\n### For Viral Content\n```json\n{\n  "optimize_for_virality": true,\n  "hook_strategy": "shock_value",\n  "pacing": "fast",\n  "cta": "share",\n  "creative_freedom": 70\n}\n```\n\n### For Professional Content\n```json\n{\n  "cinematic_style": "commercial",\n  "visual_style": "corporate",\n  "sound_design": "balanced",\n  "creative_freedom": 20\n}\n```\n\n### For Artistic Content\n```json\n{\n  "cinematic_style": "experimental",\n  "creative_freedom": 85,\n  "color_grading": "custom",\n  "target_platform": "seedance"\n}\n```\n\n---\n\n## 🎨 Creative Freedom Levels\n\n| Level | % | Description | Use Case |\n|-------|---|-------------|----------|\n| Conservative | 0-20 | Safe, predictable | Corporate, formal |\n| Professional | 20-40 | Polished, tested | Marketing, ads |\n| Balanced | 40-60 | Creative + structure | Content creation |\n| Creative | 60-80 | Experimental | Artistic projects |\n| Bold | 80-95 | Pushing boundaries | Innovative content |\n| Chaotic | 95-100 | Maximum creativity | Experimental art |\n\n---\n\n## 📚 Examples\n\nSee `examples/` directory for:\n- Fashion transformation videos\n- Product reviews\n- Storytelling narratives\n- Documentary style\n- Music video concepts\n- Commercial spots\n\n---\n\n## 🔄 Version History\n\n**v1.0** (January 2026)\n- Initial release\n- Multi-platform support (5 platforms)\n- Comprehensive input schema\n- Bilingual script generation\n- Cinematic quality focus\n- Vertical & horizontal formats\n\n---\n\n## 📞 Support\n\nFor questions or feature requests, please refer to the documentation or examples.\n\n**Platform Compatibility Matrix:**\n\n| Feature | Sora | Veo | Kling | Wan | Seedance | Compatible |\n|---------|------|-----|-------|-----|----------|------------|\n| Duration (max) | 20s | 8s | 10s | 15s | 12s | 60s |\n| Text Overlay | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ |\n| Technical Terms | ✅ | ❌ | ✅ | ❌ | ✅ | ❌ |\n| Script Generation | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |\n| Multi-language | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |\n\n---\n\n**Status:** ✅ Production Ready  \n**Language Support:** English, Thai  \n**Last Updated:** January 2026	# Video Prompt Engineer v1.0\n\n## 📹 Overview\n\n**Video Prompt Engineer** is a professional AI video prompt generation skill that creates high-quality, cinematic prompts for multiple AI video platforms.\n\n### Supported Platforms\n\n- ✅ **Sora** - OpenAI Sora 2 (detailed, 4-20s)\n- ✅ **Veo** - Google Veo 3.1 (compact, 4-8s, 500 char limit)\n- ✅ **Kling** - Kling AI (cinematic, photorealistic)\n- ✅ **Wan** - Wan Show AI (narrative-focused)\n- ✅ **Seedance** - Seedance (creative, artistic)\n- ✅ **Compatible** - Universal format (all platforms)\n\n### Key Features\n\n- 🎬 **Cinematic Quality** - Professional film terminology and techniques\n- 📐 **Multi-Format** - Vertical (9:16), Horizontal (16:9), Square (1:1)\n- 🎨 **Visual Styles** - 15+ cinematic styles\n- 🎵 **Audio Design** - Comprehensive sound design options\n- 📝 **Script Generation** - Bilingual dialogue/voiceover scripts\n- ⚡ **Platform Optimization** - TikTok, Instagram, YouTube, etc.\n- 🔄 **Smart Defaults** - Intelligent parameter selection\n\n---\n\n## 🎯 Quick Start\n\n### Basic Usage\n\n```json\n{\n  "request": "A woman walking through a busy street market at sunset",\n  "target_platform": "sora",\n  "aspect_ratio": "16:9"\n}\n```\n\n### Fashion Content Example\n\n```json\n{\n  "request": "Fashion transformation - changing 3 outfits",\n  "target_platform": "compatible",\n  "aspect_ratio": "9:16",\n  "content_type": "fashion_content",\n  "montage_style": "fast_cuts",\n  "hook_strategy": "before_after"\n}\n```\n\n### Product Review Example\n\n```json\n{\n  "request": "Unboxing latest smartphone with detailed features",\n  "target_platform": "veo",\n  "aspect_ratio": "9:16",\n  "content_type": "product_review",\n  "sound_design": "balanced",\n  "cta": "like"\n}\n```\n\n---\n\n## 📋 Input Parameters\n\n### Required\n\n| Parameter | Type | Description |\n|-----------|------|-------------|\n| `request` | string | Main video concept/description |\n\n### Core Settings\n\n| Parameter | Type | Default | Options |\n|-----------|------|---------|---------|\n| `target_platform` | string | `compatible` | `sora`, `veo`, `kling`, `wan`, `seedance`, `compatible` |\n| `language` | string | `en` | `en`, `th`, `auto` |\n| `duration` | integer | `8` | 4-60 (platform limits apply) |\n| `aspect_ratio` | string | `9:16` | `9:16`, `16:9`, `1:1`, `4:5`, `21:9` |\n\n### Cinematic Style\n\n| Parameter | Type | Default | Description |\n|-----------|------|---------|-------------|\n| `cinematic_style` | string | `cinematic` | Overall aesthetic (13 options) |\n| `visual_style` | string | `cinematic` | Color grading style (15 options) |\n| `camera_movement` | string | `dynamic` | Primary camera movement (14 options) |\n| `shot_composition` | string | `medium_shot` | Framing (13 options) |\n| `lighting_style` | string | `natural` | Lighting setup (15 options) |\n\n### Audio & Sound\n\n| Parameter | Type | Default | Description |\n|-----------|------|---------|-------------|\n| `audio_language` | string | `english` | Spoken language |\n| `sound_design` | string | `balanced` | Audio mix (12 options) |\n| `music_mood` | string | `none` | Background music (11 options) |\n\n### Content & Engagement\n\n| Parameter | Type | Default | Description |\n|-----------|------|---------|-------------|\n| `content_type` | string | `general` | Content category (11 types) |\n| `hook_strategy` | string | `none` | Opening hook (6 strategies) |\n| `cta` | string | `none` | Call-to-action (9 options) |\n| `emotion` | string | `neutral` | Emotional tone (12 emotions) |\n| `pacing` | string | `medium` | Video rhythm (5 options) |\n\n### Platform & Audience\n\n| Parameter | Type | Default | Description |\n|-----------|------|---------|-------------|\n| `social_platform` | string | `universal` | Social optimization (8 platforms) |\n| `target_audience` | string | `general` | Demographics (8 audiences) |\n\n### Advanced\n\n| Parameter | Type | Default | Description |\n|-----------|------|---------|-------------|\n| `montage_style` | string | `none` | Multi-shot editing (11 styles) |\n| `text_overlay` | boolean | `false` | Include text (Sora only) |\n| `creative_freedom` | integer | `50` | AI creativity (0-100) |\n| `color_grading` | string | `natural` | Color preset (10 options) |\n\n---\n\n## 🎬 Cinematic Styles\n\n### Film Genres\n\n- `cinematic` - Professional film aesthetic\n- `documentary` - Observational, realistic\n- `commercial` - Polished advertising style\n- `music_video` - Dynamic, artistic\n- `noir` - High contrast, shadows\n- `sci_fi` - Futuristic, sleek\n- `horror` - Dark, atmospheric\n- `romance` - Soft, warm\n- `action` - Fast-paced, dynamic\n- `drama` - Emotional, intimate\n\n### Visual Treatments\n\n- `photorealistic` - Ultra-realistic rendering\n- `vibrant` - Saturated colors\n- `minimalist` - Clean, simple\n- `retro` - Vintage aesthetic\n- `neon` - Cyberpunk, neon lights\n- `pastel` - Soft, muted colors\n- `dark` - Low-key, moody\n\n---\n\n## 📐 Camera Techniques\n\n### Camera Movements\n\n```\ndolly_in/out    - Camera moves closer/farther\npan_left/right  - Camera rotates horizontally  \ntilt_up/down    - Camera rotates vertically\ntracking        - Camera follows subject\ncrane           - Camera rises/descends\norbit           - Camera circles subject\nhandheld        - Handheld camera feel\nsteadicam       - Smooth, flowing movement\n```\n\n### Shot Compositions\n\n```\nextreme_close_up    - Very tight on detail\nclose_up            - Face/object detail\nmedium_shot         - Waist up\nwide_shot           - Full body/scene\nextreme_wide        - Vast landscape\npov                 - Point of view\nlow_angle           - Looking up\nhigh_angle          - Looking down\n```\n\n---\n\n## 🎵 Audio Design\n\n### Sound Design Presets\n\n| Preset | Description |\n|--------|-------------|\n| `silent_subtitles` | No audio, text only |\n| `music_only` | Background music dominant |\n| `voiceover_dominant` | Voice-over primary |\n| `balanced` | Equal mix of all elements |\n| `asmr` | Intimate, close sounds |\n| `sfx_heavy` | Strong sound effects |\n| `dramatic` | Orchestral, emotional |\n| `upbeat` | Energetic, positive |\n| `lo_fi` | Chill, relaxed |\n| `epic` | Grand, cinematic |\n\n### Music Moods\n\n- `upbeat_pop` - Energetic, fun\n- `dramatic_orchestral` - Intense, emotional\n- `lo_fi_chill` - Relaxed, casual\n- `epic_cinematic` - Grand, powerful\n- `romantic_piano` - Soft, intimate\n- `suspense_tension` - Mysterious, tense\n- `corporate_motivational` - Professional, inspiring\n- `ambient_nature` - Calm, natural\n\n---\n\n## 📱 Platform Optimization\n\n### TikTok (`aspect_ratio: 9:16`)\n- Hook in first 3 seconds\n- Fast-paced editing\n- Trending sounds\n- Clear visuals\n\n### Instagram Reels (`aspect_ratio: 9:16` or `4:5`)\n- Aesthetic visuals\n- Strong first frame\n- Smooth transitions\n- Branded content\n\n### YouTube Shorts (`aspect_ratio: 9:16`)\n- Attention-grabbing hook\n- Clear value proposition\n- Longer storytelling\n- End screen CTA\n\n### YouTube (`aspect_ratio: 16:9`)\n- Cinematic quality\n- Detailed storytelling\n- Professional production\n- Chapter markers\n\n---\n\n## 🎯 Content Types\n\n### Product Review\n```json\n{\n  "content_type": "product_review",\n  "hook_strategy": "problem_statement",\n  "cta": "product_link",\n  "pacing": "medium"\n}\n```\n\n### Fashion Content\n```json\n{\n  "content_type": "fashion_content",\n  "montage_style": "fast_cuts",\n  "hook_strategy": "before_after",\n  "music_mood": "upbeat_pop"\n}\n```\n\n### Storytelling\n```json\n{\n  "content_type": "storytelling",\n  "pacing": "slow",\n  "emotion": "empathy",\n  "sound_design": "dramatic"\n}\n```\n\n---\n\n## 🔧 Platform-Specific Features\n\n### Sora (OpenAI)\n- **Duration**: 4-20 seconds\n- **Prompt Style**: Detailed, technical\n- **Special Features**: \n  - Text overlay support\n  - Professional terminology\n  - Advanced camera movements\n- **Best For**: Cinematic, high-quality content\n\n### Veo (Google)\n- **Duration**: 4-8 seconds\n- **Char Limit**: 500 characters\n- **Structure**: 5-part (Cinematography + Subject + Action + Context + Style)\n- **Audio Format**: `SFX: [desc] | Character says, "[dialogue]"`\n- **Best For**: Short, impactful clips\n\n### Compatible (Universal)\n- **Duration**: 4-60 seconds\n- **Style**: Balanced approach\n- **Special Features**: Works across all platforms\n- **Best For**: Multi-platform distribution\n\n---\n\n## 📊 Output Format\n\n### Standard Output\n\n```json\n{\n  "prompt": "Cinematic tracking shot follows...",\n  "platform": "sora",\n  "metadata": {\n    "title": "Market Walk",\n    "duration": 12,\n    "aspect_ratio": "16:9",\n    "language": "en"\n  },\n  "structure": {\n    "cinematography": "Tracking shot, 35mm film",\n    "subject": "Young woman",\n    "action": "Walking through market",\n    "setting": "Tokyo street market",\n    "lighting": "Golden hour",\n    "movement": "Smooth tracking"\n  },\n  "script": {\n    "dialogue": "The best moments...",\n    "translation": "The best moments..."\n  },\n  "technical_specs": {\n    "camera": "35mm film camera",\n    "lens": "50mm f/1.4",\n    "fps": 24\n  }\n}\n```\n\n---\n\n## 💡 Best Practices\n\n### For Viral Content\n```json\n{\n  "optimize_for_virality": true,\n  "hook_strategy": "shock_value",\n  "pacing": "fast",\n  "cta": "share",\n  "creative_freedom": 70\n}\n```\n\n### For Professional Content\n```json\n{\n  "cinematic_style": "commercial",\n  "visual_style": "corporate",\n  "sound_design": "balanced",\n  "creative_freedom": 20\n}\n```\n\n### For Artistic Content\n```json\n{\n  "cinematic_style": "experimental",\n  "creative_freedom": 85,\n  "color_grading": "custom",\n  "target_platform": "seedance"\n}\n```\n\n---\n\n## 🎨 Creative Freedom Levels\n\n| Level | % | Description | Use Case |\n|-------|---|-------------|----------|\n| Conservative | 0-20 | Safe, predictable | Corporate, formal |\n| Professional | 20-40 | Polished, tested | Marketing, ads |\n| Balanced | 40-60 | Creative + structure | Content creation |\n| Creative | 60-80 | Experimental | Artistic projects |\n| Bold | 80-95 | Pushing boundaries | Innovative content |\n| Chaotic | 95-100 | Maximum creativity | Experimental art |\n\n---\n\n## 📚 Examples\n\nSee `examples/` directory for:\n- Fashion transformation videos\n- Product reviews\n- Storytelling narratives\n- Documentary style\n- Music video concepts\n- Commercial spots\n\n---\n\n## 🔄 Version History\n\n**v1.0** (January 2026)\n- Initial release\n- Multi-platform support (5 platforms)\n- Comprehensive input schema\n- Bilingual script generation\n- Cinematic quality focus\n- Vertical & horizontal formats\n\n---\n\n## 📞 Support\n\nFor questions or feature requests, please refer to the documentation or examples.\n\n**Platform Compatibility Matrix:**\n\n| Feature | Sora | Veo | Kling | Wan | Seedance | Compatible |\n|---------|------|-----|-------|-----|----------|------------|\n| Duration (max) | 20s | 8s | 10s | 15s | 12s | 60s |\n| Text Overlay | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ |\n| Technical Terms | ✅ | ❌ | ✅ | ❌ | ✅ | ❌ |\n| Script Generation | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |\n| Multi-language | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |\n\n---\n\n**Status:** ✅ Production Ready  \n**Language Support:** English, Thai  \n**Last Updated:** January 2026	\N	\N	folder	\N	\N	2026-01-27 13:02:46.369042+00	2026-01-31 03:19:13.793+00	t	## Overview\n\nVideo Prompt Engineer is a professional AI video prompt generation skill that creates high-quality, cinematic prompts for multiple AI video platforms. It handles everything from short-form social content to cinematic productions.\n\n### Key Features\n- **Multi-platform**: Sora, Veo, Kling, Wan, Seedance, and a universal Compatible format\n- **Cinematic quality**: Professional film terminology, camera movements, and lighting\n- **Audio design**: 12+ sound design presets and music mood options\n- **Social optimization**: TikTok, Instagram, YouTube, and more\n- **Content types**: Product reviews, fashion, storytelling, tutorials, and more\n- **Bilingual scripts**: Dialogue and voiceover in English and Thai\n- **Smart defaults**: Intelligent parameter selection based on context\n\n## Quick Start\n\nDescribe your video concept and optionally choose a target platform.\n\n**Example**: "A woman walking through a busy street market at sunset" with platform set to Sora.\n\n## Input\n- Video concept description (required)\n- Target platform, duration, aspect ratio, cinematic style (optional)\n- Audio settings, content type, hook strategy, call-to-action (optional)\n\n## Output\n- Platform-optimized video prompt with cinematic details\n- Shot composition, camera movement, and lighting directions\n- Script with dialogue/voiceover (bilingual)\n- Technical specifications (camera, lens, FPS)	\N	\N	c009f677de08384f7896814bb5e9c350	llm-only
1	image_prompt_engineer	image_prompt_engineer	Auto-imported from skills/image_prompt_engineer	image_generation	1.0.0	\N	sparkles	[]	skills/image_prompt_engineer	t	["\\"สร้างพรอมต์|enhance prompt|image prompt|สร้างภาพ|prompt สำหรับภาพ|create.*prompt.*image\\"| \\"generate.*image.*prompt|พรอมต์.*ภาพ|prompt.*รูป\\""]	t	t	1.00	50	\N	openai/gpt-5.2	---\n\n## 🆕 v2.1 Update: Hallucination Control\n\n- ✅ **Prevents nationality/ethnicity hallucination** — Prevents adding unspecified nationality data\n- ✅ **Auto-correction** — Automatic correction (e.g. "Korean fashion" → "modern fashion")\n- ✅ **Warnings in output** — Alerts when hallucination is detected\n\nid: image_prompt_engineer\nname: Image Prompt Engineer\nversion: 2.1\ntype: agent-skill\nlanguages: en, th\ncategory: image_generation\nexecution_mode: llm-only\nisAutoTrigger: true\nenabledByDefault: true\npriority: 50\ntriggerPatterns:\n  - "สร้างพรอมต์|เขียนพรอมต์|แต่งพรอมต์|enhance prompt|image prompt|prompt สำหรับภาพ"\n  - "generate.*image.*prompt|พรอมต์.*ภาพ|prompt.*รูป|create.*prompt.*image"\n  - "create image prompt|write image prompt|enhance image prompt|generate image prompt|create prompt|write prompt"\n  - "img prompt|สร้าง prompt|เขียน prompt"\n---\n\n# Image Prompt Engineer (v2.1)\n\n## 🎯 Purpose\nCreate comprehensive, clear "prompts for AI image generation systems" that support all image generation modes:\n\n### ✅ Supported Modes (New in v2.1!)\n1. **Text-to-Image** — Generate images from text descriptions\n2. **Image-to-Image** — Transform images from reference images\n3. **Inpaint** — Edit only selected areas (Text-based masking)\n4. **Outpaint** — Expand images beyond the original frame\n5. **Variation** — Create variations from an existing image\n\n### 🌟 Key Features\n- **Default mode emphasizes realism** (can be changed with Style/VFX)\n- Supports **text on image (Typography)** with selectable categories/styles\n- Supports **multiple reference images** (assign roles to each image)\n- **Text-based Masking** — Specify edit areas using natural language\n- **Platform-specific Output** — Adjust prompts per platform\n- **Advanced Controls** — Fine-tune advanced parameters\n\n---\n\n## 📊 What's New in v2.1\n\n### 🚀 Major Features\n\n#### 1. Generation Mode Selection\nClearly specify the image generation mode:\n```json\n{\n  "generation_mode": "text_to_image" | "image_to_image" | "inpaint" | "outpaint" | "variation"\n}\n```\n\n#### 2. Text-based Inpainting\nEdit only the desired areas using natural language:\n```json\n{\n  "generation_mode": "inpaint",\n  "edit_mask": {\n    "type": "prompt_based",\n    "segment_prompt": "sky",\n    "preserve_areas": ["foreground", "people"]\n  }\n}\n```\n\n#### 3. Outpainting Support\nExpand images in all directions:\n```json\n{\n  "generation_mode": "outpaint",\n  "outpaint_config": {\n    "expand_left": 256,\n    "expand_right": 256,\n    "expand_top": 128,\n    "expand_bottom": 128\n  }\n}\n```\n\n#### 4. Advanced Parameters\nFine-grained control over image generation:\n```json\n{\n  "advanced_params": {\n    "denoising_strength": 0.75,\n    "guidance_scale": 7.5,\n    "steps": 50,\n    "seed": 123456,\n    "sampler": "dpm_2m_karras"\n  }\n}\n```\n\n#### 5. ControlNet & IP-Adapter Support\n```json\n{\n  "controlnet": {\n    "enabled": true,\n    "type": "pose",\n    "weight": 1.0\n  },\n  "ip_adapter": {\n    "enabled": true,\n    "mode": "style",\n    "weight": 0.6\n  }\n}\n```\n\n#### 6. Platform Selection\nAdjust prompts to suit the target platform:\n```json\n{\n  "target_platform": "stable_diffusion" | "midjourney" | "dall_e_3" | "gemini_imagen" | "flux" | "firefly"\n}\n```\n\n---\n\n## 📋 Input Schema\n\n### Required Fields\n```json\n{\n  "request": "Description of what you want" // The only required field!\n}\n```\n\n### Core Fields (All have defaults)\n```json\n{\n  "generation_mode": "text_to_image",  // default\n  "task": "final_prompt",              // default\n  "detail_level": "standard",          // compact | standard | full\n  "languages": "en",                   // en | th\n  "aspect_ratio": "9:16",              // 7 options available\n  "aspect_ratio_custom": "",           // e.g. "5:4"\n  "style": "photorealistic",           // 151+ styles\n  "target_platform": "generic"         // 7 platforms\n}\n```\n\n### Image-to-Image Fields\n```json\n{\n  "reference_images": [\n    {\n      "role": "primary_subject" | "outfit" | "product" | "location_background" | ...,\n      "notes": "Additional description"\n    }\n  ],\n  "identity_lock": "none" | "soft_lock_person" | "strict_lock_product",\n  "realistic_skin": false\n}\n```\n\n### Inpainting Fields\n```json\n{\n  "edit_mask": {\n    "type": "prompt_based",              // or ai_segment, rectangle, brush\n    "segment_prompt": "sky",             // "sky", "background", "the woman's dress"\n    "preserve_areas": ["face", "hands"], // Areas to preserve\n    "feather": 10,                       // Edge softness (px)\n    "invert": false                      // Invert mask\n  }\n}\n```\n\n### Outpainting Fields\n```json\n{\n  "outpaint_config": {\n    "expand_left": 0,      // px\n    "expand_right": 0,     // px  \n    "expand_top": 0,       // px\n    "expand_bottom": 0,    // px\n    "blend_width": 64,     // px (blend zone)\n    "match_style": true    // Match original style\n  }\n}\n```\n\n### Advanced Parameters\n```json\n{\n  "advanced_params": {\n    "denoising_strength": 0.75,  // 0-1 (img2img)\n    "guidance_scale": 7.5,        // CFG: 1-30\n    "steps": 50,                  // sampling steps: 1-150\n    "seed": -1,                   // -1 = random\n    "sampler": "dpm_2m_karras",   // euler_a, ddim, etc.\n    "clip_skip": 1                // 1-12\n  }\n}\n```\n\n### ControlNet Configuration\n```json\n{\n  "controlnet": {\n    "enabled": false,\n    "type": "canny",              // depth, pose, normal, scribble, mlsd, lineart, softedge\n    "weight": 1.0,                // 0-2\n    "guidance_start": 0.0,        // 0-1\n    "guidance_end": 1.0           // 0-1\n  }\n}\n```\n\n### IP-Adapter Configuration\n```json\n{\n  "ip_adapter": {\n    "enabled": false,\n    "mode": "style",              // content, face, composition\n    "weight": 0.6,                // 0-2\n    "start_step": 0.0,            // 0-1\n    "end_step": 1.0               // 0-1\n  }\n}\n```\n\n### VFX Effects\n```json\n{\n  "vfx": {\n    "effects": [\n      "light_volumetric_lighting",\n      "atmospheric_mist"\n    ],\n    "effects_custom": ["custom effect description"]\n  }\n}\n```\n\n### Typography (Text-on-Image)\n```json\n{\n  "text_on_image": false,\n  "headline": "Main text",\n  "body_text": "Supporting text",\n  "typography": {\n    "font_personality": ["modern_clean"],\n    "composition_style": ["centered_layout"],\n    "mood_tone": ["minimal_and_calm"],\n    "color_direction": ["monochrome"],\n    "text_effects": ["drop_shadow"],\n    "use_case_templates": ["poster_typography"],\n    "modern_trend_packs": ["korean_clean_typography"],\n    "layout_add_ons": ["with_shapes"]\n  }\n}\n```\n\n---\n\n## 📤 Output Schema\n\n```json\n{\n  "prompt": "Main prompt in the selected language",\n  "avoid": ["List of things to avoid"],\n  "detail_level": "standard",\n  "task": "final_prompt",\n  "generation_mode": "text_to_image",\n  "target_platform": "generic",\n  "parameters": {\n    "aspect_ratio": "9:16",\n    "generation_mode": "text_to_image",\n    "denoising_strength": 0.75,  // if applicable\n    "cfg_scale": 7.5,            // if applicable\n    "steps": 50                  // if applicable\n  },\n  "breakdown": {               // if detail_level = full\n    "generation_mode": "...",\n    "subject": "...",\n    "style": "..."\n  }\n}\n```\n\n---\n\n## 💡 Usage Examples\n\n### Example 1: Text-to-Image (Simple)\n```json\n{\n  "request": "Beautiful woman standing in a flower garden in the morning"\n}\n```\n✅ Uses all defaults: photorealistic style, 9:16 aspect ratio, standard detail\n\n### Example 2: Image-to-Image (Style Transfer)\n```json\n{\n  "request": "Transform into an oil painting",\n  "generation_mode": "image_to_image",\n  "reference_images": [\n    {\n      "role": "primary_subject",\n      "notes": "Keep the original main composition"\n    }\n  ],\n  "style": "oil_painting",\n  "advanced_params": {\n    "denoising_strength": 0.8\n  }\n}\n```\n\n### Example 3: Inpainting (Replace Background)\n```json\n{\n  "request": "Change the background to a beach at sunset",\n  "generation_mode": "inpaint",\n  "reference_images": [\n    {\n      "role": "primary_subject",\n      "notes": "Keep the person in the original image 100%"\n    }\n  ],\n  "edit_mask": {\n    "type": "prompt_based",\n    "segment_prompt": "background",\n    "preserve_areas": ["person", "clothing"],\n    "feather": 20\n  },\n  "style": "golden_hour_cinematic",\n  "identity_lock": "soft_lock_person"\n}\n```\n\n### Example 4: Outpainting (Expand Canvas)\n```json\n{\n  "request": "Expand the image in all directions, show more of the surrounding scene",\n  "generation_mode": "outpaint",\n  "reference_images": [\n    {\n      "role": "primary_subject",\n      "notes": "Original image to expand"\n    }\n  ],\n  "outpaint_config": {\n    "expand_left": 256,\n    "expand_right": 256,\n    "expand_top": 128,\n    "expand_bottom": 128,\n    "blend_width": 64,\n    "match_style": true\n  }\n}\n```\n\n### Example 5: Advanced - ControlNet + Style\n```json\n{\n  "request": "Create an image in the same pose but in cartoon style",\n  "generation_mode": "image_to_image",\n  "reference_images": [\n    {\n      "role": "primary_subject",\n      "notes": "Pose reference"\n    },\n    {\n      "role": "style_reference",\n      "notes": "Cartoon style reference"\n    }\n  ],\n  "style": "anime_style",\n  "controlnet": {\n    "enabled": true,\n    "type": "pose",\n    "weight": 1.2\n  },\n  "ip_adapter": {\n    "enabled": true,\n    "mode": "style",\n    "weight": 0.8\n  },\n  "advanced_params": {\n    "denoising_strength": 0.7,\n    "guidance_scale": 8.0\n  }\n}\n```\n\n---\n\n## 📚 Knowledge Base\n\nThis skill comes with knowledge files serving as catalogs and best practices:\n\n1. **ai_image_style_categories.md** — Style catalog (151+ styles)\n2. **prompt_depth_reference.md** — Prompt logic and structure\n3. **vfx_effects_menu.md** — Complete VFX menu (50+ effects)\n4. **realistic_skin_preservation_rules.md** — Realistic skin rules\n5. **identity_consistency_rules.md** — Identity preservation rules\n6. **photorealistic_prompting_research_notes.md** — Research notes\n7. **legacy_system_prompt_reference.md** — Legacy workflow reference\n\n---\n\n## 🎨 Style Catalog (151+ Styles)\n\n### Photorealism\n- photorealistic, ultra_realistic, raw_realism, dslr_look\n- natural_light_realism, street_photography, documentary\n- soft_commercial, lifestyle_photography, beauty_commercial\n- kodak_portra, fujifilm_superia, cinestill_800t, polaroid\n\n### Cinematic\n- hollywood_cinematic, teal_and_orange, dark_cinematic\n- film_noir, moody_cinematic, golden_hour_cinematic\n- suspense_thriller_style, romance_cinematic, sci_fi_cinematic\n\n### Illustration & Art\n- watercolor, oil_painting, gouache, charcoal, sketch_pencil\n- clean_vector, flat_illustration, isometric\n- anime_style, manga_style, webtoon_style\n\n### Fantasy & Sci-Fi\n- medieval_fantasy, cyberpunk_neon, steampunk_industrial\n- post_apocalyptic, alien_world, underwater_fantasy\n\n...and many more! See the full catalog in the schema\n\n---\n\n## 🌐 Platform Support\n\n| Platform | text-to-image | image-to-image | inpaint | outpaint |\n|----------|---------------|----------------|---------|----------|\n| **Generic** | ✅ | ✅ | ✅ | ✅ |\n| **Stable Diffusion** | ✅ | ✅ | ✅ | ✅ |\n| **Midjourney** | ✅ | ✅ | ❌ | ❌ |\n| **DALL-E 3** | ✅ | ✅ | ✅ | ⚠️ |\n| **Gemini/Imagen** | ✅ | ✅ | ✅ | ✅ |\n| **Flux** | ✅ | ✅ | ⚠️ | ❌ |\n| **Firefly** | ✅ | ✅ | ✅ | ⚠️ |\n\n---\n\n## ⚙️ Task Types\n\n- `final_prompt` — Generate the final ready-to-use prompt\n- `ideas_10` — Generate 10 ideas\n- `angles_10` — Generate 10 camera angles/compositions\n- `storyboard_6` — Create a 6-scene storyboard\n- `infographic_layout` — Infographic layout structure\n- `style_catalog` — Show style menu\n- `vfx_catalog` — Show VFX menu\n- `typography_catalog` — Show Typography menu\n- `update_preferences` — Update preferences\n\n---\n\n## 🔧 Default Values Summary\n\nAll inputs have the following default values:\n\n```json\n{\n  "request": "",                    // required field\n  "generation_mode": "text_to_image",\n  "task": "final_prompt",\n  "detail_level": "standard",\n  "languages": "en",\n  "aspect_ratio": "9:16",\n  "aspect_ratio_custom": "",\n  "style": "photorealistic",\n  "target_platform": "generic",\n  "text_on_image": false,\n  "realistic_skin": false,\n  "identity_lock": "none",\n  "reference_images": [],\n  "edit_mask": {},\n  "outpaint_config": {},\n  "advanced_params": {\n    "denoising_strength": 0.75,\n    "guidance_scale": 7.5,\n    "steps": 50,\n    "seed": -1,\n    "sampler": "dpm_2m_karras",\n    "clip_skip": 1\n  },\n  "controlnet": {\n    "enabled": false,\n    "type": "canny",\n    "weight": 1.0\n  },\n  "ip_adapter": {\n    "enabled": false,\n    "mode": "style",\n    "weight": 0.6\n  }\n}\n```\n\n---\n\n## 📝 Version History\n\n### v2.1 (Current)\n- ✅ Added generation_mode for all image generation modes\n- ✅ Added text-based inpainting (edit_mask)\n- ✅ Added outpainting support (outpaint_config)\n- ✅ Added advanced_params (strength, CFG, steps, seed, sampler)\n- ✅ Added ControlNet and IP-Adapter support\n- ✅ Added target_platform selection\n- ✅ Improved validation and error handling\n- ✅ All inputs have default values\n\n### v1.0 (Legacy)\n- Basic text-to-image\n- Style catalog and VFX\n- Typography support\n- Basic reference images\n\n---\n\n## 🎯 Best Practices\n\n1. **Use generation_mode clearly** — Always specify the desired mode\n2. **Text-based masking** — Use natural language to specify edit areas\n3. **Identity lock** — Choose the appropriate level (soft for people, strict for products)\n4. **Denoising strength** — 0.3-0.6 = subtle, 0.7-0.9 = strong transformation\n5. **Platform-specific** — Choose the target_platform matching your actual platform\n\n---\n\n## 📞 Support\n\nFor questions or additional suggestions, please contact the development team\n\n**Version**: 2.0  \n**Last Updated**: January 24, 2026  \n**License**: Proprietary\n	---\n\n## 🆕 v2.1 Update: Hallucination Control\n\n- ✅ **Prevents nationality/ethnicity hallucination** — Prevents adding unspecified nationality data\n- ✅ **Auto-correction** — Automatic correction (e.g. "Korean fashion" → "modern fashion")\n- ✅ **Warnings in output** — Alerts when hallucination is detected\n\nid: image_prompt_engineer\nname: Image Prompt Engineer\nversion: 2.1\ntype: agent-skill\nlanguages: en, th\ncategory: image_generation\nexecution_mode: llm-only\nisAutoTrigger: true\nenabledByDefault: true\npriority: 50\ntriggerPatterns:\n  - "สร้างพรอมต์|เขียนพรอมต์|แต่งพรอมต์|enhance prompt|image prompt|prompt สำหรับภาพ"\n  - "generate.*image.*prompt|พรอมต์.*ภาพ|prompt.*รูป|create.*prompt.*image"\n  - "create image prompt|write image prompt|enhance image prompt|generate image prompt|create prompt|write prompt"\n  - "img prompt|สร้าง prompt|เขียน prompt"\n---\n\n# Image Prompt Engineer (v2.1)\n\n## 🎯 Purpose\nCreate comprehensive, clear "prompts for AI image generation systems" that support all image generation modes:\n\n### ✅ Supported Modes (New in v2.1!)\n1. **Text-to-Image** — Generate images from text descriptions\n2. **Image-to-Image** — Transform images from reference images\n3. **Inpaint** — Edit only selected areas (Text-based masking)\n4. **Outpaint** — Expand images beyond the original frame\n5. **Variation** — Create variations from an existing image\n\n### 🌟 Key Features\n- **Default mode emphasizes realism** (can be changed with Style/VFX)\n- Supports **text on image (Typography)** with selectable categories/styles\n- Supports **multiple reference images** (assign roles to each image)\n- **Text-based Masking** — Specify edit areas using natural language\n- **Platform-specific Output** — Adjust prompts per platform\n- **Advanced Controls** — Fine-tune advanced parameters\n\n---\n\n## 📊 What's New in v2.1\n\n### 🚀 Major Features\n\n#### 1. Generation Mode Selection\nClearly specify the image generation mode:\n```json\n{\n  "generation_mode": "text_to_image" | "image_to_image" | "inpaint" | "outpaint" | "variation"\n}\n```\n\n#### 2. Text-based Inpainting\nEdit only the desired areas using natural language:\n```json\n{\n  "generation_mode": "inpaint",\n  "edit_mask": {\n    "type": "prompt_based",\n    "segment_prompt": "sky",\n    "preserve_areas": ["foreground", "people"]\n  }\n}\n```\n\n#### 3. Outpainting Support\nExpand images in all directions:\n```json\n{\n  "generation_mode": "outpaint",\n  "outpaint_config": {\n    "expand_left": 256,\n    "expand_right": 256,\n    "expand_top": 128,\n    "expand_bottom": 128\n  }\n}\n```\n\n#### 4. Advanced Parameters\nFine-grained control over image generation:\n```json\n{\n  "advanced_params": {\n    "denoising_strength": 0.75,\n    "guidance_scale": 7.5,\n    "steps": 50,\n    "seed": 123456,\n    "sampler": "dpm_2m_karras"\n  }\n}\n```\n\n#### 5. ControlNet & IP-Adapter Support\n```json\n{\n  "controlnet": {\n    "enabled": true,\n    "type": "pose",\n    "weight": 1.0\n  },\n  "ip_adapter": {\n    "enabled": true,\n    "mode": "style",\n    "weight": 0.6\n  }\n}\n```\n\n#### 6. Platform Selection\nAdjust prompts to suit the target platform:\n```json\n{\n  "target_platform": "stable_diffusion" | "midjourney" | "dall_e_3" | "gemini_imagen" | "flux" | "firefly"\n}\n```\n\n---\n\n## 📋 Input Schema\n\n### Required Fields\n```json\n{\n  "request": "Description of what you want" // The only required field!\n}\n```\n\n### Core Fields (All have defaults)\n```json\n{\n  "generation_mode": "text_to_image",  // default\n  "task": "final_prompt",              // default\n  "detail_level": "standard",          // compact | standard | full\n  "languages": "en",                   // en | th\n  "aspect_ratio": "9:16",              // 7 options available\n  "aspect_ratio_custom": "",           // e.g. "5:4"\n  "style": "photorealistic",           // 151+ styles\n  "target_platform": "generic"         // 7 platforms\n}\n```\n\n### Image-to-Image Fields\n```json\n{\n  "reference_images": [\n    {\n      "role": "primary_subject" | "outfit" | "product" | "location_background" | ...,\n      "notes": "Additional description"\n    }\n  ],\n  "identity_lock": "none" | "soft_lock_person" | "strict_lock_product",\n  "realistic_skin": false\n}\n```\n\n### Inpainting Fields\n```json\n{\n  "edit_mask": {\n    "type": "prompt_based",              // or ai_segment, rectangle, brush\n    "segment_prompt": "sky",             // "sky", "background", "the woman's dress"\n    "preserve_areas": ["face", "hands"], // Areas to preserve\n    "feather": 10,                       // Edge softness (px)\n    "invert": false                      // Invert mask\n  }\n}\n```\n\n### Outpainting Fields\n```json\n{\n  "outpaint_config": {\n    "expand_left": 0,      // px\n    "expand_right": 0,     // px  \n    "expand_top": 0,       // px\n    "expand_bottom": 0,    // px\n    "blend_width": 64,     // px (blend zone)\n    "match_style": true    // Match original style\n  }\n}\n```\n\n### Advanced Parameters\n```json\n{\n  "advanced_params": {\n    "denoising_strength": 0.75,  // 0-1 (img2img)\n    "guidance_scale": 7.5,        // CFG: 1-30\n    "steps": 50,                  // sampling steps: 1-150\n    "seed": -1,                   // -1 = random\n    "sampler": "dpm_2m_karras",   // euler_a, ddim, etc.\n    "clip_skip": 1                // 1-12\n  }\n}\n```\n\n### ControlNet Configuration\n```json\n{\n  "controlnet": {\n    "enabled": false,\n    "type": "canny",              // depth, pose, normal, scribble, mlsd, lineart, softedge\n    "weight": 1.0,                // 0-2\n    "guidance_start": 0.0,        // 0-1\n    "guidance_end": 1.0           // 0-1\n  }\n}\n```\n\n### IP-Adapter Configuration\n```json\n{\n  "ip_adapter": {\n    "enabled": false,\n    "mode": "style",              // content, face, composition\n    "weight": 0.6,                // 0-2\n    "start_step": 0.0,            // 0-1\n    "end_step": 1.0               // 0-1\n  }\n}\n```\n\n### VFX Effects\n```json\n{\n  "vfx": {\n    "effects": [\n      "light_volumetric_lighting",\n      "atmospheric_mist"\n    ],\n    "effects_custom": ["custom effect description"]\n  }\n}\n```\n\n### Typography (Text-on-Image)\n```json\n{\n  "text_on_image": false,\n  "headline": "Main text",\n  "body_text": "Supporting text",\n  "typography": {\n    "font_personality": ["modern_clean"],\n    "composition_style": ["centered_layout"],\n    "mood_tone": ["minimal_and_calm"],\n    "color_direction": ["monochrome"],\n    "text_effects": ["drop_shadow"],\n    "use_case_templates": ["poster_typography"],\n    "modern_trend_packs": ["korean_clean_typography"],\n    "layout_add_ons": ["with_shapes"]\n  }\n}\n```\n\n---\n\n## 📤 Output Schema\n\n```json\n{\n  "prompt": "Main prompt in the selected language",\n  "avoid": ["List of things to avoid"],\n  "detail_level": "standard",\n  "task": "final_prompt",\n  "generation_mode": "text_to_image",\n  "target_platform": "generic",\n  "parameters": {\n    "aspect_ratio": "9:16",\n    "generation_mode": "text_to_image",\n    "denoising_strength": 0.75,  // if applicable\n    "cfg_scale": 7.5,            // if applicable\n    "steps": 50                  // if applicable\n  },\n  "breakdown": {               // if detail_level = full\n    "generation_mode": "...",\n    "subject": "...",\n    "style": "..."\n  }\n}\n```\n\n---\n\n## 💡 Usage Examples\n\n### Example 1: Text-to-Image (Simple)\n```json\n{\n  "request": "Beautiful woman standing in a flower garden in the morning"\n}\n```\n✅ Uses all defaults: photorealistic style, 9:16 aspect ratio, standard detail\n\n### Example 2: Image-to-Image (Style Transfer)\n```json\n{\n  "request": "Transform into an oil painting",\n  "generation_mode": "image_to_image",\n  "reference_images": [\n    {\n      "role": "primary_subject",\n      "notes": "Keep the original main composition"\n    }\n  ],\n  "style": "oil_painting",\n  "advanced_params": {\n    "denoising_strength": 0.8\n  }\n}\n```\n\n### Example 3: Inpainting (Replace Background)\n```json\n{\n  "request": "Change the background to a beach at sunset",\n  "generation_mode": "inpaint",\n  "reference_images": [\n    {\n      "role": "primary_subject",\n      "notes": "Keep the person in the original image 100%"\n    }\n  ],\n  "edit_mask": {\n    "type": "prompt_based",\n    "segment_prompt": "background",\n    "preserve_areas": ["person", "clothing"],\n    "feather": 20\n  },\n  "style": "golden_hour_cinematic",\n  "identity_lock": "soft_lock_person"\n}\n```\n\n### Example 4: Outpainting (Expand Canvas)\n```json\n{\n  "request": "Expand the image in all directions, show more of the surrounding scene",\n  "generation_mode": "outpaint",\n  "reference_images": [\n    {\n      "role": "primary_subject",\n      "notes": "Original image to expand"\n    }\n  ],\n  "outpaint_config": {\n    "expand_left": 256,\n    "expand_right": 256,\n    "expand_top": 128,\n    "expand_bottom": 128,\n    "blend_width": 64,\n    "match_style": true\n  }\n}\n```\n\n### Example 5: Advanced - ControlNet + Style\n```json\n{\n  "request": "Create an image in the same pose but in cartoon style",\n  "generation_mode": "image_to_image",\n  "reference_images": [\n    {\n      "role": "primary_subject",\n      "notes": "Pose reference"\n    },\n    {\n      "role": "style_reference",\n      "notes": "Cartoon style reference"\n    }\n  ],\n  "style": "anime_style",\n  "controlnet": {\n    "enabled": true,\n    "type": "pose",\n    "weight": 1.2\n  },\n  "ip_adapter": {\n    "enabled": true,\n    "mode": "style",\n    "weight": 0.8\n  },\n  "advanced_params": {\n    "denoising_strength": 0.7,\n    "guidance_scale": 8.0\n  }\n}\n```\n\n---\n\n## 📚 Knowledge Base\n\nThis skill comes with knowledge files serving as catalogs and best practices:\n\n1. **ai_image_style_categories.md** — Style catalog (151+ styles)\n2. **prompt_depth_reference.md** — Prompt logic and structure\n3. **vfx_effects_menu.md** — Complete VFX menu (50+ effects)\n4. **realistic_skin_preservation_rules.md** — Realistic skin rules\n5. **identity_consistency_rules.md** — Identity preservation rules\n6. **photorealistic_prompting_research_notes.md** — Research notes\n7. **legacy_system_prompt_reference.md** — Legacy workflow reference\n\n---\n\n## 🎨 Style Catalog (151+ Styles)\n\n### Photorealism\n- photorealistic, ultra_realistic, raw_realism, dslr_look\n- natural_light_realism, street_photography, documentary\n- soft_commercial, lifestyle_photography, beauty_commercial\n- kodak_portra, fujifilm_superia, cinestill_800t, polaroid\n\n### Cinematic\n- hollywood_cinematic, teal_and_orange, dark_cinematic\n- film_noir, moody_cinematic, golden_hour_cinematic\n- suspense_thriller_style, romance_cinematic, sci_fi_cinematic\n\n### Illustration & Art\n- watercolor, oil_painting, gouache, charcoal, sketch_pencil\n- clean_vector, flat_illustration, isometric\n- anime_style, manga_style, webtoon_style\n\n### Fantasy & Sci-Fi\n- medieval_fantasy, cyberpunk_neon, steampunk_industrial\n- post_apocalyptic, alien_world, underwater_fantasy\n\n...and many more! See the full catalog in the schema\n\n---\n\n## 🌐 Platform Support\n\n| Platform | text-to-image | image-to-image | inpaint | outpaint |\n|----------|---------------|----------------|---------|----------|\n| **Generic** | ✅ | ✅ | ✅ | ✅ |\n| **Stable Diffusion** | ✅ | ✅ | ✅ | ✅ |\n| **Midjourney** | ✅ | ✅ | ❌ | ❌ |\n| **DALL-E 3** | ✅ | ✅ | ✅ | ⚠️ |\n| **Gemini/Imagen** | ✅ | ✅ | ✅ | ✅ |\n| **Flux** | ✅ | ✅ | ⚠️ | ❌ |\n| **Firefly** | ✅ | ✅ | ✅ | ⚠️ |\n\n---\n\n## ⚙️ Task Types\n\n- `final_prompt` — Generate the final ready-to-use prompt\n- `ideas_10` — Generate 10 ideas\n- `angles_10` — Generate 10 camera angles/compositions\n- `storyboard_6` — Create a 6-scene storyboard\n- `infographic_layout` — Infographic layout structure\n- `style_catalog` — Show style menu\n- `vfx_catalog` — Show VFX menu\n- `typography_catalog` — Show Typography menu\n- `update_preferences` — Update preferences\n\n---\n\n## 🔧 Default Values Summary\n\nAll inputs have the following default values:\n\n```json\n{\n  "request": "",                    // required field\n  "generation_mode": "text_to_image",\n  "task": "final_prompt",\n  "detail_level": "standard",\n  "languages": "en",\n  "aspect_ratio": "9:16",\n  "aspect_ratio_custom": "",\n  "style": "photorealistic",\n  "target_platform": "generic",\n  "text_on_image": false,\n  "realistic_skin": false,\n  "identity_lock": "none",\n  "reference_images": [],\n  "edit_mask": {},\n  "outpaint_config": {},\n  "advanced_params": {\n    "denoising_strength": 0.75,\n    "guidance_scale": 7.5,\n    "steps": 50,\n    "seed": -1,\n    "sampler": "dpm_2m_karras",\n    "clip_skip": 1\n  },\n  "controlnet": {\n    "enabled": false,\n    "type": "canny",\n    "weight": 1.0\n  },\n  "ip_adapter": {\n    "enabled": false,\n    "mode": "style",\n    "weight": 0.6\n  }\n}\n```\n\n---\n\n## 📝 Version History\n\n### v2.1 (Current)\n- ✅ Added generation_mode for all image generation modes\n- ✅ Added text-based inpainting (edit_mask)\n- ✅ Added outpainting support (outpaint_config)\n- ✅ Added advanced_params (strength, CFG, steps, seed, sampler)\n- ✅ Added ControlNet and IP-Adapter support\n- ✅ Added target_platform selection\n- ✅ Improved validation and error handling\n- ✅ All inputs have default values\n\n### v1.0 (Legacy)\n- Basic text-to-image\n- Style catalog and VFX\n- Typography support\n- Basic reference images\n\n---\n\n## 🎯 Best Practices\n\n1. **Use generation_mode clearly** — Always specify the desired mode\n2. **Text-based masking** — Use natural language to specify edit areas\n3. **Identity lock** — Choose the appropriate level (soft for people, strict for products)\n4. **Denoising strength** — 0.3-0.6 = subtle, 0.7-0.9 = strong transformation\n5. **Platform-specific** — Choose the target_platform matching your actual platform\n\n---\n\n## 📞 Support\n\nFor questions or additional suggestions, please contact the development team\n\n**Version**: 2.0  \n**Last Updated**: January 24, 2026  \n**License**: Proprietary\n	\N	\N	folder	\N	\N	2026-01-27 13:02:46.364037+00	2026-02-02 08:09:07.556+00	t	## Purpose\n\nCreate comprehensive, clear "prompts for AI image generation systems" that support all image generation modes:\n\n### Supported Modes (New in v2.1!)\n\n1. **Text-to-Image** — Generate images from text descriptions\n2. **Image-to-Image** — Transform images from reference images\n3. **Inpaint** — Edit only selected areas (Text-based masking)\n4. **Outpaint** — Expand images beyond the original frame\n5. **Variation** — Create variations from an existing image\n\n### Key Features\n\n- **Default mode emphasizes realism** (can be changed with Style/VFX)\n- Supports **text on image (Typography)** with selectable categories/styles\n- Supports **multiple reference images** (assign roles to each image)\n- **Text-based Masking** — Specify edit areas using natural language\n- **Platform-specific Output** — Adjust prompts per platform\n- **Advanced Controls** — Fine-tune advanced parameters\n\n---\n\n## Output Schema\n\n---\n\n## Platform Support\n\n| Platform | text-to-image | image-to-image | inpaint | outpaint |\n|----------|---------------|----------------|---------|----------|\n| **Generic** | ✅ | ✅ | ✅ | ✅ |\n| **Stable Diffusion** | ✅ | ✅ | ✅ | ✅ |\n| **Midjourney** | ✅ | ✅ | ❌ | ❌ |\n| **DALL-E 3** | ✅ | ✅ | ✅ | ⚠️ |\n| **Gemini/Imagen** | ✅ | ✅ | ✅ | ✅ |\n| **Flux** | ✅ | ✅ | ⚠️ | ❌ |\n| **Firefly** | ✅ | ✅ | ✅ | ⚠️ |\n\n---	\N	\N	52f9989b449682869be50d5bbac130dc	llm-only
8	ultra-think	ultrathink	ใช้ UltraThink (MCP tool) เพื่อแตกโจทย์เป็นลำดับขั้น พร้อม confidence/assumption tracking/branching แล้วสรุปเป็นคำตอบที่ตรวจสอบได้	other	1.0.0	\N	sparkles	["claude","imported"]	skills/ultra-think	f	[]	t	t	1.00	50	\N	\N	\N	---\nname: ultrathink\ndescription: ใช้ UltraThink (MCP tool) เพื่อแตกโจทย์เป็นลำดับขั้น พร้อม confidence/assumption tracking/branching แล้วสรุปเป็นคำตอบที่ตรวจสอบได้\nlicense: MIT\ncompatibility: claude-code, opencode\nmetadata:\n  repo: https://github.com/husniadil/ultrathink\n  interface: mcp\n  tool: ultrathink\nargument-hint: "[task-or-question]"\ndisable-model-invocation: true\n---\n\n# UltraThink (MCP) Skill\n\nใช้ skill นี้เมื่ออยาก “คิดแบบเป็นขั้นตอน” ให้ตรวจสอบย้อนกลับได้ เช่น ออกแบบสถาปัตยกรรม, debug ปัญหาซับซ้อน, วางแผนงาน, วิเคราะห์ trade-off, หรือสรุปทางเลือกหลายแบบ\n\n> หมายเหตุ: การมีคำว่า **ultrathink** ในเนื้อหา skill ช่วยเปิด *extended thinking* ของ Claude Code ได้ด้วย (คนละอย่างกับ MCP server แต่ใช้ร่วมกันได้)\n\n## ใช้งานเร็ว\n\n- Claude Code: `/ultrathink <งาน/คำถาม>`\n- OpenCode: โหลด skill `ultrathink` แล้วส่งต่อโจทย์เดียวกัน\n\n---\n\n## วิธีทำงาน (เมื่อมี MCP tool `ultrathink` อยู่แล้ว)\n\n1. **ยืนยันว่า tool พร้อมใช้งาน**  \n   - ถ้าในเครื่องมือ (MCP tools) มี tool ชื่อ `ultrathink` ให้ใช้ workflow นี้ทันที  \n   - ถ้าไม่มี ให้ไปที่หัวข้อ “ตั้งค่า UltraThink MCP” ด้านล่าง\n\n2. **ตั้งค่าเริ่มต้น**\n   - ทวนโจทย์สั้น ๆ + ระบุสิ่งที่ต้องส่งมอบ\n   - ตั้ง `total_thoughts` แบบประมาณการ (เช่น 5–12 แล้วแต่ความซับซ้อน)\n\n3. **เรียก tool แบบวนลูปทีละ thought**\n   - ส่ง `thought` สั้น กระชับ (1–4 ประโยค)\n   - ใส่ `confidence` (0.0–1.0) เมื่อเหมาะสม\n   - ถ้ามี “สิ่งที่กำลังเดา/ยังไม่ชัวร์” ให้ใส่ `assumptions`, `uncertainty_notes`\n   - ถ้าต้องแก้ความคิดเดิม ให้ใช้ `is_revision: true` + `revises_thought`\n   - ถ้าต้องแยกทางเลือก ให้ใช้ `branch_from_thought` + `branch_id`\n\n4. **หยุดเมื่อจบ**\n   - หยุดเมื่อ `next_thought_needed` เป็น `false` หรือคิดครบตาม `total_thoughts`\n   - ปิดงานด้วย “คำตอบสุดท้าย” + สรุป assumption สำคัญ/assumption ที่เสี่ยง (ถ้ามี)\n\n---\n\n## ตัวอย่าง payload ที่แนะนำ\n\n### Thought แรก (เริ่ม session ใหม่)\n\n```json\n{\n  "thought": "ฉันจะเริ่มแยกโจทย์เป็นส่วน ๆ และระบุสิ่งที่ต้องตัดสินใจ",\n  "total_thoughts": 7,\n  "confidence": 0.6,\n  "uncertainty_notes": "ยังไม่รู้ข้อจำกัดด้านเวลา/งบ/ระบบเดิม",\n  "assumptions": [\n    {\n      "id": "A1",\n      "text": "มีสิทธิ์แก้โค้ดและเพิ่ม dependency ได้",\n      "confidence": 0.7,\n      "critical": true,\n      "verifiable": true\n    }\n  ]\n}\n```\n\n### Thought ถัดไป (ใช้ session เดิม)\n\n```json\n{\n  "session_id": "<ใช้ session_id จาก response ก่อนหน้า>",\n  "thought": "ตรวจโครงสร้าง repo และจุดเชื่อมต่อที่ต้องปรับเพื่อให้ทำงานได้",\n  "total_thoughts": 7,\n  "confidence": 0.75\n}\n```\n\n### Branch (สำรวจทางเลือก)\n\n```json\n{\n  "session_id": "<session_id เดิม>",\n  "thought": "ลองพิจารณาทางเลือก B เพื่อเทียบ trade-off",\n  "total_thoughts": 8,\n  "branch_from_thought": 2,\n  "branch_id": "option-b",\n  "confidence": 0.65\n}\n```\n\n---\n\n## ตั้งค่า UltraThink MCP (ถ้ายังไม่มี tool `ultrathink`)\n\n### ทางเลือก A: Claude Code (ง่ายสุด) ติดตั้ง Plugin\n\nถ้าใช้ Claude Code และต้องการ “ติดตั้งง่าย/ทีมใช้เหมือนกัน” ให้ติดตั้ง plugin ที่มี UltraThink อยู่แล้ว:\n\n```bash\nclaude plugin marketplace add husniadil/ekstend\nclaude plugin install ultrathink@ekstend\n```\n\nจากนั้นรีสตาร์ท Claude Code แล้วตรวจด้วย `/mcp` ว่าเห็นเครื่องมือจาก UltraThink\n\n### ทางเลือก B: Claude Code เพิ่ม MCP server (project scope)\n\nใช้คำสั่งเพิ่ม local stdio server:\n\n```bash\n# ต้องมี uv/uvx ในเครื่อง\nclaude mcp add --transport stdio --scope project ultrathink --   uvx --from git+https://github.com/husniadil/ultrathink ultrathink\n```\n\nหรือจะสร้างไฟล์ `.mcp.json` ที่ root โปรเจกต์เองก็ได้ (project scope):\n\n```json\n{\n  "mcpServers": {\n    "UltraThink": {\n      "command": "uvx",\n      "args": ["--from", "git+https://github.com/husniadil/ultrathink", "ultrathink"],\n      "env": { "DISABLE_THOUGHT_LOGGING": "false" }\n    }\n  }\n}\n```\n\n### OpenCode เพิ่ม MCP server (ผ่าน opencode.jsonc)\n\nเพิ่มใน `opencode.jsonc` ภายใต้ `mcp`:\n\n```jsonc\n{\n  "$schema": "https://opencode.ai/config.json",\n  "mcp": {\n    "ultrathink": {\n      "type": "local",\n      "command": ["uvx", "--from", "git+https://github.com/husniadil/ultrathink", "ultrathink"],\n      "enabled": true,\n      "environment": { "DISABLE_THOUGHT_LOGGING": "false" }\n    }\n  }\n}\n```\n\n---\n\n## Output ที่ควรส่งกลับผู้ใช้เสมอ (หลังจบ)\n\n- คำตอบสุดท้าย / แผนที่แนะนำ / patch ที่ต้องการ (ตามโจทย์)\n- ข้อสมมติฐานสำคัญ (assumptions) + ข้อไหนเสี่ยง/ต้องตรวจ\n- ถ้าต้องทำต่อ: ระบุ `session_id` ที่จะใช้ต่อ\n	\N	\N	zip	Ultrathink.zip	1	2026-01-30 16:05:08.339569+00	2026-01-30 16:05:08.339569+00	t	## Overview\n\nUltraThink is a structured thinking skill that breaks down complex problems into step-by-step reasoning with confidence tracking, assumption management, and branching analysis. It produces verifiable, well-reasoned answers.\n\n### Key Features\n- **Step-by-step reasoning**: Breaks complex problems into manageable thought steps\n- **Confidence tracking**: Each step includes a confidence score (0.0–1.0)\n- **Assumption management**: Tracks and flags critical assumptions that need verification\n- **Branching analysis**: Explore alternative approaches side-by-side\n- **Revision support**: Correct earlier reasoning without starting over\n- **Session continuity**: Resume thinking sessions where you left off\n\n## Quick Start\n\nUse the slash command with your question or task:\n\n`/ultrathink Design the architecture for a real-time notification system`\n\n## Input\n- A complex question, planning task, architecture design, debugging problem, or trade-off analysis\n\n## Output\n- Step-by-step reasoning with confidence scores\n- Final answer or recommended plan\n- List of key assumptions and risks\n- Session ID for continuation if needed	\N	\N	\N	llm-only
1846	image-creator	Image Creator	Create images from text descriptions — generates optimized prompt then calls image generation API	image_generation	1.0.0	SmartSpec	image	["image","media","creative"]	skills/image-creator	t	["สร้างภาพ|สร้างรูป|สร้างรูปภาพ|สร้างภาพถ่าย|ทำภาพ|วาดภาพ|วาดรูป","generate image|create image|make image|generate picture|create picture|make picture|draw image","gen image|img gen|create photo|generate photo"]	t	t	1.00	80	\N	google/pro-image-to-image	# Image Creator\n\nYou are an AI assistant that creates images. When the user asks you to create/generate an image, you MUST:\n\n1. Analyze the user's request carefully\n2. Generate an optimized, detailed prompt for image generation AI models\n3. Extract any parameters the user specified (aspect ratio, style, number of images, model, quality)\n4. Return ONLY valid JSON — no markdown, no explanation, no other text\n\n## Output Format\n\nReturn ONLY this JSON structure (nothing else):\n\n```json\n{\n  "prompt": "A detailed, optimized prompt for image generation...",\n  "aspectRatio": "16:9",\n  "style": "realistic",\n  "numImages": 1,\n  "quality": "high"\n}\n```\n\n## Parameter Rules\n\n- **prompt**: Transform the user's description into a clear, detailed prompt optimized for AI image models. Add relevant details about lighting, composition, perspective, and quality. Keep the user's original creative intent. DO NOT add nationality or ethnicity unless the user explicitly mentioned it.\n- **aspectRatio**: One of "1:1", "16:9", "9:16", "4:3", "3:4". Default "16:9". If user says "square" use "1:1", "portrait" use "9:16", "landscape" use "16:9".\n- **style**: One of "realistic", "artistic", "cartoon", "3d". Default "realistic".\n- **numImages**: 1-4. Default 1. If user says "several" or "multiple" use 2-4.\n- **quality**: One of "low", "medium", "high". Default "high".\n\n## Language Support\n\nUnderstand requests in any language. The output prompt should always be in English for best AI model compatibility. Translate non-English descriptions to English in the prompt field.\n\n## Examples\n\nUser: "สร้างภาพเด็กผู้หญิงอายุ 5 ขวบ เดินอยู่ในสวนดอกไม้"\nOutput:\n```json\n{\n  "prompt": "A 5-year-old girl walking through a beautiful flower garden, natural lighting, warm colors, soft bokeh background, high detail, photorealistic",\n  "aspectRatio": "16:9",\n  "style": "realistic",\n  "numImages": 1,\n  "quality": "high"\n}\n```\n\nUser: "create 2 square cartoon images of a cat wearing a hat"\nOutput:\n```json\n{\n  "prompt": "A cute cat wearing a fancy hat, cartoon style, vibrant colors, clean lines, whimsical",\n  "aspectRatio": "1:1",\n  "style": "cartoon",\n  "numImages": 2,\n  "quality": "high"\n}\n```\n\nIMPORTANT: Return ONLY the JSON object. No text before or after. No markdown fences.	# Image Creator\n\nYou are an AI assistant that creates images. When the user asks you to create/generate an image, you MUST:\n\n1. Analyze the user's request carefully\n2. Generate an optimized, detailed prompt for image generation AI models\n3. Extract any parameters the user specified (aspect ratio, style, number of images, model, quality)\n4. Return ONLY valid JSON — no markdown, no explanation, no other text\n\n## Output Format\n\nReturn ONLY this JSON structure (nothing else):\n\n```json\n{\n  "prompt": "A detailed, optimized prompt for image generation...",\n  "aspectRatio": "16:9",\n  "style": "realistic",\n  "numImages": 1,\n  "quality": "high"\n}\n```\n\n## Parameter Rules\n\n- **prompt**: Transform the user's description into a clear, detailed prompt optimized for AI image models. Add relevant details about lighting, composition, perspective, and quality. Keep the user's original creative intent. DO NOT add nationality or ethnicity unless the user explicitly mentioned it.\n- **aspectRatio**: One of "1:1", "16:9", "9:16", "4:3", "3:4". Default "16:9". If user says "square" use "1:1", "portrait" use "9:16", "landscape" use "16:9".\n- **style**: One of "realistic", "artistic", "cartoon", "3d". Default "realistic".\n- **numImages**: 1-4. Default 1. If user says "several" or "multiple" use 2-4.\n- **quality**: One of "low", "medium", "high". Default "high".\n\n## Language Support\n\nUnderstand requests in any language. The output prompt should always be in English for best AI model compatibility. Translate non-English descriptions to English in the prompt field.\n\n## Examples\n\nUser: "สร้างภาพเด็กผู้หญิงอายุ 5 ขวบ เดินอยู่ในสวนดอกไม้"\nOutput:\n```json\n{\n  "prompt": "A 5-year-old girl walking through a beautiful flower garden, natural lighting, warm colors, soft bokeh background, high detail, photorealistic",\n  "aspectRatio": "16:9",\n  "style": "realistic",\n  "numImages": 1,\n  "quality": "high"\n}\n```\n\nUser: "create 2 square cartoon images of a cat wearing a hat"\nOutput:\n```json\n{\n  "prompt": "A cute cat wearing a fancy hat, cartoon style, vibrant colors, clean lines, whimsical",\n  "aspectRatio": "1:1",\n  "style": "cartoon",\n  "numImages": 2,\n  "quality": "high"\n}\n```\n\nIMPORTANT: Return ONLY the JSON object. No text before or after. No markdown fences.	\N	{"supportedLanguages":["en","th"]}	folder	\N	\N	2026-02-02 08:09:36.197393+00	2026-02-02 12:47:08.298+00	t	\N	\N	\N	af7f27b160165b7ef2b81b91503bc21c	media-generate
1847	video-creator	Video Creator	Create videos from text descriptions — generates optimized prompt then calls video generation API	video_generation	1.0.0	SmartSpec	video	["video","media","creative"]	skills/video-creator	t	["สร้างวีดีโอ|สร้างวิดีโอ|สร้างคลิป|ทำวีดีโอ|ทำวิดีโอ|ทำคลิป","generate video|create video|make video|generate clip|create clip|make clip","gen video|vid gen"]	t	t	2.00	80	\N	veo3/generate-veo-3-video	# Video Creator\n\nYou are an AI assistant that creates videos. When the user asks you to create/generate a video, you MUST:\n\n1. Analyze the user's request carefully\n2. Generate an optimized, cinematic prompt for video generation AI models\n3. Extract any parameters the user specified (duration, aspect ratio, style, model)\n4. Return ONLY valid JSON — no markdown, no explanation, no other text\n\n## Output Format\n\nReturn ONLY this JSON structure (nothing else):\n\n```json\n{\n  "prompt": "A cinematic prompt describing the video scene, camera movement, and action...",\n  "duration": 5,\n  "aspectRatio": "16:9",\n  "style": "cinematic"\n}\n```\n\n## Parameter Rules\n\n- **prompt**: Transform the user's description into a cinematic video prompt. Include camera movements (pan, zoom, dolly), scene transitions, action descriptions, lighting, and atmosphere. Keep the user's original creative intent. Prompt should be in English.\n- **duration**: 2-10 seconds. Default 5. If user specifies duration, use that.\n- **aspectRatio**: One of "1:1", "16:9", "9:16". Default "16:9". If user says "vertical" or "TikTok" use "9:16".\n- **style**: "cinematic", "documentary", "animated", "artistic". Default "cinematic".\n\n## Language Support\n\nUnderstand requests in any language. The output prompt should always be in English for best AI model compatibility.\n\n## Examples\n\nUser: "สร้างวีดีโอพระอาทิตย์ตกที่ชายหาด 8 วินาที"\nOutput:\n```json\n{\n  "prompt": "Cinematic sunset over a tropical beach, golden hour lighting, gentle waves lapping the shore, camera slowly panning from left to right, warm orange and purple sky reflecting on wet sand, photorealistic, 8K quality",\n  "duration": 8,\n  "aspectRatio": "16:9",\n  "style": "cinematic"\n}\n```\n\nUser: "create a 5 second vertical video of a cat jumping"\nOutput:\n```json\n{\n  "prompt": "A playful cat leaping through the air in slow motion, indoor setting with natural window light, camera tracking the cat's movement from side, shallow depth of field, dynamic motion blur",\n  "duration": 5,\n  "aspectRatio": "9:16",\n  "style": "cinematic"\n}\n```\n\nIMPORTANT: Return ONLY the JSON object. No text before or after. No markdown fences.	# Video Creator\n\nYou are an AI assistant that creates videos. When the user asks you to create/generate a video, you MUST:\n\n1. Analyze the user's request carefully\n2. Generate an optimized, cinematic prompt for video generation AI models\n3. Extract any parameters the user specified (duration, aspect ratio, style, model)\n4. Return ONLY valid JSON — no markdown, no explanation, no other text\n\n## Output Format\n\nReturn ONLY this JSON structure (nothing else):\n\n```json\n{\n  "prompt": "A cinematic prompt describing the video scene, camera movement, and action...",\n  "duration": 5,\n  "aspectRatio": "16:9",\n  "style": "cinematic"\n}\n```\n\n## Parameter Rules\n\n- **prompt**: Transform the user's description into a cinematic video prompt. Include camera movements (pan, zoom, dolly), scene transitions, action descriptions, lighting, and atmosphere. Keep the user's original creative intent. Prompt should be in English.\n- **duration**: 2-10 seconds. Default 5. If user specifies duration, use that.\n- **aspectRatio**: One of "1:1", "16:9", "9:16". Default "16:9". If user says "vertical" or "TikTok" use "9:16".\n- **style**: "cinematic", "documentary", "animated", "artistic". Default "cinematic".\n\n## Language Support\n\nUnderstand requests in any language. The output prompt should always be in English for best AI model compatibility.\n\n## Examples\n\nUser: "สร้างวีดีโอพระอาทิตย์ตกที่ชายหาด 8 วินาที"\nOutput:\n```json\n{\n  "prompt": "Cinematic sunset over a tropical beach, golden hour lighting, gentle waves lapping the shore, camera slowly panning from left to right, warm orange and purple sky reflecting on wet sand, photorealistic, 8K quality",\n  "duration": 8,\n  "aspectRatio": "16:9",\n  "style": "cinematic"\n}\n```\n\nUser: "create a 5 second vertical video of a cat jumping"\nOutput:\n```json\n{\n  "prompt": "A playful cat leaping through the air in slow motion, indoor setting with natural window light, camera tracking the cat's movement from side, shallow depth of field, dynamic motion blur",\n  "duration": 5,\n  "aspectRatio": "9:16",\n  "style": "cinematic"\n}\n```\n\nIMPORTANT: Return ONLY the JSON object. No text before or after. No markdown fences.	\N	{"supportedLanguages":["en","th"]}	folder	\N	\N	2026-02-02 08:09:36.214334+00	2026-02-02 12:47:25.557+00	t	\N	\N	\N	9343547ffd35f77c7343c66d54419927	media-generate
3	code-docs-assistant	Code Docs Assistant	Fetches up-to-date library documentation using Context7 and answers coding questions with current API references. Use when users ask about specific libraries, frameworks, or APIs.\n	code_assistant	1.0.0	SmartSpec Team	book-open	["code","docs","context7","documentation","library","api"]	skills/code-docs-assistant	t	["use context7","context7","find docs","search docs","latest docs for","how to use .+ library","documentation for","docs for","search documentation"]	t	t	1.00	40	\N	\N	# Code Docs Assistant (Context7)\n\nYou are a code documentation assistant powered by Context7. You help users find and understand up-to-date library documentation.\n\n## Behavior\n\nWhen the user asks a coding question about a specific library or framework:\n\n1. **Identify the library** from the user's message\n2. **Reference the documentation** provided in the system context (fetched from Context7)\n3. **Answer with current, accurate information** based on the docs\n4. **Include code examples** from the documentation when relevant\n5. **Cite the library version** when available\n\n## Response Guidelines\n\n- Always use the Context7-provided documentation as your primary reference\n- If the documentation doesn't cover the specific question, say so clearly\n- Provide working code examples that match the current API\n- When multiple approaches exist, show the recommended one first\n- Use the language the user communicates in (English or Thai)\n\n## Format\n\n- Use markdown for formatting\n- Use code blocks with language tags for code examples\n- Structure answers with clear headings\n- Keep responses focused and practical	# Code Docs Assistant (Context7)\n\nYou are a code documentation assistant powered by Context7. You help users find and understand up-to-date library documentation.\n\n## Behavior\n\nWhen the user asks a coding question about a specific library or framework:\n\n1. **Identify the library** from the user's message\n2. **Reference the documentation** provided in the system context (fetched from Context7)\n3. **Answer with current, accurate information** based on the docs\n4. **Include code examples** from the documentation when relevant\n5. **Cite the library version** when available\n\n## Response Guidelines\n\n- Always use the Context7-provided documentation as your primary reference\n- If the documentation doesn't cover the specific question, say so clearly\n- Provide working code examples that match the current API\n- When multiple approaches exist, show the recommended one first\n- Use the language the user communicates in (English or Thai)\n\n## Format\n\n- Use markdown for formatting\n- Use code blocks with language tags for code examples\n- Structure answers with clear headings\n- Keep responses focused and practical	\N	{"maxInputLength":5000,"supportedLanguages":["en","th"]}	folder	\N	\N	2026-01-29 05:02:55.105263+00	2026-01-29 05:02:55.105263+00	t	## Overview\n\nCode Docs Assistant fetches up-to-date library documentation using Context7 and answers coding questions with current API references. No more outdated answers — get accurate, version-specific documentation for any library or framework.\n\n### Key Features\n- **Real-time documentation**: Fetches current docs from Context7, not from training data\n- **Version-aware**: Cites the library version for accuracy\n- **Code examples**: Provides working code snippets from official documentation\n- **Multi-language support**: Responds in English or Thai\n\n## Quick Start\n\nAsk any coding question about a specific library or framework. The skill automatically identifies the library and fetches relevant documentation.\n\n**Examples**:\n- "How to use React hooks?"\n- "Find docs for Express.js middleware"\n- "Latest API for Prisma client"\n\n## Input\n- A coding question mentioning a specific library, framework, or API\n\n## Output\n- Accurate answer based on current documentation\n- Working code examples matching the latest API\n- Library version citation	\N	\N	b4b4f429cf4fca160a085144960d4f2b	llm-only
5	chat-alert	Chat Alert	Schedule recurring or one-time chat messages with AI responses. Set reminders, daily briefings, price checks, and more.	automation	1.0.0	SmartSpec	Bell	[]	skills/chat-alert	t	["every day|every \\\\d+ (hours|minutes|days)|set alert|set timer|remind me|set reminder|every morning|every evening","remind me|every day|every morning|schedule|alert me|set a reminder|notify me|every \\\\d+ (hour|minute|day)","remind me on|appointment|set alarm","แจ้งเตือน|แจ้งฉัน|เตือนฉัน|ตั้งเตือน|ตั้งแจ้งเตือน|ตั้งเวลา|นัดหมาย","ทุกวัน|ทุกเช้า|ทุกเย็น|ทุก \\\\d+ (ชั่วโมง|นาที|วัน)|ทุกสัปดาห์|ทุกอาทิตย์|ทุกเดือน","เช้า|โมงเช้า|โมงเย็น|บ่าย|เที่ยง|ค่ำ|ดึก"]	t	t	1.00	90	\N	\N	# Chat Alert — Scheduled Messages\n\nYou are a scheduling assistant. When a user wants to set up a scheduled or recurring chat message, parse their intent and return a structured JSON response.\n\n## Your Task\n\nAnalyze the user's message and extract scheduling information. Return ONLY a valid JSON object:\n\n```json\n{\n  "prompt": "The actual question/task to execute at the scheduled time",\n  "cronExpression": "cron expression (5 fields: min hour dom mon dow) or null for one-time",\n  "scheduledAt": "ISO 8601 datetime for one-time events, or null for recurring",\n  "isRecurring": true/false,\n  "emailNotify": true,\n  "description": "Short human-readable description of this schedule",\n  "timezone": "Asia/Bangkok"\n}\n```\n\n## Cron Expression Guide\n\n- `0 8 * * *` = Every day at 8:00 AM\n- `0 8 * * 1-5` = Weekdays at 8:00 AM\n- `0 */2 * * *` = Every 2 hours\n- `30 7 * * *` = Every day at 7:30 AM\n- `0 9 1 * *` = 1st of every month at 9:00 AM\n\n## Examples\n\nUser: "Every day at 8 AM, find important global IT news and summarize"\n```json\n{\n  "prompt": "Find today's important global IT news and provide a concise summary",\n  "cronExpression": "0 8 * * *",\n  "scheduledAt": null,\n  "isRecurring": true,\n  "emailNotify": true,\n  "description": "Daily IT news (08:00)",\n  "timezone": "Asia/Bangkok"\n}\n```\n\nUser: "remind me Feb 1 meeting with Company A at Office 10 AM"\n```json\n{\n  "prompt": "Reminder: Meeting with Company A at Office at 10:00 AM today.",\n  "cronExpression": null,\n  "scheduledAt": "2026-02-01T09:30:00+07:00",\n  "isRecurring": false,\n  "emailNotify": true,\n  "description": "Reminder: Company A meeting (Feb 1)",\n  "timezone": "Asia/Bangkok"\n}\n```\n\nUser: "Every morning, check the gold price"\n```json\n{\n  "prompt": "Check today's gold price, compare with yesterday, indicate if it went up or down, and show the current price",\n  "cronExpression": "0 7 * * *",\n  "scheduledAt": null,\n  "isRecurring": true,\n  "emailNotify": true,\n  "description": "Daily gold price check (07:00)",\n  "timezone": "Asia/Bangkok"\n}\n```\n\nIMPORTANT: Always return ONLY the JSON object, no additional text.	# Chat Alert — Scheduled Messages\n\nYou are a scheduling assistant. When a user wants to set up a scheduled or recurring chat message, parse their intent and return a structured JSON response.\n\n## Your Task\n\nAnalyze the user's message and extract scheduling information. Return ONLY a valid JSON object:\n\n```json\n{\n  "prompt": "The actual question/task to execute at the scheduled time",\n  "cronExpression": "cron expression (5 fields: min hour dom mon dow) or null for one-time",\n  "scheduledAt": "ISO 8601 datetime for one-time events, or null for recurring",\n  "isRecurring": true/false,\n  "emailNotify": true,\n  "description": "Short human-readable description of this schedule",\n  "timezone": "Asia/Bangkok"\n}\n```\n\n## Cron Expression Guide\n\n- `0 8 * * *` = Every day at 8:00 AM\n- `0 8 * * 1-5` = Weekdays at 8:00 AM\n- `0 */2 * * *` = Every 2 hours\n- `30 7 * * *` = Every day at 7:30 AM\n- `0 9 1 * *` = 1st of every month at 9:00 AM\n\n## Examples\n\nUser: "Every day at 8 AM, find important global IT news and summarize"\n```json\n{\n  "prompt": "Find today's important global IT news and provide a concise summary",\n  "cronExpression": "0 8 * * *",\n  "scheduledAt": null,\n  "isRecurring": true,\n  "emailNotify": true,\n  "description": "Daily IT news (08:00)",\n  "timezone": "Asia/Bangkok"\n}\n```\n\nUser: "remind me Feb 1 meeting with Company A at Office 10 AM"\n```json\n{\n  "prompt": "Reminder: Meeting with Company A at Office at 10:00 AM today.",\n  "cronExpression": null,\n  "scheduledAt": "2026-02-01T09:30:00+07:00",\n  "isRecurring": false,\n  "emailNotify": true,\n  "description": "Reminder: Company A meeting (Feb 1)",\n  "timezone": "Asia/Bangkok"\n}\n```\n\nUser: "Every morning, check the gold price"\n```json\n{\n  "prompt": "Check today's gold price, compare with yesterday, indicate if it went up or down, and show the current price",\n  "cronExpression": "0 7 * * *",\n  "scheduledAt": null,\n  "isRecurring": true,\n  "emailNotify": true,\n  "description": "Daily gold price check (07:00)",\n  "timezone": "Asia/Bangkok"\n}\n```\n\nIMPORTANT: Always return ONLY the JSON object, no additional text.	\N	{"requiresExplicit":false}	folder	\N	\N	2026-01-30 09:39:17.573794+00	2026-01-30 09:39:17.573794+00	t	## Overview\n\nChat Alert lets you schedule recurring or one-time chat messages with AI-powered responses. Set reminders, daily briefings, price checks, news summaries, and more — all delivered directly in your chat.\n\n### Key Features\n- **Recurring schedules**: Daily, weekly, hourly, or custom cron expressions\n- **One-time reminders**: Set a specific date and time\n- **AI-powered responses**: Each alert triggers an AI response (e.g., news summary, price check)\n- **Email notifications**: Optional email alerts alongside chat messages\n- **Natural language**: Just describe what you want in plain English or Thai\n- **Timezone-aware**: Supports timezone configuration (default: Asia/Bangkok)\n\n## Quick Start\n\nSimply tell the chat what you want to be reminded about and when.\n\n**Examples**:\n- "Every day at 8 AM, find important global IT news and summarize"\n- "Remind me Feb 1 meeting with Company A at 10 AM"\n- "Every morning, check the gold price"\n\n## Input\n- Natural language description of the schedule and task\n\n## Output\n- Scheduled alert that triggers at the specified time\n- AI-generated response for each alert execution\n- Optional email notification	\N	\N	403395e28add9ff7b4117a955cd37c61	llm-only
6	translation	Translation	Translate text between English and your preferred language using a dedicated LLM model. Supports bidirectional translation with automatic language detection.	translation	1.0.0	SmartSpec	Languages	[]	skills/translation	f	["translate|translation","translate this|translate to English|translate to Thai"]	t	t	1.00	50	\N	\N	# Translation Skill\n\n## Purpose\nTranslate text between English and the user's preferred language using a dedicated LLM model configured in Settings > Preferences.\n\n## How It Works\n1. User sets their preferred translation language and dedicated LLM model in **Settings > Preferences > Translation**\n2. Translation detects if the input is English or another language\n3. English text is translated to the user's preferred language\n4. Non-English text is translated to English\n5. Credits are deducted based on actual token usage\n\n## Available In\n- **Media Studio**: Click the "Translate" button next to the prompt textarea to translate the current prompt\n- **Chat**: Right-click on any assistant message and select "Translate" to see an inline translation\n\n## Language Detection\nThe system uses a heuristic based on ASCII character ratio to determine if text is English:\n- If >70% of characters are ASCII letters/digits/spaces, it's treated as English\n- Otherwise, it's treated as the user's target language\n\n## Supported Languages\nThai, Chinese (Simplified & Traditional), Japanese, Korean, French, Spanish, German, Portuguese, Arabic, Russian, Hindi, Vietnamese, Indonesian, Italian, Dutch, Polish, Turkish, Swedish\n\n## Credit Cost\nCredits are calculated based on actual LLM token usage (input + output tokens) using the standard `calculateCreditsForLLM()` formula.	# Translation Skill\n\n## Purpose\nTranslate text between English and the user's preferred language using a dedicated LLM model configured in Settings > Preferences.\n\n## How It Works\n1. User sets their preferred translation language and dedicated LLM model in **Settings > Preferences > Translation**\n2. Translation detects if the input is English or another language\n3. English text is translated to the user's preferred language\n4. Non-English text is translated to English\n5. Credits are deducted based on actual token usage\n\n## Available In\n- **Media Studio**: Click the "Translate" button next to the prompt textarea to translate the current prompt\n- **Chat**: Right-click on any assistant message and select "Translate" to see an inline translation\n\n## Language Detection\nThe system uses a heuristic based on ASCII character ratio to determine if text is English:\n- If >70% of characters are ASCII letters/digits/spaces, it's treated as English\n- Otherwise, it's treated as the user's target language\n\n## Supported Languages\nThai, Chinese (Simplified & Traditional), Japanese, Korean, French, Spanish, German, Portuguese, Arabic, Russian, Hindi, Vietnamese, Indonesian, Italian, Dutch, Polish, Turkish, Swedish\n\n## Credit Cost\nCredits are calculated based on actual LLM token usage (input + output tokens) using the standard `calculateCreditsForLLM()` formula.	\N	{"requiresExplicit":true}	folder	\N	1	2026-01-30 13:28:35.513576+00	2026-01-30 13:28:35.513576+00	t	## Overview\n\nTranslation provides bidirectional translation between English and 18+ languages using a dedicated LLM model. It automatically detects the input language and translates accordingly.\n\n### Key Features\n- **Automatic language detection**: Detects whether input is English or another language\n- **18+ languages**: Thai, Chinese, Japanese, Korean, French, Spanish, German, and more\n- **Dedicated model**: Uses a separately configured LLM model for translation quality\n- **Integrated in UI**: Available in Media Studio (prompt translation) and Chat (message translation)\n\n## Quick Start\n\n- **Media Studio**: Click the "Translate" button next to the prompt textarea\n- **Chat**: Right-click on any assistant message and select "Translate"\n\nConfigure your preferred language and translation model in **Settings > Preferences > Translation**.\n\n## Input\n- Any text in English or a supported language\n\n## Output\n- Translated text in the opposite language (English ↔ your preferred language)	\N	\N	924e38e7c9c69f2c777cb031a529a699	llm-only
7	brainstorm	Brainstorm	Multi-model collaborative brainstorming with debate rounds and synthesis. Two LLM models take turns analyzing a topic from different perspectives, then produce a unified summary.	chat_assistant	1.0.0	SmartSpec	Lightbulb	[]	skills/brainstorm	f	["brainstorm|brainstorming","debate this|discuss this|analyze from multiple angles"]	t	t	1.00	40	\N	\N	# Brainstorm Skill\n\n## Purpose\nEnable collaborative brainstorming between two LLM models to explore topics from multiple perspectives and produce a synthesized best answer.\n\n## How It Works\n1. User toggles **Brainstorm Mode** in the Chat header\n2. User selects a **Model B** (brainstorm partner) alongside their primary Model A\n3. User sends a question or topic\n4. **Model A** provides initial analysis (Round 1)\n5. **Model B** offers alternative perspectives, challenges weak points (Round 1)\n6. Models continue debating for N rounds (default 3, max 6)\n7. **Model A** produces a final **Brainstorm Summary** synthesizing all insights\n\n## Skill-Aware Context\nWhen the user's question matches another skill (e.g., image prompt engineering, code documentation), the brainstorm system automatically injects that skill's knowledge base into the context for both models.\n\n## Visual Indicators\n- **Model A** messages: Blue left border + badge\n- **Model B** messages: Purple left border + badge\n- **Summary**: Green left border + badge\n- Each message shows the model name and round number\n\n## Credit Cost\nCredits are deducted for every model call:\n- 3 rounds = 6 debate calls + 1 summary = 7 total LLM calls\n- Each call uses standard `calculateCreditsForLLM()` based on actual token usage	# Brainstorm Skill\n\n## Purpose\nEnable collaborative brainstorming between two LLM models to explore topics from multiple perspectives and produce a synthesized best answer.\n\n## How It Works\n1. User toggles **Brainstorm Mode** in the Chat header\n2. User selects a **Model B** (brainstorm partner) alongside their primary Model A\n3. User sends a question or topic\n4. **Model A** provides initial analysis (Round 1)\n5. **Model B** offers alternative perspectives, challenges weak points (Round 1)\n6. Models continue debating for N rounds (default 3, max 6)\n7. **Model A** produces a final **Brainstorm Summary** synthesizing all insights\n\n## Skill-Aware Context\nWhen the user's question matches another skill (e.g., image prompt engineering, code documentation), the brainstorm system automatically injects that skill's knowledge base into the context for both models.\n\n## Visual Indicators\n- **Model A** messages: Blue left border + badge\n- **Model B** messages: Purple left border + badge\n- **Summary**: Green left border + badge\n- Each message shows the model name and round number\n\n## Credit Cost\nCredits are deducted for every model call:\n- 3 rounds = 6 debate calls + 1 summary = 7 total LLM calls\n- Each call uses standard `calculateCreditsForLLM()` based on actual token usage	\N	{"requiresExplicit":true,"maxRounds":3}	folder	\N	\N	2026-01-30 14:46:25.54048+00	2026-01-30 14:46:25.54048+00	t	## Overview\n\nBrainstorm enables multi-model collaborative brainstorming where two LLM models debate a topic from different perspectives, then produce a unified synthesis. Get deeper analysis by leveraging the strengths of multiple AI models.\n\n### Key Features\n- **Dual-model debate**: Two LLM models take turns analyzing your topic\n- **Multiple rounds**: Configurable debate rounds (default 3, max 6)\n- **Automatic synthesis**: Final summary combines the best insights from both models\n- **Skill-aware context**: Automatically injects relevant skill knowledge when applicable\n- **Visual indicators**: Color-coded messages for each model and the summary\n\n## Quick Start\n\n1. Toggle **Brainstorm Mode** in the Chat header\n2. Select a **Model B** as your brainstorm partner\n3. Ask your question or describe the topic to analyze\n\n## Input\n- A question, topic, or problem to analyze from multiple perspectives\n\n## Output\n- Round-by-round debate between Model A and Model B\n- Each model challenges and builds on the other's points\n- Final synthesized summary combining the best insights	\N	\N	e49503200d9ad15a28e350551b9c2687	llm-only
\.


--
-- Data for Name: storage_settings; Type: TABLE DATA; Schema: public; Owner: smartspec
--

COPY public.storage_settings (id, name, "displayName", description, "providerType", endpoint, region, bucket, "accessKeyIdEncrypted", "secretAccessKeyEncrypted", "hasCredentials", "publicUrlPrefix", "devTunnelUrl", "pathPrefix", "isActive", "configJson", "lastTestedAt", "lastTestResult", "createdAt", "updatedAt") FROM stdin;
1	Primary	Primar Storage R2	Storage for media	r2	https://f3fb0b6858e186fcc36be105bfa00243.r2.cloudflarestorage.com	auto	smartspec	e2c50f5c9b949909a8037cca38a30d31:b205f7c98666deb6135e7de083fbb3143aef0621beb6056d3929e7b600be36b3c8fa4077797528c2dac77b4e7118eb2e	df17d880f1c274f108f1262f5c71326a:c28424022f239b8d95bcf17e5aa5ea43c6fe3c69c944bed0aaf53c0140a91f33015215f51fed9ec86e9c716c4ce159d3cd33f35cc3ac0b9cf206a29f5d8080a76349063e633bb4ed725599feb925e107	t	https://smartspec.f3fb0b6858e186fcc36be105bfa00243.r2.dev	\N	uploads/	t	{"forcePathStyle":true}	\N	\N	2026-01-28 03:33:15.627716+00	2026-01-28 03:33:15.627716+00
\.


--
-- Data for Name: support_tickets; Type: TABLE DATA; Schema: public; Owner: smartspec
--

COPY public.support_tickets (id, ticket_number, user_id, subject, description, category, priority, status, assigned_to, created_at, updated_at, resolved_at, closed_at) FROM stdin;
\.


--
-- Data for Name: system_config; Type: TABLE DATA; Schema: public; Owner: smartspec
--

COPY public.system_config (key, value, description, updated_at) FROM stdin;
\.


--
-- Data for Name: system_settings; Type: TABLE DATA; Schema: public; Owner: smartspec
--

COPY public.system_settings (id, category, key, value, "valueJson", "isSensitive", description, "updatedBy", "createdAt", "updatedAt") FROM stdin;
1	context7	api_key_user_1	ctx7sk-ffb811f7-a4a5-44ec-8f78-b4d5afc80483	\N	t	Context7 API Key (per-user)	1	2026-01-29 05:13:11.406054+00	2026-01-29 05:13:11.406054+00
2	smtp	host	smtp.gmail.com	\N	f	\N	1	2026-02-01 02:31:27.405647+00	2026-02-01 02:35:17.719+00
3	smtp	port	465	\N	f	\N	1	2026-02-01 02:31:27.416217+00	2026-02-01 02:35:17.724+00
4	smtp	secure	true	\N	f	\N	1	2026-02-01 02:31:27.421527+00	2026-02-01 02:35:17.728+00
5	smtp	user	naibarndotcom@gmail.com	\N	f	\N	1	2026-02-01 02:31:27.425649+00	2026-02-01 02:35:17.731+00
6	smtp	from_name	Smart AI Hub	\N	f	\N	1	2026-02-01 02:31:27.429183+00	2026-02-01 02:35:17.734+00
7	smtp	from_email	naibarndotcom@gmail.com	\N	f	\N	1	2026-02-01 02:31:27.431935+00	2026-02-01 02:35:17.738+00
8	smtp	pass	c9dcd4ebb06d4b6d07795111:58917a08aa3126b0f73cf269ab8c31ad:d9a19b7e9496865bb02720403d1da37b972438	\N	t	\N	1	2026-02-01 02:31:27.434931+00	2026-02-01 02:35:17.74+00
\.


--
-- Data for Name: template_purchases; Type: TABLE DATA; Schema: public; Owner: smartspec
--

COPY public.template_purchases (id, template_id, buyer_id, price_paid_credits, creator_revenue, platform_commission, buyer_balance_before, buyer_balance_after, download_count, last_downloaded_at, template_version, purchased_at) FROM stdin;
\.


--
-- Data for Name: template_revenue_ledger; Type: TABLE DATA; Schema: public; Owner: smartspec
--

COPY public.template_revenue_ledger (id, purchase_id, template_id, buyer_id, creator_id, total_credits, creator_credits, platform_credits, recorded_at) FROM stdin;
\.


--
-- Data for Name: template_reviews; Type: TABLE DATA; Schema: public; Owner: smartspec
--

COPY public.template_reviews (id, template_id, reviewer_id, purchase_id, rating, title, review_text, helpful_count, is_verified_purchase, is_hidden, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: tenant_pages; Type: TABLE DATA; Schema: public; Owner: smartspec
--

COPY public.tenant_pages (id, "tenantId", "pageKey", title, slug, content, sections, metadata, "isPublished", "sortOrder", "showInMenu", "createdAt", "updatedAt") FROM stdin;
1	tenant-ZCSKEM9s	home	Home Page	home	<section class="hero">\n  <h1>Welcome to Smart AI Hub</h1>\n  <p>Build amazing things with our powerful AI tools. Generate images, videos, and more with cutting-edge models.</p>\n  <a href="/signup">Get Started Free</a>\n</section>\n\n<section class="features">\n  <h2>Why Choose Smart AI Hub?</h2>\n  <div class="feature-grid">\n    <div class="feature">\n      <h3>AI-Powered Generation</h3>\n      <p>Access the latest AI models for image, video, and audio generation.</p>\n    </div>\n    <div class="feature">\n      <h3>Enterprise Security</h3>\n      <p>Bank-grade encryption and comprehensive audit logs for your peace of mind.</p>\n    </div>\n    <div class="feature">\n      <h3>Easy Integration</h3>\n      <p>Simple API and SDK to integrate AI capabilities into your workflow.</p>\n    </div>\n  </div>\n</section>\n\n<section class="cta">\n  <h2>Ready to Get Started?</h2>\n  <p>Join thousands of creators using Smart AI Hub to bring their ideas to life.</p>\n  <a href="/signup">Create Free Account</a>\n</section>	\N	\N	t	0	t	2026-01-29 01:08:16.64115+00	2026-01-29 01:08:16.64115+00
3	tenant-ZCSKEM9s	features	Features	features	<section class="features-hero">\n  <h1>Features</h1>\n  <p>Everything you need to create stunning AI-generated content.</p>\n</section>\n\n<section class="feature-list">\n  <div class="feature-item">\n    <h3>Image Generation</h3>\n    <p>Create photorealistic images, illustrations, and artwork from text descriptions using models like FLUX, Nano Banana, and more.</p>\n  </div>\n  <div class="feature-item">\n    <h3>Video Generation</h3>\n    <p>Generate high-quality videos with models like Wan 2.6, Kling, Runway, and Veo 3.1.</p>\n  </div>\n  <div class="feature-item">\n    <h3>Music Generation</h3>\n    <p>Create original music tracks with Suno AI in any genre or style.</p>\n  </div>\n  <div class="feature-item">\n    <h3>Multi-Tenant Platform</h3>\n    <p>White-label solution with custom branding, themes, and domain support.</p>\n  </div>\n</section>	\N	\N	t	2	t	2026-01-29 01:08:16.64115+00	2026-01-29 01:08:16.64115+00
5	tenant-ZCSKEM9s	contact	Contact	contact	<section class="contact-hero">\n  <h1>Contact Us</h1>\n  <p>Have questions? We would love to hear from you.</p>\n</section>\n\n<section class="contact-info">\n  <div><h3>Email</h3><p>support@smartaihub.app</p></div>\n  <div><h3>Response Time</h3><p>We typically respond within 24 hours.</p></div>\n</section>	\N	\N	t	4	t	2026-01-29 01:08:16.64115+00	2026-01-29 01:08:16.64115+00
6	tenant-001	home	Home Page	home	<section class="hero">\n  <h1>Transform Ideas into <span class="gradient-text">Production-Ready</span> Applications</h1>\n  <p>SmartSpec Pro uses cutting-edge AI to generate clean, scalable code from natural language descriptions. Build SaaS applications 10x faster.</p>\n  <div class="stats">\n    <span>10K+ Developers</span> | <span>500K+ Lines Generated</span> | <span>99.9% Uptime</span> | <span>4.9/5 Rating</span>\n  </div>\n  <a href="/signup">Start Building Free</a>\n</section>\n\n<section class="features">\n  <h2>Everything You Need to Build Faster</h2>\n  <p>From code generation to deployment, SmartSpec Pro provides all the tools you need to accelerate your development workflow.</p>\n  <div class="feature-grid">\n    <div class="feature">\n      <h3>AI Code Generation</h3>\n      <p>Transform natural language into production-ready code with our advanced AI models.</p>\n    </div>\n    <div class="feature">\n      <h3>Workflow Automation</h3>\n      <p>Automate repetitive tasks and streamline your development workflow.</p>\n    </div>\n    <div class="feature">\n      <h3>Enterprise Security</h3>\n      <p>Bank-grade encryption, MFA, and comprehensive audit logs for your peace of mind.</p>\n    </div>\n  </div>\n</section>\n\n<section class="how-it-works">\n  <h2>How It Works</h2>\n  <div class="steps">\n    <div><h3>01 - Describe Your Idea</h3><p>Simply describe what you want to build in natural language. Our AI understands context and requirements.</p></div>\n    <div><h3>02 - AI Generates Code</h3><p>SmartSpec analyzes your requirements and generates clean, production-ready code with best practices.</p></div>\n    <div><h3>03 - Deploy &amp; Scale</h3><p>Review, customize, and deploy your application. Scale effortlessly with our cloud infrastructure.</p></div>\n  </div>\n</section>\n\n<section class="testimonials">\n  <h2>Loved by Developers</h2>\n  <div class="testimonial-grid">\n    <blockquote>\n      <p>SmartSpec Pro has completely transformed how we build applications. What used to take weeks now takes days.</p>\n      <cite>Sarah Chen, CTO at TechStart</cite>\n    </blockquote>\n    <blockquote>\n      <p>The AI code generation is incredibly accurate. It understands context and produces clean, maintainable code.</p>\n      <cite>Michael Park, Senior Developer</cite>\n    </blockquote>\n    <blockquote>\n      <p>Finally, a tool that actually delivers on its promises. The ROI has been phenomenal for our team.</p>\n      <cite>Emily Rodriguez, Engineering Lead</cite>\n    </blockquote>\n  </div>\n</section>\n\n<section class="cta">\n  <h2>Ready to Build Something Amazing?</h2>\n  <p>Join thousands of developers who are already building faster with SmartSpec Pro. Start your free trial today.</p>\n  <a href="/signup">Get Started Free</a> | <a href="/pricing">View Pricing</a>\n</section>	\N	\N	t	0	t	2026-01-29 01:08:16.64115+00	2026-01-29 01:08:16.64115+00
7	tenant-001	features	Features	features	<section class="features-hero">\n  <h1>Everything You Need to <span class="gradient-text">Build Faster</span></h1>\n  <p>SmartSpec Pro combines cutting-edge AI with developer-friendly tools to supercharge your productivity.</p>\n</section>\n\n<section class="main-features">\n  <div class="feature-detail">\n    <h2>AI Code Generation</h2>\n    <p>Transform natural language descriptions into clean, production-ready code. Our AI understands context, follows best practices, and generates code that actually works.</p>\n    <ul>\n      <li>Support for 20+ programming languages</li>\n      <li>Framework-aware code generation</li>\n      <li>Automatic error handling</li>\n      <li>Clean, documented code output</li>\n    </ul>\n  </div>\n  <div class="feature-detail">\n    <h2>Workflow Automation</h2>\n    <p>Automate repetitive development tasks with intelligent workflows. From code reviews to deployment, let AI handle the mundane while you focus on innovation.</p>\n    <ul>\n      <li>Custom workflow templates</li>\n      <li>CI/CD integration</li>\n      <li>Automated testing</li>\n      <li>Smart task scheduling</li>\n    </ul>\n  </div>\n  <div class="feature-detail">\n    <h2>Enterprise Security</h2>\n    <p>Bank-grade security for your code and data. Multi-factor authentication, encrypted storage, and comprehensive audit logs keep your projects safe.</p>\n    <ul>\n      <li>End-to-end encryption</li>\n      <li>MFA with TOTP support</li>\n      <li>Role-based access control</li>\n      <li>SOC 2 compliance ready</li>\n    </ul>\n  </div>\n</section>\n\n<section class="additional-features">\n  <h2>Packed with Powerful Tools</h2>\n  <div class="feature-grid">\n    <div><h3>Image Generation</h3><p>Generate stunning visuals for your applications with AI-powered image creation.</p></div>\n    <div><h3>Video Generation</h3><p>Create promotional videos, tutorials, and demos with automated video generation.</p></div>\n    <div><h3>Audio &amp; Speech</h3><p>Text-to-speech and audio generation for podcasts, voiceovers, and more.</p></div>\n    <div><h3>Smart Database</h3><p>AI-assisted database design with automatic schema optimization.</p></div>\n    <div><h3>Secure Key Management</h3><p>Enterprise-grade API key management with rotation and audit trails.</p></div>\n    <div><h3>Team Collaboration</h3><p>Real-time collaboration features for teams of any size.</p></div>\n    <div><h3>Memory System</h3><p>AI remembers your preferences and project context for better suggestions.</p></div>\n    <div><h3>Multi-language Support</h3><p>Generate code in 20+ programming languages and frameworks.</p></div>\n    <div><h3>Multiple AI Models</h3><p>Access to GPT-4, Claude, Gemini, and other cutting-edge models.</p></div>\n  </div>\n</section>\n\n<section class="integrations">\n  <h2>Works with Your Favorite Tools</h2>\n  <p>Seamlessly integrate with GitHub, GitLab, VS Code, Slack, Jira, Notion, Discord, and Vercel.</p>\n</section>\n\n<section class="cta">\n  <h2>Ready to Experience the Future of Development?</h2>\n  <p>Join thousands of developers who are already building faster with SmartSpec Pro.</p>\n  <a href="/signup">Start Free Trial</a> | <a href="/docs">Read Documentation</a>\n</section>	\N	\N	t	2	t	2026-01-29 01:08:16.64115+00	2026-01-29 01:08:16.64115+00
4	tenant-ZCSKEM9s	pricing	Pricing	pricing	<section class="pricing-hero">\n  <h1>Pricing</h1>\n  <p>Flexible plans for every creator. Start free and scale as you grow.\nYou can create photorealistic images, illustrations, and artwork from text descriptions using models like FLUX, Nano Banana, and more.</p>\n</section>\n\n<section class="pricing-info">\n  <p>Visit our <a href="/pricing">pricing page</a> for current plans and credit packages.</p>\n  <p>All plans include access to our full model library, API access, and dedicated support for create photorealistic images, illustrations, and artwork from text descriptions using models like FLUX, Nano Banana, and more.</p>\n</section>	\N	\N	t	3	t	2026-01-29 01:08:16.64115+00	2026-01-29 02:54:08.816+00
8	tenant-001	contact	Contact	contact	<section class="contact-hero">\n  <h1>Get in <span class="gradient-text">Touch</span></h1>\n  <p>Have questions about SmartSpec Pro? Our team is here to help you build amazing applications faster.</p>\n</section>\n\n<section class="contact-info">\n  <div class="info-grid">\n    <div><h3>Email</h3><p>support@smartspec.pro</p></div>\n    <div><h3>Phone</h3><p>+1 (555) 123-4567</p></div>\n    <div><h3>Office</h3><p>San Francisco, CA</p></div>\n    <div><h3>Response Time</h3><p>Within 24 hours</p></div>\n  </div>\n</section>\n\n<section class="contact-types">\n  <h2>How can we help?</h2>\n  <ul>\n    <li><strong>General Inquiry</strong> - Questions about SmartSpec Pro</li>\n    <li><strong>Technical Support</strong> - Help with your account or features</li>\n    <li><strong>Sales &amp; Enterprise</strong> - Pricing, plans, and enterprise solutions</li>\n    <li><strong>Report a Bug</strong> - Found something not working?</li>\n    <li><strong>Feature Request</strong> - Suggest new features or improvements</li>\n  </ul>\n</section>\n\n<section class="faq">\n  <h2>Frequently Asked Questions</h2>\n  <div class="faq-list">\n    <div><h3>How quickly will I receive a response?</h3><p>We typically respond to all inquiries within 24 hours during business days. For urgent technical issues, Pro and Enterprise customers receive priority support.</p></div>\n    <div><h3>Do you offer phone support?</h3><p>Phone support is available for Enterprise customers. All other plans have access to email and chat support.</p></div>\n    <div><h3>Can I schedule a demo?</h3><p>Yes! Select Sales &amp; Enterprise from the contact options and mention you would like a demo.</p></div>\n    <div><h3>Where can I find documentation?</h3><p>Visit our <a href="/docs">Docs page</a> for comprehensive guides, API references, and tutorials.</p></div>\n  </div>\n</section>	\N	\N	t	4	t	2026-01-29 01:08:16.64115+00	2026-01-29 01:08:16.64115+00
9	tenant-ZCSKEM9s	docs-intro	Docs: Introduction	docs-intro	<section class="doc-content">\n  <h1>Welcome to Smart AI Hub</h1>\n  <p>Smart AI Hub is your all-in-one AI creative platform. Generate stunning images, videos, music, and more with cutting-edge AI models — all from a single dashboard.</p>\n  <h3>What You Can Do</h3>\n  <ul>\n    <li><strong>Create Images</strong> — Generate photorealistic images, illustrations, and artwork using FLUX, Nano Banana, and other top models.</li>\n    <li><strong>Produce Videos</strong> — Create high-quality videos with Wan 2.6, Kling, Runway, and Veo 3.1.</li>\n    <li><strong>Generate Music</strong> — Compose original tracks with Suno AI in any genre.</li>\n    <li><strong>Generate Code</strong> — Transform ideas into production-ready code with AI assistance.</li>\n    <li><strong>Text-to-Speech</strong> — Convert text to natural-sounding speech in multiple languages.</li>\n  </ul>\n  <h3>Getting Started</h3>\n  <p>Create your free account, grab some credits, and start creating. Check the <a href="/docs/quickstart">Quick Start</a> guide for step-by-step instructions.</p>\n</section>	\N	\N	t	10	t	2026-01-29 03:25:54.417777+00	2026-01-29 03:25:54.417777+00
10	tenant-ZCSKEM9s	docs-quickstart	Docs: Quick Start	docs-quickstart	<section class="doc-content">\n  <h1>Quick Start — Smart AI Hub</h1>\n  <p>Start creating AI-generated content in minutes.</p>\n  <h3>Step 1: Create Your Account</h3>\n  <p>Sign up at <a href="/signup">Smart AI Hub</a>. New accounts receive free credits to explore the platform.</p>\n  <h3>Step 2: Choose Your Tool</h3>\n  <p>From the dashboard, select <strong>Media Studio</strong> to access image, video, and audio generation tools.</p>\n  <h3>Step 3: Generate Your First Image</h3>\n  <p>Select an image model (e.g., FLUX Pro), type a descriptive prompt like "a futuristic cityscape at sunset, photorealistic", and click Generate.</p>\n  <h3>Step 4: Explore More</h3>\n  <ul>\n    <li>Try <strong>Video Generation</strong> with Wan 2.6 or Kling</li>\n    <li>Create <strong>Music</strong> with Suno AI</li>\n    <li>Use the <strong>API</strong> for programmatic access</li>\n  </ul>\n</section>	\N	\N	t	11	t	2026-01-29 03:25:54.434988+00	2026-01-29 03:25:54.434988+00
11	tenant-ZCSKEM9s	docs-concepts	Docs: Core Concepts	docs-concepts	<section class="doc-content">\n  <h1>Core Concepts</h1>\n  <h3>Credits</h3>\n  <p>Credits are the currency of Smart AI Hub. Each AI generation consumes credits based on the model and output quality. Purchase credit packages or subscribe to a plan for the best value.</p>\n  <h3>Models</h3>\n  <p>We offer a curated selection of AI models for different creative tasks — image generators like FLUX and Stable Diffusion, video models like Wan 2.6 and Kling, music with Suno AI, and more.</p>\n  <h3>Prompts</h3>\n  <p>The quality of your output depends on your prompt. Be specific about style, mood, composition, and technical details. Use the prompt guide in each tool for tips.</p>\n  <h3>Media Studio</h3>\n  <p>The unified workspace where you access all AI generation tools. Switch between image, video, audio, and code generation from a single interface.</p>\n  <h3>Gallery</h3>\n  <p>All your generated content is saved to your gallery. Browse, download, share, or use outputs as inputs for further generation.</p>\n</section>	\N	\N	t	12	t	2026-01-29 03:25:54.441157+00	2026-01-29 03:25:54.441157+00
12	tenant-ZCSKEM9s	docs-auth	Docs: Authentication	docs-auth	<section class="doc-content">\n  <h1>Authentication</h1>\n  <h3>API Keys</h3>\n  <p>Generate API keys from <strong>Settings → API Keys</strong> in your dashboard. Use these for programmatic access to all Smart AI Hub services.</p>\n  <ul>\n    <li>Keep API keys secret — never expose them in client-side code</li>\n    <li>Use environment variables to store keys securely</li>\n    <li>Create separate keys for development and production</li>\n  </ul>\n  <h3>OAuth Sign-In</h3>\n  <p>Sign in quickly with Google, GitHub, or other supported providers. No password needed.</p>\n  <h3>Multi-Factor Authentication</h3>\n  <p>Enable MFA in your account settings for an extra layer of security. We support TOTP authenticator apps like Google Authenticator and Authy.</p>\n  <h3>Session Security</h3>\n  <p>Sessions are managed via secure HTTP-only cookies with automatic expiration. Review active sessions in your security settings.</p>\n</section>	\N	\N	t	13	t	2026-01-29 03:25:54.447743+00	2026-01-29 03:25:54.447743+00
13	tenant-ZCSKEM9s	docs-code-generation	Docs: Code Generation	docs-code-generation	<section class="doc-content">\n  <h1>Code Generation</h1>\n  <p>Smart AI Hub includes powerful code generation capabilities powered by leading AI models.</p>\n  <h3>How It Works</h3>\n  <p>Describe what you want to build in natural language. The AI generates complete, functional code with proper error handling, types, and documentation.</p>\n  <h3>Supported Languages</h3>\n  <ul>\n    <li>TypeScript / JavaScript</li>\n    <li>Python</li>\n    <li>Go, Rust, Java, and more</li>\n  </ul>\n  <h3>Use Cases</h3>\n  <ul>\n    <li>Generate REST APIs and microservices</li>\n    <li>Create React/Vue/Angular components</li>\n    <li>Write database schemas and migrations</li>\n    <li>Build automation scripts</li>\n  </ul>\n  <h3>Tips</h3>\n  <p>Be specific about requirements, specify frameworks and versions, and always review generated code before deploying to production.</p>\n</section>	\N	\N	t	14	t	2026-01-29 03:25:54.452916+00	2026-01-29 03:25:54.452916+00
14	tenant-ZCSKEM9s	docs-image-generation	Docs: Image Generation	docs-image-generation	<section class="doc-content">\n  <h1>Image Generation</h1>\n  <p>Create stunning images from text descriptions using our curated collection of AI models.</p>\n  <h3>Available Models</h3>\n  <ul>\n    <li><strong>FLUX Pro</strong> — State-of-the-art photorealistic and artistic image generation</li>\n    <li><strong>FLUX Schnell</strong> — Fast generation for quick iterations</li>\n    <li><strong>Nano Banana</strong> — Specialized creative model</li>\n    <li><strong>Stable Diffusion XL</strong> — Versatile generation with fine control</li>\n  </ul>\n  <h3>Prompt Guide</h3>\n  <ul>\n    <li>Be descriptive — include details about style, lighting, composition, and mood</li>\n    <li>Use style references like "photorealistic", "digital art", "oil painting", "anime"</li>\n    <li>Specify aspect ratios: portrait (2:3), landscape (16:9), square (1:1)</li>\n    <li>Use negative prompts to exclude unwanted elements</li>\n  </ul>\n  <h3>Advanced Features</h3>\n  <p>Use image-to-image for variations, inpainting for targeted edits, and upscaling for higher resolution outputs.</p>\n</section>	\N	\N	t	15	t	2026-01-29 03:25:54.458757+00	2026-01-29 03:25:54.458757+00
15	tenant-ZCSKEM9s	docs-video-generation	Docs: Video Generation	docs-video-generation	<section class="doc-content">\n  <h1>Video Generation</h1>\n  <p>Create professional-quality videos with AI — from short clips to creative productions.</p>\n  <h3>Available Models</h3>\n  <ul>\n    <li><strong>Wan 2.6</strong> — Text-to-video and image-to-video with excellent quality</li>\n    <li><strong>Kling</strong> — High-fidelity video generation with consistent motion</li>\n    <li><strong>Runway Gen-3</strong> — Creative video with advanced style control</li>\n    <li><strong>Veo 3.1</strong> — Google's latest video generation model</li>\n  </ul>\n  <h3>Use Cases</h3>\n  <ul>\n    <li>Social media content and reels</li>\n    <li>Marketing and promotional videos</li>\n    <li>Product demonstrations</li>\n    <li>Creative storytelling and animations</li>\n  </ul>\n  <h3>Tips</h3>\n  <p>Start with 3-5 second clips to iterate on prompts. Use image-to-video for more control over the starting frame. Describe motion and camera angles in your prompt.</p>\n</section>	\N	\N	t	16	t	2026-01-29 03:25:54.463698+00	2026-01-29 03:25:54.463698+00
16	tenant-ZCSKEM9s	docs-audio	Docs: Audio & Speech	docs-audio	<section class="doc-content">\n  <h1>Audio & Speech</h1>\n  <p>Generate speech, music, and sound effects with Smart AI Hub audio tools.</p>\n  <h3>Text-to-Speech</h3>\n  <p>Convert text to natural-sounding speech in multiple languages and voices. Customize tone, speed, and emphasis for the perfect narration.</p>\n  <h3>Music Generation with Suno AI</h3>\n  <p>Create original music tracks by describing the genre, mood, instruments, and style. Suno AI generates full songs with vocals and instrumentals.</p>\n  <h3>Tips for Music</h3>\n  <ul>\n    <li>Specify genre: pop, jazz, electronic, orchestral, lo-fi, etc.</li>\n    <li>Describe mood: upbeat, melancholic, energetic, calm</li>\n    <li>Mention instruments: piano, guitar, synth, drums</li>\n    <li>Set duration constraints for your needs</li>\n  </ul>\n  <h3>Use Cases</h3>\n  <ul>\n    <li>Background music for videos</li>\n    <li>Podcast intros and outros</li>\n    <li>Voice-over narration</li>\n    <li>Sound effects for content</li>\n  </ul>\n</section>	\N	\N	t	17	t	2026-01-29 03:25:54.468869+00	2026-01-29 03:25:54.468869+00
17	tenant-ZCSKEM9s	docs-security-best-practices	Docs: Security Best Practices	docs-security-best-practices	<section class="doc-content">\n  <h1>Security Best Practices</h1>\n  <p>Keep your Smart AI Hub account and API access secure by following these guidelines.</p>\n  <h3>API Key Security</h3>\n  <ul>\n    <li>Never hardcode API keys in source code or commit them to repositories</li>\n    <li>Use environment variables or secret managers (AWS Secrets Manager, Vault)</li>\n    <li>Rotate keys periodically — at least every 90 days</li>\n    <li>Use separate keys for development and production environments</li>\n    <li>Set IP allowlists when possible</li>\n  </ul>\n  <h3>Account Security</h3>\n  <ul>\n    <li>Enable Multi-Factor Authentication (MFA) immediately after signup</li>\n    <li>Use a strong, unique password (16+ characters recommended)</li>\n    <li>Review login history and active sessions regularly</li>\n    <li>Revoke access for unused OAuth integrations</li>\n  </ul>\n  <h3>Data Protection</h3>\n  <ul>\n    <li>All data encrypted in transit (TLS 1.3) and at rest (AES-256)</li>\n    <li>Generated content is accessible only by your account</li>\n    <li>We do not use your content to train models without explicit consent</li>\n    <li>You can delete your data at any time from account settings</li>\n  </ul>\n  <h3>Audit Logs</h3>\n  <p>Monitor all API and account activity through the audit log in your dashboard. Track access patterns and detect anomalies early.</p>\n</section>	\N	\N	t	18	t	2026-01-29 03:25:54.47497+00	2026-01-29 03:25:54.47497+00
2	tenant-ZCSKEM9s	about	About Us	about	<section class="doc-content">\n  <h1>About Smart AI Hub</h1>\n  <p>Smart AI Hub is your all-in-one AI creative platform, providing cutting-edge tools for image generation, video creation, music composition, and code generation.</p>\n\n  <h2>Our Mission</h2>\n  <p>We're on a mission to make AI-powered creative tools accessible to everyone. Our platform curates the best AI models — from FLUX and Stable Diffusion for images, to Wan 2.6 and Kling for video, to Suno AI for music — all in a single, easy-to-use dashboard.</p>\n\n  <h2>What Makes Us Different</h2>\n  <ul>\n    <li><strong>Curated AI Models</strong> — We hand-pick the best models for each creative task</li>\n    <li><strong>Unified Platform</strong> — One dashboard for images, videos, audio, and code</li>\n    <li><strong>Credit-Based Pricing</strong> — Pay only for what you use, no monthly minimums required</li>\n    <li><strong>Enterprise Security</strong> — Bank-grade encryption, MFA, and comprehensive audit logs</li>\n    <li><strong>API Access</strong> — Integrate AI generation into your own applications</li>\n  </ul>\n\n  <h2>Our Values</h2>\n  <h3>Innovation</h3>\n  <p>We continuously integrate the latest AI models and techniques, ensuring our users always have access to state-of-the-art creative tools.</p>\n\n  <h3>Accessibility</h3>\n  <p>We design our tools for everyone — from first-time creators to professional studios. No AI expertise required.</p>\n\n  <h3>Quality</h3>\n  <p>Every model on our platform is tested and optimized for the best possible output quality.</p>\n\n  <h2>Contact Us</h2>\n  <p>Have questions or want to learn more? Visit our <a href="/contact">contact page</a>.</p>\n</section>	\N	\N	t	1	t	2026-01-29 01:08:16.64115+00	2026-01-29 03:40:39.833+00
18	tenant-ZCSKEM9s	changelog	Changelog	changelog	<section class="doc-content">\n  <h1>Smart AI Hub Changelog</h1>\n  <p>Stay up to date with the latest features and improvements.</p>\n\n  <h2>January 2026</h2>\n  <ul>\n    <li><strong>Documentation Hub</strong> — Comprehensive docs covering all platform features</li>\n    <li><strong>Theme Presets</strong> — One-click theme customization for domain admins</li>\n    <li><strong>Content Editor</strong> — Improved editing experience with instant preview</li>\n  </ul>\n\n  <h2>December 2025</h2>\n  <ul>\n    <li><strong>Media Studio</strong> — Unified workspace for all AI generation tools</li>\n    <li><strong>Multi-Tenant System</strong> — Custom domains, branding, and user management</li>\n    <li><strong>Skill Auto-Sync</strong> — Automatic detection of available media generation capabilities</li>\n  </ul>\n\n  <h2>November 2025</h2>\n  <ul>\n    <li><strong>Flexible Pricing</strong> — Subscription, agency, and one-time credit packages</li>\n    <li><strong>New Video Models</strong> — Added Wan 2.6, Kling, and Veo 3.1 support</li>\n    <li><strong>Gallery System</strong> — Share and discover AI-generated content</li>\n    <li><strong>Suno AI Integration</strong> — Full music generation with vocals and instruments</li>\n  </ul>\n\n  <p>Follow our <a href="/blog">blog</a> for detailed release notes.</p>\n</section>	\N	\N	t	20	t	2026-01-29 03:40:39.842316+00	2026-01-29 03:40:39.842316+00
19	tenant-ZCSKEM9s	careers	Careers	careers	<section class="doc-content">\n  <h1>Careers at Smart AI Hub</h1>\n  <p>We're building the future of AI-powered creative tools. Join us!</p>\n\n  <h2>Why Smart AI Hub?</h2>\n  <ul>\n    <li><strong>Cutting-Edge AI</strong> — Work with the latest generative AI models</li>\n    <li><strong>Real Impact</strong> — Your work helps thousands of creators worldwide</li>\n    <li><strong>Growth</strong> — Continuous learning and career development</li>\n    <li><strong>Remote-Friendly</strong> — Flexible working hours and locations</li>\n  </ul>\n\n  <h2>Open Positions</h2>\n  <h3>Engineering</h3>\n  <ul>\n    <li><strong>Senior Full-Stack Engineer</strong> — TypeScript, React, Node.js</li>\n    <li><strong>ML/AI Engineer</strong> — Model integration, inference optimization</li>\n    <li><strong>DevOps Engineer</strong> — Kubernetes, Docker, cloud infrastructure</li>\n  </ul>\n\n  <h3>Design & Product</h3>\n  <ul>\n    <li><strong>Senior Product Designer</strong> — UI/UX for AI tools</li>\n    <li><strong>Product Manager</strong> — AI products, user research</li>\n  </ul>\n\n  <h2>Apply</h2>\n  <p>Send your resume via our <a href="/contact">contact page</a>. Tell us what excites you about AI creativity!</p>\n</section>	\N	\N	t	21	t	2026-01-29 03:40:39.847974+00	2026-01-29 03:40:39.847974+00
20	tenant-ZCSKEM9s	community	Community	community	<section class="doc-content">\n  <h1>Smart AI Hub Community</h1>\n  <p>Join a growing community of AI creators, artists, and developers.</p>\n\n  <h2>Get Involved</h2>\n  <h3>Gallery</h3>\n  <p>Browse and share AI-generated images, videos, and more in our <a href="/gallery">public gallery</a>. Get inspired and showcase your best work.</p>\n\n  <h3>Learn & Share</h3>\n  <ul>\n    <li>Share prompt engineering tips and techniques</li>\n    <li>Discover new creative workflows</li>\n    <li>Get feedback on your AI-generated content</li>\n  </ul>\n\n  <h2>Community Guidelines</h2>\n  <ul>\n    <li><strong>Be Respectful</strong> — Treat everyone with kindness</li>\n    <li><strong>Share Knowledge</strong> — Help others learn and grow</li>\n    <li><strong>Create Responsibly</strong> — Follow content policies</li>\n  </ul>\n</section>	\N	\N	t	22	t	2026-01-29 03:40:39.852486+00	2026-01-29 03:40:39.852486+00
21	tenant-ZCSKEM9s	support	Support	support	<section class="doc-content">\n  <h1>Smart AI Hub Support</h1>\n  <p>We're here to help you get the most out of the platform.</p>\n\n  <h2>Support Options</h2>\n  <h3>Documentation</h3>\n  <p>Start with our <a href="/docs">comprehensive docs</a> for quick answers on all features.</p>\n\n  <h3>Contact Us</h3>\n  <p><a href="/contact">Contact our team</a> for personalized support. We respond within 24 hours.</p>\n\n  <h2>Common Topics</h2>\n  <ul>\n    <li><strong>Account & Billing</strong> — Manage subscriptions and credits in Settings</li>\n    <li><strong>API Access</strong> — Generate keys at Settings → API Keys</li>\n    <li><strong>Image Generation</strong> — See <a href="/docs/image-generation">Image Generation docs</a></li>\n    <li><strong>Video Generation</strong> — See <a href="/docs/video-generation">Video Generation docs</a></li>\n    <li><strong>Music with Suno AI</strong> — See <a href="/docs/audio">Audio docs</a></li>\n  </ul>\n\n  <h2>System Status</h2>\n  <p>Check our <a href="/status">status page</a> for real-time platform health.</p>\n</section>	\N	\N	t	23	t	2026-01-29 03:40:39.855967+00	2026-01-29 03:40:39.855967+00
22	tenant-ZCSKEM9s	status	System Status	status	<section class="doc-content">\n  <h1>Smart AI Hub — System Status</h1>\n  <p>All systems are currently <strong>operational</strong>.</p>\n\n  <h3>Services</h3>\n  <ul>\n    <li><strong>Web Application</strong> — Operational</li>\n    <li><strong>API</strong> — Operational</li>\n    <li><strong>Image Generation (FLUX, SD)</strong> — Operational</li>\n    <li><strong>Video Generation (Wan 2.6, Kling)</strong> — Operational</li>\n    <li><strong>Music Generation (Suno AI)</strong> — Operational</li>\n    <li><strong>Authentication</strong> — Operational</li>\n  </ul>\n\n  <h2>Uptime</h2>\n  <p>We maintain 99.9% uptime across all services.</p>\n\n  <h2>Report an Issue</h2>\n  <p>Experiencing problems? <a href="/contact">Contact support</a> immediately.</p>\n</section>	\N	\N	t	24	t	2026-01-29 03:40:39.859347+00	2026-01-29 03:40:39.859347+00
23	tenant-ZCSKEM9s	security	Security	security	<section class="doc-content">\n  <h1>Security at Smart AI Hub</h1>\n  <p>Your data and creations are protected with enterprise-grade security measures.</p>\n\n  <h2>Data Protection</h2>\n  <ul>\n    <li><strong>Encryption in Transit</strong> — TLS 1.3 for all connections</li>\n    <li><strong>Encryption at Rest</strong> — AES-256 for stored data</li>\n    <li><strong>Data Ownership</strong> — Your content belongs to you</li>\n    <li><strong>No Training</strong> — We don't use your content to train models without consent</li>\n  </ul>\n\n  <h2>Authentication & Access</h2>\n  <ul>\n    <li>Multi-Factor Authentication (MFA) with TOTP</li>\n    <li>OAuth sign-in (Google, GitHub)</li>\n    <li>Secure session management</li>\n    <li>Role-based access control</li>\n  </ul>\n\n  <h2>Infrastructure</h2>\n  <ul>\n    <li>Enterprise-grade cloud hosting</li>\n    <li>DDoS protection and rate limiting</li>\n    <li>Regular security audits</li>\n    <li>Automated vulnerability scanning</li>\n  </ul>\n\n  <h2>Reporting Vulnerabilities</h2>\n  <p>Found a security issue? Report it through our <a href="/contact">contact page</a>.</p>\n\n  <p>For detailed guidelines, see <a href="/docs/security/best-practices">Security Best Practices</a>.</p>\n</section>	\N	\N	t	25	t	2026-01-29 03:40:39.863436+00	2026-01-29 03:40:39.863436+00
\.


--
-- Data for Name: tenant_users; Type: TABLE DATA; Schema: public; Owner: smartspec
--

COPY public.tenant_users (id, tenant_id, user_id, role, is_active, joined_at, last_active_at) FROM stdin;
\.


--
-- Data for Name: tenants; Type: TABLE DATA; Schema: public; Owner: smartspec
--

COPY public.tenants (id, name, slug, status, plan, owner_id, owner_email, settings, max_users, max_projects, max_storage_gb, max_api_calls_per_month, current_users, current_projects, current_storage_gb, current_api_calls, billing_email, stripe_customer_id, description, logo_url, website, created_at, updated_at, suspended_at, deleted_at, "primaryDomain", domains, "logoUrl", "faviconUrl", "isActive", "seoConfig", "themeConfig", "contactInfo", "ownerId", "createdAt", "updatedAt", "websiteLogoUrl") FROM stdin;
tenant-ZCSKEM9s	Smart AI Hub	smart-ai-hub	ACTIVE	FREE	\N	\N	{}	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-01-28 13:28:29.884	\N	\N	\N	smartaihub.app	["www.smartaihub.app"]	/uploads/tenants/tenant-ZCSKEM9s/logo/Qb3CT_Hqei-1769611261628.png		t	{}	{"primaryColor":"#6366f1","secondaryColor":"#8b5cf6","accentColor":"#ec4899","backgroundColor":"#ffffff","textColor":"#1f2937","fontFamily":"Plus Jakarta Sans, sans-serif","headingFont":"Plus Jakarta Sans, sans-serif","layout":"modern","headerStyle":"blur","footerStyle":"minimal","buttonStyle":"rounded","cardStyle":"elevated","customCss":null}	\N	1	2026-01-28 13:28:29.884+00	2026-01-28 14:41:02.97+00	\N
tenant-001	SmartSpec Pro	smartspec-pro	ACTIVE	ENTERPRISE	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-01-27 13:36:42.783847	2026-01-27 13:36:42.783847	\N	\N	smartspec.local	["smartspec.local","localhost","192.168.1.118","smartspec.localhost"]	/uploads/tenants/tenant-001/logo/xjs_xKgYGN-1769611250988.png		t	\N	{"primaryColor":"#0ea5e9","secondaryColor":"#06b6d4","accentColor":"#14b8a6","backgroundColor":"#ffffff","textColor":"#0f172a","fontFamily":"Plus Jakarta Sans, sans-serif","headingFont":"Plus Jakarta Sans, sans-serif","layout":"modern","headerStyle":"blur","footerStyle":"minimal","buttonStyle":"rounded","cardStyle":"elevated","customCss":null}	\N	\N	2026-01-27 13:36:42.783847+00	2026-01-30 14:06:59.204+00	/uploads/tenants/tenant-001/website-logo/HMih1Prra--1769782017397.png
\.


--
-- Data for Name: theme_presets; Type: TABLE DATA; Schema: public; Owner: smartspec
--

COPY public.theme_presets (id, name, "displayName", description, "previewImageUrl", "themeConfig", "isActive", "isDefault", "sortOrder", "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: ticket_messages; Type: TABLE DATA; Schema: public; Owner: smartspec
--

COPY public.ticket_messages (id, ticket_id, user_id, message, is_staff_response, attachments, created_at) FROM stdin;
\.


--
-- Data for Name: token_blacklist; Type: TABLE DATA; Schema: public; Owner: smartspec
--

COPY public.token_blacklist (jti, user_id, token_type, expires_at, revoked_at, reason) FROM stdin;
\.


--
-- Data for Name: user_follows; Type: TABLE DATA; Schema: public; Owner: smartspec
--

COPY public.user_follows (id, "followerId", "followingId", status, "createdAt") FROM stdin;
\.


--
-- Data for Name: user_notifications; Type: TABLE DATA; Schema: public; Owner: smartspec
--

COPY public.user_notifications (id, "userId", type, title, content, "conversationId", "scheduledMessageId", "isRead", "createdAt") FROM stdin;
1	1	scheduled_message	ค้นหาข่าวเกี่ยวกับเทคโนโลยี AI ใหม่ ๆ ทุกวันตอนแปดโมงเช้า	ตอนนี้มีข่าวเกี่ยวกับเทคโนโลยี AI ใหม่ ๆ ที่น่าสนใจมากมาย เช่น:\n\n1. **การพัฒนา AI ที่สามารถสร้างภาพและวิดีโอ**: มีการเปิดตัวโมเดลใหม่ที่สามารถสร้างภาพและวิดีโอที่มีคุณภาพสูงจากข้อความที่ป้อนเข้าไป เช่น DALL-E และ Stable Diffusion ที่ช่วยให้คนสร้างงานศิลปะได้อย่างง่ายดาย.\n\n2. **AI ในการแพทย์**: มีการใช้ AI ในการวิเคราะห์ข้อมูลทางการแพทย์และช่วยในการวินิจฉัยโรคได้เร็วขึ้น เช่น โมเดล AI ที่สามารถประเมินรูปภาพจากการสแกน MRI หรือ CT scan.\n\n3. **การแปลภาษาโดยใช้ AI**: AI ถูกนำมาใช้ในการพัฒนาโปรแกรมแปล	18	1	t	2026-02-01 16:00:07.41176+00
\.


--
-- Data for Name: user_preferences; Type: TABLE DATA; Schema: public; Owner: smartspec
--

COPY public.user_preferences (id, user_id, email_notifications, low_credits_alert, payment_notifications, support_ticket_updates, marketing_emails, low_credits_threshold, default_llm_model, default_llm_provider, default_budget_priority, theme, language, timezone, dashboard_layout, favorite_features, default_api_key_rate_limit, custom_settings) FROM stdin;
\.


--
-- Data for Name: user_skill_visibility; Type: TABLE DATA; Schema: public; Owner: smartspec
--

COPY public.user_skill_visibility (id, "userId", "skillId", visible, "autoTriggerEnabled", "createdAt", "updatedAt") FROM stdin;
1	1	2	t	t	2026-01-31 01:00:07.878178+00	2026-01-31 01:00:07.878178+00
3	1	1	t	t	2026-01-31 01:00:07.878178+00	2026-01-31 01:00:07.878178+00
4	1	6	t	t	2026-01-31 01:00:07.878178+00	2026-01-31 01:00:07.878178+00
6	1	7	t	t	2026-01-31 01:00:07.878178+00	2026-01-31 01:00:07.878178+00
7	1	5	t	t	2026-01-31 01:00:07.878178+00	2026-01-31 01:00:07.878178+00
2	1	3	f	t	2026-01-31 01:00:07.878178+00	2026-01-31 02:09:44.39+00
5	1	8	f	t	2026-01-31 01:00:07.878178+00	2026-01-31 02:09:46.091+00
12	23	2	t	t	2026-02-01 02:42:29.060693+00	2026-02-01 02:42:29.060693+00
13	23	1	t	t	2026-02-01 02:42:29.060693+00	2026-02-01 02:42:29.060693+00
14	23	8	t	t	2026-02-01 02:42:29.060693+00	2026-02-01 02:42:29.060693+00
15	23	3	t	t	2026-02-01 02:42:29.060693+00	2026-02-01 02:42:29.060693+00
16	23	5	t	t	2026-02-01 02:42:29.060693+00	2026-02-01 02:42:29.060693+00
17	23	6	t	t	2026-02-01 02:42:29.060693+00	2026-02-01 02:42:29.060693+00
18	23	7	t	t	2026-02-01 02:42:29.060693+00	2026-02-01 02:42:29.060693+00
19	1	1846	t	t	2026-02-02 08:18:05.670727+00	2026-02-02 08:18:05.670727+00
20	1	1847	t	t	2026-02-02 08:18:05.670727+00	2026-02-02 08:18:05.670727+00
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: smartspec
--

COPY public.users (id, "openId", name, email, password, "loginMethod", role, plan, credits, "createdAt", "updatedAt", "lastSignedIn", "registeredDomain", "currentTenantId", "isDisabled", is_banned, banned_until, ban_reason, "normalizedEmail", "trustScore", "registrationIp", "userPreferences", "backupEmail", "backupEmailVerified", phone, "phoneVerified", "twoFactorEnabled", "twoFactorSecret", "recoveryCodes") FROM stdin;
1	admin-admin@smartspec.pro	System Admin	admin@smartspec.pro	$2b$12$v4mGM53SkNOyTZm8bdkbS.87nxrmWb47l9cmdiG7m99N0d4joyfm2	password	admin	enterprise	98516	2026-01-27 09:08:16.255597+00	2026-02-02 12:50:07.342629+00	2026-02-02 13:34:35.745+00	\N	\N	f	f	\N	\N	admin@smartspec.pro	100	\N	{"translationModel": "openai/chatgpt-4o-latest", "translationLanguage": "th"}	\N	f	\N	f	f	\N	[]
21	test_xyz_456	Test	testxyz@test.com	hash	email	user	free	0	2026-02-01 01:46:12.008958+00	2026-02-01 01:46:12.008958+00	2026-02-01 01:46:12.008958+00	\N	\N	t	f	\N	\N	\N	100	\N	{}	\N	f	\N	f	f	\N	[]
23	local_1769911633274_tppa7	Pruksachart	pruksacharttk@gmail.com	$2b$12$Go1XZ39bSk0.lUg0wFBa.uv2DWYwmPSPCKPo74tjr0W3cZ96wRQny	email	user	free	100	2026-02-01 02:07:13.279373+00	2026-02-01 02:07:13.279373+00	2026-02-02 00:55:46.938+00	smartaihub.app	\N	f	f	\N	\N	\N	100	\N	{}	\N	f	\N	f	f	\N	[]
22	local_1769910403903_rdja7	Test User 3	testuser3@test.com	$2b$12$MbAsJ7pw1cO64pQUkUmStuYGfXPmyoCmGR2UMP/qkep/T/3RRbqTK	email	user	free	0	2026-02-01 01:46:43.904872+00	2026-02-01 01:46:43.904872+00	2026-02-01 01:46:43.903+00	\N	\N	f	f	\N	\N	\N	100	\N	{}	\N	f	\N	f	f	\N	[]
\.


--
-- Data for Name: vector_collections; Type: TABLE DATA; Schema: public; Owner: smartspec
--

COPY public.vector_collections (id, name, description, tenant_id, project_id, dimension, distance_metric, index_type, index_params, vector_count, total_size_bytes, is_indexed, last_indexed_at, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: vector_documents; Type: TABLE DATA; Schema: public; Owner: smartspec
--

COPY public.vector_documents (id, collection_id, content, content_hash, extra_data, source, source_type, chunk_index, parent_id, embedding_model, embedding_dimension, created_at, updated_at) FROM stdin;
\.


--
-- Name: __drizzle_migrations_id_seq; Type: SEQUENCE SET; Schema: drizzle; Owner: smartspec
--

SELECT pg_catalog.setval('drizzle.__drizzle_migrations_id_seq', 1, false);


--
-- Name: blocked_patterns_id_seq; Type: SEQUENCE SET; Schema: public; Owner: smartspec
--

SELECT pg_catalog.setval('public.blocked_patterns_id_seq', 1, false);


--
-- Name: blog_posts_id_seq; Type: SEQUENCE SET; Schema: public; Owner: smartspec
--

SELECT pg_catalog.setval('public.blog_posts_id_seq', 5, true);


--
-- Name: conversation_summaries_id_seq; Type: SEQUENCE SET; Schema: public; Owner: smartspec
--

SELECT pg_catalog.setval('public.conversation_summaries_id_seq', 3, true);


--
-- Name: conversations_id_seq; Type: SEQUENCE SET; Schema: public; Owner: smartspec
--

SELECT pg_catalog.setval('public.conversations_id_seq', 30, true);


--
-- Name: credit_packages_id_seq; Type: SEQUENCE SET; Schema: public; Owner: smartspec
--

SELECT pg_catalog.setval('public.credit_packages_id_seq', 21, true);


--
-- Name: credit_transactions_id_seq; Type: SEQUENCE SET; Schema: public; Owner: smartspec
--

SELECT pg_catalog.setval('public.credit_transactions_id_seq', 86, true);


--
-- Name: device_fingerprints_id_seq; Type: SEQUENCE SET; Schema: public; Owner: smartspec
--

SELECT pg_catalog.setval('public.device_fingerprints_id_seq', 1, false);


--
-- Name: direct_messages_id_seq; Type: SEQUENCE SET; Schema: public; Owner: smartspec
--

SELECT pg_catalog.setval('public.direct_messages_id_seq', 1, false);


--
-- Name: email_verification_tokens_id_seq; Type: SEQUENCE SET; Schema: public; Owner: smartspec
--

SELECT pg_catalog.setval('public.email_verification_tokens_id_seq', 4, true);


--
-- Name: entity_memories_id_seq; Type: SEQUENCE SET; Schema: public; Owner: smartspec
--

SELECT pg_catalog.setval('public.entity_memories_id_seq', 3, true);


--
-- Name: gallery_items_id_seq; Type: SEQUENCE SET; Schema: public; Owner: smartspec
--

SELECT pg_catalog.setval('public.gallery_items_id_seq', 1, false);


--
-- Name: invoice_config_id_seq; Type: SEQUENCE SET; Schema: public; Owner: smartspec
--

SELECT pg_catalog.setval('public.invoice_config_id_seq', 1, false);


--
-- Name: llm_providers_id_seq; Type: SEQUENCE SET; Schema: public; Owner: smartspec
--

SELECT pg_catalog.setval('public.llm_providers_id_seq', 1, true);


--
-- Name: media_models_id_seq; Type: SEQUENCE SET; Schema: public; Owner: smartspec
--

SELECT pg_catalog.setval('public.media_models_id_seq', 369, true);


--
-- Name: media_providers_id_seq; Type: SEQUENCE SET; Schema: public; Owner: smartspec
--

SELECT pg_catalog.setval('public.media_providers_id_seq', 3, true);


--
-- Name: messages_id_seq; Type: SEQUENCE SET; Schema: public; Owner: smartspec
--

SELECT pg_catalog.setval('public.messages_id_seq', 110, true);


--
-- Name: payment_transactions_id_seq; Type: SEQUENCE SET; Schema: public; Owner: smartspec
--

SELECT pg_catalog.setval('public.payment_transactions_id_seq', 1, false);


--
-- Name: registration_events_id_seq; Type: SEQUENCE SET; Schema: public; Owner: smartspec
--

SELECT pg_catalog.setval('public.registration_events_id_seq', 1, false);


--
-- Name: scheduled_message_logs_id_seq; Type: SEQUENCE SET; Schema: public; Owner: smartspec
--

SELECT pg_catalog.setval('public.scheduled_message_logs_id_seq', 4, true);


--
-- Name: scheduled_messages_id_seq; Type: SEQUENCE SET; Schema: public; Owner: smartspec
--

SELECT pg_catalog.setval('public.scheduled_messages_id_seq', 1, true);


--
-- Name: semantic_memories_id_seq; Type: SEQUENCE SET; Schema: public; Owner: smartspec
--

SELECT pg_catalog.setval('public.semantic_memories_id_seq', 1, false);


--
-- Name: seo_metadata_id_seq; Type: SEQUENCE SET; Schema: public; Owner: smartspec
--

SELECT pg_catalog.setval('public.seo_metadata_id_seq', 1, false);


--
-- Name: skill_comments_id_seq; Type: SEQUENCE SET; Schema: public; Owner: smartspec
--

SELECT pg_catalog.setval('public.skill_comments_id_seq', 1, false);


--
-- Name: skill_likes_id_seq; Type: SEQUENCE SET; Schema: public; Owner: smartspec
--

SELECT pg_catalog.setval('public.skill_likes_id_seq', 1, true);


--
-- Name: skill_preferences_id_seq; Type: SEQUENCE SET; Schema: public; Owner: smartspec
--

SELECT pg_catalog.setval('public.skill_preferences_id_seq', 1, false);


--
-- Name: skill_repositories_id_seq; Type: SEQUENCE SET; Schema: public; Owner: smartspec
--

SELECT pg_catalog.setval('public.skill_repositories_id_seq', 3, true);


--
-- Name: skills_id_seq; Type: SEQUENCE SET; Schema: public; Owner: smartspec
--

SELECT pg_catalog.setval('public.skills_id_seq', 1847, true);


--
-- Name: storage_settings_id_seq; Type: SEQUENCE SET; Schema: public; Owner: smartspec
--

SELECT pg_catalog.setval('public.storage_settings_id_seq', 1, true);


--
-- Name: system_settings_id_seq; Type: SEQUENCE SET; Schema: public; Owner: smartspec
--

SELECT pg_catalog.setval('public.system_settings_id_seq', 8, true);


--
-- Name: tenant_pages_id_seq; Type: SEQUENCE SET; Schema: public; Owner: smartspec
--

SELECT pg_catalog.setval('public.tenant_pages_id_seq', 23, true);


--
-- Name: theme_presets_id_seq; Type: SEQUENCE SET; Schema: public; Owner: smartspec
--

SELECT pg_catalog.setval('public.theme_presets_id_seq', 1, false);


--
-- Name: user_follows_id_seq; Type: SEQUENCE SET; Schema: public; Owner: smartspec
--

SELECT pg_catalog.setval('public.user_follows_id_seq', 1, false);


--
-- Name: user_notifications_id_seq; Type: SEQUENCE SET; Schema: public; Owner: smartspec
--

SELECT pg_catalog.setval('public.user_notifications_id_seq', 1, true);


--
-- Name: user_skill_visibility_id_seq; Type: SEQUENCE SET; Schema: public; Owner: smartspec
--

SELECT pg_catalog.setval('public.user_skill_visibility_id_seq', 20, true);


--
-- Name: users_id_seq; Type: SEQUENCE SET; Schema: public; Owner: smartspec
--

SELECT pg_catalog.setval('public.users_id_seq', 23, true);


--
-- Name: __drizzle_migrations __drizzle_migrations_pkey; Type: CONSTRAINT; Schema: drizzle; Owner: smartspec
--

ALTER TABLE ONLY drizzle.__drizzle_migrations
    ADD CONSTRAINT __drizzle_migrations_pkey PRIMARY KEY (id);


--
-- Name: api_key_usage api_key_usage_pkey; Type: CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.api_key_usage
    ADD CONSTRAINT api_key_usage_pkey PRIMARY KEY (id);


--
-- Name: api_keys api_keys_key_hash_key; Type: CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.api_keys
    ADD CONSTRAINT api_keys_key_hash_key UNIQUE (key_hash);


--
-- Name: api_keys api_keys_pkey; Type: CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.api_keys
    ADD CONSTRAINT api_keys_pkey PRIMARY KEY (id);


--
-- Name: approval_requests approval_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.approval_requests
    ADD CONSTRAINT approval_requests_pkey PRIMARY KEY (id);


--
-- Name: approval_responses approval_responses_pkey; Type: CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.approval_responses
    ADD CONSTRAINT approval_responses_pkey PRIMARY KEY (id);


--
-- Name: approval_rules approval_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.approval_rules
    ADD CONSTRAINT approval_rules_pkey PRIMARY KEY (id);


--
-- Name: assets assets_pkey; Type: CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.assets
    ADD CONSTRAINT assets_pkey PRIMARY KEY (id);


--
-- Name: audit_events audit_events_pkey; Type: CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.audit_events
    ADD CONSTRAINT audit_events_pkey PRIMARY KEY (id);


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- Name: blocked_patterns blocked_patterns_pkey; Type: CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.blocked_patterns
    ADD CONSTRAINT blocked_patterns_pkey PRIMARY KEY (id);


--
-- Name: blog_posts blog_posts_pkey; Type: CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.blog_posts
    ADD CONSTRAINT blog_posts_pkey PRIMARY KEY (id);


--
-- Name: checkpoints checkpoints_pkey; Type: CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.checkpoints
    ADD CONSTRAINT checkpoints_pkey PRIMARY KEY (id);


--
-- Name: conversation_summaries conversation_summaries_pkey; Type: CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.conversation_summaries
    ADD CONSTRAINT conversation_summaries_pkey PRIMARY KEY (id);


--
-- Name: conversations conversations_pkey; Type: CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_pkey PRIMARY KEY (id);


--
-- Name: credit_packages credit_packages_pkey; Type: CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.credit_packages
    ADD CONSTRAINT credit_packages_pkey PRIMARY KEY (id);


--
-- Name: credit_transactions credit_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.credit_transactions
    ADD CONSTRAINT credit_transactions_pkey PRIMARY KEY (id);


--
-- Name: custom_skill_prompts custom_skill_prompts_pkey; Type: CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.custom_skill_prompts
    ADD CONSTRAINT custom_skill_prompts_pkey PRIMARY KEY (id);


--
-- Name: device_fingerprints device_fingerprints_pkey; Type: CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.device_fingerprints
    ADD CONSTRAINT device_fingerprints_pkey PRIMARY KEY (id);


--
-- Name: direct_messages direct_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.direct_messages
    ADD CONSTRAINT direct_messages_pkey PRIMARY KEY (id);


--
-- Name: email_verification_tokens email_verification_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.email_verification_tokens
    ADD CONSTRAINT email_verification_tokens_pkey PRIMARY KEY (id);


--
-- Name: embedding_jobs embedding_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.embedding_jobs
    ADD CONSTRAINT embedding_jobs_pkey PRIMARY KEY (id);


--
-- Name: entity_memories entity_memories_pkey; Type: CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.entity_memories
    ADD CONSTRAINT entity_memories_pkey PRIMARY KEY (id);


--
-- Name: executions executions_pkey; Type: CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.executions
    ADD CONSTRAINT executions_pkey PRIMARY KEY (id);


--
-- Name: gallery_items gallery_items_pkey; Type: CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.gallery_items
    ADD CONSTRAINT gallery_items_pkey PRIMARY KEY (id);


--
-- Name: invoice_config invoice_config_pkey; Type: CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.invoice_config
    ADD CONSTRAINT invoice_config_pkey PRIMARY KEY (id);


--
-- Name: llm_providers llm_providers_pkey; Type: CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.llm_providers
    ADD CONSTRAINT llm_providers_pkey PRIMARY KEY (id);


--
-- Name: llm_providers llm_providers_providerName_unique; Type: CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.llm_providers
    ADD CONSTRAINT "llm_providers_providerName_unique" UNIQUE ("providerName");


--
-- Name: marketplace_templates marketplace_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.marketplace_templates
    ADD CONSTRAINT marketplace_templates_pkey PRIMARY KEY (id);


--
-- Name: media_models media_models_modelId_unique; Type: CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.media_models
    ADD CONSTRAINT "media_models_modelId_unique" UNIQUE ("modelId");


--
-- Name: media_models media_models_pkey; Type: CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.media_models
    ADD CONSTRAINT media_models_pkey PRIMARY KEY (id);


--
-- Name: media_providers media_providers_pkey; Type: CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.media_providers
    ADD CONSTRAINT media_providers_pkey PRIMARY KEY (id);


--
-- Name: media_providers media_providers_providerName_unique; Type: CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.media_providers
    ADD CONSTRAINT "media_providers_providerName_unique" UNIQUE ("providerName");


--
-- Name: media_tasks media_tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.media_tasks
    ADD CONSTRAINT media_tasks_pkey PRIMARY KEY (id);


--
-- Name: messages messages_pkey; Type: CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_pkey PRIMARY KEY (id);


--
-- Name: model_comparisons model_comparisons_pkey; Type: CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.model_comparisons
    ADD CONSTRAINT model_comparisons_pkey PRIMARY KEY (id);


--
-- Name: moderation_logs moderation_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.moderation_logs
    ADD CONSTRAINT moderation_logs_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: oauth_connections oauth_connections_pkey; Type: CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.oauth_connections
    ADD CONSTRAINT oauth_connections_pkey PRIMARY KEY (id);


--
-- Name: opencode_api_key_usage opencode_api_key_usage_pkey; Type: CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.opencode_api_key_usage
    ADD CONSTRAINT opencode_api_key_usage_pkey PRIMARY KEY (id);


--
-- Name: opencode_api_keys opencode_api_keys_pkey; Type: CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.opencode_api_keys
    ADD CONSTRAINT opencode_api_keys_pkey PRIMARY KEY (id);


--
-- Name: password_reset_tokens password_reset_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_pkey PRIMARY KEY (id);


--
-- Name: payment_transactions payment_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.payment_transactions
    ADD CONSTRAINT payment_transactions_pkey PRIMARY KEY (id);


--
-- Name: permissions permissions_name_key; Type: CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.permissions
    ADD CONSTRAINT permissions_name_key UNIQUE (name);


--
-- Name: permissions permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.permissions
    ADD CONSTRAINT permissions_pkey PRIMARY KEY (id);


--
-- Name: policies policies_pkey; Type: CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.policies
    ADD CONSTRAINT policies_pkey PRIMARY KEY (id);


--
-- Name: prompt_templates prompt_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.prompt_templates
    ADD CONSTRAINT prompt_templates_pkey PRIMARY KEY (id);


--
-- Name: provider_configs provider_configs_pkey; Type: CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.provider_configs
    ADD CONSTRAINT provider_configs_pkey PRIMARY KEY (id);


--
-- Name: refunds refunds_pkey; Type: CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.refunds
    ADD CONSTRAINT refunds_pkey PRIMARY KEY (id);


--
-- Name: registration_events registration_events_pkey; Type: CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.registration_events
    ADD CONSTRAINT registration_events_pkey PRIMARY KEY (id);


--
-- Name: role_assignments role_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.role_assignments
    ADD CONSTRAINT role_assignments_pkey PRIMARY KEY (id);


--
-- Name: roles roles_pkey; Type: CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_pkey PRIMARY KEY (id);


--
-- Name: scheduled_message_logs scheduled_message_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.scheduled_message_logs
    ADD CONSTRAINT scheduled_message_logs_pkey PRIMARY KEY (id);


--
-- Name: scheduled_messages scheduled_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.scheduled_messages
    ADD CONSTRAINT scheduled_messages_pkey PRIMARY KEY (id);


--
-- Name: secret_versions secret_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.secret_versions
    ADD CONSTRAINT secret_versions_pkey PRIMARY KEY (id);


--
-- Name: secrets secrets_pkey; Type: CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.secrets
    ADD CONSTRAINT secrets_pkey PRIMARY KEY (id);


--
-- Name: semantic_memories semantic_memories_pkey; Type: CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.semantic_memories
    ADD CONSTRAINT semantic_memories_pkey PRIMARY KEY (id);


--
-- Name: seo_metadata seo_metadata_pkey; Type: CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.seo_metadata
    ADD CONSTRAINT seo_metadata_pkey PRIMARY KEY (id);


--
-- Name: skill_comments skill_comments_pkey; Type: CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.skill_comments
    ADD CONSTRAINT skill_comments_pkey PRIMARY KEY (id);


--
-- Name: skill_likes skill_likes_pkey; Type: CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.skill_likes
    ADD CONSTRAINT skill_likes_pkey PRIMARY KEY (id);


--
-- Name: skill_preferences skill_preferences_pkey; Type: CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.skill_preferences
    ADD CONSTRAINT skill_preferences_pkey PRIMARY KEY (id);


--
-- Name: skill_prompt_templates skill_prompt_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.skill_prompt_templates
    ADD CONSTRAINT skill_prompt_templates_pkey PRIMARY KEY (id);


--
-- Name: skill_repositories skill_repositories_pkey; Type: CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.skill_repositories
    ADD CONSTRAINT skill_repositories_pkey PRIMARY KEY (id);


--
-- Name: skills skills_pkey; Type: CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.skills
    ADD CONSTRAINT skills_pkey PRIMARY KEY (id);


--
-- Name: skills skills_slug_unique; Type: CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.skills
    ADD CONSTRAINT skills_slug_unique UNIQUE (slug);


--
-- Name: storage_settings storage_settings_name_unique; Type: CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.storage_settings
    ADD CONSTRAINT storage_settings_name_unique UNIQUE (name);


--
-- Name: storage_settings storage_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.storage_settings
    ADD CONSTRAINT storage_settings_pkey PRIMARY KEY (id);


--
-- Name: support_tickets support_tickets_pkey; Type: CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.support_tickets
    ADD CONSTRAINT support_tickets_pkey PRIMARY KEY (id);


--
-- Name: system_config system_config_pkey; Type: CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.system_config
    ADD CONSTRAINT system_config_pkey PRIMARY KEY (key);


--
-- Name: system_settings system_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.system_settings
    ADD CONSTRAINT system_settings_pkey PRIMARY KEY (id);


--
-- Name: template_purchases template_purchases_pkey; Type: CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.template_purchases
    ADD CONSTRAINT template_purchases_pkey PRIMARY KEY (id);


--
-- Name: template_revenue_ledger template_revenue_ledger_pkey; Type: CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.template_revenue_ledger
    ADD CONSTRAINT template_revenue_ledger_pkey PRIMARY KEY (id);


--
-- Name: template_reviews template_reviews_pkey; Type: CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.template_reviews
    ADD CONSTRAINT template_reviews_pkey PRIMARY KEY (id);


--
-- Name: tenant_pages tenant_pages_pkey; Type: CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.tenant_pages
    ADD CONSTRAINT tenant_pages_pkey PRIMARY KEY (id);


--
-- Name: tenant_users tenant_users_pkey; Type: CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.tenant_users
    ADD CONSTRAINT tenant_users_pkey PRIMARY KEY (id);


--
-- Name: tenants tenants_pkey; Type: CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.tenants
    ADD CONSTRAINT tenants_pkey PRIMARY KEY (id);


--
-- Name: theme_presets theme_presets_name_unique; Type: CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.theme_presets
    ADD CONSTRAINT theme_presets_name_unique UNIQUE (name);


--
-- Name: theme_presets theme_presets_pkey; Type: CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.theme_presets
    ADD CONSTRAINT theme_presets_pkey PRIMARY KEY (id);


--
-- Name: ticket_messages ticket_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.ticket_messages
    ADD CONSTRAINT ticket_messages_pkey PRIMARY KEY (id);


--
-- Name: token_blacklist token_blacklist_pkey; Type: CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.token_blacklist
    ADD CONSTRAINT token_blacklist_pkey PRIMARY KEY (jti);


--
-- Name: custom_skill_prompts unique_user_skill; Type: CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.custom_skill_prompts
    ADD CONSTRAINT unique_user_skill UNIQUE (user_id, skill_id);


--
-- Name: template_purchases uq_purchase_buyer_template; Type: CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.template_purchases
    ADD CONSTRAINT uq_purchase_buyer_template UNIQUE (buyer_id, template_id);


--
-- Name: user_follows user_follows_pkey; Type: CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.user_follows
    ADD CONSTRAINT user_follows_pkey PRIMARY KEY (id);


--
-- Name: user_notifications user_notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.user_notifications
    ADD CONSTRAINT user_notifications_pkey PRIMARY KEY (id);


--
-- Name: user_preferences user_preferences_pkey; Type: CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.user_preferences
    ADD CONSTRAINT user_preferences_pkey PRIMARY KEY (id);


--
-- Name: user_preferences user_preferences_user_id_key; Type: CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.user_preferences
    ADD CONSTRAINT user_preferences_user_id_key UNIQUE (user_id);


--
-- Name: user_skill_visibility user_skill_visibility_pkey; Type: CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.user_skill_visibility
    ADD CONSTRAINT user_skill_visibility_pkey PRIMARY KEY (id);


--
-- Name: users users_openId_key; Type: CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT "users_openId_key" UNIQUE ("openId");


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: vector_collections vector_collections_pkey; Type: CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.vector_collections
    ADD CONSTRAINT vector_collections_pkey PRIMARY KEY (id);


--
-- Name: vector_documents vector_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.vector_documents
    ADD CONSTRAINT vector_documents_pkey PRIMARY KEY (id);


--
-- Name: idx_approval_request_execution; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX idx_approval_request_execution ON public.approval_requests USING btree (execution_id);


--
-- Name: idx_approval_request_status; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX idx_approval_request_status ON public.approval_requests USING btree (status);


--
-- Name: idx_approval_request_tenant; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX idx_approval_request_tenant ON public.approval_requests USING btree (tenant_id);


--
-- Name: idx_approval_request_type; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX idx_approval_request_type ON public.approval_requests USING btree (request_type);


--
-- Name: idx_approval_response_approver; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX idx_approval_response_approver ON public.approval_responses USING btree (approver_id);


--
-- Name: idx_approval_response_request; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX idx_approval_response_request ON public.approval_responses USING btree (request_id);


--
-- Name: idx_approval_rule_active; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX idx_approval_rule_active ON public.approval_rules USING btree (is_active);


--
-- Name: idx_approval_rule_tenant; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX idx_approval_rule_tenant ON public.approval_rules USING btree (tenant_id);


--
-- Name: idx_approval_rule_type; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX idx_approval_rule_type ON public.approval_rules USING btree (trigger_type);


--
-- Name: idx_audit_action; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX idx_audit_action ON public.audit_events USING btree (action);


--
-- Name: idx_audit_action_timestamp; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX idx_audit_action_timestamp ON public.audit_logs USING btree (action, "timestamp");


--
-- Name: idx_audit_actor; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX idx_audit_actor ON public.audit_events USING btree (actor_id);


--
-- Name: idx_audit_created; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX idx_audit_created ON public.audit_events USING btree (created_at);


--
-- Name: idx_audit_impersonator; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX idx_audit_impersonator ON public.audit_logs USING btree (impersonator_id, "timestamp");


--
-- Name: idx_audit_resource; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX idx_audit_resource ON public.audit_logs USING btree (resource_type, resource_id);


--
-- Name: idx_audit_severity; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX idx_audit_severity ON public.audit_events USING btree (severity);


--
-- Name: idx_audit_target; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX idx_audit_target ON public.audit_events USING btree (target_type, target_id);


--
-- Name: idx_audit_tenant; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX idx_audit_tenant ON public.audit_events USING btree (tenant_id);


--
-- Name: idx_audit_user_timestamp; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX idx_audit_user_timestamp ON public.audit_logs USING btree (user_id, "timestamp");


--
-- Name: idx_blocked_patterns_type; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX idx_blocked_patterns_type ON public.blocked_patterns USING btree ("patternType", "isActive");


--
-- Name: idx_conversations_project; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX idx_conversations_project ON public.conversations USING btree (project_id) WHERE (project_id IS NOT NULL);


--
-- Name: idx_device_fp_hash; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX idx_device_fp_hash ON public.device_fingerprints USING btree ("fingerprintHash");


--
-- Name: idx_device_fp_user; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX idx_device_fp_user ON public.device_fingerprints USING btree ("userId");


--
-- Name: idx_embedding_job_collection; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX idx_embedding_job_collection ON public.embedding_jobs USING btree (collection_id);


--
-- Name: idx_embedding_job_status; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX idx_embedding_job_status ON public.embedding_jobs USING btree (status);


--
-- Name: idx_entity_memories_project; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX idx_entity_memories_project ON public.entity_memories USING btree ("userId", "projectId");


--
-- Name: idx_expires_at; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX idx_expires_at ON public.token_blacklist USING btree (expires_at);


--
-- Name: idx_ledger_creator_date; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX idx_ledger_creator_date ON public.template_revenue_ledger USING btree (creator_id, recorded_at);


--
-- Name: idx_ledger_template_date; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX idx_ledger_template_date ON public.template_revenue_ledger USING btree (template_id, recorded_at);


--
-- Name: idx_payment_transactions_created; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX idx_payment_transactions_created ON public.payment_transactions USING btree (created_at DESC);


--
-- Name: idx_payment_transactions_user_status; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX idx_payment_transactions_user_status ON public.payment_transactions USING btree (user_id, status);


--
-- Name: idx_permission_action; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX idx_permission_action ON public.permissions USING btree (action);


--
-- Name: idx_permission_resource; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX idx_permission_resource ON public.permissions USING btree (resource);


--
-- Name: idx_permission_resource_action; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX idx_permission_resource_action ON public.permissions USING btree (resource, action);


--
-- Name: idx_policy_active; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX idx_policy_active ON public.policies USING btree (is_active);


--
-- Name: idx_policy_name; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX idx_policy_name ON public.policies USING btree (name);


--
-- Name: idx_policy_tenant; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX idx_policy_tenant ON public.policies USING btree (tenant_id);


--
-- Name: idx_purchase_buyer_template; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX idx_purchase_buyer_template ON public.template_purchases USING btree (buyer_id, template_id);


--
-- Name: idx_purchase_template_date; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX idx_purchase_template_date ON public.template_purchases USING btree (template_id, purchased_at);


--
-- Name: idx_reg_events_fingerprint; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX idx_reg_events_fingerprint ON public.registration_events USING btree ("fingerprintHash");


--
-- Name: idx_reg_events_fp; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX idx_reg_events_fp ON public.registration_events USING btree ("fingerprintHash");


--
-- Name: idx_reg_events_ip; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX idx_reg_events_ip ON public.registration_events USING btree ("ipAddress");


--
-- Name: idx_reg_events_norm_email; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX idx_reg_events_norm_email ON public.registration_events USING btree ("normalizedEmail");


--
-- Name: idx_reg_events_normalized_email; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX idx_reg_events_normalized_email ON public.registration_events USING btree ("normalizedEmail");


--
-- Name: idx_reg_events_trust; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX idx_reg_events_trust ON public.registration_events USING btree ("trustScore");


--
-- Name: idx_review_purchase; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE UNIQUE INDEX idx_review_purchase ON public.template_reviews USING btree (purchase_id);


--
-- Name: idx_review_template_rating; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX idx_review_template_rating ON public.template_reviews USING btree (template_id, rating);


--
-- Name: idx_role_assignment_role; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX idx_role_assignment_role ON public.role_assignments USING btree (role_id);


--
-- Name: idx_role_assignment_tenant; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX idx_role_assignment_tenant ON public.role_assignments USING btree (tenant_id);


--
-- Name: idx_role_assignment_user; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX idx_role_assignment_user ON public.role_assignments USING btree (user_id);


--
-- Name: idx_role_assignment_user_tenant; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX idx_role_assignment_user_tenant ON public.role_assignments USING btree (user_id, tenant_id);


--
-- Name: idx_role_name; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX idx_role_name ON public.roles USING btree (name);


--
-- Name: idx_role_system; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX idx_role_system ON public.roles USING btree (is_system);


--
-- Name: idx_role_tenant; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX idx_role_tenant ON public.roles USING btree (tenant_id);


--
-- Name: idx_secret_name; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX idx_secret_name ON public.secrets USING btree (name);


--
-- Name: idx_secret_tenant; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX idx_secret_tenant ON public.secrets USING btree (tenant_id);


--
-- Name: idx_secret_tenant_name; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE UNIQUE INDEX idx_secret_tenant_name ON public.secrets USING btree (tenant_id, name);


--
-- Name: idx_secret_type; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX idx_secret_type ON public.secrets USING btree (secret_type);


--
-- Name: idx_secret_version_current; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX idx_secret_version_current ON public.secret_versions USING btree (secret_id, is_current);


--
-- Name: idx_secret_version_secret; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX idx_secret_version_secret ON public.secret_versions USING btree (secret_id);


--
-- Name: idx_semantic_memory_importance; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX idx_semantic_memory_importance ON public.semantic_memories USING btree (importance, is_active);


--
-- Name: idx_semantic_memory_key_user; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX idx_semantic_memory_key_user ON public.semantic_memories USING btree (memory_key, user_id);


--
-- Name: idx_semantic_memory_project; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX idx_semantic_memory_project ON public.semantic_memories USING btree (project_id, memory_type);


--
-- Name: idx_semantic_memory_scope; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX idx_semantic_memory_scope ON public.semantic_memories USING btree (scope, memory_type);


--
-- Name: idx_semantic_memory_user_type; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX idx_semantic_memory_user_type ON public.semantic_memories USING btree (user_id, memory_type);


--
-- Name: idx_template_creator_revenue; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX idx_template_creator_revenue ON public.marketplace_templates USING btree (creator_id, total_revenue_credits);


--
-- Name: idx_template_creator_status; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX idx_template_creator_status ON public.marketplace_templates USING btree (creator_id, status);


--
-- Name: idx_template_featured_status; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX idx_template_featured_status ON public.marketplace_templates USING btree (is_featured, status);


--
-- Name: idx_template_purchase_count; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX idx_template_purchase_count ON public.marketplace_templates USING btree (purchase_count DESC);


--
-- Name: idx_template_rating; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX idx_template_rating ON public.marketplace_templates USING btree (rating_average DESC, rating_count);


--
-- Name: idx_template_status_category; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX idx_template_status_category ON public.marketplace_templates USING btree (status, category);


--
-- Name: idx_template_status_submitted; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX idx_template_status_submitted ON public.marketplace_templates USING btree (status, submitted_at DESC);


--
-- Name: idx_tenant_owner; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX idx_tenant_owner ON public.tenants USING btree (owner_id);


--
-- Name: idx_tenant_plan; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX idx_tenant_plan ON public.tenants USING btree (plan);


--
-- Name: idx_tenant_status; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX idx_tenant_status ON public.tenants USING btree (status);


--
-- Name: idx_tenant_user_tenant; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX idx_tenant_user_tenant ON public.tenant_users USING btree (tenant_id);


--
-- Name: idx_tenant_user_unique; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE UNIQUE INDEX idx_tenant_user_unique ON public.tenant_users USING btree (tenant_id, user_id);


--
-- Name: idx_tenant_user_user; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX idx_tenant_user_user ON public.tenant_users USING btree (user_id);


--
-- Name: idx_ticket_assigned_status; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX idx_ticket_assigned_status ON public.support_tickets USING btree (assigned_to, status);


--
-- Name: idx_ticket_status_priority; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX idx_ticket_status_priority ON public.support_tickets USING btree (status, priority);


--
-- Name: idx_ticket_user_status; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX idx_ticket_user_status ON public.support_tickets USING btree (user_id, status);


--
-- Name: idx_user_id_token_type; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX idx_user_id_token_type ON public.token_blacklist USING btree (user_id, token_type);


--
-- Name: idx_users_norm_email; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX idx_users_norm_email ON public.users USING btree ("normalizedEmail");


--
-- Name: idx_vector_collection_name; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX idx_vector_collection_name ON public.vector_collections USING btree (name);


--
-- Name: idx_vector_collection_tenant; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX idx_vector_collection_tenant ON public.vector_collections USING btree (tenant_id);


--
-- Name: idx_vector_collection_tenant_name; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE UNIQUE INDEX idx_vector_collection_tenant_name ON public.vector_collections USING btree (tenant_id, name);


--
-- Name: idx_vector_document_collection; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX idx_vector_document_collection ON public.vector_documents USING btree (collection_id);


--
-- Name: idx_vector_document_hash; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX idx_vector_document_hash ON public.vector_documents USING btree (content_hash);


--
-- Name: idx_vector_document_source; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX idx_vector_document_source ON public.vector_documents USING btree (source);


--
-- Name: ix_assets_asset_type; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX ix_assets_asset_type ON public.assets USING btree (asset_type);


--
-- Name: ix_assets_created_at; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX ix_assets_created_at ON public.assets USING btree (created_at);


--
-- Name: ix_assets_generation_task_id; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX ix_assets_generation_task_id ON public.assets USING btree (generation_task_id);


--
-- Name: ix_assets_is_latest; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX ix_assets_is_latest ON public.assets USING btree (is_latest);


--
-- Name: ix_assets_latest_active; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX ix_assets_latest_active ON public.assets USING btree (is_latest, status);


--
-- Name: ix_assets_project_id; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX ix_assets_project_id ON public.assets USING btree (project_id);


--
-- Name: ix_assets_project_spec; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX ix_assets_project_spec ON public.assets USING btree (project_id, spec_id);


--
-- Name: ix_assets_spec_id; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX ix_assets_spec_id ON public.assets USING btree (spec_id);


--
-- Name: ix_assets_status; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX ix_assets_status ON public.assets USING btree (status);


--
-- Name: ix_assets_user_id; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX ix_assets_user_id ON public.assets USING btree (user_id);


--
-- Name: ix_assets_user_project; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX ix_assets_user_project ON public.assets USING btree (user_id, project_id);


--
-- Name: ix_assets_user_type; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX ix_assets_user_type ON public.assets USING btree (user_id, asset_type);


--
-- Name: ix_audit_logs_action; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX ix_audit_logs_action ON public.audit_logs USING btree (action);


--
-- Name: ix_audit_logs_endpoint; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX ix_audit_logs_endpoint ON public.audit_logs USING btree (endpoint);


--
-- Name: ix_audit_logs_impersonator_id; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX ix_audit_logs_impersonator_id ON public.audit_logs USING btree (impersonator_id);


--
-- Name: ix_audit_logs_resource_id; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX ix_audit_logs_resource_id ON public.audit_logs USING btree (resource_id);


--
-- Name: ix_audit_logs_resource_type; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX ix_audit_logs_resource_type ON public.audit_logs USING btree (resource_type);


--
-- Name: ix_audit_logs_timestamp; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX ix_audit_logs_timestamp ON public.audit_logs USING btree ("timestamp");


--
-- Name: ix_audit_logs_user_id; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX ix_audit_logs_user_id ON public.audit_logs USING btree (user_id);


--
-- Name: ix_checkpoints_execution_id; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX ix_checkpoints_execution_id ON public.checkpoints USING btree (execution_id);


--
-- Name: ix_credit_transactions_createdAt; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX "ix_credit_transactions_createdAt" ON public.credit_transactions USING btree ("createdAt");


--
-- Name: ix_credit_transactions_userId; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX "ix_credit_transactions_userId" ON public.credit_transactions USING btree ("userId");


--
-- Name: ix_credit_transactions_user_id_type; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX ix_credit_transactions_user_id_type ON public.credit_transactions USING btree ("userId", type);


--
-- Name: ix_custom_skill_prompts_skill_id; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX ix_custom_skill_prompts_skill_id ON public.custom_skill_prompts USING btree (skill_id);


--
-- Name: ix_custom_skill_prompts_user_id; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX ix_custom_skill_prompts_user_id ON public.custom_skill_prompts USING btree (user_id);


--
-- Name: ix_executions_status; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX ix_executions_status ON public.executions USING btree (status);


--
-- Name: ix_executions_workflow_id; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX ix_executions_workflow_id ON public.executions USING btree (workflow_id);


--
-- Name: ix_marketplace_templates_category; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX ix_marketplace_templates_category ON public.marketplace_templates USING btree (category);


--
-- Name: ix_marketplace_templates_creator_id; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX ix_marketplace_templates_creator_id ON public.marketplace_templates USING btree (creator_id);


--
-- Name: ix_marketplace_templates_id; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX ix_marketplace_templates_id ON public.marketplace_templates USING btree (id);


--
-- Name: ix_marketplace_templates_is_featured; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX ix_marketplace_templates_is_featured ON public.marketplace_templates USING btree (is_featured);


--
-- Name: ix_marketplace_templates_slug; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE UNIQUE INDEX ix_marketplace_templates_slug ON public.marketplace_templates USING btree (slug);


--
-- Name: ix_marketplace_templates_status; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX ix_marketplace_templates_status ON public.marketplace_templates USING btree (status);


--
-- Name: ix_media_tasks_task_id; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX ix_media_tasks_task_id ON public.media_tasks USING btree (task_id);


--
-- Name: ix_model_comparisons_created_at; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX ix_model_comparisons_created_at ON public.model_comparisons USING btree (created_at);


--
-- Name: ix_model_comparisons_user_id; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX ix_model_comparisons_user_id ON public.model_comparisons USING btree (user_id);


--
-- Name: ix_moderation_logs_user_id; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX ix_moderation_logs_user_id ON public.moderation_logs USING btree (user_id);


--
-- Name: ix_notifications_created_at; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX ix_notifications_created_at ON public.notifications USING btree (created_at);


--
-- Name: ix_notifications_is_read; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX ix_notifications_is_read ON public.notifications USING btree (is_read);


--
-- Name: ix_notifications_type; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX ix_notifications_type ON public.notifications USING btree (type);


--
-- Name: ix_notifications_user_id; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX ix_notifications_user_id ON public.notifications USING btree (user_id);


--
-- Name: ix_oauth_connections_provider; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX ix_oauth_connections_provider ON public.oauth_connections USING btree (provider);


--
-- Name: ix_oauth_connections_user_id; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX ix_oauth_connections_user_id ON public.oauth_connections USING btree (user_id);


--
-- Name: ix_opencode_api_key_usage_api_key_id; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX ix_opencode_api_key_usage_api_key_id ON public.opencode_api_key_usage USING btree (api_key_id);


--
-- Name: ix_opencode_api_key_usage_created_at; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX ix_opencode_api_key_usage_created_at ON public.opencode_api_key_usage USING btree (created_at);


--
-- Name: ix_opencode_api_keys_key_hash; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE UNIQUE INDEX ix_opencode_api_keys_key_hash ON public.opencode_api_keys USING btree (key_hash);


--
-- Name: ix_opencode_api_keys_user_id; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX ix_opencode_api_keys_user_id ON public.opencode_api_keys USING btree (user_id);


--
-- Name: ix_password_reset_tokens_token_hash; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE UNIQUE INDEX ix_password_reset_tokens_token_hash ON public.password_reset_tokens USING btree (token_hash);


--
-- Name: ix_password_reset_tokens_user_id; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX ix_password_reset_tokens_user_id ON public.password_reset_tokens USING btree (user_id);


--
-- Name: ix_payment_transactions_id; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX ix_payment_transactions_id ON public.payment_transactions USING btree (id);


--
-- Name: ix_payment_transactions_status; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX ix_payment_transactions_status ON public.payment_transactions USING btree (status);


--
-- Name: ix_payment_transactions_stripe_payment_intent_id; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX ix_payment_transactions_stripe_payment_intent_id ON public.payment_transactions USING btree (stripe_payment_intent_id);


--
-- Name: ix_payment_transactions_stripe_session_id; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE UNIQUE INDEX ix_payment_transactions_stripe_session_id ON public.payment_transactions USING btree (stripe_session_id);


--
-- Name: ix_payment_transactions_user_id; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX ix_payment_transactions_user_id ON public.payment_transactions USING btree (user_id);


--
-- Name: ix_payment_transactions_user_id_status; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX ix_payment_transactions_user_id_status ON public.payment_transactions USING btree (user_id, status);


--
-- Name: ix_prompt_templates_category; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX ix_prompt_templates_category ON public.prompt_templates USING btree (category);


--
-- Name: ix_prompt_templates_user_id; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX ix_prompt_templates_user_id ON public.prompt_templates USING btree (user_id);


--
-- Name: ix_provider_configs_id; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX ix_provider_configs_id ON public.provider_configs USING btree (id);


--
-- Name: ix_provider_configs_provider_name; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE UNIQUE INDEX ix_provider_configs_provider_name ON public.provider_configs USING btree (provider_name);


--
-- Name: ix_refunds_payment_id; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX ix_refunds_payment_id ON public.refunds USING btree (payment_id);


--
-- Name: ix_refunds_stripe_refund_id; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX ix_refunds_stripe_refund_id ON public.refunds USING btree (stripe_refund_id);


--
-- Name: ix_refunds_user_id; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX ix_refunds_user_id ON public.refunds USING btree (user_id);


--
-- Name: ix_semantic_memories_memory_key; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX ix_semantic_memories_memory_key ON public.semantic_memories USING btree (memory_key);


--
-- Name: ix_semantic_memories_memory_type; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX ix_semantic_memories_memory_type ON public.semantic_memories USING btree (memory_type);


--
-- Name: ix_semantic_memories_project_id; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX ix_semantic_memories_project_id ON public.semantic_memories USING btree (project_id);


--
-- Name: ix_semantic_memories_session_id; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX ix_semantic_memories_session_id ON public.semantic_memories USING btree (session_id);


--
-- Name: ix_semantic_memories_user_id; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX ix_semantic_memories_user_id ON public.semantic_memories USING btree (user_id);


--
-- Name: ix_semantic_memories_workflow_id; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX ix_semantic_memories_workflow_id ON public.semantic_memories USING btree (workflow_id);


--
-- Name: ix_skill_prompt_templates_skill_id; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX ix_skill_prompt_templates_skill_id ON public.skill_prompt_templates USING btree (skill_id);


--
-- Name: ix_support_tickets_assigned_to; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX ix_support_tickets_assigned_to ON public.support_tickets USING btree (assigned_to);


--
-- Name: ix_support_tickets_category; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX ix_support_tickets_category ON public.support_tickets USING btree (category);


--
-- Name: ix_support_tickets_created_at; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX ix_support_tickets_created_at ON public.support_tickets USING btree (created_at);


--
-- Name: ix_support_tickets_priority; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX ix_support_tickets_priority ON public.support_tickets USING btree (priority);


--
-- Name: ix_support_tickets_status; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX ix_support_tickets_status ON public.support_tickets USING btree (status);


--
-- Name: ix_support_tickets_ticket_number; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE UNIQUE INDEX ix_support_tickets_ticket_number ON public.support_tickets USING btree (ticket_number);


--
-- Name: ix_support_tickets_user_id; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX ix_support_tickets_user_id ON public.support_tickets USING btree (user_id);


--
-- Name: ix_template_purchases_buyer_id; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX ix_template_purchases_buyer_id ON public.template_purchases USING btree (buyer_id);


--
-- Name: ix_template_purchases_id; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX ix_template_purchases_id ON public.template_purchases USING btree (id);


--
-- Name: ix_template_purchases_template_id; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX ix_template_purchases_template_id ON public.template_purchases USING btree (template_id);


--
-- Name: ix_template_revenue_ledger_purchase_id; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX ix_template_revenue_ledger_purchase_id ON public.template_revenue_ledger USING btree (purchase_id);


--
-- Name: ix_template_revenue_ledger_template_id; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX ix_template_revenue_ledger_template_id ON public.template_revenue_ledger USING btree (template_id);


--
-- Name: ix_template_reviews_id; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX ix_template_reviews_id ON public.template_reviews USING btree (id);


--
-- Name: ix_template_reviews_reviewer_id; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX ix_template_reviews_reviewer_id ON public.template_reviews USING btree (reviewer_id);


--
-- Name: ix_template_reviews_template_id; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX ix_template_reviews_template_id ON public.template_reviews USING btree (template_id);


--
-- Name: ix_tenants_slug; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE UNIQUE INDEX ix_tenants_slug ON public.tenants USING btree (slug);


--
-- Name: ix_ticket_messages_created_at; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX ix_ticket_messages_created_at ON public.ticket_messages USING btree (created_at);


--
-- Name: ix_ticket_messages_ticket_id; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX ix_ticket_messages_ticket_id ON public.ticket_messages USING btree (ticket_id);


--
-- Name: ix_token_blacklist_expires_at; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX ix_token_blacklist_expires_at ON public.token_blacklist USING btree (expires_at);


--
-- Name: ix_token_blacklist_jti; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX ix_token_blacklist_jti ON public.token_blacklist USING btree (jti);


--
-- Name: ix_token_blacklist_user_id; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX ix_token_blacklist_user_id ON public.token_blacklist USING btree (user_id);


--
-- Name: ix_users_email; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE UNIQUE INDEX ix_users_email ON public.users USING btree (email);


--
-- Name: ix_users_id; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE INDEX ix_users_id ON public.users USING btree (id);


--
-- Name: skill_likes_unique; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE UNIQUE INDEX skill_likes_unique ON public.skill_likes USING btree ("skillId", "userId");


--
-- Name: user_skill_visibility_unique; Type: INDEX; Schema: public; Owner: smartspec
--

CREATE UNIQUE INDEX user_skill_visibility_unique ON public.user_skill_visibility USING btree ("userId", "skillId");


--
-- Name: api_key_usage api_key_usage_api_key_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.api_key_usage
    ADD CONSTRAINT api_key_usage_api_key_id_fkey FOREIGN KEY (api_key_id) REFERENCES public.api_keys(id);


--
-- Name: api_keys api_keys_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.api_keys
    ADD CONSTRAINT api_keys_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: approval_requests approval_requests_requester_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.approval_requests
    ADD CONSTRAINT approval_requests_requester_id_fkey FOREIGN KEY (requester_id) REFERENCES public.users(id);


--
-- Name: approval_requests approval_requests_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.approval_requests
    ADD CONSTRAINT approval_requests_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: approval_responses approval_responses_approver_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.approval_responses
    ADD CONSTRAINT approval_responses_approver_id_fkey FOREIGN KEY (approver_id) REFERENCES public.users(id);


--
-- Name: approval_responses approval_responses_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.approval_responses
    ADD CONSTRAINT approval_responses_request_id_fkey FOREIGN KEY (request_id) REFERENCES public.approval_requests(id) ON DELETE CASCADE;


--
-- Name: approval_rules approval_rules_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.approval_rules
    ADD CONSTRAINT approval_rules_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: assets assets_parent_asset_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.assets
    ADD CONSTRAINT assets_parent_asset_id_fkey FOREIGN KEY (parent_asset_id) REFERENCES public.assets(id);


--
-- Name: assets assets_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.assets
    ADD CONSTRAINT assets_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: audit_events audit_events_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.audit_events
    ADD CONSTRAINT audit_events_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE SET NULL;


--
-- Name: blocked_patterns blocked_patterns_createdBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.blocked_patterns
    ADD CONSTRAINT "blocked_patterns_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES public.users(id);


--
-- Name: blog_posts blog_posts_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.blog_posts
    ADD CONSTRAINT "blog_posts_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: conversation_summaries conversation_summaries_conversationId_conversations_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.conversation_summaries
    ADD CONSTRAINT "conversation_summaries_conversationId_conversations_id_fk" FOREIGN KEY ("conversationId") REFERENCES public.conversations(id) ON DELETE CASCADE;


--
-- Name: conversations conversations_userId_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT "conversations_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: credit_transactions credit_transactions_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.credit_transactions
    ADD CONSTRAINT "credit_transactions_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id);


--
-- Name: custom_skill_prompts custom_skill_prompts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.custom_skill_prompts
    ADD CONSTRAINT custom_skill_prompts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: device_fingerprints device_fingerprints_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.device_fingerprints
    ADD CONSTRAINT "device_fingerprints_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: direct_messages direct_messages_receiverId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.direct_messages
    ADD CONSTRAINT "direct_messages_receiverId_fkey" FOREIGN KEY ("receiverId") REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: direct_messages direct_messages_senderId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.direct_messages
    ADD CONSTRAINT "direct_messages_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: email_verification_tokens email_verification_tokens_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.email_verification_tokens
    ADD CONSTRAINT "email_verification_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: embedding_jobs embedding_jobs_collection_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.embedding_jobs
    ADD CONSTRAINT embedding_jobs_collection_id_fkey FOREIGN KEY (collection_id) REFERENCES public.vector_collections(id) ON DELETE CASCADE;


--
-- Name: entity_memories entity_memories_sourceConversationId_conversations_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.entity_memories
    ADD CONSTRAINT "entity_memories_sourceConversationId_conversations_id_fk" FOREIGN KEY ("sourceConversationId") REFERENCES public.conversations(id) ON DELETE SET NULL;


--
-- Name: entity_memories entity_memories_userId_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.entity_memories
    ADD CONSTRAINT "entity_memories_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: gallery_items gallery_items_authorId_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.gallery_items
    ADD CONSTRAINT "gallery_items_authorId_users_id_fk" FOREIGN KEY ("authorId") REFERENCES public.users(id);


--
-- Name: gallery_items gallery_items_tenantid_tenants_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.gallery_items
    ADD CONSTRAINT gallery_items_tenantid_tenants_id_fk FOREIGN KEY ("tenantId") REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: marketplace_templates marketplace_templates_creator_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.marketplace_templates
    ADD CONSTRAINT marketplace_templates_creator_id_fkey FOREIGN KEY (creator_id) REFERENCES public.users(id);


--
-- Name: marketplace_templates marketplace_templates_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.marketplace_templates
    ADD CONSTRAINT marketplace_templates_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.users(id);


--
-- Name: media_tasks media_tasks_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.media_tasks
    ADD CONSTRAINT media_tasks_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: messages messages_conversationId_conversations_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT "messages_conversationId_conversations_id_fk" FOREIGN KEY ("conversationId") REFERENCES public.conversations(id) ON DELETE CASCADE;


--
-- Name: oauth_connections oauth_connections_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.oauth_connections
    ADD CONSTRAINT oauth_connections_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: opencode_api_key_usage opencode_api_key_usage_api_key_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.opencode_api_key_usage
    ADD CONSTRAINT opencode_api_key_usage_api_key_id_fkey FOREIGN KEY (api_key_id) REFERENCES public.opencode_api_keys(id);


--
-- Name: opencode_api_keys opencode_api_keys_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.opencode_api_keys
    ADD CONSTRAINT opencode_api_keys_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: payment_transactions payment_transactions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.payment_transactions
    ADD CONSTRAINT payment_transactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: policies policies_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.policies
    ADD CONSTRAINT policies_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: registration_events registration_events_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.registration_events
    ADD CONSTRAINT "registration_events_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id);


--
-- Name: role_assignments role_assignments_assigned_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.role_assignments
    ADD CONSTRAINT role_assignments_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES public.users(id);


--
-- Name: role_assignments role_assignments_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.role_assignments
    ADD CONSTRAINT role_assignments_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.roles(id) ON DELETE CASCADE;


--
-- Name: role_assignments role_assignments_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.role_assignments
    ADD CONSTRAINT role_assignments_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: role_assignments role_assignments_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.role_assignments
    ADD CONSTRAINT role_assignments_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: roles roles_parent_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_parent_role_id_fkey FOREIGN KEY (parent_role_id) REFERENCES public.roles(id);


--
-- Name: roles roles_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: scheduled_message_logs scheduled_message_logs_scheduledMessageId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.scheduled_message_logs
    ADD CONSTRAINT "scheduled_message_logs_scheduledMessageId_fkey" FOREIGN KEY ("scheduledMessageId") REFERENCES public.scheduled_messages(id) ON DELETE CASCADE;


--
-- Name: scheduled_messages scheduled_messages_conversationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.scheduled_messages
    ADD CONSTRAINT "scheduled_messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES public.conversations(id) ON DELETE SET NULL;


--
-- Name: scheduled_messages scheduled_messages_targetUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.scheduled_messages
    ADD CONSTRAINT "scheduled_messages_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: scheduled_messages scheduled_messages_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.scheduled_messages
    ADD CONSTRAINT "scheduled_messages_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: secret_versions secret_versions_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.secret_versions
    ADD CONSTRAINT secret_versions_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: secret_versions secret_versions_secret_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.secret_versions
    ADD CONSTRAINT secret_versions_secret_id_fkey FOREIGN KEY (secret_id) REFERENCES public.secrets(id) ON DELETE CASCADE;


--
-- Name: secrets secrets_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.secrets
    ADD CONSTRAINT secrets_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: secrets secrets_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.secrets
    ADD CONSTRAINT secrets_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: semantic_memories semantic_memories_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.semantic_memories
    ADD CONSTRAINT semantic_memories_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: seo_metadata seo_metadata_tenantid_tenants_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.seo_metadata
    ADD CONSTRAINT seo_metadata_tenantid_tenants_id_fk FOREIGN KEY ("tenantId") REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: skill_comments skill_comments_skillId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.skill_comments
    ADD CONSTRAINT "skill_comments_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES public.skills(id) ON DELETE CASCADE;


--
-- Name: skill_comments skill_comments_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.skill_comments
    ADD CONSTRAINT "skill_comments_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: skill_likes skill_likes_skillId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.skill_likes
    ADD CONSTRAINT "skill_likes_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES public.skills(id) ON DELETE CASCADE;


--
-- Name: skill_likes skill_likes_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.skill_likes
    ADD CONSTRAINT "skill_likes_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: skill_preferences skill_preferences_conversationId_conversations_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.skill_preferences
    ADD CONSTRAINT "skill_preferences_conversationId_conversations_id_fk" FOREIGN KEY ("conversationId") REFERENCES public.conversations(id) ON DELETE CASCADE;


--
-- Name: skill_prompt_templates skill_prompt_templates_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.skill_prompt_templates
    ADD CONSTRAINT skill_prompt_templates_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: skill_repositories skill_repositories_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.skill_repositories
    ADD CONSTRAINT skill_repositories_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: skills skills_createdBy_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.skills
    ADD CONSTRAINT "skills_createdBy_users_id_fk" FOREIGN KEY ("createdBy") REFERENCES public.users(id);


--
-- Name: skills skills_repositoryId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.skills
    ADD CONSTRAINT "skills_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES public.skill_repositories(id);


--
-- Name: support_tickets support_tickets_assigned_to_fkey; Type: FK CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.support_tickets
    ADD CONSTRAINT support_tickets_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: support_tickets support_tickets_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.support_tickets
    ADD CONSTRAINT support_tickets_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: system_settings system_settings_updatedBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.system_settings
    ADD CONSTRAINT "system_settings_updatedBy_fkey" FOREIGN KEY ("updatedBy") REFERENCES public.users(id);


--
-- Name: template_purchases template_purchases_buyer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.template_purchases
    ADD CONSTRAINT template_purchases_buyer_id_fkey FOREIGN KEY (buyer_id) REFERENCES public.users(id);


--
-- Name: template_purchases template_purchases_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.template_purchases
    ADD CONSTRAINT template_purchases_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.marketplace_templates(id);


--
-- Name: template_revenue_ledger template_revenue_ledger_buyer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.template_revenue_ledger
    ADD CONSTRAINT template_revenue_ledger_buyer_id_fkey FOREIGN KEY (buyer_id) REFERENCES public.users(id);


--
-- Name: template_revenue_ledger template_revenue_ledger_creator_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.template_revenue_ledger
    ADD CONSTRAINT template_revenue_ledger_creator_id_fkey FOREIGN KEY (creator_id) REFERENCES public.users(id);


--
-- Name: template_revenue_ledger template_revenue_ledger_purchase_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.template_revenue_ledger
    ADD CONSTRAINT template_revenue_ledger_purchase_id_fkey FOREIGN KEY (purchase_id) REFERENCES public.template_purchases(id);


--
-- Name: template_revenue_ledger template_revenue_ledger_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.template_revenue_ledger
    ADD CONSTRAINT template_revenue_ledger_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.marketplace_templates(id);


--
-- Name: template_reviews template_reviews_purchase_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.template_reviews
    ADD CONSTRAINT template_reviews_purchase_id_fkey FOREIGN KEY (purchase_id) REFERENCES public.template_purchases(id);


--
-- Name: template_reviews template_reviews_reviewer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.template_reviews
    ADD CONSTRAINT template_reviews_reviewer_id_fkey FOREIGN KEY (reviewer_id) REFERENCES public.users(id);


--
-- Name: template_reviews template_reviews_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.template_reviews
    ADD CONSTRAINT template_reviews_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.marketplace_templates(id);


--
-- Name: tenant_pages tenant_pages_tenantid_tenants_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.tenant_pages
    ADD CONSTRAINT tenant_pages_tenantid_tenants_id_fk FOREIGN KEY ("tenantId") REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: tenant_users tenant_users_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.tenant_users
    ADD CONSTRAINT tenant_users_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: tenant_users tenant_users_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.tenant_users
    ADD CONSTRAINT tenant_users_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: tenants tenants_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.tenants
    ADD CONSTRAINT tenants_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public.users(id);


--
-- Name: ticket_messages ticket_messages_ticket_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.ticket_messages
    ADD CONSTRAINT ticket_messages_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES public.support_tickets(id) ON DELETE CASCADE;


--
-- Name: ticket_messages ticket_messages_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.ticket_messages
    ADD CONSTRAINT ticket_messages_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_follows user_follows_followerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.user_follows
    ADD CONSTRAINT "user_follows_followerId_fkey" FOREIGN KEY ("followerId") REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_follows user_follows_followingId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.user_follows
    ADD CONSTRAINT "user_follows_followingId_fkey" FOREIGN KEY ("followingId") REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_notifications user_notifications_conversationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.user_notifications
    ADD CONSTRAINT "user_notifications_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES public.conversations(id) ON DELETE SET NULL;


--
-- Name: user_notifications user_notifications_scheduledMessageId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.user_notifications
    ADD CONSTRAINT "user_notifications_scheduledMessageId_fkey" FOREIGN KEY ("scheduledMessageId") REFERENCES public.scheduled_messages(id) ON DELETE SET NULL;


--
-- Name: user_notifications user_notifications_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.user_notifications
    ADD CONSTRAINT "user_notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_preferences user_preferences_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.user_preferences
    ADD CONSTRAINT user_preferences_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_skill_visibility user_skill_visibility_skillId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.user_skill_visibility
    ADD CONSTRAINT "user_skill_visibility_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES public.skills(id) ON DELETE CASCADE;


--
-- Name: user_skill_visibility user_skill_visibility_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.user_skill_visibility
    ADD CONSTRAINT "user_skill_visibility_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: users users_currentTenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT "users_currentTenantId_fkey" FOREIGN KEY ("currentTenantId") REFERENCES public.tenants(id);


--
-- Name: vector_collections vector_collections_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.vector_collections
    ADD CONSTRAINT vector_collections_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: vector_documents vector_documents_collection_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: smartspec
--

ALTER TABLE ONLY public.vector_documents
    ADD CONSTRAINT vector_documents_collection_id_fkey FOREIGN KEY (collection_id) REFERENCES public.vector_collections(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict YOCtxgkABxoOfMuBQqzafbOO4gwMN63Ce6Ufdo3kleUFEx0oK0gIraCYpUevBno

