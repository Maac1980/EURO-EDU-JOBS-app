import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY ?? "",
});

export async function analyzeImage(base64: string, mimeType: string, prompt: string): Promise<string | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  try {
    const mediaType = mimeType as "image/jpeg" | "image/png" | "image/webp" | "image/gif";
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 512,
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
          { type: "text", text: prompt },
        ],
      }],
    });
    const textBlock = response.content.find(b => b.type === "text");
    return textBlock?.type === "text" ? textBlock.text : null;
  } catch (e) {
    console.error("[ai] Claude image analysis error:", e);
    return null;
  }
}

export async function analyzeText(prompt: string, systemPrompt?: string): Promise<string | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: "user", content: prompt }],
    });
    const textBlock = response.content.find(b => b.type === "text");
    return textBlock?.type === "text" ? textBlock.text : null;
  } catch (e) {
    console.error("[ai] Claude text analysis error:", e);
    return null;
  }
}

export async function streamAnalysis(prompt: string, systemPrompt?: string): Promise<AsyncIterable<string>> {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not configured");
  const stream = anthropic.messages.stream({
    model: "claude-sonnet-4-6",
    max_tokens: 2048,
    system: systemPrompt,
    messages: [{ role: "user", content: prompt }],
  });

  return {
    async *[Symbol.asyncIterator]() {
      for await (const event of stream) {
        if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
          yield event.delta.text;
        }
      }
    },
  };
}

export async function scoreComplianceRisk(workerData: Record<string, unknown>): Promise<{
  level: "RED" | "AMBER" | "GREEN";
  score: number;
  reasons: string[];
  recommendations: string[];
} | null> {
  const prompt = `Analyze this worker's compliance data and return a risk assessment. Return ONLY valid JSON:
{
  "level": "RED" or "AMBER" or "GREEN",
  "score": 0-100 (100 = highest risk),
  "reasons": ["reason1", "reason2"],
  "recommendations": ["action1", "action2"]
}

Worker data: ${JSON.stringify(workerData)}`;

  const result = await analyzeText(prompt, "You are a Polish labor compliance expert. Assess document expiry risks, ZUS registration status, work permit validity, and RODO compliance.");
  if (!result) return null;
  try {
    const match = result.match(/\{[\s\S]*\}/);
    if (!match) return null;
    return JSON.parse(match[0]);
  } catch { return null; }
}

export { anthropic };
