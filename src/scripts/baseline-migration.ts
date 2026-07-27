/* eslint-disable no-console */

import { createDatabase } from "../lib/database.js";

const BASELINE_MIGRATION = "Migration20260727000000";

const orm = await createDatabase();

try {
	const schemaDifference = await orm.schema.getUpdateSchemaSQL({
		dropTables: true,
	});
	if (schemaDifference.trim()) {
		throw new Error(
			"Database schema does not match the MikroORM baseline.\n" +
				schemaDifference,
		);
	}

	const executedMigrations = await orm.migrator.getExecuted();
	const alreadyLogged = executedMigrations.some(
		({ name }) => name === BASELINE_MIGRATION,
	);

	if (alreadyLogged) {
		console.log(`Migration '${BASELINE_MIGRATION}' is already logged`);
	} else {
		await orm.migrator.logMigration(BASELINE_MIGRATION);
		console.log(`Successfully logged migration '${BASELINE_MIGRATION}'`);
	}
} finally {
	await orm.close(true);
}
