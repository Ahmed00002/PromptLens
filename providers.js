/**
 * Provider API calls. Loaded into the background service worker via importScripts.
 * Each call function takes (apiKey, model, base64Image, mimeType, instruction)
 * and resolves to a trimmed prompt string, or throws an Error with a readable message.
 */

/**
 * Groq's current default vision model (qwen/qwen3.6-27b) is a hybrid "thinking" model, and
 * Groq's other reasoning-capable models (the gpt-oss line, minimax-m2.x, deepseek/-r1 style
 * models) behave the same way: left on their defaults they can spend the *entire* max_tokens
 * budget on invisible chain-of-thought and never emit the actual answer. That's the "spent
 * its whole reply thinking" error this file throws below. A quick image-captioning task
 * doesn't need step-by-step reasoning, so we ask Groq to skip or hide it.
 *
 * Which knob does that depends on the model family, and Groq rejects a param a given model
 * doesn't support with a 400 (e.g. reasoning_format isn't supported on gpt-oss; reasoning_effort
 * only accepts "none"/"default" on qwen3 but "low"/"medium"/"high" on gpt-oss). Groq's supported
 * list also changes over time, so callGroq guesses from the model name and retries once without
 * these params if a request gets rejected for reasoning-param reasons, rather than hard-failing.
 */
function groqReasoningParams(model) {
  const m = (model || "").toLowerCase();
  if (m.includes("qwen")) {
    // qwen3 / qwen3.6: hybrid thinking mode, fully disable it — we don't need reasoning here.
    return { reasoning_effort: "none" };
  }
  if (m.includes("gpt-oss")) {
    // Always reasons; reasoning_format isn't supported, so cap effort low and hide it instead.
    return { reasoning_effort: "low", include_reasoning: false };
  }
  if (m.includes("minimax") || m.includes("deepseek") || m.includes("-r1")) {
    // Other reasoning-line models: ask Groq to strip the <think> block server-side.
    return { reasoning_format: "hidden" };
  }
  return {};
}

async function callGroq(apiKey, model, base64Image, mimeType, instruction) {
  const chosenModel = model || PROVIDER_META.groq.defaultModel;
  const payload = {
    model: chosenModel,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: instruction },
          { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64Image}` } },
        ],
      },
    ],
    temperature: 0.7,
    max_tokens: 3000,
  };

  const send = (extraParams) =>
    fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ...payload, ...extraParams }),
    });

  const reasoningParams = groqReasoningParams(chosenModel);
  let res = await send(reasoningParams);
  let text = await res.text();

  // If we guessed wrong about this model's supported params, retry once without them
  // instead of failing outright — Groq's per-model support for these keeps shifting.
  if (!res.ok && Object.keys(reasoningParams).length > 0 && /reasoning/i.test(text)) {
    res = await send({});
    text = await res.text();
  }

  if (!res.ok) throw new Error(readableApiError("Groq", res.status, text));
  const data = JSON.parse(text);
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error("Groq returned an empty response. Try a different model in settings.");
  return content.trim();
}

async function callGemini(apiKey, model, base64Image, mimeType, instruction) {
  const chosenModel = model || PROVIDER_META.gemini.defaultModel;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${chosenModel}:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          parts: [{ text: instruction }, { inline_data: { mime_type: mimeType, data: base64Image } }],
        },
      ],
      generationConfig: { temperature: 0.7, maxOutputTokens: 2000 },
    }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(readableApiError("Gemini", res.status, text));
  const data = JSON.parse(text);
  const content = data?.candidates?.[0]?.content?.parts
    ?.filter((p) => !p.thought)
    ?.map((p) => p.text || "")
    ?.join("");
  if (!content) {
    const blockReason = data?.promptFeedback?.blockReason;
    if (blockReason) throw new Error(`Gemini blocked this request (${blockReason}).`);
    throw new Error("Gemini returned an empty response. Try a different model in settings.");
  }
  return content.trim();
}

async function callMistral(apiKey, model, base64Image, mimeType, instruction) {
  const res = await fetch("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: model || PROVIDER_META.mistral.defaultModel,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: instruction },
            { type: "image_url", image_url: `data:${mimeType};base64,${base64Image}` },
          ],
        },
      ],
      max_tokens: 2000,
    }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(readableApiError("Mistral", res.status, text));
  const data = JSON.parse(text);
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error("Mistral returned an empty response. Try a different model in settings.");
  return content.trim();
}

function readableApiError(providerLabel, status, rawBody) {
  let detail = rawBody;
  try {
    const parsed = JSON.parse(rawBody);
    detail = parsed?.error?.message || parsed?.message || rawBody;
  } catch (_) {
    // rawBody wasn't JSON, leave as-is
  }
  if (status === 401 || status === 403) {
    return `${providerLabel} rejected the API key (${status}). Check the key in PromptLens settings.`;
  }
  if (status === 429) {
    return `${providerLabel} rate limit reached (429). Wait a moment and try again.`;
  }
  if (status === 404) {
    return `${providerLabel} model not found (404). The model name in settings may be outdated — check ${providerLabel}'s current model list.`;
  }
  return `${providerLabel} error (${status}): ${String(detail).slice(0, 300)}`;
}

