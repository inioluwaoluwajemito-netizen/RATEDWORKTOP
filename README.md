# RATEDWORKTOP

An AI-powered kitchen worktop visualiser built as a static website with Supabase authentication, data storage, and Stripe payment integration.

## Deployment Overview

This project is designed to run as a static site. The frontend is plain HTML/CSS/JavaScript and communicates with a Supabase backend for auth, profiles, and catalog data.

### What needs to be live

- `index.html`, `login.html`, `register.html`, `account.html`, `visualiser.html`, and all other frontend pages
- `css/`, `js/`, `images/`, and `admin/` folders
- Supabase project configured for auth, profiles, brands, colours, categories, and storage
- Stripe checkout and webhook support for paid upgrades

## Live deployment path

1. Host static files on any static web host:
   - Netlify
   - Vercel
   - Cloudflare Pages
   - GitHub Pages
   - Azure Static Web Apps

2. Keep the Supabase config in `js/app.js`, `admin/js/admin.js`, and other frontend entry points pointing to your Supabase project.

3. Deploy `admin/stripe-webhook.js` as a Supabase Edge Function and configure Stripe webhook secrets.

4. Update Stripe links in `account.html` from test mode to live checkout URLs before launch.

## Notes before launch

- The current frontend uses a Supabase project URL and public API key in `js/app.js`.
- Stripe checkout links are currently set to test mode in `account.html`.
- The webhook handler is located at `admin/stripe-webhook.js` and must be deployed separately.
- Static hosting is sufficient for the frontend; there is no Node/Express server required for the public website.
