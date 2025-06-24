-- CreateEnum
CREATE TYPE "ReactionType" AS ENUM ('HEART');

-- CreateTable
CREATE TABLE "element_reactions" (
    "id" TEXT NOT NULL,
    "element_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" "ReactionType" NOT NULL DEFAULT 'HEART',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "element_reactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "element_reactions_element_id_created_at_idx" ON "element_reactions"("element_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "element_reactions_element_id_user_id_key" ON "element_reactions"("element_id", "user_id");

-- AddForeignKey
ALTER TABLE "element_reactions" ADD CONSTRAINT "element_reactions_element_id_fkey" FOREIGN KEY ("element_id") REFERENCES "elements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "element_reactions" ADD CONSTRAINT "element_reactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
