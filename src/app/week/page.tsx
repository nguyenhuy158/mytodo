import type { Metadata } from "next";
import { WeeklyTasksPage } from "@/components/weekly-tasks-page";

export const metadata: Metadata = {
  title: "Task trong tuần | 2026 To-do Cockpit",
  description: "Weekly task view from Monday to Sunday.",
};

export default function WeekPage() {
  return <WeeklyTasksPage />;
}
