# TilliTalk — Version 2

A tablet-friendly English practice website for children, built with React and Vite.

## Features

- Picture and video media library with multiple questions per item
- Questions alternate between media after 1–2 questions and revisit each item later in the round
- Tap-to-order word buttons with distractors, audio prompts, and gentle feedback
- Parent editor for creating, editing, and deleting questions and media
- Demo content to try the app before uploading anything

## Local development

```bash
npm install
npm run dev
```

## Deploy to Render (Static Site)

- Build command: `npm install && npm run build`
- Publish directory: `dist`
- Branch: `main`

## IMPORTANT: browser-only storage

Uploaded media is stored in the browser's IndexedDB; lesson metadata is stored in localStorage. This data is **not** uploaded to GitHub, Render, or other devices. Clearing site data or using a different browser/device will make your custom lessons unavailable. Large videos may exceed storage quotas. There is no password protection on the parent area. Do not use sensitive personal media in this prototype. The next step is online storage, authentication, and cross-device sync.

Demo photos are external URLs and require internet access. The example images are illustrative; replace them with your own media before relying on questions about particular visual details.
