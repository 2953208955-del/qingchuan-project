CREATE TABLE `agent_steps` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`step` text NOT NULL,
	`status` text NOT NULL,
	`tool_name` text,
	`input_json` text,
	`output_json` text,
	`detail` text,
	`latency_ms` integer,
	`cost_cny` real,
	`error` text,
	`started_at` integer NOT NULL,
	`finished_at` integer
);
--> statement-breakpoint
CREATE TABLE `analysis_cache` (
	`key` text PRIMARY KEY NOT NULL,
	`value_json` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `clauses` (
	`id` text PRIMARY KEY NOT NULL,
	`document_id` text NOT NULL,
	`standard_no` text NOT NULL,
	`clause_no` text NOT NULL,
	`title` text NOT NULL,
	`content` text NOT NULL,
	`category_tags` text DEFAULT '[]' NOT NULL,
	`embedding_json` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `detections` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`image_id` text NOT NULL,
	`category` text NOT NULL,
	`material` text,
	`confidence` real NOT NULL,
	`bbox_json` text,
	`description` text NOT NULL,
	`source` text NOT NULL,
	`review_status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `feedback` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`image_id` text NOT NULL,
	`correction_json` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `images` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`filename` text NOT NULL,
	`path` text NOT NULL,
	`sha256` text NOT NULL,
	`width` integer,
	`height` integer,
	`exif_json` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`hint` text
);
--> statement-breakpoint
CREATE TABLE `reports` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`version` integer NOT NULL,
	`content_json` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `runs` (
	`id` text PRIMARY KEY NOT NULL,
	`status` text DEFAULT 'idle' NOT NULL,
	`instruction` text NOT NULL,
	`location` text,
	`focus_categories` text DEFAULT '[]' NOT NULL,
	`prompt_version` text,
	`total_cost_cny` real DEFAULT 0 NOT NULL,
	`error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
