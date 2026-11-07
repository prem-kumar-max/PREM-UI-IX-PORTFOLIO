# Prem Kumar Thanneru — Portfolio

## Run locally

Copy `.env.example` to `.env` and set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from the Supabase project. Then run:

```sh
npm ci
npm run dev
```

The public site reads published case studies and portfolio settings directly from Supabase. If Supabase is unavailable, the bundled seed content is shown. `/admin` requires the existing administrator account; sign in with its email and password. Supabase owns authentication and persists the session.

## Manage the portfolio

At `/admin`, use **Case studies** to add a case study, enter its required title and unique lowercase-hyphen URL slug, fill in project details and story sections, and save it as a draft or publish it. The editor supports thumbnails, story images with alt text, Figma prototype validation/preview, and the featured flag. Published changes appear on the website directly from Supabase without a Vercel redeploy.

Use **Site content** to update portfolio copy and contact links. **Settings** controls the homepage featured-project limit. The migration action imports legacy `prem-portfolio-v1` browser data and verifies it before offering a separate action to clear the old backup.

The resume is a regular file at `public/Prem-Kumar-Resume.pdf`. Replace that PDF with the new file using the same name, then push the change to GitHub so Vercel can deploy it.

## Vercel

Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as project environment variables for every deployment environment. The anon key is intended for browser use; never add a service-role or secret key to the frontend. Vercel builds with `npm run build` and serves the SPA rewrite in `vercel.json`.
