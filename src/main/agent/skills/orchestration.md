# Orchestration Skill Guide (Multi-Agent Parallel Execution)

Last verified: 2026-04-06

---

## Section 1: When to Use

Use orchestration tools when the user says:
- "compare X vs Y vs Z", "analyze these three options"
- "research multiple topics at once", "do these in parallel"
- "look into each of these", "investigate all of these companies"
- "summarize all of these results together"
- "run these tasks simultaneously", "fan out and gather"

**4 tools total**: `agent_spawn`, `agent_fanout`, `agent_map`, `agent_reduce`.

All orchestration tools have `sensitive` permission level because they spawn sub-agents that can use tools.

---

## Section 2: Tool Reference

| Tool | Required Params | Optional Params | Description |
|------|----------------|----------------|-------------|
| `agent_spawn` | `prompt` | `tools`, `maxTurns` (15), `systemPrompt` | Spawn a single sub-agent for a focused sub-task |
| `agent_fanout` | `prompts` | `tools`, `maxTurns` (15) | Run multiple prompts in parallel via independent sub-agents |
| `agent_map` | `template`, `items` | `tools`, `maxTurns` (15) | Apply a prompt template to each item in an array (parallel) |
| `agent_reduce` | `results` | `combinePrompt`, `maxTurns` (10) | Synthesize multiple text results into one output |

### Parameter Details

- **`prompt`** (string): The task description for a single sub-agent.
- **`prompts`** (array of strings): Multiple task prompts, each executed by its own sub-agent.
- **`template`** (string): A prompt template with `{{item}}` placeholder, applied per item.
- **`items`** (array of strings): Items to iterate over with the template.
- **`results`** (array of strings): Text results to combine.
- **`tools`** (array of strings): Restrict sub-agents to only these tool names. Omit to give access to ALL tools.
- **`maxTurns`** (number): Maximum agent loop iterations. Default 15 for spawn/fanout/map, 10 for reduce.
- **`systemPrompt`** (string): Override the default sub-agent system prompt. Only available on `agent_spawn`.
- **`combinePrompt`** (string): Instructions for how to synthesize results in `agent_reduce`. Defaults to "Synthesize these results into a single comprehensive response."

---

## Section 3: How It Works

### Sub-Agent Architecture

Each sub-agent is an independent `AgentLoop` instance with:
- Its own message history (starts with a single user message).
- Access to the same tool registry as the parent (unless restricted via `tools`).
- The same LLM provider and model as the parent agent.
- Its own turn counter (bounded by `maxTurns`).

The default sub-agent system prompt is:
```
You are a focused sub-agent. Complete the task concisely.
Use tools when needed. Return a clear, structured result.
Do not ask clarifying questions -- make reasonable assumptions.
```

### Execution Model

- **`agent_spawn`**: Runs one sub-agent. Awaits its completion. Returns the sub-agent's final text response.
- **`agent_fanout`**: Runs N sub-agents via `Promise.all()`. All execute concurrently. Returns an array of `{ index, prompt, result, error }` objects.
- **`agent_map`**: Builds N prompts by substituting `{{item}}` in the template, then delegates to `fanOut`. Returns `{ item, index, prompt, result, error }` per item.
- **`agent_reduce`**: Formats all results as numbered sections, prepends the combine prompt, and runs a single sub-agent to synthesize them.

### Tool Restriction

When you pass a `tools` array, sub-agents can ONLY use those specific tools. This is useful for:
- Security: preventing sub-agents from modifying files when you only need web searches.
- Focus: limiting tool noise so the sub-agent completes faster.
- Cost: reducing unnecessary tool calls.

The restricted registry filters tool definitions at the provider format level (Anthropic, OpenAI, Gemini all supported).

---

## Section 4: When to Use Parallel vs Sequential

### Use Parallel (fanout/map) When:
- Tasks are **independent** -- each can complete without the output of another.
- You need to **compare** multiple entities (products, companies, technologies).
- You need to **research** multiple topics simultaneously.
- You want to **apply the same analysis** to many items.
- Time savings matter -- N tasks in ~1x time instead of ~Nx time.

### Use Sequential (spawn) When:
- A later task **depends on** an earlier task's output.
- You need to **chain** results -- output of step 1 feeds into step 2.
- The task is a single focused sub-problem you want to delegate.
- You need a **custom system prompt** for the sub-agent.

