DO $$ BEGIN
  CREATE TYPE "public"."roadmap_topic_status" AS ENUM('Not Started', 'In Progress', 'Completed', 'Needs Revision');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "roadmap_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action,
	"name" varchar(100) NOT NULL,
	"slug" varchar(120) NOT NULL,
	"order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "roadmap_categories_user_slug_unique" UNIQUE("user_id","slug")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "roadmap_technologies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action,
	"category_id" uuid NOT NULL REFERENCES "public"."roadmap_categories"("id") ON DELETE cascade ON UPDATE no action,
	"name" varchar(100) NOT NULL,
	"slug" varchar(120) NOT NULL,
	"order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "roadmap_technologies_category_slug_unique" UNIQUE("category_id","slug")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "roadmap_topics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action,
	"technology_id" uuid NOT NULL REFERENCES "public"."roadmap_technologies"("id") ON DELETE cascade ON UPDATE no action,
	"title" varchar(255) NOT NULL,
	"slug" varchar(280) NOT NULL,
	"description" text,
	"status" "roadmap_topic_status" DEFAULT 'Not Started' NOT NULL,
	"order" integer DEFAULT 0 NOT NULL,
	"notes_short" text,
	"notes_detailed" text,
	"notes_code" text,
	"reference_url" varchar(2048),
	"last_revised_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "roadmap_topics_tech_slug_unique" UNIQUE("technology_id","slug")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "roadmap_categories_user_idx" ON "roadmap_categories" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "roadmap_technologies_user_idx" ON "roadmap_technologies" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "roadmap_technologies_category_idx" ON "roadmap_technologies" USING btree ("category_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "roadmap_topics_user_idx" ON "roadmap_topics" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "roadmap_topics_tech_idx" ON "roadmap_topics" USING btree ("technology_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "roadmap_topics_user_tech_order_idx" ON "roadmap_topics" USING btree ("user_id","technology_id","order");