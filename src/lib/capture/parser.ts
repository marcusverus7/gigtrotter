import "server-only";
import Anthropic from "@anthropic-ai/sdk";

import { serverEnv } from "@/lib/env";
import { ParsedCaptureSchema, type ParsedCapture } from "@/lib/capture/schema";
import {
  PARSER_SYSTEM_PROMPT,
  PARSER_USER_INSTRUCTION,
} from "@/lib/capture/prompt";

/**
 * Single-call vision parse. We ask Claude to return only JSON; the schema
 * coerces and validates. Failures bubble as `ParseError` so the API route
 * can persist a `status='rejected'` capture row with a reason.
 */

export class ParseError extends Error {
  constructor(
    message: string,
    public reason: "model_error" | "invalid_json" | "schema_mismatch" | "low_confidence",
  ) {
    super(message);
  }
}

const anthropic = () =>
  new Anthropic({ apiKey: serverEnv.anthropicApiKey });

function detectMimeType(bytes: Uint8Array): "image/png" | "image/jpeg" | "image/webp" | "application/pdf" {
  // Cheap magic-number sniff; enough for the formats Apple/Android share sheets emit.
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return "image/png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return "image/jpeg";
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46)
    return "image/webp";
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46)
    return "application/pdf";
  return "image/jpeg";
}

export async function parseCaptureBytes(
  bytes: Uint8Array,
): Promise<ParsedCapture> {
  const mime = detectMimeType(bytes);
  // PDF support arrives in V1 (camera-roll-only MVP). Reject for now.
  if (mime === "application/pdf") {
    throw new ParseError("PDF captures land in V1.", "schema_mismatch");
  }
  const b64 = Buffer.from(bytes).toString("base64");

  let response;
  try {
    response = await anthropic().messages.create({
      model: serverEnv.anthropicParseModel,
      max_tokens: 1024,
      system: PARSER_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: mime, data: b64 },
            },
            { type: "text", text: PARSER_USER_INSTRUCTION },
          ],
        },
      ],
    });
  } catch (err) {
    throw new ParseError(
      err instanceof Error ? err.message : "Anthropic call failed",
      "model_error",
    );
  }

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();

  // The model occasionally wraps JSON in a ```json fence despite the prompt;
  // strip it defensively rather than retry on cost.
  const cleaned = text.replace(/^```(?:json)?\s*|\s*```$/g, "");

  let json: unknown;
  try {
    json = JSON.parse(cleaned);
  } catch {
    throw new ParseError("Model returned non-JSON output.", "invalid_json");
  }

  const result = ParsedCaptureSchema.safeParse(json);
  if (!result.success) {
    throw new ParseError(result.error.message, "schema_mismatch");
  }
  return result.data;
}
