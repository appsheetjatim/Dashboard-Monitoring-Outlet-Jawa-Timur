import React, { useState } from 'react';
import { Info } from 'lucide-react';

interface TooltipProps {
  content: string;
  title?: string;
  className?: string;
}

export const Tooltip: React.FC<TooltipProps> = ({ content, title, className = '' }) => {
  const [visible, setVisible] = useState(false);

  return (
    <span
      className={`relative inline-flex items-center text-slate-400 hover:text-indigo-600 transition-colors cursor-help ${className}`}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onClick={(e) => {
        e.stopPropagation();
        setVisible(!visible);
      }}
    >
      <Info className="w-3.5 h-3.5 ml-1 inline-block" />
      {visible && (
        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 z-50 w-64 p-2.5 bg-slate-900 text-slate-100 text-xs rounded-lg shadow-xl pointer-events-none border border-slate-700 leading-relaxed text-left normal-case font-normal">
          {title && <span className="block font-semibold text-white mb-1">{title}</span>}
          {content}
          <span className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-slate-900"></span>
        </span>
      )}
    </span>
  );
};
