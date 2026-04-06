# Shift Headcount App

Shift Headcount is a lightweight operations app for managing baseline manning, Paste RS roster intake, department mapping, and staffing compliance review.

## Features

- baseline shift setup by department and sub-department
- department alias mapping between Baseline and Paste RS
- Paste RS roster validation with row-level issue tracking
- compliance result by department with highlighted variance
- admin and user sign-in flow
- simple backend persistence for pilot deployment

## Local Run

```bash
npm start
```

Open:

```text
http://127.0.0.1:4173
```

## Demo Users

- admin: `admin` / `Admin@123`
- user: `user` / `User@123`

These should be replaced with environment variable values before live rollout.

## Deploy

Render configuration is included in [render.yaml](./render.yaml).

Custom domain guidance for `headcount.nedglitch.com` is documented in [DEPLOY.md](./DEPLOY.md).

## Important Note

This project is currently suitable for internal demo or pilot use. It still uses file-based storage and demo user records, so a real database and proper identity management are recommended for broader rollout.
