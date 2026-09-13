export function Prose({ children }: { children: React.ReactNode }) {
  return (
    <article className="prose prose-invert prose-slate max-w-none prose-headings:font-semibold prose-a:text-indigo-400 prose-code:text-indigo-300">
      {children}
    </article>
  );
}
