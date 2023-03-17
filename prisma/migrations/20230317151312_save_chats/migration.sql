-- CreateTable
CREATE TABLE "chats" (
    "id" STRING NOT NULL,
    "name" STRING NOT NULL,
    "type" STRING NOT NULL,
    "isAllowed" BOOL NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chats_pkey" PRIMARY KEY ("id")
);
