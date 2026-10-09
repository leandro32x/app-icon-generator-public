import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { AccordionContent, AccordionItem, AccordionTrigger } from './ui/accordion';

interface SettingsSectionProps {
  value: string;
  title: string;
  icon: LucideIcon;
  /** Short read-out shown in the header (e.g. "Gradient · 135°") so a collapsed section still tells its state. */
  summary?: ReactNode;
  children: ReactNode;
}

/**
 * One collapsible block of the Customize tab: icon + title + live summary in
 * the header, controls below. Wrap several in an `<Accordion type="multiple">`.
 */
export function SettingsSection({ value, title, icon: Icon, summary, children }: SettingsSectionProps) {
  return (
    <AccordionItem value={value} className="border-b border-border last:border-b-0">
      <AccordionTrigger className="py-3 hover:no-underline [&>svg]:translate-y-0">
        <div className="flex min-w-0 flex-1 items-center justify-between gap-3">
          <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Icon className="h-4 w-4 text-muted-foreground" />
            {title}
          </span>
          {summary && (
            <span className="flex min-w-0 items-center gap-1.5 truncate text-xs font-normal text-muted-foreground">
              {summary}
            </span>
          )}
        </div>
      </AccordionTrigger>
      <AccordionContent className="pb-5 pt-1">
        <div className="space-y-4">{children}</div>
      </AccordionContent>
    </AccordionItem>
  );
}

/** Small colour/gradient chip used inside section summaries. */
export function SwatchChip({ background }: { background: string }) {
  return (
    <span
      aria-hidden="true"
      className="inline-block size-3.5 shrink-0 rounded-sm border border-border"
      style={{ background }}
    />
  );
}
