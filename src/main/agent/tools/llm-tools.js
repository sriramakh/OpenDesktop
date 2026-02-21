const { callLLM } = require('../llm');

const LLMTools = [
  {
    name: 'llm_query',
    category: 'llm',
    description: 'Query the LLM for reasoning, summarization, code generation, or general Q&A',
    params: ['prompt', 'systemPrompt', 'temperature'],
    permissionLevel: 'safe',
    async execute({ prompt, systemPrompt, temperature }) {
      if (!prompt) throw new Error('prompt is required');

      const system = systemPrompt || 'You are a helpful assistant. Be concise and accurate.';
      const options = {};
      if (temperature !== undefined) options.temperature = temperature;

      return await callLLM(system, prompt, options);
    },
  },

  {
    name: 'llm_summarize',
    category: 'llm',
    description: 'Summarize a long piece of text into key points',
    params: ['text', 'maxLength', 'format'],
    permissionLevel: 'safe',
    async execute({ text, maxLength = 500, format = 'bullets' }) {
      if (!text) throw new Error('text is required');

      const formatInstruction = format === 'bullets'
        ? 'Use bullet points.'
        : format === 'paragraph'
          ? 'Write a concise paragraph.'
          : 'Use a structured format with headings.';

      const system = `You are a summarization expert. Summarize the given text concisely in ${maxLength} characters or less. ${formatInstruction}`;

      return await callLLM(system, text);
    },
  },

  {
    name: 'llm_extract',
    category: 'llm',
    description: 'Extract structured data from unstructured text',
    params: ['text', 'schema', 'instructions'],
    permissionLevel: 'safe',
    async execute({ text, schema, instructions }) {
      if (!text) throw new Error('text is required');

      const schemaDesc = schema
        ? `\nExtract data matching this schema: ${JSON.stringify(schema)}`
        : '';

      const system = `You are a data extraction expert. Extract structured data from the given text and return valid JSON.${schemaDesc}${instructions ? `\n${instructions}` : ''}`;

      const result = await callLLM(system, text);

      // Try to parse as JSON
      try {
        const jsonMatch = result.match(/```(?:json)?\s*([\s\S]*?)```/) || result.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
        if (jsonMatch) return jsonMatch[1].trim();
      } catch { /* return raw */ }

      return result;
    },
  },

  {
    name: 'llm_code',
    category: 'llm',
    description: 'Generate or modify code based on instructions',
    params: ['instruction', 'language', 'existingCode', 'context'],
    permissionLevel: 'safe',
    async execute({ instruction, language = 'javascript', existingCode, context }) {
      if (!instruction) throw new Error('instruction is required');

      let prompt = instruction;
      if (existingCode) {
        prompt = `Existing code:\n\`\`\`${language}\n${existingCode}\n\`\`\`\n\nInstruction: ${instruction}`;
      }
      if (context) {
        prompt += `\n\nContext: ${context}`;
      }

      const system = `You are an expert ${language} programmer. Generate clean, well-structured, production-ready code. Only output the code, no explanations unless explicitly asked.`;

      return await callLLM(system, prompt);
    },
  },
];

module.exports = { LLMTools };
