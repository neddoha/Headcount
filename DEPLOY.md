# Deployment

## Recommended option

The easiest way to share this app with other users is to deploy it as a Python web service on Render.

## Important note

The current login is now browser-session based, so each user keeps their own sign-in session.

The current persistence is still file-based.

That means:

- it is fine for internal demo or pilot use
- it is better than the old shared session approach for multi-user access
- it is not yet a production-grade identity system
- if the hosting platform clears its temporary disk, app data may reset

## Render deployment

1. Put this project in a Git repository.
2. Push it to GitHub.
3. In Render, create a new Web Service from the repository.
4. Render can detect the included `render.yaml`, or you can set:
   - Build Command: leave empty
   - Start Command: `python backend/server.py`
5. After deploy, open the generated public URL.
6. In the Render service settings, set these environment variables for safer live use:
   - `ADMIN_PASSWORD`
   - `USER_PASSWORD`
   - optional: `ADMIN_NAME`
   - optional: `USER_NAME`

## Custom domain for `headcount.nedglitch.com`

1. Deploy the app successfully on Render first.
2. In Render, open the web service and go to `Settings` -> `Custom Domains`.
3. Add `headcount.nedglitch.com`.
4. Render will show the DNS target value to use.
5. In the DNS manager for `nedglitch.com`, create a `CNAME` record:
   - Host: `headcount`
   - Value: the Render target shown in Custom Domains
6. Wait for DNS propagation.
7. Render will issue HTTPS automatically once the DNS record is valid.

After that, users should be able to open:

```text
https://headcount.nedglitch.com
```

## Local run

```bash
npm start
```

Then open:

```text
http://127.0.0.1:4173
```

## Recommended next improvements before broad rollout

- move app state from file storage to a real database
- replace demo users with real per-user authentication
- add role management from persisted user records
- add audit logging for baseline and mapping changes
