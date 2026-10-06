import Anthropic from '@anthropic-ai/sdk';
import { requireEnv } from '@/lib/env';

export interface LlmRequest {
  system: string;
  user: string;
  maxTokens?: number;
}
export interface LlmResponse {
  text: string;
  tokensIn: number;
  tokensOut: number;
}
export interface LlmProvider {
  name: string;
  model: string;
  params: Record<string, unknown>;
  complete(req: LlmRequest): Promise<LlmResponse>;
}

/** Provider padrão. Trocar de fornecedor = implementar LlmProvider; nada fora deste arquivo conhece o SDK. */
export function getProvider(): LlmProvider {
  const model = process.env.AI_MODEL || 'claude-sonnet-5-5';
  const client = new Anthropic({ apiKey: requireEnv('ANTHROPIC_API_KEY') });
  const temperature = 0; // extração fiel: sem criatividade
  return {
    name: 'anthropic',
    model,
    params: { temperature },
    async complete({ system, user, maxTokens = 4096 }) {
      const res = await client.messages.create({
        model,
        max_tokens: maxTokens,
        temperature,
        system,
        messages: [{ role: 'user', content: user }]
      });
      const text = res.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
      return { text, tokensIn: res.usage.input_tokens, tokensOut: res.usage.output_tokens };
    }
  };
}
