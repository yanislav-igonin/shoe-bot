-- AlterTable
ALTER TABLE "prompts" ADD COLUMN     "dialogId" TEXT;

-- CreateTable
CREATE TABLE "dialogs" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dialogs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bot_replies" (
    "id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dialogId" TEXT NOT NULL,

    CONSTRAINT "bot_replies_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "prompts" ADD CONSTRAINT "prompts_dialogId_fkey" FOREIGN KEY ("dialogId") REFERENCES "dialogs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bot_replies" ADD CONSTRAINT "bot_replies_dialogId_fkey" FOREIGN KEY ("dialogId") REFERENCES "dialogs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
