# TilliTalk

A tablet-friendly English sentence-building website for children.

## Run locally

Requires Node.js 20.19+ or 22.12+.

```bash
npm install
npm run dev
```

## Deploy on Render

1. Push these files to a GitHub repository.
2. In Render, create a **Static Site** connected to the repository.
3. Set **Build command** to `npm install && npm run build`.
4. Set **Publish directory** to `dist`.
5. Deploy. Render will provide a public URL.

## Current features

- Two starter lessons with sentence-building questions.
- Tap-to-order word tiles with extra distractor words.
- Spoken words, questions and completed answers (browser speech synthesis).
- Basic parent lesson creation with optional small pictures.

## Important limitations

This is a prototype. Parent access is not authenticated. Custom lessons live only in the current browser's local storage and are not synced to other devices. Videos, cloud storage, AI question generation and durable progress tracking are future work. The starter dog image is fetched from Unsplash and requires internet access. The car lesson uses an emoji placeholder until a picture is added. Do not store sensitive children's information in this prototype.
