# PromptLens — Image to AI Prompt (Chrome Extension)

Right-click any image on the web and generate a detailed AI prompt from it — powered by your choice of
**Groq**, **Gemini**, or **Mistral** vision models.

## Install (unpacked, for testing / personal use)

1. Open `chrome://extensions` in Chrome (or any Chromium browser — Edge, Brave, etc.).
2. Turn on **Developer mode** (top-right toggle).
3. Click **Load unpacked** and select this folder (`prompt-lens/`).
4. The PromptLens icon (amber aperture) appears in your toolbar.

## Set up your API key(s)

1. Click the PromptLens toolbar icon → **Open settings** (or right-click the icon → **Options**).
2. Under **Providers**, paste an API key for at least one provider:
   - **Groq** — key from https://console.groq.com/keys
   - **Gemini** — key from https://aistudio.google.com/app/apikey
   - **Mistral** — key from https://console.mistral.ai/api-keys
3. Click the radio button next to the provider you want active.
4. Optionally hit **Test connection** to confirm the key works before you rely on it.
5. Everything saves automatically — no save button needed.

## Using it

1. Go to any web page with images.
2. Right-click an image → **✨ Generate AI Prompt (PromptLens)**.
3. A small card appears in the bottom-right corner of the page showing progress, then the
   generated prompt, with **Copy prompt** and **Regenerate** buttons.

## Prompt styles

In Settings → **Prompt style**, choose what PromptLens should write:

- **AI art prompt** — a Midjourney/Stable-Diffusion-style descriptive prompt (default).
- **Stock photo keywords** — a ranked, comma-separated keyword list.
- **Plain description** — a short natural-language caption.

## IP-safe mode

Built for contributors submitting AI-generated images to microstock marketplaces (Adobe Stock,
Shutterstock, etc.), which reject submissions containing legible text, brand names, logos, or other
recognizable intellectual property.

Toggle **IP-safe mode** from the toolbar popup (or the full panel in Settings) and PromptLens will
instruct the vision model to leave the following out of every generated prompt:

- **Text & watermarks** — no legible text, numbers, watermarks, or signatures.
- **Brand names** — real brands/products are swapped for generic descriptors (e.g. "a sports car"
  instead of "a Ferrari").
- **Logos & tags** — no logos, emblems, or clothing/product labels.
- **Other IP** — no copyrighted characters, franchises, celebrities, or team marks.

Each of the four is an independent toggle — tap **Customize** in the popup, or open the full grid in
Settings, to turn any of them off individually. The setting applies immediately to the next
generation (and to **Regenerate**), and each history entry shows an **IP-safe** badge when it was
used.

## Icon mode

General-purpose vision models tend to describe icons like photos — inventing backgrounds, lighting,
and materials — which produces unusable prompts for icon work. **Icon mode** fixes this: PromptLens
first asks the model to judge whether the image is a UI/app icon, pictogram, or a bundle/set of
several icons, as opposed to a photo or illustrated scene.

- If it **is** an icon or icon set, the prompt is written in icon-design language instead — subject,
  style (flat, line/outline, glyph, filled, gradient, 3D/isometric, etc.), centered and isolated with
  no scene around it, and an explicit **solid white background**. A bundle is described as a set/grid
  sharing one consistent style, with each icon's subject listed.
- If it's **not** an icon (a photo, painting, or full scene), the rule is ignored and the image is
  described normally — so leaving Icon mode on doesn't distort ordinary prompts.

Toggle it from the popup or Settings; it works alongside IP-safe mode and any prompt style, and
history entries show an **Icon** badge when it was used.

### Bundle size (grid)

When Icon mode is on, you can pin the prompt to an exact bundle size instead of leaving it to
whatever's actually in the source image — handy for marketplace listings that expect a specific
count, like a "9-icon set" or "12-icon pack."

