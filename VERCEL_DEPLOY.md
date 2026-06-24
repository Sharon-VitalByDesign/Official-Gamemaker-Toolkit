# Vercel Deployment

This bundle is ready to place in a GitHub repo and deploy with Vercel.

## What is included

- The app source code
- The Vercel serverless function in `api/`
- `vercel.json`
- Project dependencies in `package.json` and `pnpm-lock.yaml`
- `.env.example` so you know which environment variable to add

## What is intentionally not included

- `node_modules/`
- `dist/`
- `.env.local`
- Local preview helpers that are only useful on this machine

## GitHub + Vercel steps

1. Unzip this bundle.
2. Create a new GitHub repository.
3. Upload the unzipped project files to that repository.
4. In Vercel, import the GitHub repository as a new project.
5. Add the environment variable `ANTHROPIC_API_KEY` in the Vercel project settings.
6. Deploy.

## Important note

If you deploy without `ANTHROPIC_API_KEY`, the app will still load, but AI-powered responses will fall back to local templates instead of live model output.
