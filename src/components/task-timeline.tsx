import type { SheetTask } from "@/lib/tasks";
import { cn } from "@/lib/utils";

type TaskTimelineValue = Pick<SheetTask, "timeline" | "timelineDays">;

export function TaskTimelinePill({
  task,
  className,
}: {
  task: TaskTimelineValue;
  className?: string;
}) {
  const label = formatTaskTimeline(task);

  if (!label) {
    return null;
  }

  return (
    <span
      className={cn(
        "rounded-full bg-indigo-50 px-3 py-1 text-xs font-black text-indigo-700",
        className,
      )}
    >
      Timeline: {label}
    </span>
  );
}

export function formatTaskTimeline(task: TaskTimelineValue) {
  const raw = task.timeline.trim();

  if (task.timelineDays === null) {
    return raw;
  }

  return `${formatTimelineNumber(task.timelineDays)} ngày`;
}

function formatTimelineNumber(value: number) {
  return new Intl.NumberFormat("vi-VN", {
    maximumFractionDigits: 2,
  }).format(value);
}
