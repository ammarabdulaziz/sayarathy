# Sayarathy

An installable, **online-only** car-maintenance app. Service history, maintenance
schedules, mileage, notes, and follow-ups live in a private JSON file in your own
Google Drive. Receipts and photos are separate private Drive files.

**Website:** https://ammarabdulaziz.github.io/sayarathy/

## Features

- Vehicle overview with current-mileage updates and upcoming maintenance.
- Searchable, categorized service history with multi-item visits and review flags.
- Add, edit, and delete service records; notes and linked follow-ups.
- Editable distance/time intervals from your manual or mechanic. Whichever comes
  first determines due status; replacement, repair, cleaning, and inspection are distinct.
- Private PDF/JPG/PNG/WebP receipts and photos, up to 10 MB per file.
- JSON export and validated, confirmed backup restoration.
- Content-checksum conflict detection and consistent-read checks.
- Google reconnection, explicit save/error states, and in-memory retryable drafts.
- Automatic log loading after sign-in and safe foreground refresh when returning
  to the app, regaining connectivity, or once a minute while it is visible.
- Installable PWA on compatible mobile and desktop browsers.

The app supplies clearly labelled, editable starter recommendations, not a certified
factory schedule or mechanical diagnosis. Existing custom intervals are preserved.
Maintenance notifications are in-app; there are no background push notifications.

## Run locally

```sh
npm install
npm run dev
```

Open `http://localhost:5173`. The Google client must authorize that exact origin.

```sh
npm test
npm run build
npm run preview
```

The service worker is registered only in production builds. To test Google auth
with `npm run preview`, register its localhost origin/port with the OAuth client,
or serve the built app at an already authorized origin.

## Storage and authorization

The Google Cloud project is `sayarathy`, with the **Sayarathy** OAuth app and
**Sayarathy Web** browser client. Google Identity Services obtains a short-lived
`drive.file` access token in the browser. No client
secret, service account, backend, or operator-owned database is used.

Sign-in is remembered on the device for **24 hours**. The browser stores the
remembered deadline and current access token in localStorage, reusing the token
only until its actual Google expiry. Reloading within that valid window restores
Drive automatically. Expired/rejected tokens are removed; the remembered session
offers **Continue Google Drive** to renew permission via a user gesture. Google's
token model cannot guarantee uninterrupted 24-hour Drive authorization without a
backend refresh-token flow. Sign out clears the stored session.

After authorization, the app automatically opens the last-used authorized data
file. If no preference exists, it selects the newest valid log with records before
considering empty duplicates. The preferred file ID is stored locally per OAuth
client; log contents are not cached. IDs absent from the currently
authorized account are ignored.

While connected and visible, the app checks file metadata on focus, on returning
to the foreground, after regaining connectivity, and once a minute. It downloads
the JSON only when its content checksum changes. These refreshes pause during
forms, dialogs, confirmations, uploads, saves, and unsaved drafts. Token expiry
still requires user-driven reconnection; there is no closed-app background sync.

The public client ID is in `.env.production`. For development, use `.env.local`
with `VITE_GOOGLE_CLIENT_ID`. Never commit authorization tokens or client secrets.

One `sayarathy.json` contains the profile, service history, schedules, follow-ups,
and mileage readings. A **Sayarathy attachments** folder is associated with that
dataset. Only app-tagged JSON datasets appear in the data-file chooser. Unsupported
legacy JSON is not silently converted or overwritten; download the original first.

Removing an attachment from a service, or deleting that service, does not delete
the physical attachment. This preserves references in older backups. Manage those
files in Google Drive when you want to delete them permanently. Failed partial
uploads are cleaned up where authorization and connectivity permit.

JSON backups include attachment references, not the attachments' binary contents.
Back up the Drive attachment folder separately if you need a fully independent copy.

## Installable, not offline-enabled

`public/manifest.webmanifest` provides a standalone window, PNG and maskable icons,
and home-screen shortcuts. `public/sw.js` handles same-origin GET requests by
going directly to the network, with **no CacheStorage, precaching, offline
fallback, background sync, or interception of Google requests**.

There is no persistent vehicle-data cache or offline queue. Offline status disables
Drive changes and loading. Unsaved edits and retryable drafts exist only in the
open page. Download a draft before leaving if a save failed. A closed app requires
internet access to open again.

- Android/Chrome: browser menu → Install app / Add to home screen.
- iPhone/iPad: Safari → Share → Add to Home Screen.
- Desktop Chrome/Edge: address-bar install icon or browser install menu.

## Maintenance correctness

- Match both category and work type to find the last completion.
- A later oil-leak repair does not reset an oil-change schedule.
- Cleaning an AC filter does not reset its replacement schedule.
- Missing mileage stays unknown; it is not filled from an older service.
- Distance and date targets are calculated independently, using whichever is due first.
- Month intervals clamp to valid month-end dates.
- Historical service mileage is not automatically treated as current mileage.
- Unconfigured default rules receive starter intervals once: oil/filter 5,000 km
  or 6 months; coolant/brake checks 5,000 km or 6 months; AC filter review 15,000 km
  or 12 months; tyre inspection/rotation review 8,000 km or 6 months.
- These are conservative planning values, not exact market/engine-specific Toyota
  requirements. The 2006 U.S. manual's oil reminder is 8,000 km; our starter is earlier.
- Tyre/brake replacement is condition-based. Recommended inspection rules may
  use earlier replacement work as an explicitly labelled timing reference.
- Unknown baselines get a suggested condition/history review in one week, not an
  invented service or replacement deadline. New follow-ups default to a suggested
  one-week check-in; existing user dates are preserved.
- `settings.recommendationsVersion` makes the initial upgrade one-time. History,
  receipts, existing custom intervals, and user-entered dates remain intact.
- The pre-save checksum check detects stale content but is **not an atomic lock**.
  Simultaneous saves can still race; use one editing device at a time.

## Deployment

Push to `main` to run `.github/workflows/pages.yml`. The workflow tests, builds,
and deploys `dist` to GitHub Pages. OAuth must authorize
`https://ammarabdulaziz.github.io` (origin only, without the repository path).

The homepage, privacy policy, and terms are public branding pages. Only app files
are deployed; user history and attachments stay in the user's Google Drive.

`private-import.json` is deliberately ignored. It is a local-only import source,
not an application asset, fixture, or public sample. Do not commit personal history.

## Verification

Automated tests exercise reminder dates/distance, completion matching, missing
data, backup validation, stale-content detection, private binary uploads, and downloads.
Real OAuth and Drive behavior require a live signed-in browser.

Recommendation references: [2006 Camry owner's manual, Toyota publication OM33708U](https://cdn.dealereprocess.org/cdn/servicemanuals/toyota/2006-camry.pdf),
including the oil reminder (p.126), filter guidance (p.192), coolant checks (p.311),
and tyre condition/age/rotation guidance (pp.317–320). Suggested intervals are
labelled as app starters rather than quoted factory requirements.

For a full acceptance pass: connect, restore a backup, add/edit a temporary service,
upload and preview a receipt, configure a schedule, update mileage, add/complete a
follow-up, export/restore, and reload from a second session. Test stale edits from
two sessions and offline disabling. Remove temporary records afterward.
