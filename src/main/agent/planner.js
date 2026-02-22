const { callLLM } = require('./llm');
const os = require('os');

class TaskPlanner {
  async decompose(userMessage, { persona, context, memories, availableTools, conversationHistory }) {
    const toolDescriptions = availableTools
      .map((t) => {
        const params = (t.params || []).join(', ');
        return `- ${t.name} (${t.category}): ${t.description}\n  params: { ${params} }  [permission: ${t.permissionLevel}]`;
      })
      .join('\n');

    const memoryContext = memories.length
      ? `\nRelevant past interactions:\n${memories.map((m) => `- ${m.summary || m.query}`).join('\n')}`
      : '';

    const homeDir = os.homedir();
    const activeCtx = context
      ? `\nCurrent environment:\n- Platform: ${context.platform || 'unknown'} (${context.arch || '?'})\n- Home directory: ${homeDir}\n- Working directory: ${context.cwd || 'unknown'}\n- Active app: ${context.activeApp || 'unknown'}\n- Desktop path: ${homeDir}/Desktop\n- Documents path: ${homeDir}/Documents\n- Downloads path: ${homeDir}/Downloads`
      : '';

    // Conversation history for follow-up context
    const convCtx = conversationHistory
      ? `\nRecent conversation (use this to understand follow-up questions — "it", "that", "those", "the file", etc. refer to items from this history):\n${conversationHistory}`
      : '';

    const systemPrompt = `${persona.systemPrompt}

You are a task planner that decomposes user requests into concrete, executable tool-call steps.

Available tools:
${toolDescriptions}
${memoryContext}${activeCtx}${convCtx}

You MUST respond with a valid JSON object in this exact format:
{
  "goal": "high-level goal description",
  "steps": [
    {
      "id": 1,
      "description": "what this step does",
      "tool": "tool_name",
      "params": { "paramName": "value" },
      "dependsOn": []
    }
  ]
}

CRITICAL RULES:
1. Each step MUST use exactly one tool from the list above. Use the exact tool name.
2. Params MUST be concrete values — use real file paths (e.g. "${homeDir}/Desktop"), not placeholders.
3. If a step needs the output of a prior step (e.g. reading a file found by listing), set dependsOn to that step's id. The system will resolve the params at runtime.
4. For browsing directories, use fs_list with the real path. For the user's Desktop: "${homeDir}/Desktop".
5. For finding files, use fs_search with a glob pattern and a real cwd path.
6. For reading file contents, use fs_read with the full file path.
7. For running shell commands, use system_exec with the exact command string.
8. Keep steps atomic and ordered. Maximum 10 steps. Prefer fewer.
9. For simple questions that don't need tools, use a single llm_query step.
10. Always use absolute paths starting with / or ~. Never use relative paths unless appropriate.
11. IMPORTANT: If the user's message is a follow-up (e.g. "tell me more", "what about X", "open that file"), use the conversation history above to understand what they're referring to. Resolve pronouns and references to concrete values.
12. For opening applications on macOS, use app_open with just the app name (e.g. "Safari", "Finder", "Ollama") — NOT a file path. The system will find the app automatically.
13. For moving files with patterns like *.jpg, use fs_move with the glob pattern as source (e.g. source: "${homeDir}/Downloads/*.jpg").
14. For reading binary files (PDF, DOCX, XLSX, PPTX), use fs_read — the system handles extraction automatically.`;

    try {
      const response = await callLLM(systemPrompt, userMessage);
      const parsed = this.parseJSON(response);
      return parsed || this.fallbackPlan(userMessage);
    } catch (err) {
      console.error('[Planner] decompose error:', err.message);
      return this.fallbackPlan(userMessage);
    }
  }

  async revise(originalPlan, failedStepIndex, failResult, { persona, context, priorResults }) {
    const priorSummary = priorResults
      ? Object.entries(priorResults)
          .map(([id, r]) => `Step ${id} (${r.tool}): ${r.success ? 'OK' : 'FAIL'} — ${(r.data || r.error || '').slice(0, 300)}`)
          .join('\n')
      : '';

    const prompt = `The original plan failed at step ${failedStepIndex + 1}: "${originalPlan.steps[failedStepIndex]?.description}"
Error: ${failResult.error}

Original plan:
${JSON.stringify(originalPlan, null, 2)}

Prior step results:
${priorSummary}

Create a revised plan that works around this failure. Only include the REMAINING steps (from step ${failedStepIndex + 1} onward). Use concrete params based on prior results. Respond with the same JSON format.`;

    try {
      const response = await callLLM(persona.systemPrompt, prompt);
      return this.parseJSON(response);
    } catch {
      return null;
    }
  }

