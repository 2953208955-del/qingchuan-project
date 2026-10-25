'use client'

// Print is a browser API, so this action lives in a tiny client island while
// the print page itself stays a server component.
export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="holo-btn holo-btn--primary print:hidden"
      data-print-hide
    >
      打印报告
    </button>
  )
}
