// USD per million tokens. Keep these aligned with the public Zro model catalog.
export const MODEL_RATES = {
  'glm-5.3-flash': { input: 0.15, output: 0.50, cacheRead: 0.03 },
  'deepseek-v4.1-flash': { input: 0.30, output: 1.20, cacheRead: 0.006 },
  'glm-5.3': { input: 1.40, output: 4.40, cacheRead: 0.26 },
  'dolly1-security': { input: 0.45, output: 1.50, cacheRead: 0.09 },
};

export function estimatedCostUsd(usage, model) {
  const rate = MODEL_RATES[String(model || '').replace(/^zro\//, '').toLowerCase()];
  if (!rate || !Number.isFinite(usage?.promptTokens) || !Number.isFinite(usage?.completionTokens)) return null;
  const input = Math.max(0, usage.promptTokens);
  const output = Math.max(0, usage.completionTokens);
  const cached = Math.min(input, Math.max(0, Number(usage.cacheReadTokens) || 0));
  return Math.round(((input - cached) * rate.input + cached * rate.cacheRead + output * rate.output) * 1000) / 1e9;
}

export function callTelemetry(result, fallbackModel) {
  if (!result) return null;
  const servedModel = String(result.servedModel || fallbackModel || '').slice(0, 80);
  return {
    servedModel,
    latencyMs: Number.isFinite(result.latencyMs) ? result.latencyMs : null,
    usage: result.usage || null,
    estimatedCostUsd: estimatedCostUsd(result.usage, servedModel),
  };
}
