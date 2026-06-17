import "server-only";

import type { TaskConfigRepository } from "@/domain/tasks/ports";
import {
  createTaskConfigItem,
  deleteTaskConfigItem,
  listTaskConfigItems,
  updateTaskConfigItem,
} from "@/lib/task-config";

export function createGoogleSheetTaskConfigRepository(): TaskConfigRepository {
  return {
    createConfig: createTaskConfigItem,
    deleteConfig: deleteTaskConfigItem,
    listConfigs: listTaskConfigItems,
    updateConfig: updateTaskConfigItem,
  };
}
