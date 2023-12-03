/*
  Warnings:

  - You are about to drop the column `chatId` on the `messages` table. All the data in the column will be lost.
  - The `dialogId` column on the `messages` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - Added the required column `type` to the `messages` table without a default value. This is not possible if the table is not empty.
  - Changed the type of `userId` on the `messages` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "ChatType" AS ENUM ('private', 'group', 'supergroup', 'channel');

-- CreateEnum
CREATE TYPE "MessageType" AS ENUM ('text', 'image', 'voice');

-- DropForeignKey
ALTER TABLE "messages" DROP CONSTRAINT "messages_chatId_fkey";

-- DropForeignKey
ALTER TABLE "messages" DROP CONSTRAINT "messages_dialogId_fkey";

-- DropForeignKey
ALTER TABLE "messages" DROP CONSTRAINT "messages_userId_fkey";

-- DropIndex
DROP INDEX "messages_tgMessageId_key";

-- AlterTable
ALTER TABLE "messages" DROP COLUMN "chatId",
ADD COLUMN     "type" "MessageType" NOT NULL,
DROP COLUMN "userId",
ADD COLUMN     "userId" INTEGER NOT NULL,
DROP COLUMN "dialogId",
ADD COLUMN     "dialogId" INTEGER;

-- CreateTable
CREATE TABLE "new_users" (
    "id" SERIAL NOT NULL,
    "username" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "languageCode" TEXT,
    "tgId" TEXT NOT NULL,
    "isAllowed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "new_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "new_chats" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "type" "ChatType" NOT NULL,
    "tgId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "new_chats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "new_dialogs" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "chatId" INTEGER NOT NULL,

    CONSTRAINT "new_dialogs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "new_users_tgId_key" ON "new_users"("tgId");

-- AddForeignKey
ALTER TABLE "new_dialogs" ADD CONSTRAINT "new_dialogs_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "new_chats"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_userId_fkey" FOREIGN KEY ("userId") REFERENCES "new_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_dialogId_fkey" FOREIGN KEY ("dialogId") REFERENCES "new_dialogs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