### Use Reduce When:
- You have multiple text results (from fanout, map, or manual collection) that need to be **combined into one coherent output**.
- You want a **comparative analysis** across results.
- You need a **summary** that captures the key points from all inputs.

---

## Section 5: Procedures

### Procedure: Compare Multiple Entities (Fan-Out + Reduce)

This is the most common orchestration pattern: research in parallel, then synthesize.

**Example: "Compare AWS, Azure, and GCP for hosting a Node.js app"**

Step 1 -- Fan out the research:
```
agent_fanout({
  prompts: [
    "Research AWS for hosting a Node.js application. Cover: compute options (EC2, Lambda, ECS, App Runner), pricing tiers, free tier, deployment ease, Node.js-specific features, and limitations. Be specific with pricing.",
    "Research Microsoft Azure for hosting a Node.js application. Cover: compute options (App Service, Functions, AKS, Container Apps), pricing tiers, free tier, deployment ease, Node.js-specific features, and limitations. Be specific with pricing.",
    "Research Google Cloud Platform for hosting a Node.js application. Cover: compute options (Cloud Run, App Engine, GKE, Cloud Functions), pricing tiers, free tier, deployment ease, Node.js-specific features, and limitations. Be specific with pricing."
  ],
  tools: ["web_search", "browser_navigate", "browser_read"],
  maxTurns: 10
})
```

Step 2 -- Reduce the results:
```
agent_reduce({
  results: [<aws_result>, <azure_result>, <gcp_result>],
  combinePrompt: "Compare AWS, Azure, and GCP for Node.js hosting. Create a structured comparison with: 1) Summary table (rows: pricing, free tier, ease of deployment, Node.js support, scaling), 2) Winner per category, 3) Overall recommendation with reasoning."
})
```

### Procedure: Apply Analysis to Multiple Items (Map + Reduce)

**Example: "Analyze these 5 competitor websites"**

Step 1 -- Map the analysis template:
```
agent_map({
  template: "Visit {{item}} and analyze: 1) What product/service they offer, 2) Their pricing model, 3) Key features listed on the homepage, 4) Target audience, 5) Any free trial or demo available. Return structured findings.",
  items: [
    "https://competitor1.com",
    "https://competitor2.com",
    "https://competitor3.com",
    "https://competitor4.com",
    "https://competitor5.com"
  ],
  tools: ["browser_navigate", "browser_read", "web_search"],
  maxTurns: 8
})
```

Step 2 -- Reduce:
```
agent_reduce({
  results: [<result_0>, <result_1>, <result_2>, <result_3>, <result_4>],
  combinePrompt: "Create a competitive landscape analysis. Include: 1) Comparison matrix of all 5 competitors, 2) Pricing comparison table, 3) Feature gaps and overlaps, 4) Market positioning assessment."
})
```

### Procedure: Parallel File Analysis (Map)

**Example: "Summarize each PDF in this folder"**

```
agent_map({
  template: "Read the PDF at {{item}} and provide a 3-paragraph summary covering: main topic, key findings, and conclusions or recommendations.",
  items: [
    "/Users/me/docs/report-q1.pdf",
    "/Users/me/docs/report-q2.pdf",
    "/Users/me/docs/report-q3.pdf",
    "/Users/me/docs/report-q4.pdf"
  ],
  tools: ["office_read_pdf", "office_pdf_ask"],
  maxTurns: 5
})
```

### Procedure: Delegate a Complex Sub-Task (Spawn)

**Example: "Build a financial model while I continue working"**

```
agent_spawn({
  prompt: "Create a 3-year financial projection for a SaaS company with: $50K MRR starting point, 8% monthly growth, 70% gross margin, $200K annual operating expenses growing 5% yearly. Build this in an Excel file at /Users/me/Desktop/financial-model.xlsx with separate sheets for Revenue, Costs, and Summary.",
  tools: ["office_write_xlsx", "office_chart_xlsx"],
  maxTurns: 15,
  systemPrompt: "You are a financial modeling expert. Build precise Excel models with formulas, not hardcoded values. Use blue font for inputs, black for formulas."
})
```

### Procedure: Research + Report Generation (Full Pipeline)

**Example: "Research the top 3 CRM platforms and write a comparison report"**

