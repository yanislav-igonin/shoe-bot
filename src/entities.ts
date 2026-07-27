import { OptionalProps } from '@mikro-orm/core';
import {
  Check,
  Entity,
  Enum,
  ManyToOne,
  OneToOne,
  PrimaryKey,
  Property,
  Unique,
} from '@mikro-orm/decorators/legacy';
import { randomUUID } from 'node:crypto';

/* eslint-disable @typescript-eslint/explicit-member-accessibility */

const timestampColumnOptions = {
  columnType: 'timestamp(3)',
  type: 'Date',
} as const;

const createdTimestampOptions = {
  ...timestampColumnOptions,
  defaultRaw: 'current_timestamp',
} as const;

export enum ChatType {
  channel = 'channel',
  group = 'group',
  private = 'private',
  supergroup = 'supergroup',
}

export enum MessageType {
  image = 'image',
  text = 'text',
  voice = 'voice',
}

@Entity({ tableName: 'users' })
export class User {
  [OptionalProps]?:
    | 'allowedTill'
    | 'createdAt'
    | 'firstName'
    | 'languageCode'
    | 'lastName'
    | 'username';

  @PrimaryKey({ type: 'number' })
  id!: number;

  @Property({ columnType: 'text', nullable: true, type: 'string' })
  username: string | null = null;

  @Property({
    columnType: 'text',
    fieldName: 'firstName',
    nullable: true,
    type: 'string',
  })
  firstName: string | null = null;

  @Property({
    columnType: 'text',
    fieldName: 'lastName',
    nullable: true,
    type: 'string',
  })
  lastName: string | null = null;

  @Property({
    columnType: 'text',
    fieldName: 'languageCode',
    nullable: true,
    type: 'string',
  })
  languageCode: string | null = null;

  @Property({
    columnType: 'text',
    fieldName: 'tgId',
    type: 'string',
    unique: 'new_users_tgId_key',
  })
  tgId!: string;

  @Property({
    columnType: 'date',
    fieldName: 'allowedTill',
    nullable: true,
    type: 'Date',
  })
  allowedTill: Date | null = null;

  @Property({ fieldName: 'createdAt', ...createdTimestampOptions })
  createdAt = new Date();
}

@Check({
  expression: (columns) => `${columns.used} >= 0 AND ${columns.used} <= 3`,
  name: 'daily_request_usages_used_check',
})
@Entity({ tableName: 'daily_request_usages' })
@Unique({
  name: 'daily_request_usages_userId_date_key',
  properties: ['user', 'date'],
})
export class DailyRequestUsage {
  @PrimaryKey({ type: 'number' })
  id!: number;

  @ManyToOne(() => User, {
    deleteRule: 'restrict',
    fieldName: 'userId',
    foreignKeyName: 'daily_request_usages_userId_fkey',
    updateRule: 'cascade',
  })
  user!: User;

  @Property({ columnType: 'date', type: 'Date' })
  date!: Date;

  @Property({ type: 'number' })
  used!: number;
}

@Entity({ tableName: 'chats' })
export class Chat {
  [OptionalProps]?: 'createdAt';

  @PrimaryKey({ type: 'number' })
  id!: number;

  @Property({ columnType: 'text', type: 'string' })
  name!: string;

  @Enum({ items: () => ChatType, nativeEnumName: 'ChatType' })
  type!: ChatType;

  @Property({ columnType: 'text', fieldName: 'tgId', type: 'string' })
  tgId!: string;

  @Property({ fieldName: 'createdAt', ...createdTimestampOptions })
  createdAt = new Date();
}

@Entity({ tableName: 'dialogs' })
export class Dialog {
  [OptionalProps]?: 'createdAt' | 'isViolatesOpenAiPolicy';

  @PrimaryKey({ type: 'number' })
  id!: number;

  @Property({ fieldName: 'createdAt', ...createdTimestampOptions })
  createdAt = new Date();

  @ManyToOne(() => Chat, {
    deleteRule: 'restrict',
    fieldName: 'chatId',
    foreignKeyName: 'new_dialogs_chatId_fkey',
    updateRule: 'cascade',
  })
  chat!: Chat;

  @Property({
    default: false,
    fieldName: 'isViolatesOpenAiPolicy',
    type: 'boolean',
  })
  isViolatesOpenAiPolicy = false;
}

@Entity({ tableName: 'messages' })
export class Message {
  [OptionalProps]?:
    | 'createdAt'
    | 'dialog'
    | 'replyTo'
    | 'text'
    | 'tgPhotoId'
    | 'tgVoiceId';

  @PrimaryKey({ type: 'number' })
  id!: number;

  @Property({ columnType: 'text', nullable: true, type: 'string' })
  text: string | null = null;

