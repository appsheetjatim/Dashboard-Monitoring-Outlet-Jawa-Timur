import React, { useState, useEffect, useRef } from 'react';
import { ChevronDown } from 'lucide-react';

// Reusable multi-select filter dropdown: click to open a checklist panel,
// button label shows "All X" / one value / "N selected". Shared across
// Dashboard Performance, Mapping & POSM, Call Plan, and Peta Sebaran Outlet
// so every filter dropdown in the app behaves the same way.
export const MultiSelectDropdown: React.FC<{
  label: string;
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
}> = ({ label, options, selected, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const toggleOption = (opt: string) => {
    onChange(selected.includes(opt) ? selected.filter((s) => s !== opt) : [...selected, opt]);
  };

  const buttonLabel =
    selected.length === 0
      ? `All ${label} (${options.length})`
      : selected.length === 1
      ? selected[0]
      : `${selected.length} ${label} selected`;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        className={`w-full px-3 py-2 bg-white border rounded-lg text-xs text-left flex items-center justify-between gap-1 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 ${
          selected.length > 0 ? 'border-indigo-300 text-indigo-700 font-semibold' : 'border-slate-200 text-slate-800'
        }`}
      >
        <span className="truncate">{buttonLabel}</span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-slate-400 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>
      {isOpen && (
        <div className="absolute z-20 mt-1 w-full min-w-[180px] max-h-64 overflow-y-auto bg-white border border-slate-200 rounded-lg shadow-lg py-1">
          <button
            type="button"
            onClick={() => onChange([])}
            className="w-full text-left px-3 py-1.5 text-xs font-semibold text-indigo-600 hover:bg-indigo-50"
          >
            All {label}
          </button>
          <div className="border-t border-slate-100 my-1" />
          {options.length === 0 ? (
            <p className="px-3 py-1.5 text-xs text-slate-400">No options</p>
          ) : (
            options.map((opt) => (
              <label
                key={opt}
                className="flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-slate-50 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={selected.includes(opt)}
                  onChange={() => toggleOption(opt)}
                  className="rounded text-indigo-600 shrink-0"
                />
                <span className="truncate">{opt}</span>
              </label>
            ))
          )}
        </div>
      )}
    </div>
  );
};