Step 1 -- Fan out research:
```
agent_fanout({
  prompts: [
    "Research Salesforce CRM: features, pricing plans, integrations, pros and cons, ideal customer size.",
    "Research HubSpot CRM: features, pricing plans, integrations, pros and cons, ideal customer size.",
    "Research Pipedrive CRM: features, pricing plans, integrations, pros and cons, ideal customer size."
  ],
  tools: ["web_search", "browser_navigate", "browser_read"],
  maxTurns: 10
})
```

Step 2 -- Reduce into a report:
```
agent_reduce({
  results: [<salesforce_result>, <hubspot_result>, <pipedrive_result>],
  combinePrompt: "Write a professional CRM comparison report. Structure: Executive Summary, Individual Platform Overviews (1 paragraph each), Feature Comparison Table, Pricing Comparison Table, Recommendation by Company Size (startup, mid-market, enterprise)."
})
```

Step 3 -- Save the output (use a regular tool call, not orchestration):
```
fs_write({ path: "/Users/me/Desktop/crm-comparison.md", content: <reduced_result> })
```

### Procedure: Parallel Data Gathering with Restricted Tools

**Example: "Get the stock info for these 5 companies"**

```
agent_map({
  template: "Search the web for the current stock price, market cap, P/E ratio, and 52-week range for {{item}}. Return the data in a structured format.",
  items: ["Apple (AAPL)", "Microsoft (MSFT)", "Google (GOOGL)", "Amazon (AMZN)", "NVIDIA (NVDA)"],
  tools: ["web_search"],
  maxTurns: 5
})
```

By restricting to `["web_search"]` only, each sub-agent completes faster and cannot accidentally modify files or use unnecessary tools.

---

## Section 6: Known Issues & Gotchas

### Error Handling

- If a sub-agent encounters an error, `agent_fanout` and `agent_map` capture it in the `error` field of that result -- they do NOT fail the entire operation. Other sub-agents continue running.
- `agent_spawn` returns the error as a string: `"Sub-agent error: <message>"`.
- If the AgentSpawner is not initialized, all tools throw `"AgentSpawner not initialized"`.

### Token and Cost Considerations

- Each sub-agent is a full agent loop with its own LLM calls. Fanning out to 5 sub-agents means roughly 5x the LLM token usage.
- Use `maxTurns` to cap runaway sub-agents. A sub-agent doing web research rarely needs more than 10 turns.
- Restrict tools via the `tools` parameter to reduce unnecessary tool-call overhead.

### Concurrency Limits

- `agent_fanout` and `agent_map` use `Promise.all()` -- all sub-agents run simultaneously.
- There is no built-in concurrency limit. Fanning out to 20+ prompts will create 20+ concurrent LLM requests, which may hit provider rate limits.
- Practical recommendation: keep fanout to 3-8 parallel prompts for reliability.

### The `{{item}}` Placeholder

- In `agent_map`, the template MUST use `{{item}}` (exactly) as the placeholder. Other variable names like `{{name}}` or `{{url}}` will NOT be substituted.
- `{{item}}` is replaced via global regex -- all occurrences in the template are substituted.
- Items are coerced to strings via `String(item)`.

### Sub-Agent Context Isolation

- Sub-agents do NOT share message history with the parent agent or with each other.
- Sub-agents do NOT see the parent's system prompt (they use the default sub-agent prompt or a custom `systemPrompt`).
- Sub-agents CAN access the same tools and files as the parent. A sub-agent writing to a file that another sub-agent reads concurrently can cause race conditions.

### The `systemPrompt` Parameter

- Only available on `agent_spawn`, NOT on `agent_fanout` or `agent_map`.
- For fanout/map, all sub-agents use the default sub-agent system prompt.
- If you need custom system prompts for parallel agents, use multiple `agent_spawn` calls instead of `agent_fanout`.

### Result Size

- `agent_fanout` and `agent_map` return JSON-stringified results with 2-space indentation.
- Very long sub-agent responses (e.g., full web page analyses) can produce large result payloads. Consider asking sub-agents to be concise in their prompts.

### Nesting

- Sub-agents can technically call orchestration tools themselves (spawning sub-sub-agents). This is allowed but NOT recommended -- it can lead to exponential resource usage and is difficult to debug.
- Keep orchestration to a single level: parent fans out, sub-agents do focused work, parent reduces.
