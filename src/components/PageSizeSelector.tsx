import React from 'react';

// Small "N rows per page" toggle, meant to sit right next to a table's own
// "Showing X–Y of Z" footer text so the control is where people actually
// look for it, rather than tucked away in a page-level toolbar.
export const PageSizeSelector: React.FC<{
  value: number;
  onChange: (size: number) => void;
  options?: number[];
}> = ({ value, onChange, options = [10, 25, 50] }) => (
  <div className="inline-flex items-center gap-1 rounded-lg bg-slate-100 p-0.5 text-[11px] font-semibold shrink-0">
    {options.map((size) => (
      <button
        key={size}
        type="button"
        onClick={() => onChange(size)}
        className={`px-2 py-1 rounded-md transition-all ${
          value === size ? 'bg-white text-indigo-600 shadow-xs' : 'text-slate-500 hover:text-slate-800'
        }`}
      >
        {size}
      </button>
    ))}
  </div>
);