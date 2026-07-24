export type RequestAccess = 'free' | 'generation' | 'ignore';

export type RequestAccessInput = {
  botUsername: string | undefined;
  chatType: string | undefined;
  command: string | undefined;
  hasReply: boolean;
  isReplyToThisBot: boolean;
  matchesTextTrigger: boolean;
  text: string | undefined;
};

const freeCommands = new Set([
  'activate',
  'generate',
  'getbotroles',
  'help',
  'profile',
  'setbotrole',
  'start',
  'stats',
]);

export const classifyRequest = ({
  botUsername,
  chatType,
  command,
  hasReply,
  isReplyToThisBot,
  matchesTextTrigger,
  text,
}: RequestAccessInput): RequestAccess => {
  if (!text) {
    return 'ignore';
  }

  const atIndex = command?.indexOf('@') ?? -1;
  const commandName = atIndex === -1 ? command : command?.slice(0, atIndex);
  const commandTarget =
    atIndex === -1 ? undefined : command?.slice(atIndex + 1);

  if (commandTarget !== undefined && commandTarget !== botUsername) {
    return 'ignore';
  }

  if (commandName && freeCommands.has(commandName)) {
    return 'free';
  }

  if (hasReply && !isReplyToThisBot) {
    return 'ignore';
  }

  if (
    chatType === 'private' ||
    commandName === 'shicture' ||
    isReplyToThisBot ||
    matchesTextTrigger
  ) {
    return 'generation';
  }

  return 'ignore';
};
