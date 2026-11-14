// Written with an LLM coding assistant (SI); reviewed by the team.
import Anthropic from '@anthropic-ai/sdk';

/** A model that streams plain text for one system + user prompt. */
export interface Llm { stream(system: string, user: string): AsyncIterable<string> }

export type Effort = 'low' | 'medium' | 'high';

/**
 * Claude via the Anthropic SDK. The model comes from configuration (LLM_MODEL), never hardcoded.
 * Server-side refusal fallback is on ("default" routing) so a safety decline is retried on another model.
 */
export function anthropicLlm(opts: { apiKey: string; model: string; effort?: Effort; maxTokens?: number }): Llm {
  const client = new Anthropic({ apiKey: opts.apiKey });
  return {
    async *stream(system: string, user: string) {
      const stream = client.beta.messages.stream({
        model: opts.model,
        max_tokens: opts.maxTokens ?? 8000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: opts.effort ?? 'low' },
        system,
        messages: [{ role: 'user', content: user }],
      } as Parameters<typeof client.beta.messages.stream>[0]);
      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') yield event.delta.text;
      }
    },
  };
}
