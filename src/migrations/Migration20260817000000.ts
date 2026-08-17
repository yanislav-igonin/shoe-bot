import { Migration } from "@mikro-orm/migrations";

export class Migration20260817000000 extends Migration {
	public override up(): void {
		this.addSql(`
      INSERT INTO "settings" ("key", "value", "updatedAt")
      VALUES
        ('hfInferenceEndpointNamespace', '', CURRENT_TIMESTAMP),
        ('hfTextInferenceEndpointName', '', CURRENT_TIMESTAMP),
        ('hfTextInferenceEndpointUrl', '', CURRENT_TIMESTAMP),
        ('hfImageInferenceEndpointUrl', '', CURRENT_TIMESTAMP)
      ON CONFLICT ("key") DO NOTHING;
    `);
	}

	public override down(): void {
		this.addSql(`
      DELETE FROM "settings"
      WHERE "key" IN (
        'hfInferenceEndpointNamespace',
        'hfTextInferenceEndpointName',
        'hfTextInferenceEndpointUrl',
        'hfImageInferenceEndpointUrl'
      );
    `);
	}
}
