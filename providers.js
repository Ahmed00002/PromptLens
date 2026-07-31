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

  if (!res.ok) throwApiError("Groq", res, text);
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
  if (!res.ok) throwApiError("Gemini", res, text);
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
  if (!res.ok) throwApiError("Mistral", res, text);
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

/**
 * Builds and throws the Error for a failed API response, attaching how long the provider itself
 * says to wait (its Retry-After header, when present) as `err.retryAfterMs` on 429s. Groq, Gemini,
 * and Mistral all can send this on rate limits, and it's a much better wait time than a guess —
 * generateWithFallback's retry-before-fallback logic uses it directly.
 */
function throwApiError(providerLabel, res, rawBody) {
  const err = new Error(readableApiError(providerLabel, res.status, rawBody));
  if (res.status === 429) {
    const retryAfter = res.headers?.get?.("retry-after");
    const seconds = retryAfter != null ? Number(retryAfter) : NaN;
    if (!Number.isNaN(seconds) && seconds > 0) err.retryAfterMs = seconds * 1000;
  }
  throw err;
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

/** Dispatches to the right provider's raw HTTP call. Shared by regular generation, Adobe Stock metadata, and anything else that needs a vision call. */
async function callProviderRaw(providerId, apiKey, model, base64Image, mimeType, instruction) {
  if (providerId === "groq") return callGroq(apiKey, model, base64Image, mimeType, instruction);
  if (providerId === "gemini") return callGemini(apiKey, model, base64Image, mimeType, instruction);
  if (providerId === "mistral") return callMistral(apiKey, model, base64Image, mimeType, instruction);
  throw new Error(`Unknown provider: ${providerId}`);
}

/**
 * Classifies a thrown error as a capacity issue (rate limit / quota) vs. anything else. Only
 * capacity errors trigger provider fallback in generateWithFallback below — a malformed
 * response or a bad image won't be fixed by switching providers, so those fail immediately
 * rather than being retried against a different model that has the same problem.
 */
function isRateLimitError(err) {
  const message = String((err && err.message) || err || "").toLowerCase();
  return (
    message.includes("429") ||
    message.includes("rate limit") ||
    message.includes("quota") ||
    message.includes("resource exhausted") ||
    message.includes("resource_exhausted") ||
    message.includes("too many requests")
  );
}

/** Configured providers (have an API key set), starting with the active one, in a stable order. */
function getFallbackProviderOrder(settings) {
  const configured = Object.keys(PROVIDER_META).filter(
    (id) => settings.providers[id] && settings.providers[id].apiKey
  );
  const active = settings.activeProvider;
  return [active, ...configured.filter((id) => id !== active)].filter((id) => configured.includes(id));
}

/**
 * Runs `taskFn(providerId, providerConfig)` against the person's configured providers in
 * priority order, falling back to the next one ONLY on a capacity error (rate limit/quota) —
 * anything else fails immediately rather than being retried against a different model, since
 * that wouldn't fix it. Used by regular generation, batch mode, and Adobe Stock auto-fill so a
 * rate limit on one provider doesn't stall everything when another configured provider is idle.
 *
 * On a rate limit, each provider gets one backoff-and-retry *before* moving on: free-tier limits
 * (especially Groq/Gemini's per-minute request or token budgets, which a handful of image calls
 * can burn through fast) are usually short windows that clear on their own within seconds, so
 * immediately jumping to another provider — or failing the file outright once every provider's
 * been tried — throws away a call that would likely have succeeded a moment later. The wait uses
 * the provider's own Retry-After header when it sends one, since that's a real number rather than
 * a guess; otherwise a fixed short backoff.
 *
 * Resolves to { result, providerId, usedFallback }.
 */
async function generateWithFallback(settings, taskFn) {
  const order = getFallbackProviderOrder(settings);
  if (!order.length) {
    throw new Error("No AI provider has an API key set. Open PromptLens settings to add one.");
  }
  const DEFAULT_BACKOFF_MS = 4000;
  const MAX_BACKOFF_MS = 15000;
  let lastErr = null;
  for (let i = 0; i < order.length; i++) {
    const providerId = order[i];
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const result = await taskFn(providerId, settings.providers[providerId]);
        return { result, providerId, usedFallback: i > 0 };
      } catch (err) {
        lastErr = err;
        if (!isRateLimitError(err)) throw err; // not a capacity error — retrying/falling back won't help
        const isLastProviderThisRound = i === order.length - 1;
        if (attempt === 1) {
          if (isLastProviderThisRound) throw err;
          break; // exhausted the retry for this provider — move to the next one
        }
        const waitMs = Math.min(err.retryAfterMs || DEFAULT_BACKOFF_MS, MAX_BACKOFF_MS);
        await new Promise((resolve) => setTimeout(resolve, waitMs));
      }
    }
  }
  throw lastErr;
}

async function generatePromptFromImage(providerId, providerConfig, base64Image, mimeType, outputStyle, ipSafe, iconMode) {
  const instruction = buildPromptInstruction(outputStyle, ipSafe, iconMode);
  const { apiKey, model } = providerConfig;
  if (!apiKey) {
    throw new Error(`No API key set for ${PROVIDER_META[providerId]?.label || providerId}. Open PromptLens settings to add one.`);
  }
  const raw = await callProviderRaw(providerId, apiKey, model, base64Image, mimeType, instruction);

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

/**
 * One combined vision-model call that returns Adobe Stock's two required fields (title +
 * keywords) as structured JSON, instead of the free-text prompt used everywhere else in
 * PromptLens. Reuses the same reasoning-strip safety net as generatePromptFromImage, since a
 * reasoning model can burn its token budget "thinking" here too.
 */
async function generateAdobeStockMetadata(providerId, providerConfig, base64Image, mimeType, ipSafe, lengthSettings) {
  const instruction = buildAdobeStockInstruction(ipSafe, lengthSettings);
  const { apiKey, model } = providerConfig;
  if (!apiKey) {
    throw new Error(`No API key set for ${PROVIDER_META[providerId]?.label || providerId}. Open PromptLens settings to add one.`);
  }
  const raw = await callProviderRaw(providerId, apiKey, model, base64Image, mimeType, instruction);

  const { cleaned, truncated } = extractFinalAnswer(raw);
  if (truncated) {
    throw new Error(
      `${PROVIDER_META[providerId]?.label || providerId}'s model spent its whole reply "thinking" and never reached the metadata.`
    );
  }
  if (!cleaned) {
    throw new Error(`${PROVIDER_META[providerId]?.label || providerId} returned no usable text.`);
  }
  return parseAdobeStockJson(cleaned, lengthSettings);
}
