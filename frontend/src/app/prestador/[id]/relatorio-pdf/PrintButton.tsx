"use client";

export default function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="px-4 py-2 text-sm font-semibold bg-gray-900 text-white rounded-lg shadow-sm hover:bg-gray-800 flex items-center gap-1.5"
    >
      <svg
        className="w-4 h-4"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <polyline points="6 9 6 2 18 2 18 9" strokeLinecap="round" strokeLinejoin="round" />
        <path
          d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <rect x="6" y="14" width="12" height="8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      Imprimir / PDF
    </button>
  );
}
