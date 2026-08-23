/** Chapter visual: signed webhook delivery, verbatim. */
export function WebhookTerminal() {
  return (
    <div className="overflow-hidden rounded-card border border-line bg-[#070b11]">
      <div className="flex items-center gap-2 border-b border-line/60 px-5 py-3">
        <span className="size-2.5 rounded-full bg-danger/70" />
        <span className="size-2.5 rounded-full bg-warn/70" />
        <span className="size-2.5 rounded-full bg-ok/70" />
        <span className="ml-3 font-mono text-[11px] text-ink-3">
          POST /api/v1/webhooks/…/ping
        </span>
      </div>

      <pre className="overflow-x-auto p-5 font-mono text-xs leading-relaxed">
        <code>
          <span className="text-ink-3">$ curl -X POST \</span>
          {"\n"}
          <span className="text-info"> -H</span>{" "}
          <span className="text-ink">&quot;X-TaskAPI-Signature:</span>{" "}
          <span className="text-amber-bright">sha256=8f31a9…c104&quot;</span>
          {"\n"}
          <span className="text-info"> -d</span>{" "}
          <span className="text-ink">
            &apos;{"{"}&quot;event&quot;:&quot;task.completed&quot;,
          </span>
          {"\n"}
          <span className="text-ink">
            {" "}
            &quot;task&quot;:{"{"}&quot;title&quot;:&quot;Ship v1.2&quot;{"}"}
            {"}"}&apos;
          </span>
          {"\n\n"}
          <span className="text-ok">← 200 OK</span>
          <span className="text-ink-3"> · attempt 1/5 · 182ms</span>
          {"\n"}
          <span className="text-ink-3">
            {"// dead endpoints auto-disable after 10 consecutive failures"}
          </span>
        </code>
      </pre>
    </div>
  );
}
