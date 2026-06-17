import type { TaskHistoryRepository } from "@/domain/tasks/ports";
import type {
  SheetTask,
  TaskBackupSummary,
  TaskCreateInput,
  TaskHistoryTarget,
  TaskUpdateInput,
} from "@/lib/tasks";

const DEFAULT_HISTORY_LIMIT = 100;

const TASK_FIELD_LABELS = {
  tags: "Tags",
  system: "System",
  task: "Task",
  details: "Details",
  priority: "Priority",
  status: "Status",
  timeline: "Timeline",
  dateReceived: "Date Received",
  deadline: "Deadline",
  actualDate: "Actual Date",
  note: "Note",
} satisfies Record<keyof TaskUpdateInput["updates"], string>;

type TaskField = keyof typeof TASK_FIELD_LABELS;

export function createTaskHistoryService(
  historyRepository: TaskHistoryRepository,
) {
  return {
    listHistory(options?: { limit?: number }) {
      return historyRepository.listEntries({
        limit: options?.limit ?? DEFAULT_HISTORY_LIMIT,
      });
    },
    recordTaskCreate({
      actorEmail,
      createdTask,
      input,
    }: {
      actorEmail: string;
      createdTask?: SheetTask;
      input: TaskCreateInput;
    }) {
      const target = getTaskTarget(createdTask, input.task);
      const changes = buildCreateChanges(input);

      return historyRepository.appendEntry({
        actorEmail,
        action: "task.create",
        summary: `Tạo task${target.taskTitle ? `: ${target.taskTitle}` : ""}`,
        target,
        changes,
        metadata: {
          rowNumber: createdTask?.rowNumber ?? null,
        },
      });
    },
    recordTaskUpdate({
      actorEmail,
      afterTask,
      beforeTask,
      input,
    }: {
      actorEmail: string;
      afterTask?: SheetTask;
      beforeTask?: SheetTask;
      input: TaskUpdateInput;
    }) {
      const target = getTaskTarget(afterTask ?? beforeTask, input.updates.task);
      const changes = buildUpdateChanges(input, beforeTask, afterTask);

      return historyRepository.appendEntry({
        actorEmail,
        action: "task.update",
        summary: `Update row ${input.rowNumber}${target.taskTitle ? `: ${target.taskTitle}` : ""}`,
        target: {
          ...target,
          rowNumber: input.rowNumber,
        },
        changes,
        metadata: {
          updatedFieldCount: Object.keys(input.updates).length,
          changedFieldCount: changes.length,
        },
      });
    },
    recordBackupCreate({
      actorEmail,
      backup,
    }: {
      actorEmail: string;
      backup: TaskBackupSummary;
    }) {
      return historyRepository.appendEntry({
        actorEmail,
        action: "backup.create",
        summary: `Tạo backup ${shortId(backup.id)} (${backup.taskCount} task)`,
        target: {
          type: "backup",
          backupId: backup.id,
        },
        changes: [],
        metadata: {
          backupId: backup.id,
          rowCount: backup.rowCount,
          taskCount: backup.taskCount,
          source: backup.source,
          note: backup.note ?? null,
        },
      });
    },
    recordBackupRestore({
      actorEmail,
      backup,
      safetyBackup,
    }: {
      actorEmail: string;
      backup: TaskBackupSummary;
      safetyBackup?: TaskBackupSummary;
    }) {
      return historyRepository.appendEntry({
        actorEmail,
        action: "backup.restore",
        summary: `Restore backup ${shortId(backup.id)} (${backup.taskCount} task)`,
        target: {
          type: "sheet",
          backupId: backup.id,
        },
        changes: [
          {
            field: "backupId",
            label: "Restore backup",
            before: "",
            after: backup.id,
          },
          ...(safetyBackup
            ? [
                {
                  field: "safetyBackupId",
                  label: "Safety backup",
                  before: "",
                  after: safetyBackup.id,
                },
              ]
            : []),
        ],
        metadata: {
          backupId: backup.id,
          safetyBackupId: safetyBackup?.id ?? null,
          rowCount: backup.rowCount,
          taskCount: backup.taskCount,
          source: backup.source,
        },
      });
    },
  };
}

function buildCreateChanges(input: TaskCreateInput) {
  return TASK_FIELDS.flatMap((field) => {
    const value = getCreateInputValue(input, field);

    if (!value) {
      return [];
    }

    return [
      {
        field,
        label: TASK_FIELD_LABELS[field],
        before: "",
        after: value,
      },
    ];
  });
}

function buildUpdateChanges(
  input: TaskUpdateInput,
  beforeTask?: SheetTask,
  afterTask?: SheetTask,
) {
  return TASK_FIELDS.flatMap((field) => {
    if (!(field in input.updates)) {
      return [];
    }

    const before = beforeTask
      ? getTaskFieldValue(beforeTask, field)
      : "";
    const after = afterTask
      ? getTaskFieldValue(afterTask, field)
      : getUpdateInputValue(input, field);

    if (before === after) {
      return [];
    }

    return [
      {
        field,
        label: TASK_FIELD_LABELS[field],
        before,
        after,
      },
    ];
  });
}

function getTaskTarget(
  task: SheetTask | undefined,
  fallbackTitle?: string,
): TaskHistoryTarget {
  return {
    type: "task",
    rowNumber: task?.rowNumber,
    taskId: task?.id,
    taskTitle: task?.task || fallbackTitle?.trim() || undefined,
  };
}

function getCreateInputValue(input: TaskCreateInput, field: TaskField) {
  if (field === "priority" || field === "status") {
    return input[field];
  }

  return (input[field] ?? "").trim();
}

function getUpdateInputValue(input: TaskUpdateInput, field: TaskField) {
  const value = input.updates[field];

  return typeof value === "string" ? value.trim() : "";
}

function getTaskFieldValue(task: SheetTask, field: TaskField) {
  if (field === "dateReceived") {
    return task.dateReceived.trim();
  }

  if (field === "actualDate") {
    return task.actualDate.trim();
  }

  return String(task[field] ?? "").trim();
}

function shortId(value: string) {
  return value.slice(0, 8);
}

const TASK_FIELDS = Object.keys(TASK_FIELD_LABELS) as TaskField[];
