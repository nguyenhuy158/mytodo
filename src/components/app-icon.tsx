import {
  AlertCircle,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  ChartColumn,
  Clock3,
  ExternalLink,
  Filter,
  GripVertical,
  LayoutDashboard,
  ListTodo,
  Loader2,
  PencilLine,
  Plus,
  RefreshCw,
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
  externalLink: ExternalLink,
  filter: Filter,
  grip: GripVertical,
  kanban: SquareKanban,
  listTodo: ListTodo,
  loader: Loader2,
  pencil: PencilLine,
  plus: Plus,
  refresh: RefreshCw,
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
