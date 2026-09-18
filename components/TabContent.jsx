"use client";

export default function TabContent({ tabKey, data }) {
  if (tabKey === "lifeContext") {
    if (!data || !data.length) return <p className="text-sm text-[#26314F]/45 italic">Nothing recorded yet.</p>;
    return (
      <div className="space-y-4">
        {data.map((entry) => (
          <div key={entry.id}>
            <div className="text-sm text-[#26314F] font-medium">
              {entry.name} <span className="text-xs text-[#26314F]/40 font-normal">— {entry.type}</span>
            </div>
            <div className="mt-1 space-y-1">
              {entry.mentions.map((m, j) => (
                <div key={j} className="text-sm text-[#26314F]/70 flex gap-2">
                  <span className="text-xs text-[#26314F]/40 shrink-0 pt-0.5 w-20">{m.date}</span>
                  <span>{m.note}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }
  if (tabKey === "openThreads") {
    if (!data || !data.length) return <p className="text-sm text-[#26314F]/45 italic">No threads yet.</p>;
    return (
      <div className="space-y-2.5">
        {data.map((t) => (
          <div key={t.id} className="flex items-start gap-2.5">
            <span className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${t.status === "resolved" ? "bg-[#8A9A7E]" : "bg-[#B96B72]"}`} />
            <div>
              <div className={`text-sm ${t.status === "resolved" ? "text-[#26314F]/45 line-through" : "text-[#26314F]"}`}>{t.desc}</div>
              {t.resolution && <div className="text-xs text-[#8A9A7E] mt-0.5">{t.resolution}</div>}
            </div>
          </div>
        ))}
      </div>
    );
  }
  return <p className="text-sm text-[#26314F]/75 leading-relaxed whitespace-pre-line">{data}</p>;
}
