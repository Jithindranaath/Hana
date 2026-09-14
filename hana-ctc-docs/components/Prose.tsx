export function Prose({ children }: { children: React.ReactNode }) {
  return (
    <article
      className="
        prose prose-invert max-w-none
        prose-headings:tracking-display prose-headings:font-semibold
        prose-h1:text-3xl prose-h1:mb-3
        prose-h2:text-lg prose-h2:mt-10 prose-h2:mb-3
        prose-h3:text-base
        prose-p:text-fg-muted prose-p:leading-relaxed
        prose-li:text-fg-muted prose-li:marker:text-fg-subtle
        prose-strong:text-fg
        prose-a:text-accent-hi prose-a:no-underline hover:prose-a:underline prose-a:underline-offset-2
        prose-code:text-aqua prose-code:font-normal prose-code:before:content-none prose-code:after:content-none
        prose-pre:bg-surface prose-pre:border prose-pre:border-line prose-pre:rounded-card
        prose-hr:border-line
        prose-th:text-fg prose-th:font-medium prose-td:text-fg-muted
        prose-table:text-sm
        prose-blockquote:border-l-accent prose-blockquote:text-fg-muted prose-blockquote:not-italic
      "
    >
      {children}
    </article>
  );
}
