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
const RECONNECT_GRACE_SECONDS = 30;
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
  const visibleChoices = match.done
    ? { ...match.choices }
    : (viewerId !== null && Object.prototype.hasOwnProperty.call(match.choices, viewerId) ? { [viewerId]: match.choices[viewerId] } : {});
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
    completedMatches: room.completedMatches, totalMatches: room.players.length * GAMES_PER_PLAYER / 2,
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
 room.matches=[];room.matchQueue=[];room.activeMatches=new Map();room.busyPlayers=new Set();room.completedMatches=0;room.nextMatchId=0;
 room.players.forEach(p=>{p.remainingPoints=shuffle(BASE_POINTS);p.gamesPlayed=0;p.forfeited=false;p.disconnectTimer=null;p.history=[];});
}
function findCommonPoint(a,b){return a.remainingPoints.find(x=>b.remainingPoints.includes(x));}
function settleMatch(room,m,timedOut=false,forfeitId=null){
 if(m.done)return;if(m.timer)clearTimeout(m.timer);m.timer=null;
 const [a,b]=m.players,ca=m.choices[a],cb=m.choices[b],complete=['common','self'].includes(ca)&&['common','self'].includes(cb);
 m.points[a]=0;m.points[b]=0;
 if(forfeitId!==null){const survivor=m.players.find(id=>id!==forfeitId);if(!room.players.find(p=>p.id===survivor)?.forfeited)m.points[survivor]=m.basePoints[survivor];m.choices[forfeitId]='forfeit';}
 else if(complete){if(ca==='common'&&cb==='common'){m.points[a]=m.basePoints[a];m.points[b]=m.basePoints[b];}else if(ca==='self'&&cb==='common')m.points[a]=2*m.basePoints[a];else if(ca==='common'&&cb==='self')m.points[b]=2*m.basePoints[b];}
 m.players.forEach(id=>{const p=room.players.find(x=>x.id===id);if(!p)return;if(p.disconnectTimer){clearTimeout(p.disconnectTimer);p.disconnectTimer=null;}const oid=m.players.find(x=>x!==id),op=room.players.find(x=>x.id===oid);p.score+=m.points[id]||0;p.gamesPlayed++;p.history.push({round:p.gamesPlayed,gameNumber:p.gamesPlayed,matchId:m.id,opponentId:oid,opponent:op?.name||'Người chơi đã rời',choice:m.choices[id]||'timeout',opponentChoice:m.choices[oid]||'timeout',points:m.points[id]||0,basePoints:m.basePoints[id],timedOut:timedOut||!complete,forfeited:forfeitId===id});});
 if(forfeitId!==null){const p=room.players.find(x=>x.id===forfeitId);if(p){p.forfeited=true;p.remainingPoints=[];}}
 m.done=true;m.endsAt=null;room.activeMatches.delete(m.id);m.players.forEach(id=>room.busyPlayers.delete(id));room.completedMatches++;
}
function startAvailableMatches(room){
 if(!room.started||room.finished)return;let started;
 do{started=false;const free=room.players.filter(p=>!p.forfeited&&p.gamesPlayed<GAMES_PER_PLAYER&&p.socketId&&io.sockets.sockets.has(p.socketId)&&!room.busyPlayers.has(p.id));
 outer:for(let i=0;i<free.length;i++)for(let j=i+1;j<free.length;j++){const a=free[i],b=free[j],points=findCommonPoint(a,b);if(points===undefined)continue;
 a.remainingPoints.splice(a.remainingPoints.indexOf(points),1);b.remainingPoints.splice(b.remainingPoints.indexOf(points),1);
 const m={id:room.nextMatchId++,players:[a.id,b.id],choices:{},points:{},done:false,basePoints:{[a.id]:points,[b.id]:points},gameNumbers:{[a.id]:a.gamesPlayed+1,[b.id]:b.gamesPlayed+1},pointType:points,endsAt:Date.now()+ROUND_SECONDS*1000,timer:null,remainingMs:ROUND_SECONDS*1000};
 room.matches.push(m);room.activeMatches.set(m.id,m);room.busyPlayers.add(a.id);room.busyPlayers.add(b.id);
 m.timer=setTimeout(()=>{if(m.done||!room.started||room.finished)return;settleMatch(room,m,true);startAvailableMatches(room);emit(room);finishIfComplete(room);},ROUND_SECONDS*1000);started=true;break outer;
 }}while(started);
}
function finishIfComplete(room) {
  if (room.started && room.players.every(p => p.forfeited || p.gamesPlayed >= GAMES_PER_PLAYER) && room.activeMatches.size === 0) {
    room.finished = true;
    room.players.forEach(p => {
      if (!p.forfeited && p.gamesPlayed !== GAMES_PER_PLAYER) {
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
    
    const playerName = String(name || '').trim().replace(/\\s+/g, ' ').slice(0, 30);
    const r = room.started ? room.players.find(p=>!p.forfeited&&!p.socketId&&p.disconnectTimer&&p.name.toLocaleLowerCase('vi')===playerName.toLocaleLowerCase('vi')) : null;
    if(r){clearTimeout(r.disconnectTimer);r.disconnectTimer=null;r.socketId=socket.id;socket.data.roomCode=room.code;socket.data.playerId=r.id;socket.join(room.code);const m=[...room.activeMatches.values()].find(x=>x.players.includes(r.id));if(m&&m.pausedForDisconnect){m.pausedForDisconnect=false;m.endsAt=Date.now()+m.remainingMs;m.timer=setTimeout(()=>{if(m.done||room.finished)return;settleMatch(room,m,true);startAvailableMatches(room);emit(room);finishIfComplete(room);},m.remainingMs);}cb&&cb({ok:true,state:pub(room,r.id,false),playerId:r.id,reconnected:true});startAvailableMatches(room);emit(room);return;}
    if(room.started)return cb&&cb({ok:false,error:'Ván chơi đã bắt đầu. Chỉ người mất kết nối mới có thể quay lại bằng đúng tên cũ trong 30 giây.'});
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
        const p=playerBySocket(room,socket.id);
        if(p&&p.socketId===socket.id){p.socketId=null;if(room.started&&!room.finished&&!p.forfeited){const m=[...room.activeMatches.values()].find(x=>x.players.includes(p.id));if(m&&!m.done){if(m.timer)clearTimeout(m.timer);m.timer=null;m.remainingMs=Math.max(1000,(m.endsAt||Date.now())-Date.now());m.endsAt=null;m.pausedForDisconnect=true;}p.disconnectTimer=setTimeout(()=>{p.disconnectTimer=null;if(p.socketId||p.forfeited||room.finished)return;const active=[...room.activeMatches.values()].find(x=>x.players.includes(p.id));if(active)settleMatch(room,active,true,p.id);else{p.forfeited=true;p.remainingPoints=[];}startAvailableMatches(room);emit(room);finishIfComplete(room);},RECONNECT_GRACE_SECONDS*1000);}}
        emit(room);
      }
    }
  });
});

const port = process.env.PORT || 3000;
server.listen(port, '0.0.0.0', () => console.log('Game listening on ' + port));
