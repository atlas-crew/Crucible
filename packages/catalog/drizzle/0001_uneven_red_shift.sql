-- Add new nullable columns to execution_steps (matches the runtime ensureTables
-- ALTER path so fresh drizzle-kit deployments end up in the same shape).
ALTER TABLE `execution_steps` ADD `result` text;--> statement-breakpoint
ALTER TABLE `execution_steps` ADD `details` text;--> statement-breakpoint

-- Add target_url to executions as nullable first. SQLite cannot ADD COLUMN
-- with NOT NULL and no DEFAULT on a non-empty table, and we intentionally
-- avoid baking a DEFAULT into the column so application code cannot silently
-- insert rows without a target. Instead we backfill, then rebuild the table
-- with target_url NOT NULL.
ALTER TABLE `executions` ADD `target_url` text;--> statement-breakpoint

-- Backfill historical rows with a clear sentinel so old executions remain
-- distinguishable from new ones in reports and history views.
UPDATE `executions` SET `target_url` = 'unknown' WHERE `target_url` IS NULL;--> statement-breakpoint

-- Rebuild executions with target_url NOT NULL. SQLite has no ALTER COLUMN
-- so we copy rows into a fresh table, drop the old one, and rename.
CREATE TABLE `executions_new` (
  `id` text PRIMARY KEY NOT NULL,
  `scenario_id` text NOT NULL,
  `mode` text NOT NULL,
  `status` text NOT NULL,
  `started_at` integer,
  `completed_at` integer,
  `duration` integer,
  `error` text,
  `trigger_data` text,
  `metadata` text,
  `context` text,
  `paused_state` text,
  `parent_execution_id` text,
  `target_url` text NOT NULL,
  `report` text
);--> statement-breakpoint

INSERT INTO `executions_new` (
  `id`, `scenario_id`, `mode`, `status`, `started_at`, `completed_at`, `duration`,
  `error`, `trigger_data`, `metadata`, `context`, `paused_state`,
  `parent_execution_id`, `target_url`, `report`
)
SELECT
  `id`, `scenario_id`, `mode`, `status`, `started_at`, `completed_at`, `duration`,
  `error`, `trigger_data`, `metadata`, `context`, `paused_state`,
  `parent_execution_id`, `target_url`, `report`
FROM `executions`;--> statement-breakpoint

DROP TABLE `executions`;--> statement-breakpoint
ALTER TABLE `executions_new` RENAME TO `executions`;--> statement-breakpoint

-- Recreate indexes on the rebuilt table. idx_executions_scenario_started and
-- idx_executions_status_started were defined in 0000 and dropped with the
-- original table; idx_executions_target_url is new with this migration.
CREATE INDEX `idx_executions_scenario_started` ON `executions` (`scenario_id`,`started_at`);--> statement-breakpoint
CREATE INDEX `idx_executions_status_started` ON `executions` (`status`,`started_at`);--> statement-breakpoint
CREATE INDEX `idx_executions_target_url` ON `executions` (`target_url`);
