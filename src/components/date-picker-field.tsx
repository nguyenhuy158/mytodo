"use client";

import {
  DayFlag,
  DayPicker,
  SelectionState,
  UI,
  type ChevronProps,
  type ClassNames,
} from "@daypicker/react";
import {
  autoUpdate,
  flip,
  FloatingFocusManager,
  FloatingPortal,
  offset,
  shift,
  useClick,
  useDismiss,
  useFloating,
  useInteractions,
  useRole,
} from "@floating-ui/react";
import {
  useId,
  useMemo,
  useState,
} from "react";
import { AppIcon, type AppIconName } from "@/components/app-icon";
import { cn } from "@/lib/utils";

const POPOVER_MARGIN = 12;

const CALENDAR_CLASS_NAMES: Partial<ClassNames> = {
  [UI.Root]: "relative text-slate-900",
  [UI.Months]: "relative flex flex-col",
  [UI.Month]: "space-y-3",
  [UI.MonthCaption]: "flex h-9 items-center justify-center px-10",
  [UI.CaptionLabel]: "text-sm font-black text-slate-950",
  [UI.Nav]: "absolute left-0 right-0 top-0 flex h-9 items-center justify-between",
  [UI.PreviousMonthButton]:
    "inline-flex size-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:border-teal-200 hover:bg-teal-50 hover:text-teal-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-100 disabled:cursor-not-allowed disabled:opacity-40",
  [UI.NextMonthButton]:
    "inline-flex size-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:border-teal-200 hover:bg-teal-50 hover:text-teal-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-100 disabled:cursor-not-allowed disabled:opacity-40",
  [UI.Chevron]: "size-4",
  [UI.MonthGrid]: "w-full border-separate border-spacing-y-1",
  [UI.Weekday]:
    "h-8 w-10 text-center text-[0.68rem] font-black uppercase text-slate-400",
  [UI.Day]: "size-10 p-0 text-center align-middle",
  [UI.DayButton]:
    "mx-auto flex size-9 items-center justify-center rounded-xl border border-transparent text-sm font-bold text-slate-700 transition hover:border-teal-200 hover:bg-teal-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-100 disabled:cursor-not-allowed disabled:opacity-40",
  [DayFlag.today]: "[&>button]:border-teal-300 [&>button]:text-teal-800",
  [DayFlag.outside]: "[&>button]:text-slate-300",
  [DayFlag.disabled]: "[&>button]:cursor-not-allowed [&>button]:opacity-30",
  [SelectionState.selected]:
    "[&>button]:border-slate-950 [&>button]:bg-slate-950 [&>button]:text-white [&>button]:shadow-lg [&>button]:shadow-slate-950/15 hover:[&>button]:bg-slate-900",
};

type DatePickerFieldProps = {
  className?: string;
  disabled?: boolean;
  id?: string;
  inputClassName?: string;
  label: string;
  labelClassName?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  value: string;
};

