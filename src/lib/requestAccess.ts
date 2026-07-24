export type RequestAccess = 'free' | 'generation' | 'ignore';

export type RequestAccessInput = {
  chatType: string | undefined;
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

const getCommand = (text: string) => {
  const [firstWord] = text.split(/\s/u, 1);
  if (!firstWord.startsWith('/')) {
    return undefined;
  }

  const [command] = firstWord.slice(1).split('@', 1);
  return command.toLowerCase();
};

export const classifyRequest = ({
  chatType,
  isReplyToThisBot,
  matchesTextTrigger,
  text,
}: RequestAccessInput): RequestAccess => {
  if (!text) {
    return 'ignore';
  }

  const command = getCommand(text);
  if (command && freeCommands.has(command)) {
    return 'free';
  }

  if (
    chatType === 'private' ||
    command === 'shicture' ||
    isReplyToThisBot ||
    matchesTextTrigger
  ) {
    return 'generation';
  }

  return 'ignore';
};
