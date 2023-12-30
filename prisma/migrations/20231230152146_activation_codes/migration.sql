-- AlterTable
ALTER TABLE "new_users" ADD COLUMN     "allowedTill" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "activation_codes" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usedByUserId" INTEGER,

    CONSTRAINT "activation_codes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "activation_codes_code_key" ON "activation_codes"("code");

-- AddForeignKey
ALTER TABLE "activation_codes" ADD CONSTRAINT "activation_codes_usedByUserId_fkey" FOREIGN KEY ("usedByUserId") REFERENCES "new_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
