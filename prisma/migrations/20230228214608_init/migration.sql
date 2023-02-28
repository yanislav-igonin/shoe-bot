-- CreateTable
CREATE TABLE "users" (
    "id" INT4 NOT NULL,
    "username" STRING,
    "firstName" STRING,
    "lastName" STRING,
    "language" STRING,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prompts" (
    "id" STRING NOT NULL,
    "text" STRING NOT NULL,
    "result" STRING NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" INT4 NOT NULL,

    CONSTRAINT "prompts_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "prompts" ADD CONSTRAINT "prompts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
