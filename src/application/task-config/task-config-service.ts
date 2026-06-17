import type { TaskConfigRepository } from "@/domain/tasks/ports";
import type {
  TaskConfigCategory,
  TaskConfigCreateInput,
  TaskConfigDeleteInput,
  TaskConfigItem,
  TaskConfigsPayload,
  TaskConfigUpdateInput,
} from "@/lib/tasks";

const CONFIG_CATEGORIES: TaskConfigCategory[] = [
  "status",
  "priority",
  "system",
  "tags",
];

export function createTaskConfigService(
  taskConfigRepository: TaskConfigRepository,
) {
  const listConfigs = async (): Promise<TaskConfigsPayload> => {
    const items = await taskConfigRepository.listConfigs();

    return toConfigsPayload(items);
  };

  return {
    listConfigs,
    async createConfig(input: TaskConfigCreateInput) {
      const item = await taskConfigRepository.createConfig(input);
      const payload = await listConfigs();

      return {
        ...payload,
        item,
      };
    },
    async updateConfig(input: TaskConfigUpdateInput) {
      const item = await taskConfigRepository.updateConfig(input);
      const payload = await listConfigs();

      return {
        ...payload,
        item,
      };
    },
    async deleteConfig(input: TaskConfigDeleteInput) {
      const item = await taskConfigRepository.deleteConfig(input);
      const payload = await listConfigs();

      return {
        ...payload,
        item,
      };
    },
  };
}

function toConfigsPayload(items: TaskConfigItem[]): TaskConfigsPayload {
  const configs = Object.fromEntries(
    CONFIG_CATEGORIES.map((category) => [
      category,
      items
        .filter((item) => item.category === category)
        .sort(
          (left, right) =>
            left.order - right.order || left.label.localeCompare(right.label),
        ),
    ]),
  ) as Record<TaskConfigCategory, TaskConfigItem[]>;

  return {
    configs,
    meta: {
      updatedAt: new Date().toISOString(),
      sheetTitle: process.env.TASK_CONFIG_SHEET_TITLE?.trim() || "App Config",
      total: items.length,
    },
  };
}
