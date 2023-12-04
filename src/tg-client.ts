// @ts-expect-error shit
import input from 'input';
import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions';

const apiId = 21_533_341;
const apiHash = '691caea58771632e7b0bbdba90b5b646';
const stringSession = new StringSession(
  '1AgAOMTQ5LjE1NC4xNjcuNDEBu2Rii14BFp3GMQtTxeWbDIP98nYnhl39o+EVGcJPVdE0HgLyi5EQ5AHHu5r69ERJlD0lJo6PMCgfGFISYlujTF9fnAqQOL6Im+uyrw4SfSj82f0JHTA+pgkpncm+AVgmXZ4kkVZOhopz0swJvpYtf9oDPmeLmO4GzJycbi0buWbm1JxW2xgWhMS7DR+Wm6FQ43K0pO5OyCMeqQ14mtXBWd8MtcpevkJYxtDD8Ct14K780x/zbqnf/MMu2/mhxMKywtQtlSJH//3LUYe3kzU+VLSNLd01Xpg005jm0AOpctfXfeNxsIoRDNUM1wxS5HjDtF1DMGcAzSJzYW5PqJ+ensY=',
); // fill this later with the value from session.save()

export const startTgCliend = async () => {
  console.log('Loading interactive example...');
  const client = new TelegramClient(stringSession, apiId, apiHash, {
    connectionRetries: 5,
  });
  await client.start({
    onError: (error) => console.log(error),
    password: async () => await input.text('Please enter your password: '),
    phoneCode: async () =>
      await input.text('Please enter the code you received: '),
    phoneNumber: async () => await input.text('Please enter your number: '),
  });
  console.log('You should now be connected.');
  // console.log(client.session.save()); // Save this string to avoid logging in again
  await client.sendMessage('me', { message: 'Hello!' });
};
