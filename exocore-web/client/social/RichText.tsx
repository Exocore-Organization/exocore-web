import React, { useMemo } from "react";
import Prism from "prismjs";
import "prismjs/components/prism-clike";
import "prismjs/components/prism-c";
import "prismjs/components/prism-cpp";
import "prismjs/components/prism-csharp";
import "prismjs/components/prism-java";
import "prismjs/components/prism-javascript";
import "prismjs/components/prism-typescript";
import "prismjs/components/prism-jsx";
import "prismjs/components/prism-tsx";
import "prismjs/components/prism-python";
import "prismjs/components/prism-go";
import "prismjs/components/prism-rust";
import "prismjs/components/prism-ruby";
import "prismjs/components/prism-php";
import "prismjs/components/prism-bash";
import "prismjs/components/prism-json";
import "prismjs/components/prism-yaml";
import "prismjs/components/prism-markup";
import "prismjs/components/prism-css";
import "prismjs/components/prism-sql";

const LANG_ALIAS: Record<string, string> = {
  js: "javascript", ts: "typescript", py: "python", rb: "ruby",
  sh: "bash", shell: "bash", html: "markup", xml: "markup",
  "c++": "cpp", "c#": "csharp", cs: "csharp", yml: "yaml",
};

type Segment =
  | { kind: "text"; value: string }
  | { kind: "code"; lang: string; value: string };

function parse(src: string): Segment[] {
  const out: Segment[] = [];
  const re = /```([A-Za-z0-9_+#-]*)\n?([\s\S]*?)```/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    if (m.index > last) out.push({ kind: "text", value: src.slice(last, m.index) });
    out.push({ kind: "code", lang: (m[1] || "").toLowerCase(), value: m[2].replace(/\n$/, "") });
    last = m.index + m[0].length;
  }
  if (last < src.length) out.push({ kind: "text", value: src.slice(last) });
  return out;
}

function CodeBlock({ lang, value }: { lang: string; value: string }) {
  const resolved = LANG_ALIAS[lang] || lang;
  const grammar = resolved && (Prism.languages as Record<string, unknown>)[resolved];
  const html = useMemo(() => {
    if (grammar) {
      try { return Prism.highlight(value, grammar as Prism.Grammar, resolved); } catch { /* noop */ }
    }
    return value
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }, [value, grammar, resolved]);
  return (
    <pre className={`rt-code language-${resolved || "plain"}`}>
      {lang && <span className="rt-code-lang">{lang}</span>}
      <code dangerouslySetInnerHTML={{ __html: html }} />
    </pre>
  );
}

export const RichText: React.FC<{ text: string }> = ({ text }) => {
  if (!text) return null;
  const segs = parse(text);
  return (
    <>
      {segs.map((s, i) =>
        s.kind === "code"
          ? <CodeBlock key={i} lang={s.lang} value={s.value} />
          : <span key={i} className="rt-text">{s.value}</span>
      )}
    </>
  );
};
