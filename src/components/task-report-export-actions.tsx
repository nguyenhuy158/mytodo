"use client";

import { toast } from "sonner";
import { AppIcon } from "@/components/app-icon";
import {
  formatTaskRowId,
  type SheetTask,
} from "@/lib/tasks";
import { cn } from "@/lib/utils";

type TaskReportScope = "month" | "week";

type TaskReportExportActionsProps = {
  className?: string;
  periodEndISO: string;
  periodLabel: string;
  periodStartISO: string;
  scope: TaskReportScope;
  tasks: SheetTask[];
};

type TaskReportStats = {
  active: number;
  blocked: number;
  done: number;
  highPriority: number;
  overdue: number;
  total: number;
};

type TaskReportBucket = {
  label: string;
  tasks: SheetTask[];
};

const REPORT_BUCKETS: Array<{
  key: keyof Pick<TaskReportStats, "done" | "overdue" | "blocked" | "highPriority">;
  label: string;
}> = [
  { key: "done", label: "Done" },
  { key: "overdue", label: "Overdue" },
  { key: "blocked", label: "Blocked" },
  { key: "highPriority", label: "High priority" },
];

export function TaskReportExportActions({
  className,
  periodEndISO,
  periodLabel,
  periodStartISO,
  scope,
  tasks,
}: TaskReportExportActionsProps) {
  const disabled = tasks.length === 0;
  const title = scope === "week" ? "báo cáo tuần" : "báo cáo tháng";

  const handleExport = (format: "csv" | "md") => {
    if (disabled) {
      toast.message("Chưa có task để export.");
      return;
    }

    const content =
      format === "csv"
        ? buildTaskReportCsv({ periodEndISO, periodLabel, periodStartISO, scope, tasks })
        : buildTaskReportMarkdown({
            periodEndISO,
            periodLabel,
            periodStartISO,
            scope,
            tasks,
          });
    const extension = format === "csv" ? "csv" : "md";
    const mimeType = format === "csv" ? "text/csv;charset=utf-8" : "text/markdown;charset=utf-8";

    downloadTextFile({
      content: format === "csv" ? `\uFEFF${content}` : content,
      fileName: buildReportFileName(scope, periodStartISO, periodEndISO, extension),
      mimeType,
    });

    toast.success(`Đã export ${title} dạng ${format.toUpperCase()}.`);
  };

  return (
    <div className={cn("flex flex-col gap-2 sm:flex-row", className)}>
      <button
        type="button"
        onClick={() => handleExport("csv")}
        disabled={disabled}
        className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white/85 px-4 text-sm font-black text-slate-800 shadow-sm transition hover:-translate-y-0.5 hover:border-teal-200 hover:text-teal-800 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
      >
        <AppIcon name="table" className="size-4" />
        CSV
      </button>
      <button
        type="button"
        onClick={() => handleExport("md")}
        disabled={disabled}
        className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white/85 px-4 text-sm font-black text-slate-800 shadow-sm transition hover:-translate-y-0.5 hover:border-teal-200 hover:text-teal-800 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
      >
        <AppIcon name="fileText" className="size-4" />
        Markdown
      </button>
    </div>
  );
}

function buildTaskReportCsv({
  periodEndISO,
  periodLabel,
  periodStartISO,
  scope,
  tasks,
}: TaskReportExportActionsProps) {
  const stats = buildTaskReportStats(tasks);
  const buckets = buildTaskReportBuckets(tasks);
  const summaryRows = [
    ["summary", "scope", getScopeLabel(scope)],
    ["summary", "period", periodLabel],
    ["summary", "start", periodStartISO],
    ["summary", "end", periodEndISO],
    ["summary", "total", String(stats.total)],
    ["summary", "done", String(stats.done)],
    ["summary", "overdue", String(stats.overdue)],
    ["summary", "blocked", String(stats.blocked)],
    ["summary", "high_priority", String(stats.highPriority)],
    ["summary", "active", String(stats.active)],
  ];
  const taskRows = buckets.flatMap((bucket) =>
    bucket.tasks.map((task) => [
      bucket.label,
      "",
      "",
      formatTaskRowId(task.rowNumber),
      task.id,
      task.task,
      task.status,
      task.priority,
      task.system,
      task.tags,
      task.dateReceived,
      task.deadline,
      task.actualDate,
      formatTimelineDays(task.timelineDays),
      task.note,
    ]),
  );

  return [
    [
      "section",
      "metric",
      "value",
      "row_id",
      "task_id",
      "task",
      "status",
      "priority",
      "system",
      "tags",
      "date_received",
      "deadline",
      "actual_date",
      "timeline_days",
      "note",
    ],
    ...summaryRows.map(([section, metric, value]) => [
      section,
      metric,
      value,
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
    ]),
    ...taskRows,
  ]
    .map((row) => row.map(csvCell).join(","))
    .join("\n");
}

