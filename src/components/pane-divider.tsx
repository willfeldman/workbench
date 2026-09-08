"use client";
import { useEffect, useRef, useState } from "react";

const storageKey = "workbench-chat-width";
export function PaneDivider() {
  const handle = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; width: number } | null>(null);
  const [value, setValue] = useState(38);
  const layout = () => handle.current?.closest<HTMLElement>(".content-layout");
  function resize(width: number) {
    const container = layout();
    if (!container) return;
    const total = container.getBoundingClientRect().width;
    const next = Math.max(280, Math.min(total - 320, width));
    const percent = (next / total) * 100;
    container.style.setProperty("--chat-width", `${percent}%`);
    setValue(Math.round(percent));
  }
  function save() {
    try {
      localStorage.setItem(
        storageKey,
        layout()?.style.getPropertyValue("--chat-width") || "",
      );
    } catch {
      /* Storage can be unavailable in private browsing. */
    }
  }
  function finish() {
    drag.current = null;
    layout()?.removeAttribute("data-resizing");
    save();
  }
  function reset() {
    layout()?.style.removeProperty("--chat-width");
    setValue(38);
    try {
      localStorage.removeItem(storageKey);
    } catch {}
  }
  useEffect(() => {
    const container = layout();
    try {
      const saved = localStorage.getItem(storageKey);
      if (
        saved &&
        /^\d+(\.\d+)?%$/.test(saved) &&
        parseFloat(saved) > 0 &&
        parseFloat(saved) < 100
      ) {
        container?.style.setProperty("--chat-width", saved);
        setValue(Math.round(parseFloat(saved)));
      }
    } catch {}
    return () => container?.removeAttribute("data-resizing");
  }, []);
  return (
    <div
      ref={handle}
      className="pane-divider"
      role="separator"
      aria-label="Resize conversation"
      aria-orientation="vertical"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value}
      aria-valuetext={`Conversation ${value} percent`}
      tabIndex={0}
      title="Drag to resize · Double-click to reset"
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.currentTarget.focus();
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = {
          x: event.clientX,
          width:
            event.currentTarget.parentElement!.getBoundingClientRect().width,
        };
        layout()?.setAttribute("data-resizing", "true");
      }}
      onPointerMove={(event) => {
        if (drag.current)
          resize(drag.current.width + event.clientX - drag.current.x);
      }}
      onPointerUp={(event) => {
        if (drag.current) finish();
        if (event.currentTarget.hasPointerCapture(event.pointerId))
          event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onPointerCancel={finish}
      onLostPointerCapture={() => {
        if (drag.current) finish();
      }}
      onDoubleClick={reset}
      onKeyDown={(event) => {
        const container = layout();
        if (!container) return;
        const width =
          event.currentTarget.parentElement!.getBoundingClientRect().width;
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          event.preventDefault();
          resize(
            width +
              (event.key === "ArrowRight" ? 1 : -1) *
                (event.shiftKey ? 48 : 16),
          );
          save();
        } else if (event.key === "Home" || event.key === "End") {
          event.preventDefault();
          resize(event.key === "Home" ? 280 : container.clientWidth - 320);
          save();
        } else if (event.key === "Enter") {
          event.preventDefault();
          reset();
        }
      }}
    />
  );
}
