export const VALID_MODELS = [
  'gemini-3.6-flash',
  'gemini-3.7-flash',
  'gemini-2.5-flash',
  'gemini-flash-latest'
];

export const DEFAULT_MODEL = 'gemini-3.6-flash';

export function getAIConfig() {
  const provider = process.env.AI_PROVIDER || 'gemini';
  const model = process.env.AI_MODEL || DEFAULT_MODEL;
  
  if (!VALID_MODELS.includes(model)) {
    throw new Error(`Invalid AI_MODEL configured: ${model}. Supported models: ${VALID_MODELS.join(', ')}`);
  }
  
  return { provider, model };
}
