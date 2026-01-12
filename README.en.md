# RU→EN Layout Typer (CDP)

[Русский](README.md) | **English**

Chrome extension that **emulates real key presses** in the active tab via **Chrome DevTools Protocol (CDP)** and types text as if it was entered on an **English keyboard layout by physical keys** (ЙЦУКЕН→QWERTY).

Useful when you need **actual typing** rather than clipboard paste — for example in web‑KVM (e.g. NanoKVM), terminals/consoles, or inputs where paste is blocked.

## Features

- **RU→EN physical-key remap** (e.g. `й→q`, `ф→a`, `ё→\``).
- **Automatic Alt+Shift toggles** at “ASCII ↔ Cyrillic” boundaries in the original text (as if you switched layouts while typing).
- **Typing via CDP** (`Input.dispatchKeyEvent`) including punctuation and modifiers.

## Install (Load unpacked)

1) Open `chrome://extensions`.
2) Enable **Developer mode**.
3) Click **Load unpacked** and select the project folder.
4) Open the target tab (where you want to type).
5) Click the extension icon → paste text → **“Type (CDP)”**.
6) On first run, Chrome will ask to allow tab debugging (permission `debugger`) — approve it.

## Usage

1) Paste your source text into the popup (multiline is supported).
2) Click **“Type (CDP)”**.
3) The extension will:
   - compute Alt+Shift toggle positions based on the **original** text,
   - remap Cyrillic characters to “English” symbols by physical keys,
   - type through CDP, injecting Alt+Shift at the right positions.

## Notes & limitations

- The extension does **not** “change OS layout” in the traditional sense — it sends a key-event sequence so the target receives the expected characters.
- Requires the **`debugger`** permission (needed for CDP input).
- Different websites/editors may react differently to synthetic input; CDP is generally more consistent than `KeyboardEvent`.

## Project structure

- `popup.html` / `popup.js` — popup UI and send-typing command.
- `mapping.js` — RU→EN mapping and Alt+Shift boundary calculation.
- `background.js` — service worker: CDP attach/detach and `Input.dispatchKeyEvent`.
- `manifest.json` — MV3 manifest.

## Development

Fast loop:

1) Open `chrome://extensions`.
2) Enable Developer mode.
3) After changes click **Reload** on the extension.
4) Open the service worker DevTools (the **service worker** link on the extension card) to see logs/errors.

## Security

The `debugger` permission allows sending CDP commands to the debugged tab. Install and use this extension **only from a trusted source**.

## License

MIT — see `LICENSE`.

