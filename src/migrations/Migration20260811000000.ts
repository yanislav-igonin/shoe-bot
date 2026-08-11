import { Migration } from "@mikro-orm/migrations";

export class Migration20260811000000 extends Migration {
	public override up(): void {
		this.addSql(
			`INSERT INTO "settings" ("key", "value", "updatedAt")
       VALUES
         ('textProvider', 'xai', CURRENT_TIMESTAMP),
         ('textModel', 'grok-4', CURRENT_TIMESTAMP)
       ON CONFLICT ("key") DO NOTHING;`,
		);
	}

	public override down(): void {
		this.addSql(
			`DELETE FROM "settings"
       WHERE "key" IN ('textProvider', 'textModel');`,
		);
	}
}
