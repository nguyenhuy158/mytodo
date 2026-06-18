import "server-only";

const GEMINI_API_BASE_URL =
  process.env.GEMINI_API_BASE_URL?.trim() ||
  "https://generativelanguage.googleapis.com/v1beta";
const DEFAULT_GEMINI_MODEL = "gemini-3.5-flash";

export type GeminiJsonSchema = Record<string, unknown>;

export type GeminiUsageMetadata = {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  totalTokenCount?: number;
};

export type GeminiJsonResult<T> = {
  data: T;
  model: string;
  modelVersion?: string;
  responseId?: string;
  usageMetadata?: GeminiUsageMetadata;
};

type GeminiJsonInput = {
  maxOutputTokens?: number;
  model?: string;
  prompt: string;
  responseSchema: GeminiJsonSchema;
  systemInstruction?: string;
  temperature?: number;
};

type GeminiGenerateContentResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
    finishReason?: string;
  }>;
  modelVersion?: string;
  promptFeedback?: {
    blockReason?: string;
  };
  responseId?: string;
  usageMetadata?: GeminiUsageMetadata;
};

type GeminiErrorResponse = {
  error?: {
    code?: number;
    message?: string;
    status?: string;
  };
};

export class GeminiConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GeminiConfigError";
  }
}

export class GeminiRequestError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "GeminiRequestError";
    this.status = status;
  }
}

export async function generateGeminiJson<T>({
  maxOutputTokens = 1600,
  model,
  prompt,
  responseSchema,
  systemInstruction,
  temperature = 0.2,
}: GeminiJsonInput): Promise<GeminiJsonResult<T>> {
  const config = getGeminiConfig(model);
  const requestInput = {
    maxOutputTokens,
    prompt,
    responseSchema,
    systemInstruction,
    temperature,
  } satisfies Required<Omit<GeminiJsonInput, "model" | "systemInstruction">> &
    Pick<GeminiJsonInput, "systemInstruction">;
  const structuredResult = await requestGeminiJson(config, requestInput, true);
  let response = structuredResult.response;
  let payload = structuredResult.payload;

  if (!response.ok && shouldRetryWithoutStructuredOutput(payload, response.status)) {
    const plainResult = await requestGeminiJson(config, requestInput, false);

    response = plainResult.response;
    payload = plainResult.payload;
  }

  if (!response.ok) {
    throw new GeminiRequestError(
      getGeminiErrorMessage(payload, response.status),
      response.status,
    );
  }

  const text = extractGeminiText(payload);

  if (!text) {
    throw new GeminiRequestError(
      getEmptyResponseMessage(payload),
      response.status,
    );
  }

  return {
    data: parseGeminiJson<T>(text),
    model: config.model,
    modelVersion: payload.modelVersion,
    responseId: payload.responseId,
    usageMetadata: payload.usageMetadata,
  };
}

async function requestGeminiJson(
  config: ReturnType<typeof getGeminiConfig>,
  input: Required<Omit<GeminiJsonInput, "model" | "systemInstruction">> &
    Pick<GeminiJsonInput, "systemInstruction">,
  structuredOutput: boolean,
) {
  const response = await fetch(getGenerateContentUrl(config.model), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": config.apiKey,
    },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [
            {
              text: structuredOutput
                ? input.prompt
                : buildPlainJsonPrompt(input.prompt, input.responseSchema),
            },
          ],
        },
      ],
      generationConfig: {
        maxOutputTokens: input.maxOutputTokens,
        ...(structuredOutput
          ? {
              responseFormat: {
                text: {
                  mimeType: "application/json",
                  schema: input.responseSchema,
                },
              },
            }
          : {}),
        temperature: input.temperature,
      },
      systemInstruction: input.systemInstruction
        ? {
            parts: [
              {
                text: structuredOutput
                  ? input.systemInstruction
                  : `${input.systemInstruction} Trả về duy nhất JSON hợp lệ, không markdown, không giải thích ngoài JSON.`,
              },
            ],
          }
        : undefined,
    }),
  });

  return {
    payload: await readGeminiJson(response),
    response,
  };
}

