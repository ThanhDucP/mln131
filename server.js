const express=require('express');
const http=require('http');
const {Server}=require('socket.io');
const crypto=require('crypto');
const app=express(),server=http.createServer(app),io=new Server(server);
app.use(express.static('public'));
app.get('/health',(req,res)=>res.json({ok:true,app:'Vi Loi Ich Chung'}));

const TOTAL_ROUNDS=20;
const ROUND_SECONDS=30;
const MIN_PLAYERS=2,MAX_PLAYERS=50;
const BASE_POINTS=[5,5,5,10,10,10,10,20,20,30];
const pointsFor=round=>BASE_POINTS[round%BASE_POINTS.length];
const rooms=new Map();
function code(){let c;do{c=crypto.randomBytes(3).toString('hex').toUpperCase()}while(rooms.has(c));return c}
function shuffle(items){
 const result=[...items];
 for(let i=result.length-1;i>0;i--){const j=crypto.randomInt(i+1);[result[i],result[j]]=[result[j],result[i]]}
 return result;
}
function makePairs(room){
 const shuffled=shuffle(room.players.filter(p=>p.socketId||room.started).map(p=>p.id));
 room.pairs=[];
 for(let i=0;i+1<shuffled.length;i+=2){
  room.pairs.push({id:room.pairs.length,players:[shuffled[i],shuffled[i+1]],choices:{},done:false,points:{}});
 }
 room.byePlayerId=shuffled.length%2?shuffled[shuffled.length-1]:null;
}
function cooperationRate(player){
 const choices=(player.history||[]).filter(h=>h.choice==='common'||h.choice==='self');
 return choices.length?choices.filter(h=>h.choice==='common').length/choices.length:0;
}
function isGood(player){return cooperationRate(player)>=0.7}
function rankingData(room){
 return room.players.map(p=>{
  const history=p.history||[];
  const betrayalsAgainstCooperators=history.filter(h=>h.choice==='self'&&h.opponentChoice==='common').length;
  return {...p,cooperationRate:cooperationRate(p),isGood:isGood(p),betrayalsAgainstCooperators};
 });
}
function pub(room,viewerId=null){
 const ranked=rankingData(room);
 return {
  code:room.code,started:room.started,round:room.round,rounds:TOTAL_ROUNDS,basePoints:pointsFor(room.round),roundEndsAt:room.roundEndsAt||null,roundSeconds:ROUND_SECONDS,
  finalRankingPublished:!!room.finalRankingPublished,finished:room.finished,byePlayerId:room.byePlayerId,
  players:ranked.map(p=>({id:p.id,name:p.name,connected:!!p.socketId,score:p.score,history:p.history||[],cooperationRate:p.cooperationRate,isGood:p.isGood,betrayalsAgainstGood:p.betrayalsAgainstGood})),
  pairs:room.pairs.map(p=>({id:p.id,players:p.players,choices:p.done?p.choices:(viewerId!==null&&p.choices[viewerId]?{[viewerId]:p.choices[viewerId]}:{}),submittedCount:Object.keys(p.choices).length,done:p.done,points:p.points})),
 };
}
function emit(room){
 const host=io.sockets.sockets.get(room.hostId);
 if(host)host.emit('state',pub(room));
 room.players.forEach(p=>{const s=p.socketId&&io.sockets.sockets.get(p.socketId);if(s)s.emit('state',pub(room,p.id))});
}
function settlePair(room,pair){
 if(pair.done)return;
 const [a,b]=pair.players,ca=pair.choices[a],cbx=pair.choices[b],base=pointsFor(room.round);
 if(!ca||!cbx){pair.points[a]=0;pair.points[b]=0}
 else if(ca==='common'&&cbx==='common'){pair.points[a]=base;pair.points[b]=base}
 else if(ca==='self'&&cbx==='common'){pair.points[a]=base*2;pair.points[b]=0}
 else if(ca==='common'&&cbx==='self'){pair.points[a]=0;pair.points[b]=base*2}
 else {pair.points[a]=0;pair.points[b]=0}
 pair.players.forEach(id=>{
  const player=room.players.find(p=>p.id===id),opponentId=pair.players.find(other=>other!==id);
  player.score+=pair.points[id];
  player.history.push({round:room.round+1,opponentId,opponent:room.players.find(p=>p.id===opponentId).name,choice:pair.choices[id]||'timeout',opponentChoice:pair.choices[opponentId]||'timeout',points:pair.points[id]});
 });
 pair.done=true;
}
function advanceRound(room){
 if(room.timer){clearTimeout(room.timer);room.timer=null}
 if(room.round+1>=TOTAL_ROUNDS){room.finished=true;room.roundEndsAt=null;room.byePlayerId=null;emit(room);return}
 room.round++;makePairs(room);beginRoundTimer(room);emit(room);
}
function beginRoundTimer(room){
 if(room.timer)clearTimeout(room.timer);
 room.roundEndsAt=Date.now()+ROUND_SECONDS*1000;
 room.timer=setTimeout(()=>{
  if(!room.started||room.finished)return;
  room.pairs.forEach(pair=>{if(!pair.done){pair.players.forEach(id=>{if(!pair.choices[id])pair.choices[id]='timeout'});settlePair(room,pair)}});
  advanceRound(room);
 },ROUND_SECONDS*1000);
}
function playerBySocket(room,socketId){return room.players.find(p=>p.socketId===socketId)}
io.on('connection',socket=>{
 socket.on('createRoom',(payload={},cb)=>{
  const count=Number(payload.playerCount);
  if(!Number.isInteger(count)||count<MIN_PLAYERS||count>MAX_PLAYERS)
   return cb&&cb({ok:false,error:'Số người chơi phải từ 2 đến '+MAX_PLAYERS+'.'});
  const c=code(),room={code:c,hostId:socket.id,hostConnected:true,started:false,round:0,finished:false,finalRankingPublished:false,byePlayerId:null,
   players:Array.from({length:count},(_,id)=>({id,name:'Người chơi '+(id+1),score:0,socketId:null,history:[]})),pairs:[]};
  rooms.set(c,room);socket.join(c);makePairs(room);
  cb&&cb({ok:true,code:c,state:pub(room)});emit(room);
 });
 socket.on('roomInfo',({code:rawCode}={},cb)=>{
  const room=rooms.get(String(rawCode||'').trim().toUpperCase());
  if(!room)return cb&&cb({ok:false,error:'Không tìm thấy phòng. Kiểm tra mã phòng.'});
  cb&&cb({ok:true,players:room.players.map(p=>({id:p.id,name:p.name,connected:!!p.socketId,score:p.score})),started:room.started,finished:room.finished});
 });
 socket.on('joinTeam',({code:rawCode,name}={},cb)=>{
  const room=rooms.get(String(rawCode||'').trim().toUpperCase());
  if(!room)return cb&&cb({ok:false,error:'Không tìm thấy phòng. Kiểm tra mã phòng.'});
  if(room.finished)return cb&&cb({ok:false,error:'Ván chơi đã kết thúc.'});
  if(room.started)return cb&&cb({ok:false,error:'Ván chơi đã bắt đầu, không thể tham gia thêm.'});
  const playerName=String(name||'').trim().replace(/\\s+/g,' ').slice(0,30);
  if(!playerName)return cb&&cb({ok:false,error:'Nhập tên người chơi.'});
  if(room.players.some(p=>p.socketId&&p.name.toLocaleLowerCase('vi')===playerName.toLocaleLowerCase('vi')))return cb&&cb({ok:false,error:'Tên này đã được sử dụng trong phòng. Hãy chọn tên khác.'});
  const player=room.players.find(p=>!p.socketId||!io.sockets.sockets.has(p.socketId));
  if(!player)return cb&&cb({ok:false,error:'Phòng đã đủ người chơi.'});
  player.name=playerName;
  player.socketId=socket.id;socket.data.roomCode=room.code;socket.data.playerId=player.id;socket.join(room.code);
  cb&&cb({ok:true,state:pub(room,player.id),playerId:player.id});emit(room);
 });
 socket.on('startGame',({code}={},cb)=>{
  const room=rooms.get(String(code||'').toUpperCase());
  if(!room||room.hostId!==socket.id)return cb&&cb({ok:false,error:'Chỉ quản trò mới có thể bắt đầu.'});
  if(room.started||room.finished)return cb&&cb({ok:false,error:'Ván chơi đã bắt đầu hoặc đã kết thúc.'});
  const connected=room.players.filter(p=>p.socketId&&io.sockets.sockets.has(p.socketId));
  if(connected.length<MIN_PLAYERS)return cb&&cb({ok:false,error:'Cần ít nhất 2 người chơi đã tham gia.'});
  room.players=connected;
  room.players.forEach((p,id)=>{p.id=id;const playerSocket=io.sockets.sockets.get(p.socketId);if(playerSocket)playerSocket.data.playerId=id});
  room.started=true;room.round=0;makePairs(room);beginRoundTimer(room);emit(room);cb&&cb({ok:true});
 });
 socket.on('publishFinalRanking',({code}={},cb)=>{
  const room=rooms.get(String(code||'').toUpperCase());
  if(!room||room.hostId!==socket.id)return cb&&cb({ok:false,error:'Chỉ quản trò mới có thể công bố bảng xếp hạng.'});
  if(!room.finished)return cb&&cb({ok:false,error:'Chỉ có thể công bố xếp hạng sau khi kết thúc.'});
  room.finalRankingPublished=true;emit(room);cb&&cb({ok:true});
 });
 socket.on('choose',({pairId,choice}={},cb)=>{
  const room=rooms.get(socket.data.roomCode),playerId=socket.data.playerId;
  if(!room||!room.started||room.finished)return cb&&cb({ok:false,error:'Ván chơi chưa bắt đầu hoặc đã kết thúc.'});
  const pair=room.pairs.find(p=>p.id===pairId);
  if(!pair||!pair.players.includes(playerId)||pair.done)return cb&&cb({ok:false,error:'Lượt này không thuộc bạn hoặc đã khóa.'});
  if(!['common','self'].includes(choice))return cb&&cb({ok:false,error:'Lựa chọn không hợp lệ.'});
  if(pair.choices[playerId])return cb&&cb({ok:false,error:'Bạn đã chốt lựa chọn.'});
  pair.choices[playerId]=choice;
  if(pair.players.every(id=>pair.choices[id])){settlePair(room,pair);if(room.pairs.every(p=>p.done)){advanceRound(room);cb&&cb({ok:true});return}}

  cb&&cb({ok:true});emit(room);
 });
 socket.on('nextRound',({code}={},cb)=>{
  const room=rooms.get(String(code||'').toUpperCase());
  if(!room||room.hostId!==socket.id)return cb&&cb({ok:false,error:'Chỉ quản trò mới có thể chuyển lượt.'});
  if(!room.started||room.finished)return cb&&cb({ok:false,error:'Ván chơi chưa bắt đầu hoặc đã kết thúc.'});
  return cb&&cb({ok:false,error:'Lượt chơi tự chuyển khi mọi người đã chọn hoặc hết 30 giây.'});
 });
 socket.on('disconnect',()=>{
  for(const room of rooms.values()){
   if(room.hostId===socket.id){room.hostConnected=false;emit(room)}
   if(socket.data.roomCode===room.code&&Number.isInteger(socket.data.playerId)){
    const p=room.players.find(p=>p.id===socket.data.playerId);if(p&&p.socketId===socket.id)p.socketId=null;emit(room)
   }
  }
 });
});
const port=process.env.PORT||3000;server.listen(port,'0.0.0.0',()=>console.log('Game listening on '+port));
