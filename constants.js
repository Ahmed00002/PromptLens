/**
 * Shared constants for PromptLens.
 * Loaded as a classic (non-module) script by background.js (via importScripts),
 * options.html, and popup.html — so it must only use `var`/plain globals,
 * no `export` statements.
 */

var PROVIDER_META = {
  groq: {
    label: "Groq",
    helpUrl: "https://console.groq.com/keys",
    defaultModel: "qwen/qwen3.6-27b",
    modelHint: "Any current Groq vision model, e.g. qwen/qwen3.6-27b or llama-3.2-90b-vision-preview",
    keyPlaceholder: "gsk_...",
  },
  gemini: {
    label: "Gemini",
    helpUrl: "https://aistudio.google.com/app/apikey",
    defaultModel: "gemini-2.5-flash",
    modelHint: "Any current Gemini model that supports images, e.g. gemini-2.5-flash",
    keyPlaceholder: "AIza...",
  },
  mistral: {
    label: "Mistral",
    helpUrl: "https://console.mistral.ai/api-keys",
    defaultModel: "pixtral-12b-2409",
    modelHint: "Any current Mistral vision model, e.g. pixtral-12b-2409 or pixtral-large-latest",
    keyPlaceholder: "...",
  },
};

var OUTPUT_STYLES = {
  art_prompt: {
    label: "AI art prompt",
    description: "Comma-separated, descriptive — ready for Midjourney / Stable Diffusion.",
  },
  stock_keywords: {
    label: "Stock photo keywords",
    description: "A comma-separated keyword list, most relevant terms first.",
  },
  plain_description: {
    label: "Plain description",
    description: "A short, natural-language description of the image.",
  },
};

/**
 * Individual IP-safety toggles. Each maps to a clause the model is instructed to follow so the
 * generated prompt won't reintroduce trademarked/copyrighted material — useful for contributors
 * generating images for microstock sites (Adobe Stock, Shutterstock, etc.) that reject submissions
 * containing legible text, brand names, logos, or other recognizable IP.
 */
var IP_SAFE_ORDER = ["noText", "noBrands", "noLogosTags", "noOtherIP"];

var IP_SAFE_META = {
  noText: {
    label: "Text & watermarks",
    description: "Skip legible text, numbers, watermarks, or signatures.",
  },
  noBrands: {
    label: "Brand names",
    description: "No real brand, product, or company names — generic descriptors only.",
  },
  noLogosTags: {
    label: "Logos & tags",
    description: "No logos, emblems, or clothing/product labels.",
  },
  noOtherIP: {
    label: "Other IP",
    description: "No copyrighted characters, celebrities, franchises, or team marks.",
  },
};

/**
 * "Icon mode" — when on, the model is told to check whether the image is an icon or a bundle/set of
 * icons (as opposed to a photo or illustrated scene) and, if so, write the prompt as an icon-design
 * prompt with an explicit solid white background. General vision models tend to describe icons like
 * photos (backgrounds, lighting, materials) which produces unusable prompts for icon work — this
 * clause steers them toward the right vocabulary instead.
 */
var ICON_MODE_META = {
  label: "Icon mode",
  description: "Detect icons or icon sets and write the prompt for a flat icon on a solid white background.",
};

/**
 * Optional grid size for icon bundles. "auto" leaves the count up to what's actually in the image;
 * any other preset (or "custom") pins the prompt to an exact rows x cols count so contributors get
 * bundles sized the way their marketplace listing needs (e.g. a "9-icon set").
 */
var ICON_GRID_PRESETS = [
  { id: "auto", label: "Auto" },
  { id: "2x2", label: "2×2", rows: 2, cols: 2 },
  { id: "3x3", label: "3×3", rows: 3, cols: 3 },
  { id: "3x4", label: "3×4", rows: 3, cols: 4 },
  { id: "4x4", label: "4×4", rows: 4, cols: 4 },
  { id: "custom", label: "Custom" },
];

/** Resolves an iconMode settings object down to a concrete {rows, cols} grid, or null for "auto". */
function resolveIconGrid(iconMode) {
  if (!iconMode) return null;
  const mode = iconMode.gridMode || "auto";
  if (mode === "auto") return null;
  const clamp = (v) => Math.min(12, Math.max(1, Math.round(Number(v)) || 3));
  if (mode === "custom") {
    return { rows: clamp(iconMode.customRows), cols: clamp(iconMode.customCols) };
  }
  const preset = ICON_GRID_PRESETS.find((p) => p.id === mode);
  return preset && preset.rows ? { rows: preset.rows, cols: preset.cols } : null;
}

