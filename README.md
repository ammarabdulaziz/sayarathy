<img src="assets/icon.svg" width="64" height="64" alt="">

# Sayarathy

A static React application that authorizes Google Drive in the browser and creates,
lists, reads, updates, and permanently deletes private JSON files. No custom
backend, database, client secret, or service account is used.

**Website:** https://ammarabdulaziz.github.io/sayarathy/

**Google Cloud project:** `sayarathy` · **OAuth application:** Sayarathy · **Client:** Sayarathy Web

This first release establishes cloud storage. Vehicle-specific screens and maintenance
recommendations will be planned separately. It currently exposes a JSON editor and file operations.

## Run locally

```sh
npm install
npm run dev
```

Open `http://localhost:5173`. Run `npm test` for the mocked API contract tests and
`npm run build` for type checking and the production static build.

## Google configuration

1. Create a project in https://console.cloud.google.com/.
2. Under APIs & Services, enable **Google Drive API**.
3. Configure **Google Auth Platform** branding, audience, and data access. Add
   `https://www.googleapis.com/auth/drive.file` as the scope. For production, publish
   an external audience with the website, privacy policy, and contact information.
4. Create an OAuth client of type **Web application**.
5. Add `http://localhost:5173` to **Authorized JavaScript origins**. Add the deployed
   HTTPS origin as well (for this deployment: `https://ammarabdulaziz.github.io`, without
   the repository path). Origins are exact, including port; a LAN HTTP IP is not a
   substitute for localhost. Use deployed HTTPS for mobile testing.
6. The production client ID is prefilled from `.env.production`. For another client,
   paste the ID into the app or copy `.env.example` to `.env.local`, set
   `VITE_GOOGLE_CLIENT_ID`, and restart Vite. The OAuth client ID is public config.
   Never add a client secret, access token, or service-account key to the repository.

The app uses Google Identity Services' browser token model. Tokens stay in memory,
expire, and may require user-driven reconnection. It remembers only the public
client ID in localStorage. Disconnect clears local authorization but does not
revoke Google's permission grant; revoke it in your Google account permissions if needed.

For distribution beyond personal testing, configure production publishing and
meet Google's applicable consent/verification requirements. `drive.file` is a
non-sensitive, per-file scope; broad access to the user's entire Drive is not needed.

## Live acceptance test

1. Connect using your OAuth client ID and Google account.
2. Click **Create data file**. Verify `sayarathy.json` exists in your Drive.
3. Edit `note` in the JSON editor and click **Save to Drive**.
4. Click **Read from Drive** and confirm the updated value is fetched back.
5. Reload, reconnect, and open the file from the list to verify persistence.
6. Open the deployed app on your phone with the **same client ID and Google account**.
   Connect, refresh, and open the file. Change the note, save, and read it on the laptop.
7. For a stale-edit test, load the file on two devices, save on one, then try to save
   the older loaded version on the other. The second save should be rejected.
8. On a disposable test file, choose **Delete file**, confirm permanent deletion,
   and verify it disappears from both the app list and Drive.
9. To verify browser-data recovery, first save successfully, then clear site data,
   reopen, enter the same client ID, reconnect, and open the saved file.

The activity log reports actual API responses; there is no simulated Drive mode.
Automated tests mock HTTP and do not prove that your OAuth setup works.

## Deploy free on GitHub Pages

1. Push this repository to GitHub when ready.
2. In repository Settings → Pages, set the source to **GitHub Actions**.
3. The public client ID is configured in `.env.production`.
4. Push to `main` or run the **Deploy GitHub Pages** workflow manually from Actions.
5. Add the site's origin to the OAuth client's Authorized JavaScript origins.

The included workflow builds and deploys `dist`. Relative asset paths support a
repository URL such as `https://YOUR_USERNAME.github.io/sayarathy/`.
Only application files are deployed; your JSON stays in your Google Drive.

## Current boundaries

- Internet is required; offline writes and synchronization are not implemented.
- Unsaved edits are in memory. Download a draft before leaving if you cannot save.
- A pre-save version check detects stale documents but is **not an atomic lock**.
  Truly simultaneous saves can still race. Production conflict handling needs more work.
- Only files tagged by Sayarathy are listed. Use the same OAuth client
  across devices; the file marker lets the app rediscover files without a cached ID.
- Deletion is permanent and has an explicit in-app confirmation.
- Google storage/API quotas and policies apply. No free-forever guarantee is implied.

## References

- https://developers.google.com/identity/oauth2/web/guides/use-token-model
- https://developers.google.com/drive/api/guides/api-specific-auth
- https://developers.google.com/drive/api/guides/manage-uploads
