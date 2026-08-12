import { Migration } from "@mikro-orm/migrations";

export class Migration20260812000000 extends Migration {
	public override up(): void {
		this.addSql(`CREATE UNIQUE INDEX "chats_tgId_key" ON "chats" ("tgId");`);
	}

	public override down(): void {
		this.addSql(`DROP INDEX IF EXISTS "chats_tgId_key";`);
	}
}