/**
 * "Hover quick-action button" — a tiny floating button appears over any qualifying image on
 * hover (similar to Pinterest's save button), so a prompt can be generated with a single click
 * instead of opening the right-click menu every time. It always triggers the exact same
 * generation flow as the context-menu item, using whichever provider/style/IP-safe/Icon-mode
 * settings are already active — it's purely a faster on-ramp into that same flow, not a separate
 * code path.
 */
var HOVER_BUTTON_META = {
  label: "Hover quick-action button",
  description: "Show a small button over images on hover to generate a prompt with one click.",
};

/**
 * Keyword "shape" for Adobe Stock metadata generation — steers whether the model favors single
 * words, longer descriptive phrases, or a natural blend of both. Purely a generation-time
 * instruction; Adobe's keyword field itself doesn't distinguish between the two shapes, so this
 * has no effect on validation, only on what the model is asked to produce.
 */
var KEYWORD_TYPE_ORDER = ["mixed", "single", "long_tail"];

var KEYWORD_TYPE_META = {
  mixed: {
    label: "Mixed",
    short: "Mixed",
    description: "A natural blend of single words and short phrases, ordered by relevance (default).",
  },
  single: {
    label: "Single words",
    short: "Single",
    description: "Individual words only — no multi-word phrases.",
  },
  long_tail: {
    label: "Long-tail phrases",
    short: "Long-tail",
    description: "Multi-word descriptive phrases (e.g. \"woman drinking coffee at sunrise\") that target more specific buyer searches.",
  },
};

/** The instruction clause for a given keyword type — null for "mixed", since that's the model's unconstrained default. */
function keywordTypeClause(keywordType) {
  if (keywordType === "single") {
    return "Every keyword must be exactly one word — no multi-word phrases.";
  }
  if (keywordType === "long_tail") {
    return (
      'Every keyword should be a long-tail phrase — a specific multi-word description (e.g. "woman drinking ' +
      'coffee at sunrise" rather than "woman" or "coffee") — since these target more specific buyer searches. ' +
      "Avoid single, generic words."
    );
  }
  return null;
}

/**
 * Adobe Stock's own field constraints (title advice is "under 70 characters, sounds natural
 * when spoken"; keywords 5–49, comma-separated, ordered by relevance — the first ~10 carry the
 * most search weight; titles themselves aren't searchable, only keywords are — see Adobe's
 * contributor help docs). This asks for structured JSON in one call rather than reusing the
 * plain "Stock photo keywords" style, so background.js can drop both fields straight into
 * Adobe's form without any further parsing on the page.
 */
