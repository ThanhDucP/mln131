const express=require('express');
const http=require('http');
const {Server}=require('socket.io');
const crypto=require('crypto');
const app=express(),server=http.createServer(app),io=new Server(server);
app.use(express.static('public'));
app.get('/health',(req,res)=>res.json({ok:true,app:'Vi Loi Ich Chung'}));

const TEAM_NAMES=['Nhóm 1','Nhóm 3','Nhóm 4','Nhóm 5','Nhóm 6','Nhóm 7'];
const PLAYER_NAMES=['Người chơi 1','Người chơi 2'];
const BASE_POINTS=[5,5,5,10,10,10,10,20,20,30];
const SCENARIOS=[
 ['Hội nghị Diên Hồng (1284)','Bạn là một đại diện địa phương được triệu tập khi quân Nguyên chuẩn bị xâm lược Đại Việt. Triều đình cần các địa phương phối hợp chuẩn bị lương thực, quân lính và phòng thủ; nếu góp sức, địa phương bạn phải chịu thêm gánh nặng và có thể thiếu nguồn lực riêng.','Cam kết đóng góp theo khả năng và phối hợp kế hoạch phòng thủ chung','Giấu bớt lương thực, quân lực để giữ an toàn và lợi ích cho địa phương mình'],
 ['Trước cuộc kháng chiến chống Nguyên lần hai (1285)','Bạn là một tướng địa phương biết một tuyến đường quân sự quan trọng. Đồng minh cần thông tin để bảo vệ dân và quân, nhưng tiết lộ cũng khiến gia đình, quê nhà của bạn đối mặt nguy hiểm.','Chia sẻ thông tin chính xác với lực lượng kháng chiến và cùng tìm cách bảo vệ dân','Giữ kín hoặc bán thông tin để đổi lấy sự an toàn cho mình'],
 ['Trận Bạch Đằng (1288)','Bạn là người dân địa phương thông thạo thủy triều, được lực lượng nhà Trần nhờ hỗ trợ kế hoạch trên sông. Việc phối hợp có thể giúp đánh bại đối phương nhưng nếu thất bại, làng bạn sẽ bị trả đũa.','Phối hợp dẫn đường, giữ bí mật kế hoạch và hỗ trợ sơ tán dân','Tiết lộ kế hoạch cho đối phương để tránh bị liên lụy'],
 ['Khởi nghĩa Lam Sơn (1418–1427)','Bạn là người quản lý kho lương ở vùng nghĩa quân hoạt động. Dân trong vùng cũng đang thiếu ăn; nghĩa quân cần lương thực để tiếp tục chiến đấu, còn bạn phải bảo đảm gia đình và làng mình sống sót.','Công khai lượng lương còn lại và cùng phân phối phần có thể chia sẻ','Giấu kho lương, chỉ ưu tiên người thân và mặc kệ lực lượng phối hợp'],
 ['Cuộc vây hãm thành Đông Quan (1426–1427)','Bạn là người đưa tin có thể giúp các cánh quân Lam Sơn phối hợp. Đối phương hứa thưởng lớn nếu bạn cung cấp đường đi và kế hoạch; từ chối đồng nghĩa bạn bỏ lỡ cơ hội đổi đời.','Giữ lời cam kết, chuyển tin chính xác để các cánh quân phối hợp','Nhận thưởng và tiết lộ kế hoạch của đồng minh'],
 ['Chiến dịch Ngọc Hồi–Đống Đa (1789)','Bạn là người dân được huy động hỗ trợ đoàn quân của Quang Trung tiến ra Bắc. Gia đình bạn cần nhân lực và lương thực, nhưng chiến dịch cần đường đi, hậu cần và sự hỗ trợ của địa phương trong thời gian ngắn.','Thống nhất mức đóng góp khả thi và hỗ trợ hậu cần theo kế hoạch chung','Tự ý giữ nguồn lực hoặc báo đường hành quân cho đối phương để tránh thiệt hại riêng'],
 ['Nạn đói năm 1945','Bạn là người quản lý một kho thóc ở miền Bắc Việt Nam trong lúc nạn đói lan rộng. Kho thóc cần được bảo toàn, nhưng nhiều gia đình quanh bạn đang thiếu ăn; việc chia sẻ có rủi ro khiến kho cạn trước khi nguồn tiếp tế đến.','Kiểm kê minh bạch và phối hợp phân phối phần lương thực có thể cứu trợ','Tích trữ hoặc tuồn thóc ra ngoài để bảo vệ lợi ích của nhóm mình'],
 ['Cách mạng Tháng Tám năm 1945','Bạn là một liên lạc viên trong mạng lưới vận động giành chính quyền ở địa phương. Các nhóm cần thống nhất thời điểm và thông tin; nếu hành động thiếu phối hợp, người dân có thể gặp nguy hiểm.','Chia sẻ thông tin đã xác minh và phối hợp hành động với các nhóm khác','Giữ thông tin cho riêng nhóm mình để giành vị thế và quyền lợi sau biến động'],
 ['Hội nghị Fontainebleau và tình hình Việt–Pháp năm 1946','Bạn là thành viên một đoàn đàm phán hư cấu đang cân nhắc thỏa thuận nhằm tránh xung đột. Thỏa hiệp có thể giữ hòa bình trước mắt nhưng cũng có nguy cơ bị lợi dụng; phá vỡ cam kết có thể bảo vệ lợi ích ngắn hạn nhưng làm mất lòng tin.','Tuân thủ điều khoản đã thống nhất, đồng thời ghi nhận vi phạm và yêu cầu cơ chế kiểm chứng','Âm thầm phá cam kết để tạo lợi thế riêng, dù có thể khiến đối tác mất lòng tin'],
 ['Hiệp định Sơ bộ Việt–Pháp (6/3/1946)','Bạn là một cán bộ địa phương hư cấu được giao chuẩn bị thực hiện chỉ thị trong bối cảnh Việt Nam tìm cách tránh xung đột khi lực lượng Pháp trở lại miền Bắc. Thỏa thuận mở ra thời gian thương lượng nhưng lòng tin mong manh; địa phương bạn lo rằng hợp tác sẽ khiến mình chịu rủi ro nếu bên kia không giữ cam kết.','Phối hợp thực hiện phần cam kết, đồng thời theo dõi và báo cáo vi phạm bằng chứng cứ','Tự ý phá thỏa thuận hoặc cung cấp thông tin sai để giành lợi thế trước mắt, dù có thể làm suy giảm lòng tin']
];
const rooms=new Map();
function code(){let c;do{c=crypto.randomBytes(3).toString('hex').toUpperCase()}while(rooms.has(c));return c}
function pairsFor(round){
 const arr=[0,1,2,3,4,5],fixed=arr[5],rot=arr.slice(0,5);
 for(let i=0;i<round%5;i++)rot.unshift(rot.pop());
 const base=[[fixed,rot[0]],[rot[1],rot[4]],[rot[2],rot[3]]];
 if(round>=5)base.forEach(p=>p.reverse());
 return base;
}
function pub(room,viewerTeamId=null){
 return {code:room.code,mode:room.mode,hostConnected:room.hostConnected,started:room.started,round:room.round,scenarios:SCENARIOS.length,basePoints:BASE_POINTS[room.round]||0,scenario:SCENARIOS[room.round]||null,
  teams:room.teams.map(t=>({id:t.id,name:t.name,connected:!!t.socketId,score:t.score,joined:!!t.socketId})),
  pairs:room.pairs.map(p=>({id:p.id,teams:p.teams,choices:p.done?p.choices:(viewerTeamId!==null&&p.choices[viewerTeamId]?{[viewerTeamId]:p.choices[viewerTeamId]}:{}),submittedCount:Object.keys(p.choices).length,done:p.done,points:p.points})),finished:room.finished};
}
function emit(room){
 const host=io.sockets.sockets.get(room.hostId);
 if(host)host.emit('state',pub(room));
 room.teams.forEach(t=>{const participant=t.socketId&&io.sockets.sockets.get(t.socketId);if(participant)participant.emit('state',pub(room,t.id))});
}
function makePairs(room){
 const list=room.mode==='duo'?[[0,1]]:pairsFor(room.round);
 room.pairs=list.map((teams,id)=>({id,teams,choices:{},done:false,points:{}}));
}
io.on('connection',socket=>{
 socket.on('createRoom',(payload={},cb)=>{
  const mode=payload.mode==='duo'?'duo':'groups';
  const names=mode==='duo'?PLAYER_NAMES:TEAM_NAMES;
  const c=code(),room={code:c,mode,hostId:socket.id,hostConnected:true,started:false,round:0,finished:false,
   teams:names.map((name,id)=>({id,name,score:0,socketId:null})),pairs:[]};
  rooms.set(c,room);socket.join(c);makePairs(room);
  cb&&cb({ok:true,code:c,state:pub(room)});emit(room);
 });
 socket.on('roomInfo',({code:rawCode}={},cb)=>{
  const room=rooms.get(String(rawCode||'').trim().toUpperCase());
  if(!room)return cb&&cb({ok:false,error:'Không tìm thấy phòng. Kiểm tra mã phòng.'});
  cb&&cb({ok:true,mode:room.mode,teams:room.teams.map(t=>({id:t.id,name:t.name,connected:!!t.socketId,score:t.score})),started:room.started,finished:room.finished});
 });
 socket.on('joinTeam',({code:rawCode,name}={},cb)=>{
  const room=rooms.get(String(rawCode||'').trim().toUpperCase());
  if(!room)return cb&&cb({ok:false,error:'Không tìm thấy phòng. Kiểm tra mã phòng.'});
  if(room.finished)return cb&&cb({ok:false,error:'Ván chơi đã kết thúc.'});
  if(room.started)return cb&&cb({ok:false,error:'Ván chơi đã bắt đầu, không thể tham gia thêm.'});
  const team=room.teams.find(t=>t.name===name);
  if(!team)return cb&&cb({ok:false,error:'Tên người chơi/nhóm không hợp lệ. Hãy tải lại danh sách từ mã phòng.'});
  if(team.socketId&&io.sockets.sockets.has(team.socketId))return cb&&cb({ok:false,error:'Vị trí này đã đăng nhập trên thiết bị khác.'});
  team.socketId=socket.id;socket.data.roomCode=room.code;socket.data.teamId=team.id;socket.join(room.code);
  cb&&cb({ok:true,state:pub(room,team.id),teamId:team.id});emit(room);
 });
 socket.on('startGame',({code}={},cb)=>{
  const room=rooms.get(String(code||'').toUpperCase());
  if(!room||room.hostId!==socket.id)return cb&&cb({ok:false,error:'Chỉ quản trò mới có thể bắt đầu.'});
  if(room.started||room.finished)return cb&&cb({ok:false,error:'Ván chơi đã bắt đầu hoặc đã kết thúc.'});
  if(room.mode==='duo'&&!room.teams.every(t=>t.socketId&&io.sockets.sockets.has(t.socketId)))
   return cb&&cb({ok:false,error:'Chế độ 2 người chơi cần cả Người chơi 1 và Người chơi 2 vào phòng trước.'});
  room.started=true;makePairs(room);emit(room);cb&&cb({ok:true});
 });
 socket.on('choose',({pairId,choice}={},cb)=>{
  const room=rooms.get(socket.data.roomCode),teamId=socket.data.teamId;
  if(!room||!room.started||room.finished)return cb&&cb({ok:false,error:'Ván chơi chưa bắt đầu hoặc đã kết thúc.'});
  const pair=room.pairs.find(p=>p.id===pairId);
  if(!pair||!pair.teams.includes(teamId)||pair.done)return cb&&cb({ok:false,error:'Lượt này không thuộc người chơi/nhóm của bạn hoặc đã khóa.'});
  if(!['common','self'].includes(choice))return cb&&cb({ok:false,error:'Lựa chọn không hợp lệ.'});
  if(pair.choices[teamId])return cb&&cb({ok:false,error:'Bạn đã chốt lựa chọn.'});
  pair.choices[teamId]=choice;
  if(pair.teams.every(id=>pair.choices[id])){
   const [a,b]=pair.teams,ca=pair.choices[a],cbx=pair.choices[b],base=BASE_POINTS[room.round];
   pair.points={};
   if(ca==='common'&&cbx==='common'){pair.points[a]=base;pair.points[b]=base}
   else if(ca==='self'&&cbx==='common'){pair.points[a]=base*2;pair.points[b]=0}
   else if(ca==='common'&&cbx==='self'){pair.points[a]=0;pair.points[b]=base*2}
   else {pair.points[a]=0;pair.points[b]=0}
   pair.teams.forEach(id=>room.teams[id].score+=pair.points[id]);pair.done=true;
  }
  cb&&cb({ok:true});emit(room);
 });
 socket.on('nextRound',({code}={},cb)=>{
  const room=rooms.get(String(code||'').toUpperCase());
  if(!room||room.hostId!==socket.id)return cb&&cb({ok:false,error:'Chỉ quản trò mới có thể chuyển lượt.'});
  if(!room.started||room.finished)return cb&&cb({ok:false,error:'Ván chơi chưa bắt đầu hoặc đã kết thúc.'});
  if(!room.pairs.every(p=>p.done))return cb&&cb({ok:false,error:room.mode==='duo'?'Hai người chơi cần chốt lựa chọn trước khi chuyển lượt.':'Chưa đủ 3 cặp hoàn tất. Chờ các nhóm chốt lựa chọn.'});
  if(room.round+1>=SCENARIOS.length){room.finished=true;emit(room);return cb&&cb({ok:true,finished:true})}
  room.round++;makePairs(room);emit(room);cb&&cb({ok:true});
 });
 socket.on('disconnect',()=>{
  for(const room of rooms.values()){
   if(room.hostId===socket.id){room.hostConnected=false;emit(room)}
   if(socket.data.roomCode===room.code&&Number.isInteger(socket.data.teamId)){
    const t=room.teams[socket.data.teamId];if(t.socketId===socket.id)t.socketId=null;emit(room)
   }
  }
 });
});
const port=process.env.PORT||3000;server.listen(port,'0.0.0.0',()=>console.log('Game listening on '+port));
