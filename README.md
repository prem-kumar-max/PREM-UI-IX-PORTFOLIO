# Prem Kumar Thanneru — Portfolio

A React and JSX portfolio with public pages and a browser-local case study CMS.

## Run locally

```sh
npm install
npm run dev
```

Open the Vite URL and visit `/admin` to set a browser passcode and manage case studies and site content. Add a case study with a thumbnail, title, description, and Figma prototype iframe or URL. Preview the embed, then save it as a draft or publish it. Published case studies appear on the Work page at `/work/<slug>`; featured published projects also appear on the home page.

Figma embeds are rendered in a sandboxed iframe. Only HTTPS prototype URLs from `embed.figma.com` are accepted; the CMS extracts and stores the iframe `src` rather than rendering pasted HTML. Public case studies and CMS previews include a native browser full-screen viewer with animated open/close, Escape-to-close, and no iframe reload when entering full screen.

## Storage and privacy

This frontend-only version saves edits and the passcode in the current browser's `localStorage`. Uploaded cover images and resume PDFs are stored in browser storage (`localStorage` and IndexedDB, respectively). Data is not synchronized to another browser or device; clearing browser data removes it. The passcode is only a convenience gate and is **not secure authentication**. Do not use this setup for sensitive data or a publicly deployed private CMS.

Uploaded project images are limited to JPG, PNG, or WebP files up to 2 MB each. Resume uploads accept multiple PDF files, up to 20 MB each; exactly one can be active and linked on the About page. Browser storage is limited, so large or numerous files can prevent saving.

There is no server-side database, file storage, or authentication service in this project. Case studies, resume files, and the passcode remain in the current browser; they are not synchronized to visitors' browsers or other devices. To make an uploaded resume available to all website visitors, add a backend or deploy the resume as a site asset. The CMS passcode is only a convenience gate and does not protect data on a deployed public site.