  async synthesize(originalQuery, results, persona, stepResults) {
    const successfulResults = results.filter((r) => r.success);
    const failedResults = results.filter((r) => r.error);
    const skippedResults = results.filter((r) => r.skipped);

    // Build a data summary from step results
    const dataParts = [];
    if (stepResults) {
      for (const [id, r] of Object.entries(stepResults)) {
        if (r.success && r.data) {
          dataParts.push(`[Step ${id} — ${r.tool}]: ${r.data.slice(0, 2000)}`);
        } else if (r.error) {
          dataParts.push(`[Step ${id} — ${r.tool}]: ERROR: ${r.error}`);
        }
      }
    }

    // Try LLM-powered synthesis for richer responses
    if (dataParts.length > 0) {
      try {
        const synthesisPrompt = `The user asked: "${originalQuery}"

Here are the results from executing the task:
${dataParts.join('\n\n')}

Summarize these results in a clear, helpful response to the user. Include relevant data from the results. If directory listings or file contents were retrieved, present them in a readable format. Be concise but complete.`;

        const llmSummary = await callLLM(
          persona.systemPrompt || 'You are a helpful assistant. Be concise and accurate.',
          synthesisPrompt
        );
        if (llmSummary && llmSummary.trim().length > 10) {
          return llmSummary.trim();
        }
      } catch (err) {
        console.error('[Planner] LLM synthesis failed, using fallback:', err.message);
      }
    }

    // Fallback: static synthesis
    let summary = '';

    if (failedResults.length === 0 && skippedResults.length === 0) {
      summary = `Task completed successfully. All ${successfulResults.length} step(s) executed.`;
    } else if (successfulResults.length === 0) {
      summary = `Task failed. ${failedResults.length} step(s) encountered errors.`;
    } else {
      summary = `Task partially completed. ${successfulResults.length} succeeded, ${failedResults.length} failed, ${skippedResults.length} skipped.`;
    }

    const dataOutputs = successfulResults
      .filter((r) => r.data && typeof r.data === 'string' && r.data.length < 3000)
      .map((r) => r.data);

    if (dataOutputs.length > 0) {
      summary += '\n\nResults:\n' + dataOutputs.join('\n---\n');
    }

    if (failedResults.length > 0) {
      summary +=
        '\n\nErrors:\n' + failedResults.map((r) => `- ${r.error}`).join('\n');
    }

    return summary;
  }

  parseJSON(text) {
    // Extract JSON from potentially markdown-wrapped response
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/) || text.match(/(\{[\s\S]*\})/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[1].trim());
      } catch {
        // Fall through
      }
    }
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }

  fallbackPlan(message) {
    const homeDir = os.homedir();
    const lowerMsg = message.toLowerCase();
    const steps = [];

    // Extract file paths from the message
    const pathMatch = message.match(/[\/~][\w\/_.\-]+/);

    // --- Directory listing / browsing ---
    if (lowerMsg.match(/\b(list|show|browse|what'?s (in|on)|contents? of|look at|crawl|scan|explore)\b/) &&
        lowerMsg.match(/\b(folder|directory|desktop|documents|downloads|dir|files?)\b/)) {
      let targetPath = pathMatch ? pathMatch[0] : null;
      if (!targetPath) {
        if (lowerMsg.includes('desktop')) targetPath = `${homeDir}/Desktop`;
        else if (lowerMsg.includes('download')) targetPath = `${homeDir}/Downloads`;
        else if (lowerMsg.includes('document')) targetPath = `${homeDir}/Documents`;
        else if (lowerMsg.includes('home')) targetPath = homeDir;
        else targetPath = '.';
      }
      steps.push({
        id: 1,
        description: `List contents of ${targetPath}`,
        tool: 'fs_list',
        params: { path: targetPath, recursive: false },
        dependsOn: [],
      });
    }
    // --- File search ---
    else if (lowerMsg.match(/\b(find|search for|locate|where is|look for)\b/) &&
             lowerMsg.match(/\b(file|folder|directory|\.\w{1,5})\b/)) {
      const extMatch = lowerMsg.match(/\.(\w{1,6})\b/);
      const pattern = extMatch ? `**/*.${extMatch[1]}` : '**/*';
      let cwd = pathMatch ? pathMatch[0] : homeDir;
      if (lowerMsg.includes('desktop')) cwd = `${homeDir}/Desktop`;
      else if (lowerMsg.includes('download')) cwd = `${homeDir}/Downloads`;
      else if (lowerMsg.includes('document')) cwd = `${homeDir}/Documents`;
      steps.push({
        id: 1,
        description: `Search for files matching ${pattern} in ${cwd}`,
        tool: 'fs_search',
        params: { pattern, cwd, maxResults: 30 },
        dependsOn: [],
      });
    }
    // --- Read file ---
    else if (lowerMsg.match(/\b(read|show|cat|display|open|view|contents? of|what'?s in)\b/) && pathMatch) {
      steps.push({
        id: 1,
        description: `Read file: ${pathMatch[0]}`,
        tool: 'fs_read',
        params: { path: pathMatch[0] },
        dependsOn: [],
      });
    }
    // --- Write file ---
    else if (lowerMsg.match(/\b(write|create file|save|make a file)\b/)) {
      steps.push({
        id: 1,
        description: 'Write content to file',
        tool: 'fs_write',
        params: { path: pathMatch ? pathMatch[0] : '', content: '' },
        dependsOn: [],
      });
    }
    // --- Web search ---
    else if (lowerMsg.match(/\b(search the web|google|look up online|web search)\b/)) {
      steps.push({
        id: 1,
        description: 'Search the web',
        tool: 'web_search',
        params: { query: message },
        dependsOn: [],
      });
    }
    // --- Run command ---
    else if (lowerMsg.match(/\b(run|execute|command|shell|terminal)\b/)) {
      const cmdMatch = message.match(/[`"'](.+?)[`"']/);
      steps.push({
        id: 1,
        description: 'Execute system command',
        tool: 'system_exec',
        params: { command: cmdMatch ? cmdMatch[1] : message },
        dependsOn: [],
      });
    }
    // --- Open app/file/URL ---
    else if (lowerMsg.match(/\b(open|launch|start)\b/)) {
      const target = pathMatch ? pathMatch[0] : message.replace(/^(open|launch|start)\s+/i, '').trim();
      steps.push({
        id: 1,
        description: `Open: ${target}`,
        tool: 'app_open',
        params: { target },
        dependsOn: [],
      });
    }
    // --- Default: conversational query ---
    else {
      steps.push({
        id: 1,
        description: 'Process user query with LLM',
        tool: 'llm_query',
        params: { prompt: message },
        dependsOn: [],
      });
    }

    return {
      goal: message,
      steps,
    };
  }
}

module.exports = { TaskPlanner };
