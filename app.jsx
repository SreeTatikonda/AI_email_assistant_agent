import { useState } from "react";

const GMAIL_MCP_URL = "https://gmail.mcp.claude.com/mcp";

const CATEGORIES = {
  urgent: { label: "Urgent", color: "#E05555", bg: "#E0555512", icon: "🔴" },
  action: { label: "Action Needed", color: "#D97706", bg: "#D9770612", icon: "🟠" },
  fyi: { label: "FYI", color: "#3B82F6", bg: "#3B82F612", icon: "🔵" },
  newsletter: { label: "Newsletter", color: "#7C3AED", bg: "#7C3AED12", icon: "💜" },
  spam: { label: "Spam", color: "#6B7280", bg: "#6B728012", icon: "⚫" },
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export default function Clarity() {
  const [emails, setEmails] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(false);
  const [agentStatus, setAgentStatus] = useState("");
  const [draft, setDraft] = useState("");
  const [draftLoading, setDraftLoading] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");
  const [copied, setCopied] = useState(false);

  async function callClaude(messages, systemPrompt) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1000,
        system: systemPrompt,
        messages,
        mcp_servers: [{ type: "url", url: GMAIL_MCP_URL, name: "gmail" }],
      }),
    });
    return res.json();
  }

  async function fetchAndTriageEmails() {
    setLoading(true);
    setError("");
    setEmails([]);
    setSelected(null);
    setDraft("");

    try {
      setAgentStatus("Connecting to Gmail…");
      await sleep(400);

      const fetchData = await callClaude(
        [{ role: "user", content: "Use gmail_search_messages to fetch the 10 most recent unread emails. Return a JSON array with fields: id, subject, from, snippet (first 200 chars). Return ONLY valid JSON, no markdown." }],
        "You are an email assistant. Always respond with only valid JSON arrays. No preamble, no markdown fences."
      );

      setAgentStatus("Reading your inbox…");
      await sleep(300);

      let rawEmails = [];
      for (const block of fetchData.content || []) {
        if (block.type === "text") {
          try {
            const clean = block.text.replace(/```json|```/g, "").trim();
            const parsed = JSON.parse(clean);
            if (Array.isArray(parsed)) { rawEmails = parsed; break; }
          } catch {}
        }
        if (block.type === "mcp_tool_result") {
          try {
            const txt = block.content?.[0]?.text || "";
            const parsed = JSON.parse(txt);
            if (Array.isArray(parsed)) { rawEmails = parsed; break; }
          } catch {}
        }
      }

      if (!rawEmails.length) throw new Error("Could not retrieve emails. Make sure Gmail is connected.");

      setAgentStatus("Categorizing with AI…");

      const categorizeData = await callClaude(
        [{
          role: "user",
          content: `Categorize these emails. For each assign one category: urgent, action, fyi, newsletter, or spam. Write a 1-sentence summary.
Emails: ${JSON.stringify(rawEmails)}
Return ONLY a JSON array with fields: id, subject, from, snippet, category, summary. No markdown.`
        }],
        "You are an email triage AI. Respond only with valid JSON arrays."
      );

      let triaged = [];
      for (const block of categorizeData.content || []) {
        if (block.type === "text") {
          try {
            const clean = block.text.replace(/```json|```/g, "").trim();
            const parsed = JSON.parse(clean);
            if (Array.isArray(parsed)) { triaged = parsed; break; }
          } catch {}
        }
      }

      if (!triaged.length) triaged = rawEmails.map(e => ({ ...e, category: "fyi", summary: e.snippet }));

      setEmails(triaged);
      setAgentStatus(`${triaged.length} emails sorted`);
    } catch (err) {
      setError(err.message || "Something went wrong.");
      setAgentStatus("");
    } finally {
      setLoading(false);
    }
  }

  async function generateDraft(email) {
    setDraftLoading(true);
    setDraft("");
    try {
      const data = await callClaude(
        [{ role: "user", content: `Draft a professional, concise reply to this email:\n\nSubject: ${email.subject}\nFrom: ${email.from}\nContent: ${email.snippet}\n\nWrite only the reply body.` }],
        "You are a professional email assistant. Write clear, helpful email replies."
      );
      const text = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("\n");
      setDraft(text);
    } catch {
      setDraft("Could not generate draft.");
    }
    setDraftLoading(false);
  }

  function handleCopy() {
    navigator.clipboard?.writeText(draft);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const filtered = filter === "all" ? emails : emails.filter(e => e.category === filter);
  const categoryCounts = Object.fromEntries(
    Object.keys(CATEGORIES).map(k => [k, emails.filter(e => e.category === k).length])
  );

  return (
    <div style={{ minHeight: "100vh", background: "#F7F7F5", fontFamily: "'Georgia', 'Times New Roman', serif", display: "flex", flexDirection: "column" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;0,500;0,600;1,400&family=DM+Sans:wght@300;400;500&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #F7F7F5; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-thumb { background: #D5D2CA; border-radius: 4px; }
        .email-row { cursor: pointer; padding: 16px 20px; border-bottom: 1px solid #ECEAE4; transition: background 0.12s; }
        .email-row:hover { background: #F0EDE6; }
        .email-row.active { background: #EDE8DF; border-left: 3px solid #8B7355; }
        .pill { display: inline-flex; align-items: center; gap: 4px; padding: 3px 10px; border-radius: 99px; font-size: 11px; font-family: 'DM Sans', sans-serif; font-weight: 500; letter-spacing: 0.02em; }
        .btn { cursor: pointer; font-family: 'DM Sans', sans-serif; border: none; transition: all 0.15s; font-size: 13px; }
        .btn-primary { background: #2C2C2C; color: #F7F7F5; padding: 9px 20px; border-radius: 6px; font-weight: 500; letter-spacing: 0.02em; }
        .btn-primary:hover:not(:disabled) { background: #444; }
        .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
        .btn-secondary { background: white; color: #555; padding: 7px 16px; border-radius: 6px; border: 1px solid #DDD8CE; }
        .btn-secondary:hover { border-color: #8B7355; color: #2C2C2C; }
        .btn-ghost { background: transparent; color: #888; padding: 7px 14px; border-radius: 6px; border: 1px solid #E5E0D8; }
        .btn-ghost:hover { background: #F0EDE6; color: #555; }
        .filter-chip { cursor: pointer; font-family: 'DM Sans', sans-serif; font-size: 12px; padding: 4px 12px; border-radius: 99px; border: 1px solid #DDD8CE; background: white; color: #888; transition: all 0.12s; }
        .filter-chip.active { background: #2C2C2C; color: #F7F7F5; border-color: #2C2C2C; }
        .filter-chip:hover:not(.active) { border-color: #8B7355; color: #555; }
        .draft-area { width: 100%; background: white; border: 1px solid #DDD8CE; color: #333; padding: 14px 16px; border-radius: 8px; font-family: 'DM Sans', sans-serif; font-size: 13.5px; resize: vertical; min-height: 150px; line-height: 1.7; }
        .draft-area:focus { outline: none; border-color: #8B7355; box-shadow: 0 0 0 3px #8B735518; }
        .spinner { display: inline-block; width: 13px; height: 13px; border: 2px solid #DDD; border-top-color: #555; border-radius: 50%; animation: spin 0.7s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .fade-in { animation: fadeIn 0.25s ease; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }
        .empty-state { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: #BBB5A8; gap: 10px; }
      `}</style>

      {/* Header */}
      <header style={{ background: "white", borderBottom: "1px solid #ECEAE4", padding: "0 32px", height: 60, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <span style={{ fontFamily: "'Lora', serif", fontSize: 22, fontWeight: 600, color: "#1A1A1A", letterSpacing: "-0.3px" }}>Clarity</span>
          <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "#AAA5 9C", letterSpacing: "0.08em", textTransform: "uppercase" }}>AI Email Assistant</span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {agentStatus && !error && (
            <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: loading ? "#8B7355" : "#5A8A5A" }}>
              {loading && <span className="spinner" style={{ marginRight: 6 }} />}
              {agentStatus}
            </span>
          )}
          {error && <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "#CC4444" }}>{error}</span>}
          <button className="btn btn-primary" onClick={fetchAndTriageEmails} disabled={loading}
            style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {loading ? <><span className="spinner" style={{ borderTopColor: "#F7F7F5" }} /> Working…</> : "Sort my inbox"}
          </button>
        </div>
      </header>

      <div style={{ display: "flex", flex: 1, overflow: "hidden", height: "calc(100vh - 60px)" }}>

        {/* Left — email list */}
        <div style={{ width: 360, background: "white", borderRight: "1px solid #ECEAE4", display: "flex", flexDirection: "column", overflow: "hidden" }}>

          {emails.length > 0 && (
            <div style={{ padding: "12px 16px", borderBottom: "1px solid #ECEAE4", display: "flex", flexWrap: "wrap", gap: 6 }}>
              <button className={`filter-chip ${filter === "all" ? "active" : ""}`} onClick={() => setFilter("all")}>
                All {emails.length}
              </button>
              {Object.entries(CATEGORIES).map(([k, v]) => categoryCounts[k] > 0 && (
                <button key={k} className={`filter-chip ${filter === k ? "active" : ""}`} onClick={() => setFilter(k)}>
                  {v.icon} {v.label} {categoryCounts[k]}
                </button>
              ))}
            </div>
          )}

          <div style={{ flex: 1, overflowY: "auto" }}>
            {!loading && emails.length === 0 && (
              <div className="empty-state" style={{ padding: 40 }}>
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                  <polyline points="22,6 12,13 2,6"/>
                </svg>
                <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, textAlign: "center", lineHeight: 1.6 }}>
                  Click <strong style={{ color: "#555" }}>Sort my inbox</strong> to get started
                </div>
              </div>
            )}

            {loading && [1,2,3,4,5].map(i => (
              <div key={i} style={{ padding: "16px 20px", borderBottom: "1px solid #ECEAE4", opacity: 1 - i * 0.15 }}>
                <div style={{ height: 12, background: "#F0EDE6", borderRadius: 4, width: "70%", marginBottom: 8 }} />
                <div style={{ height: 10, background: "#F5F3EF", borderRadius: 4, width: "45%", marginBottom: 6 }} />
                <div style={{ height: 10, background: "#F5F3EF", borderRadius: 4, width: "90%" }} />
              </div>
            ))}

            {filtered.map((email, i) => {
              const cat = CATEGORIES[email.category] || CATEGORIES.fyi;
              const isActive = selected?.id === email.id;
              return (
                <div key={email.id || i} className={`email-row fade-in${isActive ? " active" : ""}`}
                  style={{ borderLeft: isActive ? `3px solid #8B7355` : "3px solid transparent" }}
                  onClick={() => { setSelected(email); setDraft(""); }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 5, gap: 8 }}>
                    <div style={{ fontFamily: "'Lora', serif", fontSize: 13.5, fontWeight: 500, color: "#1A1A1A", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {email.subject || "(no subject)"}
                    </div>
                    <span className="pill" style={{ background: cat.bg, color: cat.color, flexShrink: 0 }}>
                      {cat.label}
                    </span>
                  </div>
                  <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11.5, color: "#888", marginBottom: 5 }}>{email.from}</div>
                  <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "#AAA59C", lineHeight: 1.5, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                    {email.summary || email.snippet}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right — detail */}
        <div style={{ flex: 1, overflowY: "auto", padding: "32px 36px", background: "#F7F7F5" }}>
          {!selected ? (
            <div className="empty-state" style={{ height: "100%" }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                <polyline points="22,6 12,13 2,6"/>
              </svg>
              <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>Select an email to read and reply</div>
            </div>
          ) : (
            <div className="fade-in" style={{ maxWidth: 680 }}>
              {/* Subject + meta */}
              <div style={{ marginBottom: 24 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, marginBottom: 10 }}>
                  <h1 style={{ fontFamily: "'Lora', serif", fontSize: 22, fontWeight: 600, color: "#1A1A1A", lineHeight: 1.3, flex: 1 }}>
                    {selected.subject || "(no subject)"}
                  </h1>
                  {(() => {
                    const cat = CATEGORIES[selected.category] || CATEGORIES.fyi;
                    return <span className="pill" style={{ background: cat.bg, color: cat.color, fontSize: 12, flexShrink: 0 }}>{cat.icon} {cat.label}</span>;
                  })()}
                </div>
                <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: "#999" }}>
                  From <span style={{ color: "#666" }}>{selected.from}</span>
                </div>
              </div>

              {/* AI Summary */}
              {selected.summary && (
                <div style={{ background: "#FFFDF7", border: "1px solid #E8E0CC", borderRadius: 8, padding: "14px 18px", marginBottom: 20 }}>
                  <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10.5, fontWeight: 500, color: "#8B7355", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6 }}>
                    Summary
                  </div>
                  <div style={{ fontFamily: "'Lora', serif", fontSize: 14, color: "#444", lineHeight: 1.65, fontStyle: "italic" }}>
                    {selected.summary}
                  </div>
                </div>
              )}

              {/* Body preview */}
              <div style={{ background: "white", border: "1px solid #ECEAE4", borderRadius: 8, padding: "16px 20px", marginBottom: 28, fontFamily: "'DM Sans', sans-serif", fontSize: 13.5, color: "#555", lineHeight: 1.75 }}>
                {selected.snippet || "No preview available."}
              </div>

              {/* Draft reply */}
              <div style={{ borderTop: "1px solid #ECEAE4", paddingTop: 24 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                  <div>
                    <div style={{ fontFamily: "'Lora', serif", fontSize: 16, fontWeight: 600, color: "#1A1A1A" }}>Draft a reply</div>
                    <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "#AAA59C", marginTop: 2 }}>AI-generated, ready to edit</div>
                  </div>
                  <button className="btn btn-secondary" onClick={() => generateDraft(selected)} disabled={draftLoading}
                    style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {draftLoading ? <><span className="spinner" /> Writing…</> : "Generate reply"}
                  </button>
                </div>

                {!draft && !draftLoading && (
                  <div style={{ padding: "24px 20px", background: "white", border: "1px dashed #DDD8CE", borderRadius: 8, textAlign: "center", fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: "#C5BFB5" }}>
                    Click "Generate reply" and Clarity will write a draft for you
                  </div>
                )}

                {draft && (
                  <div className="fade-in">
                    <textarea className="draft-area" value={draft} onChange={e => setDraft(e.target.value)} />
                    <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
                      <button className="btn btn-primary" onClick={handleCopy} style={{ minWidth: 120 }}>
                        {copied ? "✓ Copied" : "Copy reply"}
                      </button>
                      <button className="btn btn-ghost" onClick={() => generateDraft(selected)}>
                        Try again
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}