/** Lightweight text-only ping used by the "Test" button in Settings. */
async function testProviderConnection(providerId, apiKey, model) {
  const instruction = 'Reply with exactly one word: OK';
  if (providerId === "groq") {
    const chosenModel = model || PROVIDER_META.groq.defaultModel;
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: chosenModel,
        messages: [{ role: "user", content: instruction }],
        max_tokens: 20,
        ...groqReasoningParams(chosenModel),
      }),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(readableApiError("Groq", res.status, text));
    // A 200 with no content means a reasoning model burned its whole budget "thinking" —
    // that's not a working connection, even though the HTTP call itself succeeded.
    const data = JSON.parse(text);
    if (!data?.choices?.[0]?.message?.content) {
      throw new Error(
        "Groq accepted the request but returned no text — this reasoning model may need more tokens to respond. Try a different model in settings."
      );
    }
    return true;
  }
  if (providerId === "gemini") {
    const chosenModel = model || PROVIDER_META.gemini.defaultModel;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${chosenModel}:generateContent?key=${apiKey}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: instruction }] }],
        generationConfig: { maxOutputTokens: 5 },
      }),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(readableApiError("Gemini", res.status, text));
    return true;
  }
  if (providerId === "mistral") {
    const res = await fetch("https://api.mistral.ai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: model || PROVIDER_META.mistral.defaultModel,
        messages: [{ role: "user", content: instruction }],
        max_tokens: 5,
      }),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(readableApiError("Mistral", res.status, text));
    return true;
  }
  throw new Error(`Unknown provider: ${providerId}`);
}

/**
 * Some "reasoning" models (Groq's qwen line, DeepSeek-style models, etc.) write out their
 * chain-of-thought as <think>...</think> before the real answer, even when told not to.
 * Strip that out so PromptLens never shows raw reasoning to the user. If the response got
 * cut off mid-thought (ran out of tokens before reaching the real answer), flag it as
 * truncated so the caller can surface a clear, actionable error instead of a fragment.
 */
function extractFinalAnswer(rawText) {
  if (!rawText) return { cleaned: "", truncated: false };
  const openTag = /<think>|<thinking>|\[think\]/i;
  const closeTag = /<\/think>|<\/thinking>|\[\/think\]/i;

  if (openTag.test(rawText) && !closeTag.test(rawText)) {
    return { cleaned: "", truncated: true };
  }

  let cleaned = rawText
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<thinking>[\s\S]*?<\/thinking>/gi, "")
    .replace(/\[think\][\s\S]*?\[\/think\]/gi, "")
    .trim();

  return { cleaned, truncated: false };
}

async function generatePromptFromImage(providerId, providerConfig, base64Image, mimeType, outputStyle, ipSafe, iconMode) {
  const instruction = buildPromptInstruction(outputStyle, ipSafe, iconMode);
  const { apiKey, model } = providerConfig;
  if (!apiKey) {
    throw new Error(`No API key set for ${PROVIDER_META[providerId]?.label || providerId}. Open PromptLens settings to add one.`);
  }
  let raw;
  if (providerId === "groq") raw = await callGroq(apiKey, model, base64Image, mimeType, instruction);
  else if (providerId === "gemini") raw = await callGemini(apiKey, model, base64Image, mimeType, instruction);
  else if (providerId === "mistral") raw = await callMistral(apiKey, model, base64Image, mimeType, instruction);
  else throw new Error(`Unknown provider: ${providerId}`);

  const { cleaned, truncated } = extractFinalAnswer(raw);
  if (truncated) {
    throw new Error(
      `${PROVIDER_META[providerId]?.label || providerId}'s model spent its whole reply "thinking" and never reached ` +
      `the answer. Try again, or pick a non-reasoning model in settings (Advanced: model name).`
    );
  }
  if (!cleaned) {
    throw new Error(
      `${PROVIDER_META[providerId]?.label || providerId} returned no usable text after removing its reasoning output. ` +
      `Try again, or try a different model in settings.`
    );
  }
  return cleaned;
}
