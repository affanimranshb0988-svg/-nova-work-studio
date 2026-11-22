"use client";
import type { ReactNode } from "react";

/**
 * Tiny, dependency-free Markdown renderer for AI chat replies.
 * Supports: headings, bold, italic, strikethrough, inline code, links,
 * fenced code blocks, bullet/numbered lists, blockquotes, tables, hr.
 * Renders only React elements (no dangerouslySetInnerHTML), so raw HTML in
 * the text is shown as plain text, never executed. Heading sizes are kept
 * small on purpose (max 18px) so chat replies never blow up the layout.
 */

const TOKEN_RE = /(\*\*[^*\n]+\*\*|\*[^*\n]+\*|~~[^~\n]+~~|`[^`\n]+`|\[[^\]\n]+\]\([^)\s]+\))/g;

function renderInline(text: string): ReactNode[] {
  const parts = text.split(TOKEN_RE);
  return parts.map((part, i) => {
    if (!part) return null;
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return <strong key={i} className="font-bold text-white">{renderInline(part.slice(2, -2))}</strong>;
    }
    if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
      return <em key={i}>{renderInline(part.slice(1, -1))}</em>;
    }
    if (part.startsWith("~~") && part.endsWith("~~") && part.length > 4) {
      return <s key={i}>{renderInline(part.slice(2, -2))}</s>;
    }
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      return <code key={i} className="rounded bg-black/40 px-1 py-0.5 text-[13px] text-violet-100">{part.slice(1, -1)}</code>;
    }
    const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(part);
    if (link) {
      return <a key={i} href={link[2]} target="_blank" rel="noreferrer" className="text-violet-300 underline">{renderInline(link[1])}</a>;
    }
    return part;
  });
}

function splitRow(line: string): string[] {
  const t = line.trim().replace(/^\||\|$/g, "");
  return t.split("|").map((c) => c.trim());
}

export function Markdown({ text }: { text: string }) {
  const lines = text.split("\n");
  const out: ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) { i++; continue; }

    // Fenced code block
    if (/^```/.test(trimmed)) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i].trim())) { buf.push(lines[i]); i++; }
      i++; // skip closing fence
      out.push(
        <pre key={key++} className="overflow-x-auto whitespace-pre rounded-xl bg-black/40 p-3 text-[13px] leading-relaxed text-violet-100">{buf.join("\n")}</pre>
      );
      continue;
    }

    // ATX heading — capped at 18px so replies stay compact
    const h = /^(#{1,6})\s+(.*)$/.exec(trimmed);
    if (h) {
      const level = h[1].length;
      const cls = level === 1
        ? "text-lg font-extrabold text-white"
        : level === 2
          ? "text-base font-extrabold text-white"
          : "text-[15px] font-bold text-white";
      out.push(<div key={key++} className={`${cls} mt-1`}>{renderInline(h[2])}</div>);
      i++;
      continue;
    }

    // Horizontal rule
    if (/^(\*\*\*|---|___)\s*$/.test(trimmed)) {
      out.push(<hr key={key++} className="my-2 border-white/10" />);
      i++;
      continue;
    }

    // Table: header row + separator row
    if (/^\|/.test(trimmed) && i + 1 < lines.length && /^\|?[\s:|-]+\|?$/.test(lines[i + 1].trim()) && lines[i + 1].includes("-")) {
      const head = splitRow(line);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && /^\|/.test(lines[i].trim())) { rows.push(splitRow(lines[i])); i++; }
      out.push(
        <div key={key++} className="overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full border-collapse text-[13px] leading-relaxed">
            <thead><tr>{head.map((c, ci) => <th key={ci} className="border-b border-white/10 bg-white/[0.05] px-2 py-1.5 text-left font-bold text-white">{renderInline(c)}</th>)}</tr></thead>
            <tbody>{rows.map((r, ri) => <tr key={ri} className="border-b border-white/5 last:border-0">{r.map((c, ci) => <td key={ci} className="px-2 py-1.5 align-top text-violet-100">{renderInline(c)}</td>)}</tr>)}</tbody>
          </table>
        </div>
      );
      continue;
    }

    // Blockquote
    if (/^>\s?/.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) { buf.push(lines[i].replace(/^>\s?/, "")); i++; }
      out.push(<blockquote key={key++} className="border-l-2 border-violet-400/60 pl-3 text-violet-200/80">{renderInline(buf.join("\n"))}</blockquote>);
      continue;
    }

    // Unordered list
    if (/^\s*[-*+]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) { items.push(lines[i].replace(/^\s*[-*+]\s+/, "")); i++; }
      out.push(<ul key={key++} className="list-disc space-y-1 pl-5">{items.map((it, ii) => <li key={ii}>{renderInline(it)}</li>)}</ul>);
      continue;
    }

    // Ordered list
    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) { items.push(lines[i].replace(/^\s*\d+[.)]\s+/, "")); i++; }
      out.push(<ol key={key++} className="list-decimal space-y-1 pl-5">{items.map((it, ii) => <li key={ii}>{renderInline(it)}</li>)}</ol>);
      continue;
    }

    // Paragraph: consecutive lines until a blank line or a new block.
    const buf: string[] = [];
    while (i < lines.length) {
      const l = lines[i];
      const t = l.trim();
      if (!t) break;
      if (/^```/.test(t) || /^(#{1,6})\s+/.test(t) || /^(\*\*\*|---|___)\s*$/.test(t) || /^>\s?/.test(l) || /^\s*[-*+]\s+/.test(l) || /^\s*\d+[.)]\s+/.test(l)) break;
      if (/^\|/.test(t) && i + 1 < lines.length && /^\|?[\s:|-]+\|?$/.test(lines[i + 1].trim()) && lines[i + 1].includes("-")) break;
      buf.push(l);
      i++;
    }
    out.push(<p key={key++} className="whitespace-pre-wrap">{renderInline(buf.join("\n"))}</p>);
  }

  return <div className="min-w-0 space-y-2 text-sm leading-relaxed">{out}</div>;
}
