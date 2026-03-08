CREATE TABLE `execution_steps` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`execution_id` text NOT NULL,
	`step_id` text NOT NULL,
	`status` text NOT NULL,
	`started_at` integer,
	`completed_at` integer,
	`duration` integer,
	`error` text,
	`logs` text,
	`attempts` integer DEFAULT 0 NOT NULL,
	`assertions` text,
	FOREIGN KEY (`execution_id`) REFERENCES `executions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_steps_execution_id` ON `execution_steps` (`execution_id`);--> statement-breakpoint
CREATE TABLE `executions` (
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
	`report` text
);
--> statement-breakpoint
CREATE INDEX `idx_executions_scenario_started` ON `executions` (`scenario_id`,`started_at`);--> statement-breakpoint
CREATE INDEX `idx_executions_status_started` ON `executions` (`status`,`started_at`);