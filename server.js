const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
app.use(express.static('public'));
app.get('/health', (req, res) => res.json({ ok: true, app: 'Vi Loi Ich Chung' }));

const GAMES_PER_PLAYER = 20;
const ROUND_SECONDS = 30;
const MIN_PLAYERS = 2;
const MAX_PLAYERS = 50;
const BASE_POINTS = [5, 5, 5, 5, 5, 5, 10, 10, 10, 10, 10, 10, 10, 10, 20, 20, 20, 20, 30, 30];
const rooms = new Map();

function code() {
  let value;
  do { value = crypto.randomBytes(3).toString('hex').toUpperCase(); } while (rooms.has(value));
  return value;
}
function shuffle(items) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
function cooperationRate(player) {
  const choices = (player.history || []).filter(h => h.choice === 'common' || h.choice === 'self');
  return choices.length ? choices.filter(h => h.choice === 'common').length / choices.length : 0;
}
function rankingData(room) {
  return room.players.map(p => {
    const history = p.history || [];
    const betrayalsAgainstCooperators = history.filter(h => h.choice === 'self' && h.opponentChoice === 'common').length;
    return { ...p, cooperationRate: cooperationRate(p), betrayalsAgainstCooperators };
  });
}
function matchForViewer(match, viewerId, isHost) {
  const visibleChoices = match.done || isHost
    ? { ...match.choices }
    : (Object.prototype.hasOwnProperty.call(match.choices, viewerId) ? { [viewerId]: match.choices[viewerId] } : {});
  return {
    id: match.id,
    players: [...match.players],
    choices: visibleChoices,
    submittedCount: Object.keys(match.choices).length,
    done: match.done,
    points: match.done ? { ...match.points } : {},
    basePoints: { ...match.basePoints },
    endsAt: match.endsAt || null,
    gameNumbers: { ...match.gameNumbers }
  };
}
function pub(room, viewerId = null, isHost = false) {
  const ranked = rankingData(room);
  const activeMatches = [...room.activeMatches.values()];
  const ownMatch = viewerId === null ? null : activeMatches.find(m => m.players.includes(viewerId));
  const playerPayload = ranked.map(p => ({
    id: p.id, name: p.name, connected: !!p.socketId, score: p.score,
    gamesPlayed: p.gamesPlayed, gamesTotal: GAMES_PER_PLAYER,
    history: p.history || [], cooperationRate: p.cooperationRate,
    betrayalsAgainstCooperators: p.betrayalsAgainstCooperators
  }));
  return {
    code: room.code, started: room.started, finished: room.finished,
    finalRankingPublished: !!room.finalRankingPublished,
    gamesPerPlayer: GAMES_PER_PLAYER, roundSeconds: ROUND_SECONDS,
    completedMatches: room.completedMatches, totalMatches: room.matches.length,
    players: playerPayload,
    activeMatches: isHost ? activeMatches.map(m => matchForViewer(m, null, true)) : [],
    activeMatch: ownMatch ? matchForViewer(ownMatch, viewerId, false) : null,
    waitingPlayerIds: room.started ? room.players.filter(p => p.gamesPlayed < GAMES_PER_PLAYER && !room.busyPlayers.has(p.id)).map(p => p.id) : [],
    remainingMatches: room.matchQueue.length
  };
}
function emit(room) {
  const host = io.sockets.sockets.get(room.hostId);
  if (host) host.emit('state', pub(room, null, true));
  room.players.forEach(p => {
    const s = p.socketId && io.sockets.sockets.get(p.socketId);
    if (s) s.emit('state', pub(room, p.id, false));
  });
}
function createSchedule(room) {
  const players = room.players;
  const n = players.length;
  const personalPoints = players.map(() => shuffle(BASE_POINTS));
  const matches = [];
  let id = 0;
  // A balanced 20-degree schedule: each player contributes 10 outgoing pairings
  // and receives 10 incoming pairings, so every player is scheduled exactly 20 times.
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < 10; k++) {
      const offset = (k % (n - 1)) + 1;
      const j = (i + offset) % n;
      matches.push({
        id: id++, players: [i, j], choices: {}, points: {}, done: false,
        basePoints: {}, gameNumbers: {}, endsAt: null, timer: null
      });
    }
  }
  const appearances = Array(n).fill(0);
  matches.forEach(match => {
    match.players.forEach(playerId => {
      const gameNumber = ++appearances[playerId];
      match.gameNumbers[playerId] = gameNumber;
      match.basePoints[playerId] = personalPoints[playerId][gameNumber - 1];
    });
  });
  // Shuffle execution order without changing each player's preassigned game number/point value.
  room.matches = shuffle(matches);
  room.matchQueue = [...room.matches];
  room.activeMatches = new Map();
  room.busyPlayers = new Set();
  room.completedMatches = 0;
}
function settleMatch(room, match, timedOut = false) {
  if (match.done) return;
  if (match.timer) clearTimeout(match.timer);
  match.timer = null;
  const [a, b] = match.players;
  const ca = match.choices[a];
  const cb = match.choices[b];
  const complete = (ca === 'common' || ca === 'self') && (cb === 'common' || cb === 'self');
  match.points[a] = 0;
  match.points[b] = 0;
  if (complete) {
    const baseA = match.basePoints[a];
    const baseB = match.basePoints[b];
    if (ca === 'common' && cb === 'common') {
      match.points[a] = baseA;
      match.points[b] = baseB;
    } else if (ca === 'self' && cb === 'common') {
      match.points[a] = baseA * 2;
    } else if (ca === 'common' && cb === 'self') {
      match.points[b] = baseB * 2;
    }
  }
  match.players.forEach(playerId => {
    const player = room.players.find(p => p.id === playerId);
    const opponentId = match.players.find(id => id !== playerId);
    const choice = match.choices[playerId] || 'timeout';
    const opponentChoice = match.choices[opponentId] || 'timeout';
    player.score += match.points[playerId];
    player.gamesPlayed += 1;
    player.history.push({
      round: player.gamesPlayed,
      gameNumber: match.gameNumbers[playerId],
      matchId: match.id,
      opponentId,
      opponent: room.players.find(p => p.id === opponentId).name,
      choice, opponentChoice,
      points: match.points[playerId],
      basePoints: match.basePoints[playerId],
      timedOut: timedOut || !complete
    });
  });
  match.done = true;
  match.endsAt = null;
  room.activeMatches.delete(match.id);
  match.players.forEach(id => room.busyPlayers.delete(id));
  room.completedMatches += 1;
}
function startAvailableMatches(room) {
  if (!room.started || room.finished) return;
  let startedAny;
  do {
    startedAny = false;
    for (let i = 0; i < room.matchQueue.length; i++) {
      const match = room.matchQueue[i];
      if (match.players.some(id => room.busyPlayers.has(id))) continue;
      room.matchQueue.splice(i, 1);
      i--;
      match.endsAt = Date.now() + ROUND_SECONDS * 1000;
      room.activeMatches.set(match.id, match);
      match.players.forEach(id => room.busyPlayers.add(id));
      match.timer = setTimeout(() => {
        if (match.done || !room.started || room.finished) return;
        settleMatch(room, match, true);
        startAvailableMatches(room);
        emit(room);
        finishIfComplete(room);
      }, ROUND_SECONDS * 1000);
      startedAny = true;
    }
  } while (startedAny);
}
function finishIfComplete(room) {
  if (room.started && room.matchQueue.length === 0 && room.activeMatches.size === 0) {
    room.finished = true;
    room.players.forEach(p => {
      if (p.gamesPlayed !== GAMES_PER_PLAYER) {
        console.error('Schedule invariant failed', room.code, p.id, p.gamesPlayed);
      }
    });
    emit(room);
  }
}
function playerBySocket(room, socketId) {
  return room.players.find(p => p.socketId === socketId);
}

