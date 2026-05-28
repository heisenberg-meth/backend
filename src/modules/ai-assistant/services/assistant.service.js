import orchestrationService from './orchestration.service.js';

class AssistantService {
  /**
   * Main entry point for the AI Assistant
   */
  async process(tenantId, userId, userQuery) {
    // 1. LLM Step: Classify intent and extract params (Mocking LLM interaction)
    // In production, this call integrates with an LLM provider (e.g. Gemini API)
    const { tool, params } = this.mockLLMReasoning(userQuery);

    // 2. Execution Step: Run through Orchestrator
    const result = await orchestrationService.executeTool(tenantId, userId, tool, params);

    // 3. Summarization Step: LLM formats the response
    return `Operational Update: ${JSON.stringify(result)}`;
  }

  mockLLMReasoning(query) {
    if (query.includes('stock')) return { tool: 'getLowStock', params: {} };
    return { tool: 'unknown', params: {} };
  }
}

export default new AssistantService();
