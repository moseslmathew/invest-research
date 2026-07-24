/**
 * Centralized AI Model & Provider Configuration.
 * 
 * Easily switch models and AI providers (OpenAI or Google Gemini) here to update
 * model selection across all API routes (Research, SWOT, News, Technicals, Briefings) in code.
 */

export type AIModel =
  | "gpt-5.6-sol"
  | "gpt-5.6-luna"
  | "gpt-5.6-terra"
  | "gpt-5"
  | "gpt-5-mini"
  | "gpt-4o"
  | "gpt-4o-mini"
  | "o3"
  | "gemini-2.5-flash"
  | "gemini-2.5-pro"
  | "gemini-1.5-flash"
  | "gemini-1.5-pro"
  | "gemini-2.0-flash";

export const AI_CONFIG = {
  /**
   * Primary model used for high-intelligence synthesis:
   * - AI Research Briefs (/api/research)
   * - SWOT Analysis (/api/swot)
   * - Technical Takeaways (/api/technicals)
   * 
   * Options: "gpt-5.6-luna", "gemini-2.5-flash", "gemini-2.5-pro", "gpt-4o", etc.
   */
  RESEARCH_MODEL: "gpt-5.6-luna" as AIModel,

  /**
   * Fast model used for sub-second categorization:
   * - News Sentiment Tagging (/api/news)
   * - Headline Clustering (/api/headlines)
   * - Insider Trade Verification (/api/insider)
   * 
   * Options: "gpt-4o-mini", "gemini-2.5-flash", "gemini-1.5-flash"
   */
  FAST_MODEL: "gpt-4o-mini" as AIModel,

  /**
   * Model used for portfolio/watchlist executive briefings:
   * - Watchlist Briefing (/api/watchlist-briefing)
   * - Market Trending Analysis (/api/trending)
   * 
   * Options: "gpt-5.6-terra", "gemini-2.5-flash", "gemini-2.5-pro"
   */
  BRIEFING_MODEL: "gpt-5.6-terra" as AIModel,

  /**
   * Helper that builds the request body object for OpenAI fetch calls.
   */
  createBody: (options: {
    model: AIModel;
    messages: { role: string; content: string }[];
    responseFormat?: { type: string };
    temperature?: number;
  }) => {
    const isReasoningOrGpt5 =
      options.model.startsWith("gpt-5") ||
      options.model.startsWith("o1") ||
      options.model.startsWith("o3");

    const body: Record<string, unknown> = {
      model: options.model,
      messages: options.messages,
    };

    if (options.responseFormat) {
      body.response_format = options.responseFormat;
    }

    if (!isReasoningOrGpt5 && options.temperature !== undefined) {
      body.temperature = options.temperature;
    }

    return body;
  },
};

export function cleanJsonResponseText(rawText: string): string {
  if (!rawText) return "{}";
  let cleaned = rawText.trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, "");
  cleaned = cleaned.replace(/\s*```$/i, "");
  return cleaned.trim();
}

/**
 * Unified AI completion runner supporting both OpenAI & Google Gemini models.
 * Routes to the proper API provider endpoint depending on model selection.
 */
export async function executeAICall(options: {
  model: AIModel;
  messages: { role: string; content: string }[];
  responseFormat?: { type: string };
  temperature?: number;
}): Promise<Response> {
  const isGemini = options.model.startsWith("gemini");

  if (isGemini) {
    const geminiKey = process.env.GEMINI_API_KEY;
    if (!geminiKey) {
      return new Response(
        JSON.stringify({ error: "GEMINI_API_KEY is not configured in .env file." }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const modelName = options.model;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${geminiKey}`;

    const promptText = options.messages.map((m) => `${m.role.toUpperCase()}: ${m.content}`).join("\n\n");

    const geminiBody = {
      contents: [
        {
          role: "user",
          parts: [{ text: promptText }],
        },
      ],
      generationConfig: {
        responseMimeType: options.responseFormat?.type === "json_object" ? "application/json" : "text/plain",
      },
    };

    let res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(geminiBody),
    });

    // Fallback from pro to flash if 429 quota limit is encountered on free tier keys
    if (!res.ok && res.status === 429 && modelName === "gemini-2.5-pro") {
      const fallbackUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`;
      res = await fetch(fallbackUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(geminiBody),
      });
    }

    if (!res.ok) {
      return res;
    }

    const geminiData = await res.json();
    const rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
    const generatedText = cleanJsonResponseText(rawText);

    const openAiShape = {
      choices: [
        {
          message: {
            content: generatedText,
          },
        },
      ],
    };

    return new Response(JSON.stringify(openAiShape), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  // OpenAI Flow
  const openAiKey = process.env.OPENAI_API_KEY;
  if (!openAiKey) {
    return new Response(
      JSON.stringify({ error: "OPENAI_API_KEY is not configured in .env file." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  const body = AI_CONFIG.createBody(options);

  return fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openAiKey}`,
    },
    body: JSON.stringify(body),
  });
}
