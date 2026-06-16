"use client";

import { Toaster } from "sonner";

export function AppToaster() {
  return (
    <Toaster
      closeButton
      richColors
      position="top-right"
      toastOptions={{
        classNames: {
          toast:
            "border border-slate-200 bg-white/95 text-slate-950 shadow-xl shadow-slate-900/10 backdrop-blur",
          title: "font-black tracking-[-0.02em]",
          description: "text-slate-500",
          actionButton: "bg-slate-950 text-white",
          cancelButton: "bg-slate-100 text-slate-700",
        },
      }}
    />
  );
}
