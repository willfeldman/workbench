/** Preserve the supplied artwork, framing only its nontransparent bounds. */
export function WorkbenchLogo({ compact = false }: { compact?: boolean }) {
  return (
    <svg className="workbench-logo" viewBox={compact ? "278 386 697 565" : "210 53 789 899"} aria-hidden="true">
      <image href="/workbench-logo.png" width="1254" height="1254" />
    </svg>
  );
}
