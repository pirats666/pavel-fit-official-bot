import 'dotenv/config';
import { createServer } from 'node:http';
import { Bot, InlineKeyboard } from 'grammy';
import { createClient } from '@supabase/supabase-js';

const BOT_TOKEN = process.env.BOT_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PORT = Number(process.env.PORT ?? 10000);

if (!BOT_TOKEN || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('BOT_TOKEN, SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
}

const bot = new Bot(BOT_TOKEN);
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

type State = {
  step: 'goal' | 'location' | 'experience';
  goal?: 'loss' | 'mass' | 'health';
  location?: 'gym' | 'home' | 'outdoor';
};

const sessions = new Map<number, State>();

const labels = {
  goal: { loss: 'Похудение', mass: 'Набор массы', health: 'Здоровье / форма' },
  location: { gym: 'Зал', home: 'Дом', outdoor: 'Улица' },
  experience: { beginner: 'Новичок', under1: 'До 1 года', 1to3: '1–3 года', 3plus: '3+ года' }
};

function keyboard() {
  return new InlineKeyboard().text('Начать', 'quiz:start');
}

async function startQuiz(ctx: any) {
  sessions.set(ctx.from.id, { step: 'goal' });
  await ctx.reply('Давай определим твою цель. Это займёт около минуты 👇', {
    reply_markup: new InlineKeyboard()
      .text('Похудение', 'goal:loss')
      .text('Набор массы', 'goal:mass')
      .row()
      .text('Здоровье / форма', 'goal:health')
  });
}

async function saveLead(ctx: any, state: State, experience: keyof typeof labels.experience) {
  const programCode = state.goal === 'loss' ? 'full_body_beginner' : 'full_body_beginner';
  const { error } = await supabase.from('leads').upsert({
    telegram_user_id: ctx.from.id,
    username: ctx.from.username ?? null,
    first_name: ctx.from.first_name ?? null,
    goal: state.goal,
    training_location: state.location,
    experience,
    program_code: programCode,
    updated_at: new Date().toISOString()
  }, { onConflict: 'telegram_user_id' });
  if (error) throw error;
  return programCode;
}

bot.command('start', async ctx => {
  await ctx.reply(
    'Привет! 👋\n\nЗдесь ты можешь определить свою цель и получить подходящую стартовую программу.',
    { reply_markup: keyboard() }
  );
});

bot.command('help', async ctx => {
  await ctx.reply('/start — начать\n/reset — пройти заново');
});

bot.command('reset', startQuiz);

bot.callbackQuery('quiz:start', async ctx => {
  await ctx.answerCallbackQuery();
  await startQuiz(ctx);
});

bot.callbackQuery(/^goal:(loss|mass|health)$/, async ctx => {
  const state: State = { step: 'location', goal: ctx.match[1] as State['goal'] };
  sessions.set(ctx.from.id, state);
  await ctx.answerCallbackQuery();
  await ctx.editMessageText('Где ты планируешь тренироваться?', {
    reply_markup: new InlineKeyboard()
      .text('В зале', 'loc:gym')
      .text('Дома', 'loc:home')
      .row()
      .text('На улице', 'loc:outdoor')
  });
});

bot.callbackQuery(/^loc:(gym|home|outdoor)$/, async ctx => {
  const state = sessions.get(ctx.from.id);
  if (!state) return startQuiz(ctx);
  state.location = ctx.match[1] as State['location'];
  state.step = 'experience';
  sessions.set(ctx.from.id, state);
  await ctx.answerCallbackQuery();
  await ctx.editMessageText('Какой у тебя опыт тренировок?', {
    reply_markup: new InlineKeyboard()
      .text('Новичок', 'exp:beginner')
      .text('До 1 года', 'exp:under1')
      .row()
      .text('1–3 года', 'exp:1to3')
      .text('3+ года', 'exp:3plus')
  });
});

bot.callbackQuery(/^exp:(beginner|under1|1to3|3plus)$/, async ctx => {
  const state = sessions.get(ctx.from.id);
  if (!state || !state.goal || !state.location) return startQuiz(ctx);
  const experience = ctx.match[1] as keyof typeof labels.experience;
  try {
    const programCode = await saveLead(ctx, state, experience);
    sessions.delete(ctx.from.id);
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(
      `Готово ✅\n\nТвоя цель: ${labels.goal[state.goal]}\nФормат: ${labels.location[state.location]}\nОпыт: ${labels.experience[experience]}\n\nТвоя стартовая программа: ${programCode}.\n\nСохрани результат — дальше программу можно расширить под твою цель.`
    );
  } catch (error) {
    console.error('lead save error', error);
    await ctx.answerCallbackQuery({ text: 'Ошибка сохранения' });
    await ctx.reply('Не удалось сохранить результат. Попробуй ещё раз через /start.');
  }
});

bot.catch(err => console.error('Telegram error', err.error));

const server = createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, service: 'pavel-fit-official-bot' }));
    return;
  }
  res.writeHead(404);
  res.end();
});

server.listen(PORT, () => console.log(`Health server listening on :${PORT}`));

bot.start({
  onStart: info => console.log(`Bot @${info.username} started`)
}).catch(error => {
  console.error('Fatal bot error', error);
  process.exit(1);
});