io.on('connection', socket => {
  socket.on('createRoom', (payload = {}, cb) => {
    const count = Number(payload.playerCount);
    if (!Number.isInteger(count) || count < MIN_PLAYERS || count > MAX_PLAYERS) {
      return cb && cb({ ok: false, error: 'Số người chơi phải từ 2 đến ' + MAX_PLAYERS + '.' });
    }
    const c = code();
    const room = {
      code: c, hostId: socket.id, hostConnected: true, started: false, finished: false,
      finalRankingPublished: false, players: Array.from({ length: count }, (_, id) => ({
        id, name: 'Người chơi ' + (id + 1), score: 0, socketId: null, history: [], gamesPlayed: 0
      })),
      matches: [], matchQueue: [], activeMatches: new Map(), busyPlayers: new Set(), completedMatches: 0
    };
    rooms.set(c, room);
    socket.join(c);
    cb && cb({ ok: true, code: c, state: pub(room, null, true) });
    emit(room);
  });

  socket.on('roomInfo', ({ code: rawCode } = {}, cb) => {
    const room = rooms.get(String(rawCode || '').trim().toUpperCase());
    if (!room) return cb && cb({ ok: false, error: 'Không tìm thấy phòng. Kiểm tra mã phòng.' });
    cb && cb({
      ok: true,
      players: room.players.map(p => ({ id: p.id, name: p.name, connected: !!p.socketId, score: p.score, gamesPlayed: p.gamesPlayed })),
      started: room.started, finished: room.finished
    });
  });

  socket.on('joinTeam', ({ code: rawCode, name } = {}, cb) => {
    const room = rooms.get(String(rawCode || '').trim().toUpperCase());
    if (!room) return cb && cb({ ok: false, error: 'Không tìm thấy phòng. Kiểm tra mã phòng.' });
    if (room.finished) return cb && cb({ ok: false, error: 'Ván chơi đã kết thúc.' });
    if (room.started) return cb && cb({ ok: false, error: 'Ván chơi đã bắt đầu, không thể tham gia thêm.' });
    const playerName = String(name || '').trim().replace(/\s+/g, ' ').slice(0, 30);
    if (!playerName) return cb && cb({ ok: false, error: 'Nhập tên người chơi.' });
    if (room.players.some(p => p.socketId && p.name.toLocaleLowerCase('vi') === playerName.toLocaleLowerCase('vi'))) {
      return cb && cb({ ok: false, error: 'Tên này đã được sử dụng trong phòng. Hãy chọn tên khác.' });
    }
    const player = room.players.find(p => !p.socketId || !io.sockets.sockets.has(p.socketId));
    if (!player) return cb && cb({ ok: false, error: 'Phòng đã đủ người chơi.' });
    player.name = playerName;
    player.socketId = socket.id;
    socket.data.roomCode = room.code;
    socket.data.playerId = player.id;
    socket.join(room.code);
    cb && cb({ ok: true, state: pub(room, player.id, false), playerId: player.id });
    emit(room);
  });

  socket.on('startGame', ({ code: rawCode } = {}, cb) => {
    const room = rooms.get(String(rawCode || '').toUpperCase());
    if (!room || room.hostId !== socket.id) return cb && cb({ ok: false, error: 'Chỉ quản trò mới có thể bắt đầu.' });
    if (room.started || room.finished) return cb && cb({ ok: false, error: 'Ván chơi đã bắt đầu hoặc đã kết thúc.' });
    const connected = room.players.filter(p => p.socketId && io.sockets.sockets.has(p.socketId));
    if (connected.length < MIN_PLAYERS) return cb && cb({ ok: false, error: 'Cần ít nhất 2 người chơi đã tham gia.' });
    room.players = connected;
    room.players.forEach((p, id) => {
      p.id = id;
      const playerSocket = io.sockets.sockets.get(p.socketId);
      if (playerSocket) playerSocket.data.playerId = id;
    });
    room.started = true;
    createSchedule(room);
    startAvailableMatches(room);
    emit(room);
    cb && cb({ ok: true });
  });

  socket.on('publishFinalRanking', ({ code: rawCode } = {}, cb) => {
    const room = rooms.get(String(rawCode || '').toUpperCase());
    if (!room || room.hostId !== socket.id) return cb && cb({ ok: false, error: 'Chỉ quản trò mới có thể công bố bảng xếp hạng.' });
    if (!room.finished) return cb && cb({ ok: false, error: 'Chỉ có thể công bố xếp hạng sau khi kết thúc.' });
    room.finalRankingPublished = true;
    emit(room);
    cb && cb({ ok: true });
  });

  socket.on('choose', ({ matchId, choice } = {}, cb) => {
    const room = rooms.get(socket.data.roomCode);
    const playerId = socket.data.playerId;
    if (!room || !room.started || room.finished) return cb && cb({ ok: false, error: 'Ván chơi chưa bắt đầu hoặc đã kết thúc.' });
    const match = room.activeMatches.get(matchId);
    if (!match || !match.players.includes(playerId) || match.done) return cb && cb({ ok: false, error: 'Trận này không thuộc bạn hoặc đã khóa.' });
    if (!['common', 'self'].includes(choice)) return cb && cb({ ok: false, error: 'Lựa chọn không hợp lệ.' });
    if (match.choices[playerId]) return cb && cb({ ok: false, error: 'Bạn đã chốt lựa chọn.' });
    match.choices[playerId] = choice;
    if (match.players.every(id => ['common', 'self'].includes(match.choices[id]))) {
      settleMatch(room, match, false);
      startAvailableMatches(room);
      finishIfComplete(room);
    }
    cb && cb({ ok: true });
    emit(room);
  });

  socket.on('nextRound', (_payload = {}, cb) => cb && cb({ ok: false, error: 'Các trận tự kết thúc độc lập khi cả hai đã chọn hoặc hết 30 giây.' }));

  socket.on('disconnect', () => {
    for (const room of rooms.values()) {
      if (room.hostId === socket.id) { room.hostConnected = false; emit(room); }
      if (socket.data.roomCode === room.code && Number.isInteger(socket.data.playerId)) {
        const p = playerBySocket(room, socket.id);
        if (p && p.socketId === socket.id) p.socketId = null;
        emit(room);
      }
    }
  });
});

const port = process.env.PORT || 3000;
server.listen(port, '0.0.0.0', () => console.log('Game listening on ' + port));