function buildTaskReportMarkdown({
  periodEndISO,
  periodLabel,
  periodStartISO,
  scope,
  tasks,
}: TaskReportExportActionsProps) {
  const stats = buildTaskReportStats(tasks);
  const buckets = buildTaskReportBuckets(tasks);
  const title = `# ${getScopeLabel(scope)} report: ${periodLabel}`;
  const summary = [
    `- Period: ${periodStartISO} -> ${periodEndISO}`,
    `- Total: ${stats.total}`,
    `- Done: ${stats.done}`,
    `- Overdue: ${stats.overdue}`,
    `- Blocked: ${stats.blocked}`,
    `- High priority: ${stats.highPriority}`,
    `- Active: ${stats.active}`,
  ];

  return [
    title,
    "",
    "## Summary",
    ...summary,
    "",
    ...buckets.flatMap((bucket) => [
      `## ${bucket.label} (${bucket.tasks.length})`,
      "",
      bucket.tasks.length
        ? buildMarkdownTaskTable(bucket.tasks)
        : "_Không có task._",
      "",
    ]),
  ].join("\n");
}

function buildTaskReportStats(tasks: SheetTask[]): TaskReportStats {
  return {
    active: tasks.filter((task) => task.status !== "Done").length,
    blocked: tasks.filter(isBlockedTask).length,
    done: tasks.filter(isDoneTask).length,
    highPriority: tasks.filter(isHighPriorityTask).length,
    overdue: tasks.filter(isOverdueTask).length,
    total: tasks.length,
  };
}

function buildTaskReportBuckets(tasks: SheetTask[]): TaskReportBucket[] {
  return REPORT_BUCKETS.map((bucket) => ({
    label: bucket.label,
    tasks: tasks.filter(getBucketPredicate(bucket.key)),
  }));
}

function getBucketPredicate(
  bucket: keyof Pick<TaskReportStats, "done" | "overdue" | "blocked" | "highPriority">,
) {
  const predicates = {
    blocked: isBlockedTask,
    done: isDoneTask,
    highPriority: isHighPriorityTask,
    overdue: isOverdueTask,
  } satisfies Record<
    keyof Pick<TaskReportStats, "done" | "overdue" | "blocked" | "highPriority">,
    (task: SheetTask) => boolean
  >;

  return predicates[bucket];
}

function buildMarkdownTaskTable(tasks: SheetTask[]) {
  return [
    "| Row | Task | Status | Priority | Deadline | Note |",
    "| --- | --- | --- | --- | --- | --- |",
    ...tasks.map((task) =>
      [
        formatTaskRowId(task.rowNumber),
        markdownCell(task.task),
        markdownCell(task.status),
        markdownCell(task.priority),
        markdownCell(task.deadline || "No deadline"),
        markdownCell(task.note || ""),
      ].join(" | "),
    ),
  ].join("\n");
}

function isDoneTask(task: SheetTask) {
  return task.status === "Done";
}

function isOverdueTask(task: SheetTask) {
  return task.status !== "Done" && task.isOverdue;
}

function isBlockedTask(task: SheetTask) {
  return task.status === "Blocked";
}

function isHighPriorityTask(task: SheetTask) {
  return task.status !== "Done" && task.priority === "High";
}

function csvCell(value: string) {
  return `"${value.replaceAll("\"", "\"\"").replaceAll(/\r?\n/g, " ")}"`;
}

function markdownCell(value: string) {
  return value.replaceAll("|", "\\|").replaceAll(/\r?\n/g, "<br>");
}

function formatTimelineDays(days: number | null) {
  return typeof days === "number" ? String(days) : "";
}

function getScopeLabel(scope: TaskReportScope) {
  return scope === "week" ? "Weekly" : "Monthly";
}

function buildReportFileName(
  scope: TaskReportScope,
  periodStartISO: string,
  periodEndISO: string,
  extension: "csv" | "md",
) {
  return `task-report-${scope}-${periodStartISO}-${periodEndISO}.${extension}`;
}

function downloadTextFile({
  content,
  fileName,
  mimeType,
}: {
  content: string;
  fileName: string;
  mimeType: string;
}) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = fileName;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