export function DatePickerField({
  className,
  disabled = false,
  id,
  inputClassName,
  label,
  labelClassName,
  onChange,
  placeholder = "Chọn ngày",
  value,
}: DatePickerFieldProps) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const labelId = `${fieldId}-label`;
  const popoverId = `${fieldId}-calendar`;
  const [isOpen, setIsOpen] = useState(false);
  const selectedDate = useMemo(() => parseInputDate(value), [value]);
  const [month, setMonth] = useState<Date>(() => selectedDate ?? new Date());
  const {
    context,
    floatingStyles,
    refs: { setFloating, setReference },
  } = useFloating({
    middleware: [
      offset(8),
      flip({ padding: POPOVER_MARGIN }),
      shift({ padding: POPOVER_MARGIN }),
    ],
    onOpenChange: setIsOpen,
    open: isOpen,
    placement: "bottom-start",
    strategy: "fixed",
    whileElementsMounted: autoUpdate,
  });
  const click = useClick(context);
  const dismiss = useDismiss(context);
  const role = useRole(context, { role: "dialog" });
  const { getFloatingProps, getReferenceProps } = useInteractions([
    click,
    dismiss,
    role,
  ]);

  const handleSelect = (date: Date | undefined) => {
    if (!date) {
      onChange("");
      return;
    }

    onChange(formatInputDate(date));
    setIsOpen(false);
  };

  const handleToday = () => {
    const today = new Date();

    setMonth(today);
    onChange(formatInputDate(today));
    setIsOpen(false);
  };

  const handleReferenceClick = () => {
    if (!context.open) {
      setMonth(selectedDate ?? new Date());
    }
  };

  return (
    <div
      className={cn(
        "grid gap-2 text-xs font-black uppercase tracking-[0.16em] text-slate-500",
        className,
      )}
    >
      <span id={labelId} className={labelClassName}>
        {label}
      </span>
      <button
        ref={setReference}
        id={fieldId}
        type="button"
        aria-controls={isOpen ? popoverId : undefined}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        aria-labelledby={`${labelId} ${fieldId}`}
        disabled={disabled}
        className={cn(
          "flex h-12 w-full items-center justify-between gap-3 rounded-2xl border border-white bg-white px-4 text-left text-sm font-bold normal-case tracking-normal text-slate-800 outline-none transition focus:border-teal-400 focus:ring-4 focus:ring-teal-100 disabled:cursor-wait disabled:opacity-60",
          inputClassName,
        )}
        {...getReferenceProps({ onClick: handleReferenceClick })}
      >
        <span className={cn(!value && "text-slate-400")}>
          {value ? formatDisplayDate(value) : placeholder}
        </span>
        <AppIcon name="calendarDays" className="size-4 text-slate-400" />
      </button>
      {isOpen ? (
        <FloatingPortal>
          <FloatingFocusManager context={context} modal={false}>
            <div
              ref={setFloating}
              id={popoverId}
              aria-label={`${label} calendar`}
              className="z-[140] w-[min(calc(100vw-1.5rem),20rem)] rounded-[1.25rem] border border-slate-200 bg-white p-3 shadow-2xl shadow-slate-950/20"
              style={floatingStyles}
              {...getFloatingProps()}
            >
              <DayPicker
                autoFocus
                mode="single"
                month={month}
                onMonthChange={setMonth}
                onSelect={handleSelect}
                selected={selectedDate}
                showOutsideDays
                weekStartsOn={1}
                classNames={CALENDAR_CLASS_NAMES}
                components={{ Chevron: CalendarChevron }}
              />
              <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    onChange("");
                    setIsOpen(false);
                  }}
                  className="rounded-full px-3 py-2 text-xs font-black text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-100"
                >
                  Clear
                </button>
                <button
                  type="button"
                  onClick={handleToday}
                  className="rounded-full px-3 py-2 text-xs font-black text-teal-700 transition hover:bg-teal-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-100"
                >
                  Today
                </button>
              </div>
            </div>
          </FloatingFocusManager>
        </FloatingPortal>
      ) : null}
    </div>
  );
}

function CalendarChevron({
  className,
  disabled,
  orientation = "right",
}: ChevronProps) {
  const iconName = getChevronIconName(orientation);

  return (
    <AppIcon
      name={iconName}
      className={cn("size-4", disabled && "opacity-40", className)}
    />
  );
}

function getChevronIconName(
  orientation: NonNullable<ChevronProps["orientation"]>,
): AppIconName {
  if (orientation === "left") {
    return "chevronLeft";
  }

  if (orientation === "up") {
    return "chevronUp";
  }

  if (orientation === "down") {
    return "chevronDown";
  }

  return "chevronRight";
}

function parseInputDate(value: string) {
  const [yearValue, monthValue, dayValue] = value.split("-");
  const year = Number(yearValue);
  const month = Number(monthValue);
  const day = Number(dayValue);

  if (!year || !month || !day) {
    return undefined;
  }

  const date = new Date(year, month - 1, day);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return undefined;
  }

  return date;
}

function formatInputDate(date: Date) {
  return [
    String(date.getFullYear()).padStart(4, "0"),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function formatDisplayDate(value: string) {
  const [year, month, day] = value.split("-");

  if (!year || !month || !day) {
    return value;
  }

  return `${day}/${month}/${year}`;
}
