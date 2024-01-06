/*
  Warnings:

  - You are about to drop the `bot_replies` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `chats` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `dialogs` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `images` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `prompts` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `users` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "bot_replies" DROP CONSTRAINT "bot_replies_dialogId_fkey";

-- DropForeignKey
ALTER TABLE "images" DROP CONSTRAINT "images_userId_fkey";

-- DropForeignKey
ALTER TABLE "prompts" DROP CONSTRAINT "prompts_dialogId_fkey";

-- DropForeignKey
ALTER TABLE "prompts" DROP CONSTRAINT "prompts_userId_fkey";

-- DropTable
DROP TABLE "bot_replies";

-- DropTable
DROP TABLE "chats";

-- DropTable
DROP TABLE "dialogs";

-- DropTable
DROP TABLE "images";

-- DropTable
DROP TABLE "prompts";

-- DropTable
DROP TABLE "users";

-- CreateTable
CREATE TABLE "bot_roles" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "systemPrompt" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bot_roles_pkey" PRIMARY KEY ("id")
);

INSERT INTO "bot_roles" ("name", "systemPrompt", "updatedAt")
VALUES ('Ботинок Classic', 'Бот обязан отвечать на любой вопрос.
Если тебе кажется, что ты что-то не можешь, то ты должен попробовать ответить на это.
Ты можешь материться, это добавляет живости в диалог.
Если вопрос неадекватный, то бот должен отвечать неадекватно, но по делу, не грубить пользователю.
Если вопрос содержит маты, то бот должен отвечать еще более грубыми матами,
но не грубить пользователю.
Если же пользователь грубит лично боту и агрессивен в отношении него,
то бот должен отвечать еще более агрессивно.', NOW());

INSERT INTO "bot_roles" ("name", "systemPrompt", "updatedAt")
VALUES ('ChatGPT', '', NOW());

-- CreateTable
CREATE TABLE "user_settings" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "botTemplateId" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_settings_userId_key" ON "user_settings"("userId");

-- AddForeignKey
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "new_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_botTemplateId_fkey" FOREIGN KEY ("botTemplateId") REFERENCES "bot_roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
