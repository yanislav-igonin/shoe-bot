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

const timestampOptions = {
  columnType: 'timestamp(3)',
  defaultRaw: 'current_timestamp',
  type: 'Date',
} as const;

export enum ChatType {
  Channel = 'channel',
  Group = 'group',
  Private = 'private',
  Supergroup = 'supergroup',
}

export enum MessageType {
  Image = 'image',
  Text = 'text',
  Voice = 'voice',
}

@Entity({ tableName: 'users' })
export class User {
  @PrimaryKey({ type: 'number' })
  id!: number;

  @Property({ nullable: true, type: 'string' })
  username: string | null = null;

  @Property({ fieldName: 'firstName', nullable: true, type: 'string' })
  firstName: string | null = null;

  @Property({ fieldName: 'lastName', nullable: true, type: 'string' })
  lastName: string | null = null;

  @Property({ fieldName: 'languageCode', nullable: true, type: 'string' })
  languageCode: string | null = null;

  @Property({ fieldName: 'tgId', type: 'string', unique: true })
  tgId!: string;

  @Property({
    columnType: 'date',
    fieldName: 'allowedTill',
    nullable: true,
    type: 'Date',
  })
  allowedTill: Date | null = null;

  @Property({ fieldName: 'createdAt', ...timestampOptions })
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
  @PrimaryKey({ type: 'number' })
  id!: number;

  @Property({ type: 'string' })
  name!: string;

  @Enum({ items: () => ChatType, nativeEnumName: 'ChatType' })
  type!: ChatType;

  @Property({ fieldName: 'tgId', type: 'string' })
  tgId!: string;

  @Property({ fieldName: 'createdAt', ...timestampOptions })
  createdAt = new Date();
}

@Entity({ tableName: 'dialogs' })
export class Dialog {
  @PrimaryKey({ type: 'number' })
  id!: number;

  @Property({ fieldName: 'createdAt', ...timestampOptions })
  createdAt = new Date();

  @ManyToOne(() => Chat, {
    deleteRule: 'restrict',
    fieldName: 'chatId',
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
  @PrimaryKey({ type: 'number' })
  id!: number;

  @Property({ nullable: true, type: 'string' })
  text: string | null = null;

  @Enum({ items: () => MessageType, nativeEnumName: 'MessageType' })
  type!: MessageType;

  @ManyToOne(() => User, {
    deleteRule: 'restrict',
    fieldName: 'userId',
    updateRule: 'cascade',
  })
  user!: User;

  @ManyToOne(() => Dialog, {
    deleteRule: 'set null',
    fieldName: 'dialogId',
    nullable: true,
    updateRule: 'cascade',
  })
  dialog: Dialog | null = null;

  @Property({ fieldName: 'tgPhotoId', nullable: true, type: 'string' })
  tgPhotoId: string | null = null;

  @Property({ fieldName: 'tgMessageId', type: 'string' })
  tgMessageId!: string;

  @Property({ fieldName: 'tgVoiceId', nullable: true, type: 'string' })
  tgVoiceId: string | null = null;

  @ManyToOne(() => Message, {
    deleteRule: 'set null',
    fieldName: 'replyToId',
    nullable: true,
    updateRule: 'cascade',
  })
  replyTo: Message | null = null;

  @Property({ fieldName: 'createdAt', ...timestampOptions })
  createdAt = new Date();
}

@Entity({ tableName: 'activation_codes' })
export class ActivationCode {
  @PrimaryKey({ type: 'number' })
  id!: number;

  @Property({ type: 'string', unique: true })
  code = randomUUID();

  @Property({ fieldName: 'createdAt', ...timestampOptions })
  createdAt = new Date();

  @ManyToOne(() => User, {
    deleteRule: 'set null',
    fieldName: 'usedByUserId',
    nullable: true,
    updateRule: 'cascade',
  })
  usedByUser: User | null = null;
}

@Entity({ tableName: 'bot_roles' })
export class BotRole {
  @PrimaryKey({ type: 'number' })
  id!: number;

  @Property({ type: 'string' })
  name!: string;

  @Property({ fieldName: 'systemPrompt', type: 'string' })
  systemPrompt!: string;

  @Property({ fieldName: 'createdAt', ...timestampOptions })
  createdAt = new Date();

  @Property({
    fieldName: 'updatedAt',
    onUpdate: () => new Date(),
    ...timestampOptions,
  })
  updatedAt = new Date();
}

@Entity({ tableName: 'user_settings' })
export class UserSettings {
  @PrimaryKey({ type: 'number' })
  id!: number;

  @OneToOne(() => User, {
    deleteRule: 'restrict',
    fieldName: 'userId',
    owner: true,
    updateRule: 'cascade',
  })
  user!: User;

  @ManyToOne(() => BotRole, {
    default: 1,
    deleteRule: 'restrict',
    fieldName: 'botRoleId',
    updateRule: 'cascade',
  })
  botRole!: BotRole;

  @Property({ fieldName: 'createdAt', ...timestampOptions })
  createdAt = new Date();

  @Property({
    fieldName: 'updatedAt',
    onUpdate: () => new Date(),
    ...timestampOptions,
  })
  updatedAt = new Date();
}

@Entity({ tableName: 'settings' })
export class Setting {
  @PrimaryKey({ type: 'string' })
  key!: string;

  @Property({ type: 'string' })
  value!: string;

  @Property({ fieldName: 'createdAt', ...timestampOptions })
  createdAt = new Date();

  @Property({
    fieldName: 'updatedAt',
    onUpdate: () => new Date(),
    ...timestampOptions,
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
