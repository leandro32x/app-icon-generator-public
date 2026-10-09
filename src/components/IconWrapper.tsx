import React from 'react';
import { ErrorBoundary } from './ErrorBoundary';

interface IconWrapperProps {
  icon: React.ComponentType<any>;
  color: string;
  name: string;
  /** Unused under Iconify but kept for API compatibility with IconGenerator. */
  iconStyle?: string;
  onSelect: () => void;
  isSelected: boolean;
}

// Wrapper component that safely renders a picker icon tile with error handling.
// Under Iconify, every icon is a ComponentType that takes `size` + `color`;
// previous source-specific branches (phosphor weight, solar weight, lucide
// strokeWidth) collapse into a single render path.
export function IconWrapper({
  icon: IconComponent,
  color,
  name,
  onSelect,
  isSelected,
}: IconWrapperProps) {
  const iconContent = (
    <IconComponent size={24} color={color} style={{ display: 'block' }} />
  );

  return (
    <ErrorBoundary
      fallback={
        <button
          className="p-3 rounded-lg border-2 border-border bg-card opacity-50"
          title={`Error loading ${name}`}
          disabled
        >
          <div className="flex flex-col items-center gap-1">
            <div className="w-6 h-6 bg-muted rounded" />
            <span className="text-xs text-muted-foreground truncate w-full text-center">
              {name}
            </span>
          </div>
        </button>
      }
    >
      <button
        onClick={onSelect}
        className={`flex flex-col items-center justify-center p-3 rounded-xl transition-all duration-200 group border-2 h-[100px] w-full ${isSelected
          ? 'bg-blue-50 text-blue-700 border-blue-500 shadow-sm dark:bg-sky-500/10 dark:text-sky-200 dark:border-sky-500/50'
          : 'bg-card text-muted-foreground border-transparent hover:border-border hover:bg-accent/40 hover:shadow-sm hover:-translate-y-0.5'
          }`}
        title={name}
      >
        <div className={`mb-2 p-2 rounded-lg transition-colors ${isSelected ? 'bg-blue-100/80 dark:bg-sky-500/10' : 'bg-surface-subtle group-hover:bg-surface-muted'}`}>
          {iconContent}
        </div>
        <span className={`text-xs font-medium truncate w-full text-center px-1 ${isSelected ? 'text-blue-700 dark:text-sky-200' : 'text-foreground'}`}>
          {name}
        </span>
      </button>
    </ErrorBoundary>
  );
}

