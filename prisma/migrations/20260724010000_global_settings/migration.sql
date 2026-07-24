CREATE TABLE IF NOT EXISTS "settings" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("key")
);

INSERT INTO "settings" ("key", "value", "updatedAt")
VALUES
    ('imageProvider', 'togetherai', CURRENT_TIMESTAMP),
    ('imageModel', 'black-forest-labs/FLUX.2-dev', CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;
