# Prem Kumar Thanneru — Portfolio

This is a React + Vite portfolio. The published website is generated only from the checked-in files in `src/data/` and assets in `public/`. There is no backend, database, or external CMS service.

## Run locally

1. Install Node.js 20 or newer.
2. Install dependencies and start Vite:

   ```sh
   npm install
   npm run dev
   ```

3. Open the Vite URL and visit `/admin`.

The admin CMS stores a working copy and uploaded file Blobs in this browser's IndexedDB. That copy is local to the current browser and device; it does not change the live website.

## Admin and publishing

The passcode is a convenience gate only. It is not server-side authentication and does not protect a deployed website's source files. Configure it locally before using `/admin`:

```sh
npm run set-passcode
```

The command prompts without echoing the passcode and writes only a SHA-256 hash to `src/data/adminPasscode.js`. Do not commit the passcode itself.

To publish a CMS change:

1. Make your edits in `/admin`.
2. Select **Export for GitHub** and download the ZIP.
3. Copy the ZIP's files into the matching locations in the project.
4. Run `git add`, `git commit` and `git push`. Vercel will redeploy from the updated source.

Until that push and redeploy, the live site remains unchanged. **Reset to published data** discards the browser's working copy and returns to the checked-in data. **Migrate browser data** imports the old `prem-portfolio-v1` localStorage record and `prem-portfolio-files` resume Blobs without deleting them. After a successful export, the separate **Clear old data** action can remove that old browser backup.

## Editing by hand

- Case studies: `src/data/caseStudies.js`
- Site content: `src/data/siteContent.js`
- Featured project limit and active resume: `src/data/settings.js`
- Thumbnails: `public/thumbnails/`
- Case-study images: `public/case-images/`
- Resumes: `public/resumes/`

Only case studies with `status: "Published"` appear on public pages. The homepage selects featured published projects up to `featuredLimit`; published slugs power `/work/<slug>`. Keep Figma prototype URLs in `figmaEmbedUrl` and use the CMS preview to check them before exporting.

The current `/Prem-Kumar-Resume.pdf` remains the default resume. To replace it by hand, replace that file while keeping the same name, or update `activeResumePath` in `src/data/settings.js` to a PDF under `public/resumes/`. In the CMS, you can upload multiple PDFs, choose the active version, and export them with the data files.

Images added in the CMS are resized to a maximum width of 1600 pixels and stored as WebP Blobs in IndexedDB. PDFs must be 10 MB or smaller. Uploaded files are only added to the deployed site when their ZIP export is copied into the project and pushed.

## Build and preview

```sh
npm run build
npm run preview
```

Vercel builds the static site with `npm run build` and serves the SPA fallback configured in `vercel.json`.