function getGeminiConfig(model?: string) {
  const apiKey = process.env.GEMINI_API_KEY?.trim();

  if (!apiKey) {
    throw new GeminiConfigError(
      "Thiếu GEMINI_API_KEY nên chưa thể dùng tính năng AI.",
    );
  }

  return {
    apiKey,
    model: normalizeModelName(
      model || process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL,
    ),
  };
}

function normalizeModelName(model: string) {
  const normalized = model.trim() || DEFAULT_GEMINI_MODEL;

  return normalized.startsWith("models/")
    ? normalized.slice("models/".length)
    : normalized;
}

function getGenerateContentUrl(model: string) {
  return `${GEMINI_API_BASE_URL}/models/${encodeURIComponent(
    model,
  )}:generateContent`;
}

function shouldRetryWithoutStructuredOutput(
  payload: GeminiGenerateContentResponse & GeminiErrorResponse,
  status: number,
) {
  if (status !== 400) {
    return false;
  }

  const message = payload.error?.message?.toLowerCase() ?? "";

  return (
    message.includes("response_format") ||
    message.includes("responseformat") ||
    message.includes("mime_type") ||
    message.includes("mimetype") ||
    message.includes("application/json")
  );
}

function buildPlainJsonPrompt(prompt: string, responseSchema: GeminiJsonSchema) {
  return [
    prompt,
    "",
    "Bắt buộc trả về duy nhất một JSON object hợp lệ theo JSON Schema bên dưới.",
    "Không bọc ```json, không markdown, không thêm chữ giải thích trước hoặc sau JSON.",
    "JSON Schema:",
    JSON.stringify(responseSchema, null, 2),
  ].join("\n");
}

async function readGeminiJson(response: Response) {
  try {
    return (await response.json()) as GeminiGenerateContentResponse &
      GeminiErrorResponse;
  } catch {
    return {} as GeminiGenerateContentResponse & GeminiErrorResponse;
  }
}

function getGeminiErrorMessage(
  payload: GeminiGenerateContentResponse & GeminiErrorResponse,
  status: number,
) {
  return payload.error?.message
    ? `Gemini trả lỗi ${status}: ${payload.error.message}`
    : `Gemini trả lỗi ${status}.`;
}

function extractGeminiText(payload: GeminiGenerateContentResponse) {
  return (
    payload.candidates?.[0]?.content?.parts
      ?.map((part) => part.text ?? "")
      .join("")
      .trim() ?? ""
  );
}

function getEmptyResponseMessage(payload: GeminiGenerateContentResponse) {
  const blockReason = payload.promptFeedback?.blockReason;
  const finishReason = payload.candidates?.[0]?.finishReason;

  if (blockReason) {
    return `Gemini không trả nội dung vì prompt bị chặn: ${blockReason}.`;
  }

  if (finishReason) {
    return `Gemini không trả nội dung. Finish reason: ${finishReason}.`;
  }

  return "Gemini không trả nội dung.";
}

function parseGeminiJson<T>(text: string) {
  const jsonText = extractJsonText(text);

  try {
    return JSON.parse(jsonText) as T;
  } catch {
    throw new GeminiRequestError("Gemini trả JSON không hợp lệ.", 502);
  }
}

function extractJsonText(text: string) {
  const trimmed = text.trim();
  const fencedJson = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);

  if (fencedJson?.[1]) {
    return fencedJson[1].trim();
  }

  const firstObjectBrace = trimmed.indexOf("{");
  const lastObjectBrace = trimmed.lastIndexOf("}");

  if (firstObjectBrace >= 0 && lastObjectBrace > firstObjectBrace) {
    return trimmed.slice(firstObjectBrace, lastObjectBrace + 1).trim();
  }

  const firstArrayBracket = trimmed.indexOf("[");
  const lastArrayBracket = trimmed.lastIndexOf("]");

  if (firstArrayBracket >= 0 && lastArrayBracket > firstArrayBracket) {
    return trimmed.slice(firstArrayBracket, lastArrayBracket + 1).trim();
  }

  return trimmed;
}