function buildAdobeStockInstruction(ipSafe, lengthSettings) {
  const { titleMinLength, titleMaxLength, keywordMin, keywordMax, keywordType } = Object.assign(
    { titleMinLength: 20, titleMaxLength: 70, keywordMin: 30, keywordMax: 49, keywordType: "mixed" },
    lengthSettings || {}
  );
  // NOTE: this used to look up IP_SAFE_META[ipSafe.level]?.clause, but ipSafe has no "level"
  // field (it's four independent booleans — noText/noBrands/noLogosTags/noOtherIP) and
  // IP_SAFE_META's entries only ever had label/description, never a .clause property. That
  // lookup was always undefined, so ipClause was always "" and IP Safe Mode never actually
  // reached the model here — titles/keywords could include real brands, logos, and other IP
  // even with every toggle checked. buildIpSafeClause() is the function that actually builds the
  // real instruction (and is already used correctly by the main prompt-generation feature).
  // Also pulling in the lead-in and closer now, for the same reason the main prompt style uses
  // all three: a single mid-instruction clause wasn't enough to reliably stop salient logos/text
  // from slipping through, so this gets the same start-and-end reinforcement.
  const ipLeadIn = buildIpSafeLeadIn(ipSafe);
  const ipClause = buildIpSafeClause(ipSafe);
  const ipCloser = buildIpSafeCloser(ipSafe);
  return [
    ipLeadIn,
    "You are an expert Adobe Stock metadata writer. Look at this image and produce metadata for submitting it to Adobe Stock.",
    "Respond with ONLY a single valid JSON object — no markdown code fences, no commentary before or after. Exact shape:",
    '{"title": "string", "keywords": ["string", "string", ...]}',
    "",
    `Title: a natural-language title between ${titleMinLength} and ${titleMaxLength} characters that reads like a sentence ` +
      "a person would say out loud. Titles are not searchable on Adobe Stock, so don't try to cram keywords into it — " +
      "just describe the shot naturally.",
    `Keywords: ${keywordMin}–${keywordMax} single words or short phrases, ordered from most to least relevant (the first 10 carry the most ` +
      "search weight). Cover the main subject, setting/background, colors, mood, style, and concepts a buyer might " +
      "search for. No duplicates. Lowercase unless a proper noun.",
    keywordTypeClause(keywordType),
    ipClause,
    ipCloser,
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Vision models sometimes wrap requested JSON in markdown fences or add a stray sentence despite
 * being told not to — this pulls the first well-formed {...} object out rather than failing on
 * the first stray character. Also normalizes the result (clamps title length, case-insensitively
 * dedupes keywords, caps at 49) so callers can trust the shape without their own validation.
 */
function parseAdobeStockJson(raw, lengthSettings) {
  const { titleMaxLength, keywordMax } = Object.assign(
    { titleMinLength: 20, titleMaxLength: 70, keywordMin: 30, keywordMax: 49, keywordType: "mixed" },
    lengthSettings || {}
  );
  if (!raw) throw new Error("Empty response — nothing to parse.");
  const stripped = raw
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();

  let parsed;
  try {
    parsed = JSON.parse(stripped);
  } catch (_) {
    const match = stripped.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("Could not find a JSON object in the model's response.");
    parsed = JSON.parse(match[0]);
  }

  const title = String(parsed.title || "").trim().slice(0, titleMaxLength);
  const seen = new Set();
  const keywords = [];
  (Array.isArray(parsed.keywords) ? parsed.keywords : [])
    .map((k) => String(k).trim())
    .filter(Boolean)
    .forEach((k) => {
      const key = k.toLowerCase();
      if (seen.has(key) || keywords.length >= keywordMax) return;
      seen.add(key);
      keywords.push(k);
    });

  // Adobe's own platform minimum (5 keywords) is the hard validation floor here, regardless of
  // the configured target — that target steers generation, but shouldn't hard-fail a file that
  // came back with, say, 25 good keywords against a 30 target. Below Adobe's actual minimum,
  // though, the file genuinely can't be submitted, so that's still a real failure.
  if (!title || keywords.length < 5) {
    throw new Error("The model's response was missing a title or enough keywords — try again.");
  }
  return { title, keywords };
}

var DEFAULT_SETTINGS = {
  activeProvider: "groq",
  outputStyle: "art_prompt",
  adobeStock: {
    // Master switch — the Adobe Stock content script does nothing at all while this is off.
    enabled: false,
    // Whether it also runs unattended on newly-detected uploaded files, vs. only via the
    // manual "Run now" button. Independent of `enabled` so it can be built and tested
    // with the manual button first.
    autoTrigger: false,
    // The AI-content disclosure toggle is a compliance field, not a stylistic one — a vision
    // model looking at an already-generated image can't reliably tell whether *that image*
    // was AI-generated, so this is never guessed per-image. It's a fixed answer set once,
    // applied identically to every file. "off" leaves the toggle untouched.
    aiDisclosure: "off", // "off" | "yes" | "no"
    // Title/keyword length targets, adjustable via sliders in Settings and the in-page panel.
    // Adobe's own hard limits are ~200 chars for title and 5–49 for keywords — these defaults
    // are narrower, matching Adobe's own stated best-practice guidance ("titles under 70
    // characters"), but the slider itself goes all the way to Adobe's real 200-char field limit.
    titleMinLength: 20,
    titleMaxLength: 70,
    keywordMin: 30,
    keywordMax: 49,
    // "mixed" (default) leaves the model unconstrained on word count; "single" forces one-word
    // keywords only; "long_tail" pushes toward specific multi-word phrases instead.
    keywordType: "mixed",
  },
  hoverButton: {
    enabled: true,
  },
  ipSafe: {
    enabled: true,
    noText: true,
    noBrands: true,
    noLogosTags: true,
    noOtherIP: true,
  },
  iconMode: {
    enabled: false,
    gridMode: "auto",
    customRows: 3,
    customCols: 3,
  },
  providers: {
    groq: { apiKey: "", model: PROVIDER_META.groq.defaultModel },
    gemini: { apiKey: "", model: PROVIDER_META.gemini.defaultModel },
    mistral: { apiKey: "", model: PROVIDER_META.mistral.defaultModel },
  },
  history: [],
};

var MAX_HISTORY = 60;

/**
 * Builds the "keep this commercially safe" clause appended to every prompt style when the user has
 * IP-safe mode on. Only the sub-rules that are actually enabled are included, so a user can turn off
 * (say) the text rule alone and keep the rest.
 */
function buildIpSafeClause(ipSafe) {
  if (!ipSafe || !ipSafe.enabled) return "";

  const rules = [];
  if (ipSafe.noText) {
    rules.push(
      "Do not mention, transcribe, or describe any legible text, letters, numbers, watermarks, signatures, or " +
      "captions visible in the image — leave them out entirely rather than quoting or paraphrasing what they say."
    );
  }
  if (ipSafe.noBrands) {
    rules.push(
      "Do not name any real brand, product, or company (for example write 'a sports car' instead of 'a " +
      "Ferrari', 'a smartphone' instead of 'an iPhone', 'a cola can' instead of 'a Coca-Cola can') — describe " +
      "the item generically by its shape, color, and material instead."
    );
  }
  if (ipSafe.noLogosTags) {
    rules.push(
      "Do not mention any logos, emblems, brand marks, clothing tags, or product labels visible in the image, " +
      "even generically (no 'branded label' or 'logo patch') — simply omit them from the description."
    );
  }
  if (ipSafe.noOtherIP) {
    rules.push(
      "Do not name or reference copyrighted characters, franchises, movies/games, celebrities or other " +
      "identifiable public figures, or sports teams/leagues — describe people and characters only by generic " +
      "physical traits, and describe any distinctive design only by its generic visual style."
    );
  }
  if (!rules.length) return "";

  return (
    " IMPORTANT — this output is for a stock-photo marketplace submission (Adobe Stock, Shutterstock, and " +
    "similar), and such marketplaces reject submissions whose title/keywords/prompt reference third-party " +
    "intellectual property. Keep it commercially safe: " + rules.join(" ") + " If the main subject of " +
    "the image IS itself recognizable IP, describe it only in generic terms rather than naming it, so the " +
    "output never names or reproduces anything trademarked or copyrighted."
  );
}

/**
 * Builds the icon-detection clause appended when Icon mode is on. Conditional by design — it tells
 * the model to only apply icon-style phrasing (and the solid white background) if the image actually
 * looks like an icon or icon set, so turning this on doesn't distort prompts for ordinary photos.
 */
function buildIconModeClause(iconMode) {
  if (!iconMode || !iconMode.enabled) return "";

  const grid = resolveIconGrid(iconMode);
  const bundleRule = grid
    ? `The user wants exactly ${grid.rows * grid.cols} icons arranged in a ${grid.rows}x${grid.cols} grid ` +
      `(${grid.rows} rows by ${grid.cols} columns) — no more, no fewer. This applies whether the source image ` +
      `shows a single icon or an existing bundle: describe generating a themed set of exactly ` +
      `${grid.rows * grid.cols} icons that share the source's visual style, listing exactly that many distinct ` +
      `icon subjects fitting the theme, evenly laid out in the ${grid.rows}x${grid.cols} grid.`
    : "If the image shows a bundle of several icons, describe it as a set/grid of icons that share one " +
      "consistent style, listing each icon's subject actually visible in the set.";

  return (
    " ICON CHECK: First judge whether the image is a UI/app icon, pictogram, glyph, or a bundle/set of " +
    "multiple such icons — flat, simple, symbolic graphics — as opposed to a photo, painting, or complex " +
    "scene. If it IS an icon or icon set: write the prompt as an icon-design prompt instead of a scene " +
    "description. Name the icon's subject and its visual style (flat design, line/outline icon, glyph, " +
    "filled, gradient, 3D/isometric icon, etc. — matching what's actually shown), state that it is " +
    "centered and isolated with no scene, shadow, or background elements around it, and explicitly " +
    "include the phrase 'solid white background' as one of the descriptors. " + bundleRule + " If the " +
    "image is NOT an icon or icon set (e.g. a photo, illustration, or full scene), ignore this instruction " +
    "entirely and describe it normally."
  );
}

/**
 * A short, blunt version of the IP-safe rule, meant to go at the very START of the instruction —
 * before the model has read anything else. buildIpSafeClause's full version (with all its
 * specific examples) still gets appended at the end as before; this exists because that alone
 * wasn't enough. The art_prompt style in particular tells the model, emphatically and early on,
 * that it MUST use "specific, concrete descriptors" for maximum detail — and a same-length caveat
 * arriving 8 bullet points later is easy for a model to underweight against that. Stating the
 * override up front, before the conflicting instruction ever appears, fixes the images where the
 * model still named the exact brand/logo/text despite the tail-end rule technically being there.
 */
function buildIpSafeLeadIn(ipSafe) {
  if (!ipSafe || !ipSafe.enabled) return "";
  const bits = [];
  if (ipSafe.noText) bits.push("legible text, numbers, or watermarks");
  if (ipSafe.noBrands) bits.push("real brand, product, or company names");
  if (ipSafe.noLogosTags) bits.push("logos, emblems, or clothing/product labels");
  if (ipSafe.noOtherIP) bits.push("copyrighted characters, franchises, or celebrities");
  if (!bits.length) return "";
  return (
    "CRITICAL RULE — apply this to everything below, INCLUDING any later instruction to be maximally " +
    "specific or detailed: before writing anything, silently scan the whole image for " + bits.join(", ") +
    ". Treat every region containing one of these as if it were blank or not present at all — never name it, " +
    "transcribe it, or describe it even in passing or generically (not 'a logo', not 'some text', not 'a " +
    "familiar character'). If you're even slightly unsure whether something is one of these (a shape that " +
    "might be a brand mark, a pattern that might be text, a design that might be a known character), treat it " +
    "as if it definitely is and leave it out — never guess in the direction of including it. Being generic or " +
    "silent on this one point always takes priority over being specific or complete. "
  );
}

/**
 * A short, final restatement of the IP-safe rule, meant to be the literal LAST thing the model
 * reads before it starts generating. Models tend to weight both the start and the end of a long
 * instruction more heavily than the middle — buildIpSafeLeadIn already covers the start, and
 * buildIpSafeClause covers the body with full examples; this is the deliberately brief bookend,
 * not redundancy for its own sake. Added because the lead-in + body-clause combination alone
 * still wasn't catching every case, particularly for salient logos/text.
 */
function buildIpSafeCloser(ipSafe) {
  if (!ipSafe || !ipSafe.enabled) return "";
  return (
    " FINAL CHECK before you answer: re-read what you were about to write and confirm it contains no real " +
    "brand or product names, no logos or clothing/product labels, no legible text or watermarks, and no " +
    "copyrighted characters or celebrities — if any slipped in, rewrite that part generically before responding."
  );
}

/**
 * A different problem from buildIpSafeClause/LeadIn/Closer above, which only govern what words
 * PromptLens's own text contains. Image generators (Midjourney, Stable Diffusion, etc.) that a
 * generated art_prompt gets pasted into routinely paint brand-typical logos onto generic objects
 * — a plain "laptop" or "smartphone" often renders with a recognizable logo anyway, because
 * that's statistically what those objects look like in the generator's own training data, with
 * no brand word in the prompt required to trigger it. A bare "no logo" instruction is also known
 * to be unreliable for diffusion-style generators (negation in the main prompt is weak — it's
 * why Midjourney has a *separate* --no parameter); explicitly describing the surface as
 * blank/unmarked in POSITIVE terms, as part of the object's own descriptor phrase, is what
 * actually steers generation. Scoped to art_prompt only, since that's the one style whose output
 * is meant to feed back into an image generator — stock_keywords/plain_description describe an
 * existing photo, they don't generate a new one.
 */
function buildIpSafeVisualHallucinationClause(ipSafe) {
  if (!ipSafe || !ipSafe.enabled) return "";
  if (!ipSafe.noBrands && !ipSafe.noLogosTags) return "";
  return (
    " Image generators often paint brand-typical logos onto generic electronics, vehicles, clothing, and " +
    "packaging even when the prompt never named a brand. Counter this by actively describing any " +
    "branded-looking object in the scene (laptops, phones, cars, shoes, appliances, packaging, screens, etc.) " +
    "as unbranded IN POSITIVE TERMS, woven into its own descriptor phrase — for example 'a laptop with a " +
    "plain unmarked lid and a screen showing only abstract icons, no visible logo', 'a smartphone with a " +
    "blank matte back panel, no brand marking', not just omitting the brand name and leaving it at that."
  );
}

function buildPromptInstruction(outputStyle, ipSafe, iconMode) {
  const NO_REASONING_CLAUSE =
    " Respond with the final answer text only. Do not include any <think> tags, chain-of-thought, planning " +
    "notes, or explanation of your process anywhere in the reply — just the requested output itself, starting " +
    "immediately with the first word of it.";

  const ipSafeLeadIn = buildIpSafeLeadIn(ipSafe);
  const ipSafeClause = buildIpSafeClause(ipSafe);
  const ipSafeCloser = buildIpSafeCloser(ipSafe);
  const iconModeClause = buildIconModeClause(iconMode);
  const modeClauses = ipSafeClause + iconModeClause;

  if (outputStyle === "stock_keywords") {
    return (
      ipSafeLeadIn +
      "You are an expert stock-photography metadata specialist. Look closely at every part of the image — " +
      "foreground, background, edges, and small details — and produce a single line of comma-separated " +
      "keywords describing it, ordered from most to least important/searchable (main subject first, then " +
      "secondary subjects, setting, actions, style/medium, colors, lighting, mood, and abstract concepts a " +
      "buyer might search for). You must output between 35 and 50 keywords — not fewer. Do not stop early. " +
      "Output ONLY the comma-separated keyword list — no numbering, no headers, no explanation, no quotation " +
      "marks." + modeClauses + NO_REASONING_CLAUSE + ipSafeCloser
    );
  }
  if (outputStyle === "plain_description") {
    return (
      ipSafeLeadIn +
      "Look closely at every part of the image — foreground, background, edges, and small details — and write " +
      "a thorough, detailed natural-language description of it in 5-8 full sentences. Cover: the main subject " +
      "and what it's doing, the setting/background, composition and framing, colors and lighting, textures or " +
      "materials, and the overall style or mood. Do not summarize briefly — describe as if the reader cannot " +
      "see the image at all and needs every visual detail conveyed in words. Output ONLY the description — no " +
      "preamble, no headers, no quotation marks, no meta-commentary like 'the image shows'." + modeClauses +
      NO_REASONING_CLAUSE + ipSafeCloser
    );
  }
  // default: art_prompt
  const ipSafeVisualClause = buildIpSafeVisualHallucinationClause(ipSafe);
  return (
    ipSafeLeadIn +
    "You are an expert AI prompt engineer who reverse-engineers images into prompts for AI image generators. " +
    "Study every part of the image closely — foreground, background, edges, small details — and write ONE " +
    "long, richly detailed, comma-separated prompt that could recreate it in Midjourney, Stable Diffusion, or " +
    "a similar tool. You MUST weave in all of the following, each as its own comma-separated phrase: " +
    "(1) the main subject with specific, concrete descriptors (not just 'a woman' but her pose, expression, " +
    "clothing, age impression, etc. — same specificity for objects/animals/scenes, but see the critical rule " +
    "above about not naming real brands/logos/text/IP even here), " +
    "(2) composition and framing (camera angle, shot distance, focal point), " +
    "(3) the setting/background in specific detail, " +
    "(4) lighting (direction, quality, time of day, light sources), " +
    "(5) full color palette, " +
    "(6) the artistic medium or style (photograph, oil painting, 3D render, anime, etc.) and, if it reads as a " +
    "photo, plausible camera/lens/film characteristics, " +
    "(7) fine textures and materials visible in the image, " +
    "(8) overall mood or atmosphere. " +
    "This must be a genuinely detailed prompt of at least 80 words and as long as 150 words if the image " +
    "warrants it — a short one- or two-sentence summary is a failure. Rules: output ONLY the prompt itself as " +
    "flowing comma-separated phrases (not full sentences), with no preamble, no headers, no quotation marks, " +
    "no explanation, no meta-commentary." + modeClauses + ipSafeVisualClause + NO_REASONING_CLAUSE + ipSafeCloser
  );
}

if (typeof module !== "undefined") {
  module.exports = {
    PROVIDER_META,
    OUTPUT_STYLES,
    IP_SAFE_ORDER,
    IP_SAFE_META,
    HOVER_BUTTON_META,
    ICON_MODE_META,
    ICON_GRID_PRESETS,
    resolveIconGrid,
    KEYWORD_TYPE_ORDER,
    KEYWORD_TYPE_META,
    buildAdobeStockInstruction,
    parseAdobeStockJson,
    DEFAULT_SETTINGS,
    MAX_HISTORY,
    buildPromptInstruction,
  };
}