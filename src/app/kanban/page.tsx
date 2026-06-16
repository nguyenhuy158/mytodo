import type { Metadata } from "next";
import { KanbanTasksPage } from "@/components/kanban-tasks-page";

export const metadata: Metadata = {
  title: "Kanban | 2026 To-do Cockpit",
  description: "Kanban board grouped by task status from Google Sheet.",
};

export default function KanbanPage() {
  return <KanbanTasksPage />;
}
