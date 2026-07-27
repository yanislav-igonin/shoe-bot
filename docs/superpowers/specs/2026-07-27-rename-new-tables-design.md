# Rename New Tables Design

## Goal

Replace temporary `NewUser`, `NewChat`, and `NewDialog` names with
`User`, `Chat`, and `Dialog` in Prisma and TypeScript, and rename their
PostgreSQL tables from `new_users`, `new_chats`, and `new_dialogs` to
`users`, `chats`, and `dialogs`.

## Scope

- Rename the three Prisma models and every generated-client type/client
  reference that uses their old names.
- Update `@@map` values to the final table names.
- Add one data-preserving SQL migration based on `ALTER TABLE ... RENAME TO`.
- Keep fields, relations, indexes, constraints, and application behavior
  unchanged.
- Do not rename unrelated models, columns, enums, or domain concepts.

## Migration

The cleanup migration from 2024 already removed the legacy `users`, `chats`,
and `dialogs` tables. The new migration can therefore rename the replacement
tables directly:

```sql
ALTER TABLE "new_users" RENAME TO "users";
ALTER TABLE "new_chats" RENAME TO "chats";
ALTER TABLE "new_dialogs" RENAME TO "dialogs";
```

PostgreSQL preserves table contents and dependent foreign keys during these
renames. Existing constraint and index names may retain their `new_` prefix;
renaming those internal identifiers is outside scope because Prisma behavior
does not depend on them.

## Verification

- A schema-focused test must fail while any old model/table mapping remains.
- `prisma format` and `prisma validate` must accept the updated schema.
- Existing tests, lint, typecheck, and build must pass.
- The generated migration must contain only the three table renames.

