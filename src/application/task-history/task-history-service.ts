import type { TaskHistoryRepository } from "@/domain/tasks/ports";
import type {
  SheetTask,
  TaskBackupSummary,
  TaskCreateInput,
  TaskHistoryMetadataValue,
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
type AuditMetadata = Record<string, TaskHistoryMetadataValue>;

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
      requestContext,
    }: {
      actorEmail: string;
      createdTask?: SheetTask;
      input: TaskCreateInput;
      requestContext?: AuditMetadata;
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
          request: requestContext ?? null,
          submittedFields: getCreateSubmittedFields(input),
          rowNumber: createdTask?.rowNumber ?? null,
          inputSnapshot: buildCreateInputSnapshot(input),
          createdSnapshot: buildTaskSnapshot(createdTask),
        },
      });
    },
    recordTaskUpdate({
      actorEmail,
      afterTask,
      beforeTask,
      input,
      requestContext,
    }: {
      actorEmail: string;
      afterTask?: SheetTask;
      beforeTask?: SheetTask;
      input: TaskUpdateInput;
      requestContext?: AuditMetadata;
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
          request: requestContext ?? null,
          submittedFields: Object.keys(input.updates),
          updatedFieldCount: Object.keys(input.updates).length,
          changedFieldCount: changes.length,
          submittedPatch: buildUpdateInputSnapshot(input),
          beforeSnapshot: buildTaskSnapshot(beforeTask),
          afterSnapshot: buildTaskSnapshot(afterTask),
        },
      });
    },
    recordBackupCreate({
      actorEmail,
      backup,
      requestContext,
    }: {
      actorEmail: string;
      backup: TaskBackupSummary;
      requestContext?: AuditMetadata;
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
          request: requestContext ?? null,
          backupSnapshot: buildBackupSnapshot(backup),
        },
      });
    },
    recordBackupRestore({
      actorEmail,
      backup,
      requestContext,
      safetyBackup,
    }: {
      actorEmail: string;
      backup: TaskBackupSummary;
      requestContext?: AuditMetadata;
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
          request: requestContext ?? null,
          backupSnapshot: buildBackupSnapshot(backup),
          safetyBackupSnapshot: safetyBackup
            ? buildBackupSnapshot(safetyBackup)
            : null,
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

function buildTaskSnapshot(task?: SheetTask): TaskHistoryMetadataValue {
  if (!task) {
    return null;
  }

  return {
    id: task.id,
    rowNumber: task.rowNumber,
    tags: task.tags,
    system: task.system,
    task: task.task,
    details: task.details,
    priority: task.priority,
    status: task.status,
    timeline: task.timeline,
    timelineDays: task.timelineDays,
    dateReceived: task.dateReceived,
    deadline: task.deadline,
    actualDate: task.actualDate,
    note: task.note,
    startDateISO: task.startDateISO,
    deadlineISO: task.deadlineISO,
    actualDateISO: task.actualDateISO,
    daysLeft: task.daysLeft,
    isOverdue: task.isOverdue,
  };
}

function buildCreateInputSnapshot(input: TaskCreateInput): TaskHistoryMetadataValue {
  return {
    tags: input.tags ?? null,
    system: input.system ?? null,
    task: input.task,
    details: input.details ?? null,
    priority: input.priority,
    status: input.status,
    timeline: input.timeline ?? null,
    dateReceived: input.dateReceived ?? null,
    deadline: input.deadline ?? null,
    actualDate: input.actualDate ?? null,
    note: input.note ?? null,
  };
}

function buildUpdateInputSnapshot(input: TaskUpdateInput): TaskHistoryMetadataValue {
  return {
    rowNumber: input.rowNumber,
    updates: Object.fromEntries(
      Object.entries(input.updates).map(([key, value]) => [key, value ?? null]),
    ),
  };
}

function buildBackupSnapshot(backup: TaskBackupSummary): TaskHistoryMetadataValue {
  return {
    id: backup.id,
    version: backup.version,
    createdAt: backup.createdAt,
    source: backup.source,
    spreadsheetId: backup.spreadsheetId,
    sheetTitle: backup.sheetTitle,
    range: backup.range,
    rowCount: backup.rowCount,
    columnCount: backup.columnCount,
    taskCount: backup.taskCount,
    note: backup.note ?? null,
  };
}

function getCreateSubmittedFields(input: TaskCreateInput) {
  return TASK_FIELDS.filter((field) => getCreateInputValue(input, field));
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