- **Auto** (default) — describes whatever's actually shown; no forced count.
- **Presets** — 2×2, 3×3, 3×4, 4×4.
- **Custom** — type any rows × columns (1–12 each).

Once a size is picked, the prompt is instructed to produce exactly that many icons arranged in that
grid — whether the source image is a single icon or an existing bundle. A single reference icon gets
expanded into a themed set of the requested count; an existing bundle gets resized to match. The
picker shows a live "N icons total" readout, and history entries record the grid used (e.g.
**Icon 3×3**).

## Batch mode (select multiple images)

Generate prompts for several images on a page in one go instead of right-clicking each one
individually — handy for reference-image research, competitor galleries, or stock search results.

**Enter select mode** one of two ways:
- Right-click empty space on the page → **🖼️ Select images to batch-generate (PromptLens)**.
- Click the PromptLens toolbar icon → **Select images on this page**.

Once active, a small panel appears in the bottom-left corner:

1. **Click any image** on the page to select it (it gets an amber outline). Click again to
   deselect. Hovering over a selectable image previews it with a dashed outline.
2. Use **Select all** to grab every qualifying image currently on the page, or **Clear** to
   start over. Tiny icons/spacers (under ~48×48px) and hidden elements are skipped automatically.
3. Click **Generate N prompts**. The panel switches to a live progress list — each image gets its
   own row that updates from queued → generating → done/failed as results come in (processed a
   few at a time, so one slow or failed image doesn't hold up the rest).
4. Once finished, use **Copy** on any individual row, **Copy all** to grab every successful prompt
   at once (separated by `---`), or **Download CSV** to save an `Image URL, Prompt, Status` file.

Every successful result is also added to history (with a **Batch** badge), same as single
right-click generations. A batch is capped at 40 images at a time to stay easy on rate limits —
press **Esc** or the **×** to cancel out of select mode at any point before generating.

## How it works / privacy notes

- API keys are stored only in your browser's local extension storage (`chrome.storage.local`) —
  never uploaded anywhere else.
- When you generate a prompt, the extension downloads the clicked image, base64-encodes it in the
  background service worker, and sends it **directly** to the API of whichever provider you have
  active (Groq / Google / Mistral), using your key. No middleman server is involved.
- The broad host permission (`https://*/*`, `http://*/*`) is required so the extension can fetch
  the image bytes from whatever site you're on — Chrome extensions with host permissions can read
  cross-origin responses that a normal web page couldn't. It's used only to download the exact
  image you right-clicked.
- A history of your last 60 generated prompts (text + source URL, not the image itself) is kept
  locally so you can revisit them from the Settings page; **Clear history** wipes it.

## Known limitations

- Images served as `blob:` URLs generated dynamically by page JavaScript (rare — most sites use
  plain `https://` or `data:` image URLs) may fail to fetch, since blob URLs are origin-locked to
  the page that created them.
- Vision model names/APIs move fast. If a provider retires the default model, open its **Advanced:
  model name** field in Settings and enter the current model name — no code changes needed.
- Very large images may take a few seconds longer, or fail if they exceed a provider's request
  size limit (Gemini's inline-data limit is 20MB total request size, for example).
- Batch/select mode uses a size heuristic (skips anything under ~48×48px) to avoid selecting
  tracking pixels, spacers, and tiny site-chrome icons — this occasionally means a genuinely small
  content image gets skipped too. It's also capped at 40 images per batch.

## File overview

| File | Purpose |
|---|---|
| `manifest.json` | Extension configuration (MV3) |
| `background.js` | Service worker — context menu, image fetch, API orchestration |
| `providers.js` | The actual Groq / Gemini / Mistral API request logic |
| `content.js` | Injected into pages — renders the floating result card |
| `constants.js` | Shared defaults, provider metadata, prompt templates |
| `options.html/css/js` | Settings page |
| `popup.html/css/js` | Toolbar popup — quick provider switch + last result |
| `icons/` | Extension icon (aperture mark) |
