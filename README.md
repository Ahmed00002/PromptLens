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

This is enforced entirely through the instruction sent to the vision model — reinforced three
times (an upfront rule telling it to silently scan for and treat forbidden content as absent
before writing anything, a detailed mid-instruction clause with concrete examples, and a short
final re-check reminder right before it answers) rather than once, since a single mid-instruction
mention wasn't reliably catching salient logos/text. This applies to Adobe Stock metadata
generation too, not just the three prompt styles. That said, this is model compliance, not a hard
filter — no prompting can *guarantee* a vision model never slips on a very prominent logo or
piece of text; if you spot one getting through, that's worth flagging so the instruction can be
tightened further for that case.

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

## Hover quick-action button

A small floating button appears over any image (~56×56px or larger) as soon as you hover it —
similar to Pinterest's save button — so you can generate a prompt with a single click instead of
opening the right-click menu each time. Handy for rapid-fire use across a page full of images.

- Hover an image → the button fades in over its top-right corner. Click it to generate a prompt
  using whichever provider/style/IP-safe/Icon-mode settings you already have set — it's the exact
  same generation as the right-click menu item, just one click away.
- Moving the pointer from the image onto the button itself keeps it visible; moving away from both
  hides it after a brief moment.
- Automatically hidden while select/batch mode is active, so the two never overlap.
- Toggle it off from the toolbar popup or Settings → **Hover quick-action button** if you'd rather
  keep hovering images free of any overlay (e.g. on image-dense sites). The setting takes effect
  immediately on already-open tabs, no page refresh needed.

## Adobe Stock auto-fill

Settings → **Adobe Stock auto-fill** generates a title + keywords for each uploaded file on the
[contributor portal](https://contributor.stock.adobe.com) and fills them in automatically.

**A single draggable control panel** appears on the page while the feature is enabled (top-right
by default) — grab its header to move it anywhere on screen, click **—** to collapse it down to
just the header bar. It shows live status, a progress bar, a **Start**/**Cancel** button, and
title-length / keyword-count range sliders you can adjust right there without opening Settings
(both stay in sync with the full Settings page, which has the same sliders as a backup). A
"More settings →" link opens the full options page for everything else (provider, auto-trigger,
the release-question placeholder, etc.).

**Three ways to trigger a run — all funnel through the same logic, so the panel's status always
reflects what's actually happening no matter which one you used:**
- **Start button** in the panel — processes every not-yet-handled uploaded file.
- **The popup's "Run now"** button, while on the contributor portal.
- **Fully automatic** — the "Auto-trigger on new uploads" setting (Settings page) runs it the
  moment new files appear, no click needed.

A run in progress can be cancelled from the panel (Start becomes Cancel) — it finishes the file
currently in flight and stops before the next one.

**What it does, per file:**
1. Clicks the file's thumbnail to select it, and actually waits for the side panel to catch up
   (polls the panel's own thumbnail until it matches, rather than a fixed delay).
2. If the title field already has text, **asks via an on-page modal** — Skip this file, or
   Overwrite it — rather than silently skipping. A "do this for every already-filled file in this
   session" checkbox means you're only asked once per run, not once per file.
3. Sends the thumbnail to your configured AI provider for one combined title+keywords call,
   validated and normalized before anything touches the page. **Title length and keyword count
   are both real min–max ranges**, adjustable via the panel's sliders or Settings (title: 10–200
   characters, matching Adobe's own field limit; keywords: a range within Adobe's 5–49
   requirement) — these steer what the AI aims for; Adobe's actual 5-keyword platform minimum is
   still enforced as a hard floor regardless of your slider setting. A **Keyword type** dropdown
   (also in both the panel and Settings) steers the *shape* of those keywords: **Mixed** (a
   natural blend of single words and short phrases, ordered by relevance — the default),
   **Single words** (one word per keyword, no phrases), or **Long-tail phrases** (specific
   multi-word descriptions like "woman drinking coffee at sunrise" that target more specific
   buyer searches).
4. Fills the title and keyword-paste fields using a React-safe value setter (a plain
   `element.value = x` gets silently ignored by React-controlled inputs — this goes through the
   native property setter and dispatches real `input`/`change` events instead).
5. A generation failure on one file skips just that file (and stays eligible for a later retry —
   it's not permanently marked done); a rate-limit/quota failure automatically retries the same
   image on the next configured provider first. This fallback logic also backs regular
   single-image and batch-mode generation, not just Adobe Stock.

**The auto-trigger loop bug is fixed at the root, not patched over.** The original version
re-ran on *every* DOM mutation — including mutations caused by its own actions (selecting a
card, filling a field both change the page), which created a feedback loop that kept reselecting
cards indefinitely. It's now gated on the number of file cards actually growing, and every card
that's been handled (filled, explicitly skipped via the modal, or found already-filled) is
remembered for the rest of the page session so it's never reselected once it's done — this also
means the mutation observer settles to doing nothing once there's genuinely nothing new to
process, rather than continuing to poll forever.

**What it deliberately does NOT touch:** the on-page "Yes/No" toggle. It was initially assumed to
be the AI-content disclosure question; inspecting the real markup showed it's actually
`name="hasReleases"` — a model/property-**release** question, a different field entirely.
Auto-answering that incorrectly would be a real, incorrect legal declaration, not just a
cosmetic mistake, so it's left completely untouched — you'll still answer it yourself on every
file. The Settings panel has a placeholder for this, currently disabled, pending the real
AI-disclosure control being found and confirmed (Adobe's actual AI-content labeling requirement
lives somewhere else on the page/flow).

All of the selectors this relies on (`.upload-tile`, `data-t="asset-title-content-tagger"`,
`#content-keywords-ui-textarea`, etc.) were confirmed against a real diagnostics capture of the
live page, not guessed — see `adobe-stock.js` for the full breakdown. Like any integration with
a page PromptLens doesn't control, these can break if Adobe changes their frontend; the popup's
**Copy page diagnostics** button is there to make re-confirming them quick if that happens.

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
- The hover quick-action button uses a similar size heuristic (~56×56px) so it doesn't clutter tiny
  thumbnails or icons — small images won't show the button and still need the right-click menu.
- Adobe Stock auto-fill relies on selectors confirmed against the live page at the time this was
  built — if Adobe changes their contributor portal's frontend, it may need re-confirming (use
  the popup's **Copy page diagnostics** button). It also does not touch the model/property-release
  toggle on the page — that's answered manually on every file, by design.

## File overview

| File | Purpose |
|---|---|
| `manifest.json` | Extension configuration (MV3) |
| `background.js` | Service worker — context menu, image fetch, API orchestration, provider fallback |
| `providers.js` | The actual Groq / Gemini / Mistral API request logic |
| `content.js` | Injected into pages — renders the floating result card, the hover quick-action button, and batch/select-mode UI |
| `adobe-stock.js` | Injected only on the Adobe Stock contributor portal — diagnostics collector + the (currently gated) auto-fill automation |
| `constants.js` | Shared defaults, provider metadata, prompt templates, platform-formatting logic |
| `options.html/css/js` | Settings page |
| `popup.html/css/js` | Toolbar popup — quick provider switch + last result + Adobe Stock controls |
| `icons/` | Extension icon (aperture mark) |
