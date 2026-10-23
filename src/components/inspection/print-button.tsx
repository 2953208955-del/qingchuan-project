'use client'

// Print is a browser API, so this action lives in a tiny client island while
// the print page itself stays a server component.
export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90 print:hidden"
    >
      打印报告
    </button>
  )
}
