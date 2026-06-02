import orchestrationService from './orchestration.service.js';

class AssistantService {
  async process(tenantId, userId, userQuery) {
    const { tool, params } = this.mockLLMReasoning(userQuery);

    const result = await orchestrationService.executeTool(tenantId, userId, tool, params);

    return `Operational Update: ${JSON.stringify(result)}`;
  }

  mockLLMReasoning(query) {
    if (query.includes('stock')) return { tool: 'getLowStock', params: {} };
    return { tool: 'unknown', params: {} };
  }
}

export default new AssistantService();
