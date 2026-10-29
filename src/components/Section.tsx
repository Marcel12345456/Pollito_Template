import { useState, type ReactNode } from 'react';

/**
 * A collapsible settings section.
 *
 * Built on `<details>`/`<summary>` rather than a div and a state flag: the
 * browser handles the open/closed semantics, keyboard operation and screen
 * reader announcement for free, and the content stays in the DOM so a
 * half-typed amount is not lost by collapsing the panel.
 *
 * Open state is remembered per section, because Settings is where you go to do
 * one specific thing and being made to re-open the same panel on every visit is
 * the kind of small friction that makes an app feel unfinished.
 *
 * Sections start closed. Income and Categories are long lists, and the point of
 * this screen is to be scannable — you should see what Settings *contains*
 * without scrolling past everything it contains.
 */
export function Section(
  { id, title, summary, defaultOpen = false, children }: {
    id: string;
    title: string;
    /** One line shown while collapsed, so the panel is worth not opening. */
    summary?: string;
    defaultOpen?: boolean;
    children: ReactNode;
  },
) {
  const storageKey = `pollito.section.${id}`;
  const [open, setOpen] = useState(() => {
    const stored = localStorage.getItem(storageKey);
    return stored === null ? defaultOpen : stored === 'true';
  });

  return (
    <details
      className="section"
      open={open}
      onToggle={(event) => {
        const next = event.currentTarget.open;
        setOpen(next);
        localStorage.setItem(storageKey, String(next));
      }}
    >
      <summary className="section__summary">
        <span className="section__title">{title}</span>
        {summary ? <span className="section__meta">{summary}</span> : null}
        <span className="section__chevron" aria-hidden="true" />
      </summary>
      <div className="section__body">{children}</div>
    </details>
  );
}
