import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const baseURL = process.env.BASE_URL || 'https://vi-loi-ich-chung-game.onrender.com/';
const browser = await chromium.launch({ headless: true });
const contexts = [];
const pages = [];
const timeout = ms => new Promise(resolve => setTimeout(resolve, ms));

async function newSession() {
  const context = await browser.newContext();
  contexts.push(context);
  const page = await context.newPage();
  page.setDefaultTimeout(15_000);
  await page.goto(baseURL, { waitUntil: 'domcontentloaded', timeout: 90_000 });
  await page.locator('#create').waitFor({ state: 'visible' });
  pages.push(page);
  return page;
}

async function waitFor(predicate, description, ms = 120_000) {
  const started = Date.now();
  while (Date.now() - started < ms) {
    if (await predicate()) return;
    await timeout(250);
  }
  throw new Error('Timed out waiting for: ' + description);
}

try {
  const host = await newSession();
  await host.locator('#create').click();
  await host.locator('#hostCode').waitFor({ state: 'visible' });
  const code = (await host.locator('#hostCode').innerText()).trim();
  assert.match(code, /^[A-Z0-9]{6}$/i, 'room code should be generated');

  const players = [];
  for (const name of ['Integration Alice', 'Integration Bob', 'Integration Carol']) {
    const page = await newSession();
    await page.locator('#roomCode').fill(code);
    await page.locator('#playerName').fill(name);
    await page.locator('#join').click();
    await page.locator('#game').waitFor({ state: 'visible' });
    players.push(page);
  }

  await waitFor(async () => (await host.locator('#teamList .team').count()) === 3, 'three joined players');
  await host.locator('#start').click();
  await waitFor(async () => (await host.locator('#pairs .pair').count()) > 0, 'first pair scheduled');
  const initialActive = await host.locator('#pairs .pair').count();
  assert.ok(initialActive >= 1, 'at least one match should start');
  const initialChoicePages = [];
  for (let i = 0; i < players.length; i++) {
    if (await players[i].locator('[data-choice="common"]').isVisible().catch(() => false)) initialChoicePages.push(i);
  }
  assert.equal(initialChoicePages.length, 2, 'exactly the two matched players should see active choices');

  // Leave the first match unanswered to exercise the real 30-second server timer.
  await waitFor(async () => {
    const label = await host.locator('#roundLabel').innerText();
    return /Đã xong [1-9]\d* \/ 30 trận/.test(label);
  }, 'first match timeout to settle', 45_000);
  const timedOutVisible = await Promise.all(players.map(async p =>
    (await p.locator('#playerHistory').innerText().catch(() => '')).includes('Hết giờ')
  ));
  assert.ok(timedOutVisible.some(Boolean), 'a timed-out choice should appear in player history');

  // A new participant must be appended to the room even after the game has started.
  const latePlayer = await newSession();
  await latePlayer.locator('#roomCode').fill(code);
  await latePlayer.locator('#playerName').fill('Integration Dave');
  await latePlayer.locator('#join').click();
  await latePlayer.locator('#playerView').waitFor({ state: 'visible' });
  await waitFor(async () => (await host.locator('#teamList .team').count()) === 4, 'late joiner appended to live roster');
  players.push(latePlayer);

  // Submit choices from independent browser contexts; the first active pair is chosen nearly simultaneously.
  let firstConcurrentPair = false;
  const clickActiveChoices = async () => Promise.all(players.map(async p => {
    const button = p.locator('[data-choice="common"]');
    if (await button.isVisible().catch(() => false) && await button.isEnabled().catch(() => false)) {
      if (!firstConcurrentPair) firstConcurrentPair = true;
      await button.click({ timeout: 5_000 }).catch(() => {});
    }
  }));
  await waitFor(async () => {
    await clickActiveChoices();
    return firstConcurrentPair;
  }, 'concurrent player choices', 20_000);

  // Keep cooperating whenever a new match appears, until all 30 scheduled matches are settled.
  await waitFor(async () => {
    await clickActiveChoices();
    const label = await host.locator('#roundLabel').innerText();
    return label.includes('Đã kết thúc');
  }, 'game to finish all 40 matches', 240_000);

  const completedLabel = await host.locator('#roundLabel').innerText();
  assert.match(completedLabel, /Đã kết thúc/);
  for (const p of players) {
    const text = await p.locator('#playerScoreline').innerText();
    assert.match(text, /20\/20 trận hoàn thành/, 'each player must complete exactly 20 matches');
    const history = await p.locator('#playerHistory').innerText();
    assert.ok(history.includes('Điểm nhận:'), 'completed history should contain settled score values');
  }
  const teamCards = host.locator('#teamList .team');
  assert.equal(await teamCards.count(), 4);
  for (let i = 0; i < 4; i++) {
    assert.match(await teamCards.nth(i).innerText(), /20 \/ 20 trận/);
  }

  console.log(JSON.stringify({
    result: 'PASS',
    baseURL,
    sessions: 5,
    players: 4,
    matchesCompleted: 40,
    gamesPerPlayer: [20, 20, 20, 20],
    checks: ['room creation, unbounded roster and late joining', 'pairing exposes choices to exactly two players', '30-second timeout settles a match', 'choices submitted from independent browser contexts', 'cooperative scoring/history rendered', 'game ends after 20 matches per player, including a late joiner']
  }, null, 2));
} catch (error) {
  console.error('INTEGRATION TEST FAILED:', error);
  process.exitCode = 1;
} finally {
  for (const context of contexts) await context.close().catch(() => {});
  await browser.close().catch(() => {});
}
