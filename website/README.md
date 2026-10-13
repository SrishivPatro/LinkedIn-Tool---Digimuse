# Digimuse website

Static, dependency-free site (HTML + CSS + vanilla JS). Open `index.html` in a browser, or deploy the `website/` folder to Netlify, Vercel, GitHub Pages or any static host.

Before going live, replace the placeholder content marked `<!-- REPLACE -->` in `index.html`: stats, case studies, testimonials and contact details. The contact form is front-end only, so connect it to Formspree, Netlify Forms or your CRM.

## Deploy to Vercel

1. Go to https://vercel.com/new and import `srishivpatro/linkedin-tool---digimuse`.
2. Set **Root Directory** to `website` and **Framework Preset** to *Other*. Leave the build command empty.
3. Click **Deploy**. Later pushes to the production branch redeploy automatically.

Or from a terminal: `cd website && npx vercel --prod`.
