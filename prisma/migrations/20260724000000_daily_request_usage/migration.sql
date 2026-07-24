CREATE TABLE "daily_request_usages" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "used" INTEGER NOT NULL,

    CONSTRAINT "daily_request_usages_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "daily_request_usages_used_check"
        CHECK ("used" >= 0 AND "used" <= 3)
);

CREATE UNIQUE INDEX "daily_request_usages_userId_date_key"
ON "daily_request_usages"("userId", "date");

ALTER TABLE "daily_request_usages"
ADD CONSTRAINT "daily_request_usages_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "new_users"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
