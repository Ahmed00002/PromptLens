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

var DEFAULT_SETTINGS = {
  activeProvider: "groq",
  outputStyle: "art_prompt",
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
    " IMPORTANT — this prompt will be used to generate a brand-new image for submission to stock-photo " +
    "marketplaces (Adobe Stock, Shutterstock, and similar), which reject submissions containing third-party " +
    "intellectual property. Keep the prompt commercially safe: " + rules.join(" ") + " If the main subject of " +
    "the image IS itself recognizable IP, describe a generic, original-looking stand-in instead of naming it, " +
    "so the resulting prompt never reproduces anything trademarked or copyrighted."
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

function buildPromptInstruction(outputStyle, ipSafe, iconMode) {
  const NO_REASONING_CLAUSE =
    " Respond with the final answer text only. Do not include any <think> tags, chain-of-thought, planning " +
    "notes, or explanation of your process anywhere in the reply — just the requested output itself, starting " +
    "immediately with the first word of it.";

  const ipSafeClause = buildIpSafeClause(ipSafe);
  const iconModeClause = buildIconModeClause(iconMode);
  const modeClauses = ipSafeClause + iconModeClause;

  if (outputStyle === "stock_keywords") {
    return (
      "You are an expert stock-photography metadata specialist. Look closely at every part of the image — " +
      "foreground, background, edges, and small details — and produce a single line of comma-separated " +
      "keywords describing it, ordered from most to least important/searchable (main subject first, then " +
      "secondary subjects, setting, actions, style/medium, colors, lighting, mood, and abstract concepts a " +
      "buyer might search for). You must output between 35 and 50 keywords — not fewer. Do not stop early. " +
      "Output ONLY the comma-separated keyword list — no numbering, no headers, no explanation, no quotation " +
      "marks." + modeClauses + NO_REASONING_CLAUSE
    );
  }
  if (outputStyle === "plain_description") {
    return (
      "Look closely at every part of the image — foreground, background, edges, and small details — and write " +
      "a thorough, detailed natural-language description of it in 5-8 full sentences. Cover: the main subject " +
      "and what it's doing, the setting/background, composition and framing, colors and lighting, textures or " +
      "materials, and the overall style or mood. Do not summarize briefly — describe as if the reader cannot " +
      "see the image at all and needs every visual detail conveyed in words. Output ONLY the description — no " +
      "preamble, no headers, no quotation marks, no meta-commentary like 'the image shows'." + modeClauses +
      NO_REASONING_CLAUSE
    );
  }
  // default: art_prompt
  return (
    "You are an expert AI prompt engineer who reverse-engineers images into prompts for AI image generators. " +
    "Study every part of the image closely — foreground, background, edges, small details — and write ONE " +
    "long, richly detailed, comma-separated prompt that could recreate it in Midjourney, Stable Diffusion, or " +
    "a similar tool. You MUST weave in all of the following, each as its own comma-separated phrase: " +
    "(1) the main subject with specific, concrete descriptors (not just 'a woman' but her pose, expression, " +
    "clothing, age impression, etc. — same specificity for objects/animals/scenes), " +
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
    "no explanation, no meta-commentary." + modeClauses + NO_REASONING_CLAUSE
  );
}

if (typeof module !== "undefined") {
  module.exports = {
    PROVIDER_META,
    OUTPUT_STYLES,
    IP_SAFE_ORDER,
    IP_SAFE_META,
    ICON_MODE_META,
    ICON_GRID_PRESETS,
    resolveIconGrid,
    DEFAULT_SETTINGS,
    MAX_HISTORY,
    buildPromptInstruction,
  };
}
