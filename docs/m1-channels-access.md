# M1: Channels and access

M1 adds the first real aggregate: a channel is isolated by membership, owns a
versioned settings object, and references Telegram credentials without storing
secret material.

## Access baseline

`POST /api/v1/access/bootstrap` is intentionally one-shot. It creates the first
active user and refuses to run after any user exists. An owner can create more
users with `POST /api/v1/access/users` and `x-actor-id`.

Every channel request requires `x-actor-id`. The service checks the active user
and membership before reading or mutating anything. Roles are ranked:

`OWNER > EDITOR > OPERATOR > VIEWER`

M1 permissions: viewers can read, editors can update channel metadata, and only
owners can change protected settings, manage members, or set a Telegram
credential reference. The reference is a secret-manager key, never a token.

## Endpoints

- `POST /access/bootstrap`
- `POST /access/users`
- `POST /channels`
- `GET /channels`, `GET /channels/:id`
- `PATCH /channels/:id`
- `PATCH /channels/:id/settings` with optimistic `expectedVersion`
- `POST /channels/:id/members`
- `PUT /channels/:id/telegram-credential`

Channel settings separate protected policy from future optimizer inputs:
forbidden topics, legal restrictions, evidence thresholds and publication mode
are protected owner-controlled fields; source priorities and style config are
stored as bounded candidates for later optimization, but M1 does not let an AI
process mutate them.

## Safety rules

- No Telegram token is accepted by the API or persisted in the database.
- Channel list/get queries are membership-scoped, so one user cannot enumerate
  another user's channels.
- Settings updates require the current version and increment it atomically.
- Audit rows are written for bootstrap, channel creation, metadata/settings
  changes, member changes and credential-reference updates.
