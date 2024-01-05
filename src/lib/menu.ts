import { Menu } from '@grammyjs/menu';

const menu = new Menu('my-menu-identifier')
  .text('A', (context) => context.reply('You pressed A!'))
  .row()
  .text('B', (context) => context.reply('You pressed B!'));
