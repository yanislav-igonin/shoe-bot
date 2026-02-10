import { database } from './database.js';
import { logger } from './logger.js';

const REFRESH_INTERVAL_MS = 60_000;

const REQUIRED_KEYS = [
  'fastModel',
  'mainModel',
  'imageGenerationModel',
] as const;

type SettingKey = (typeof REQUIRED_KEYS)[number];

export class SettingsService {
  private cache: Map<string, string> = new Map();

  private interval: ReturnType<typeof setInterval> | null =
    null;

  async initialize() {
    await this.refresh();
    this.assertRequiredKeys();

    this.interval = setInterval(() => {
      this.refresh().catch((error: unknown) => {
        logger.error(
          'Failed to refresh settings:',
          error,
        );
      });
    }, REFRESH_INTERVAL_MS);
  }

  get fastModel(): string {
    return this.getOrThrow('fastModel');
  }

  get mainModel(): string {
    return this.getOrThrow('mainModel');
  }

  get imageGenerationModel(): string {
    return this.getOrThrow('imageGenerationModel');
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  private getOrThrow(key: SettingKey): string {
    const value = this.cache.get(key);

    if (value === undefined) {
      throw new Error(
        `Missing required setting: "${key}"`,
      );
    }

    return value;
  }

  private async refresh() {
    const rows = await database.settings.findMany();

    for (const row of rows) {
      this.cache.set(row.key, row.value);
    }

    logger.info(
      `Settings refreshed (${rows.length} keys)`,
    );
  }

  private assertRequiredKeys() {
    for (const key of REQUIRED_KEYS) {
      if (!this.cache.has(key)) {
        throw new Error(
          `Missing required setting: "${key}". ` +
            `Seed the "settings" table with this key.`,
        );
      }
    }
  }
}

export const settings = new SettingsService();
