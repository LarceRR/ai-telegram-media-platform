# M1: Channels and access

M1 adds channel isolation, baseline RBAC, versioned protected settings and Telegram credential references.

`POST /api/v1/access/bootstrap` is one-shot. It creates the first active user. Owners create more users via `POST /api/v1/access/users`. Channel requests require `x-actor-id` and are membership scoped.

Roles: OWNER > EDITOR > OPERATOR > VIEWER. Viewers read, editors update metadata, owners change protected settings, manage members and set credential references.

No Telegram token is accepted or persisted. Only a secret-manager reference is stored. Settings updates require `expectedVersion`, increment version atomically and write an audit event.
