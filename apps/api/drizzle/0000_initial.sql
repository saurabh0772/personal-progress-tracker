CREATE TYPE "public"."activity_type" AS ENUM('Learned', 'Practiced', 'Built', 'Fixed', 'Revised', 'Researched', 'Other');
CREATE TYPE "public"."activity_status" AS ENUM('Completed', 'In Progress', 'Needs Revision');
CREATE TYPE "public"."difficulty" AS ENUM('Easy', 'Medium', 'Hard');
CREATE TABLE "users" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "email" varchar(254) NOT NULL,
  "password_hash" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "users_email_unique" UNIQUE("email")
);
CREATE TABLE "categories" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "name" varchar(60) NOT NULL,
  "slug" varchar(80) NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "categories_user_slug_unique" UNIQUE("user_id", "slug")
);
CREATE TABLE "tags" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "name" varchar(40) NOT NULL,
  "slug" varchar(60) NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "tags_user_slug_unique" UNIQUE("user_id", "slug")
);
CREATE TABLE "activities" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "category_id" uuid REFERENCES "categories"("id") ON DELETE set null,
  "title" varchar(180) NOT NULL,
  "description" text,
  "activity_type" "activity_type" DEFAULT 'Learned' NOT NULL,
  "status" "activity_status" DEFAULT 'Completed' NOT NULL,
  "reference_url" varchar(2048),
  "duration_minutes" integer,
  "difficulty" "difficulty",
  "activity_date" date DEFAULT now() NOT NULL,
  "started_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "activity_tags" (
  "activity_id" uuid NOT NULL REFERENCES "activities"("id") ON DELETE cascade,
  "tag_id" uuid NOT NULL REFERENCES "tags"("id") ON DELETE cascade,
  CONSTRAINT "activity_tags_activity_id_tag_id_pk" PRIMARY KEY("activity_id", "tag_id")
);
CREATE INDEX "categories_user_idx" ON "categories" USING btree ("user_id");
CREATE INDEX "tags_user_idx" ON "tags" USING btree ("user_id");
CREATE INDEX "activities_user_date_idx" ON "activities" USING btree ("user_id", "activity_date");
CREATE INDEX "activities_user_category_idx" ON "activities" USING btree ("user_id", "category_id");
CREATE INDEX "activities_created_idx" ON "activities" USING btree ("user_id", "created_at");

CREATE TABLE IF NOT EXISTS "daily_summaries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "summary_date" date NOT NULL,
  "summary" text DEFAULT '' NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "daily_summaries_user_date_unique" UNIQUE("user_id", "summary_date")
);
CREATE INDEX IF NOT EXISTS "daily_summaries_user_date_idx" ON "daily_summaries" USING btree ("user_id", "summary_date");