  @Enum({ items: () => MessageType, nativeEnumName: 'MessageType' })
  type!: MessageType;

  @ManyToOne(() => User, {
    deleteRule: 'restrict',
    fieldName: 'userId',
    foreignKeyName: 'messages_userId_fkey',
    updateRule: 'cascade',
  })
  user!: User;

  @ManyToOne(() => Dialog, {
    deleteRule: 'set null',
    fieldName: 'dialogId',
    foreignKeyName: 'messages_dialogId_fkey',
    nullable: true,
    updateRule: 'cascade',
  })
  dialog: Dialog | null = null;

  @Property({
    columnType: 'text',
    fieldName: 'tgPhotoId',
    nullable: true,
    type: 'string',
  })
  tgPhotoId: string | null = null;

  @Property({ columnType: 'text', fieldName: 'tgMessageId', type: 'string' })
  tgMessageId!: string;

  @Property({
    columnType: 'text',
    fieldName: 'tgVoiceId',
    nullable: true,
    type: 'string',
  })
  tgVoiceId: string | null = null;

  @ManyToOne(() => Message, {
    deleteRule: 'set null',
    fieldName: 'replyToId',
    foreignKeyName: 'messages_replyToId_fkey',
    nullable: true,
    updateRule: 'cascade',
  })
  replyTo: Message | null = null;

  @Property({ fieldName: 'createdAt', ...createdTimestampOptions })
  createdAt = new Date();
}

@Entity({ tableName: 'activation_codes' })
export class ActivationCode {
  [OptionalProps]?: 'code' | 'createdAt' | 'usedByUser';

  @PrimaryKey({ type: 'number' })
  id!: number;

  @Property({
    columnType: 'text',
    type: 'string',
    unique: 'activation_codes_code_key',
  })
  code: string = randomUUID();

  @Property({ fieldName: 'createdAt', ...createdTimestampOptions })
  createdAt = new Date();

  @ManyToOne(() => User, {
    deleteRule: 'set null',
    fieldName: 'usedByUserId',
    foreignKeyName: 'activation_codes_usedByUserId_fkey',
    nullable: true,
    updateRule: 'cascade',
  })
  usedByUser: User | null = null;
}

@Entity({ tableName: 'bot_roles' })
export class BotRole {
  [OptionalProps]?: 'createdAt' | 'updatedAt';

  @PrimaryKey({ type: 'number' })
  id!: number;

  @Property({ columnType: 'text', type: 'string' })
  name!: string;

  @Property({
    columnType: 'text',
    fieldName: 'systemPrompt',
    type: 'string',
  })
  systemPrompt!: string;

  @Property({ fieldName: 'createdAt', ...createdTimestampOptions })
  createdAt = new Date();

  @Property({
    fieldName: 'updatedAt',
    onUpdate: () => new Date(),
    ...timestampColumnOptions,
  })
  updatedAt = new Date();
}

@Entity({ tableName: 'user_settings' })
export class UserSettings {
  [OptionalProps]?: 'botRoleId' | 'createdAt' | 'updatedAt';

  @PrimaryKey({ type: 'number' })
  id!: number;

  @OneToOne(() => User, {
    deleteRule: 'restrict',
    fieldName: 'userId',
    foreignKeyName: 'user_settings_userId_fkey',
    owner: true,
    unique: 'user_settings_userId_key',
    updateRule: 'cascade',
  })
  user!: User;

  @ManyToOne(() => BotRole, {
    default: 1,
    deleteRule: 'restrict',
    fieldName: 'botRoleId',
    foreignKeyName: 'user_settings_botRoleId_fkey',
    updateRule: 'cascade',
  })
  botRole!: BotRole;

  public get botRoleId() {
    return this.botRole.id;
  }

  @Property({ fieldName: 'createdAt', ...createdTimestampOptions })
  createdAt = new Date();

  @Property({
    fieldName: 'updatedAt',
    onUpdate: () => new Date(),
    ...timestampColumnOptions,
  })
  updatedAt = new Date();
}

@Entity({ tableName: 'settings' })
export class Setting {
  [OptionalProps]?: 'createdAt' | 'updatedAt';

  @PrimaryKey({ columnType: 'text', type: 'string' })
  key!: string;

  @Property({ columnType: 'text', type: 'string' })
  value!: string;

  @Property({ fieldName: 'createdAt', ...createdTimestampOptions })
  createdAt = new Date();

  @Property({
    fieldName: 'updatedAt',
    onUpdate: () => new Date(),
    ...timestampColumnOptions,
  })
  updatedAt = new Date();
}

export const entities = [
  ActivationCode,
  BotRole,
  Chat,
  DailyRequestUsage,
  Dialog,
  Message,
  Setting,
  User,
  UserSettings,
];

/* eslint-enable @typescript-eslint/explicit-member-accessibility */
