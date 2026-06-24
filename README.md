# The Gamemaker’s Toolkit: Arena Builder

The Gamemaker’s Toolkit is a mobile-first arena-design instrument for K–12, college, and adult-learning educators. Its five-step visioning sequence helps a Gamemaker turn a topic into a thinking experience, calibrate four primary controls and eight fine conditions, generate context-specific Design Moves, read live tension signals, and export a coach-ready brief organized around the five North Star questions. It is not a lesson-plan generator.

## Local development

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env.local`.
3. Add `ANTHROPIC_API_KEY` to `.env.local`.
4. Start the app with `npm run dev`.

The app remains usable without an API key because every AI surface has a local fallback. With a key configured, lenses, concepts, Move Bank suggestions, Live Signal synthesis, and the final brief use validated structured responses. The key is read only by the serverless function and is never sent to the browser.

## Deploy to Vercel

Push this folder to a GitHub repository, import that repository in Vercel, and add `ANTHROPIC_API_KEY` under Project Settings → Environment Variables. Vercel will use the included configuration and deploy on every push.

## Update toolkit content

Edit `src/data/toolkit.json` to revise primary-control definitions, Design Move categories, faders, or tension rules. Edit `src/data/lenses.json` for the five fixed lens definitions. ISTE-demo language is centralized in `src/config/copy.js` so a future public-release identity can be swapped without rewriting components.

## Update or add standards

Representative standards live in `src/data/standards/`, with one JSON file per framework. Each record uses:

```json
{ "id": "unique-id", "framework": "Framework", "subject": "Subject", "gradeBand": "3-5", "code": "CODE", "title": "Short title", "description": "One-sentence description" }
```

Add a new framework file using that schema, then import it into `src/components/stage1/ArenaVisioning.jsx` and include it in `allStandards`. College and Adult Learners intentionally see ISTE and NCSS only, plus the option to use no formal framework.

Framework developed by Sharon Matthews, Vital by Design.
