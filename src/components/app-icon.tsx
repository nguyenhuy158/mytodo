import {
  AlertCircle,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  ChartColumn,
  Clock3,
  DatabaseBackup,
  ExternalLink,
  Filter,
  GripVertical,
  LayoutDashboard,
  ListTodo,
  LogOut,
  Loader2,
  Settings,
  PencilLine,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Sparkles,
  SquareKanban,
  TimerReset,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

const icons = {
  alertCircle: AlertCircle,
  calendarClock: CalendarClock,
  calendarDays: CalendarDays,
  chart: ChartColumn,
  checkCircle: CheckCircle2,
  clock: Clock3,
  dashboard: LayoutDashboard,
  databaseBackup: DatabaseBackup,
  externalLink: ExternalLink,
  filter: Filter,
  grip: GripVertical,
  kanban: SquareKanban,
  listTodo: ListTodo,
  loader: Loader2,
  logOut: LogOut,
  pencil: PencilLine,
  plus: Plus,
  refresh: RefreshCw,
  settings: Settings,
  restore: RotateCcw,
  search: Search,
  sparkles: Sparkles,
  timerReset: TimerReset,
} satisfies Record<string, LucideIcon>;

export type AppIconName = keyof typeof icons;

type AppIconProps = Omit<React.ComponentPropsWithoutRef<LucideIcon>, "name"> & {
  name: AppIconName;
};

export function AppIcon({
  name,
  className,
  strokeWidth = 2,
  ...props
}: AppIconProps) {
  const Icon = icons[name];

  return (
    <Icon
      aria-hidden="true"
      className={cn("shrink-0", className)}
      strokeWidth={strokeWidth}
      {...props}
    />
  );
}
