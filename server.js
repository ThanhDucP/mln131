const express=require('express');
const http=require('http');
const {Server}=require('socket.io');
const crypto=require('crypto');
const app=express(), server=http.createServer(app), io=new Server(server);
app.use(express.static('public'));
app.get('/health',(req,res)=>res.json({ok:true,app:'Vi Loi Ich Chung'}));
const TEAM_NAMES=['Nhóm 1','Nhóm 3','Nhóm 4','Nhóm 5','Nhóm 6','Nhóm 7'];
const SCENARIOS=[
['Ngân sách chống ngập','Khu dân cư thường ngập sau mưa. Hội đồng cần chọn cách dùng ngân sách hạn chế.','Công khai tiêu chí, ưu tiên điểm ngập nặng và giám sát chi tiêu','Dồn ngân sách cho khu vực có lợi cho nhóm mình'],
['Phân loại rác','Phường triển khai phân loại rác nhưng cần người dân hợp tác.','Cùng thực hiện phân loại và góp ý cách thu gom khả thi','Bỏ qua quy định vì nghĩ phần mình không ảnh hưởng'],
['Hỗ trợ người thất nghiệp','Quỹ hỗ trợ có hạn, nhiều hộ đang gặp khó khăn.','Công khai tiêu chí và phân bổ theo mức độ cần thiết','Ưu tiên người quen dù hoàn cảnh ít khó khăn hơn'],
['Minh bạch ngân sách','Người dân muốn biết khoản thu chi của địa phương.','Công khai số liệu dễ hiểu và tạo kênh giám sát','Giữ thông tin khó tiếp cận để tránh bị chất vấn'],
['Phòng chống dịch','Địa phương cần phối hợp khi xuất hiện nguy cơ dịch bệnh.','Chia sẻ thông tin chính xác và tuân thủ hướng dẫn chung','Che giấu thông tin bất lợi cho bản thân'],
['An toàn giao thông trường học','Khu vực cổng trường thường ùn tắc và nguy hiểm.','Cùng thống nhất phương án phân luồng, ưu tiên trẻ em','Chỉ yêu cầu xử lý khi ảnh hưởng trực tiếp đến mình'],
['Dịch vụ công trực tuyến','Một số người dân lớn tuổi khó sử dụng dịch vụ trực tuyến.','Bố trí hướng dẫn và kênh hỗ trợ trực tiếp','Chỉ phục vụ người đã biết sử dụng ứng dụng'],
['Ứng phó thiên tai','Mưa bão gây thiệt hại, nguồn lực cứu trợ có hạn.','Công khai danh sách hỗ trợ và ưu tiên hộ dễ tổn thương','Giữ phần cứu trợ cho nhóm quen biết'],
['Giám sát bữa ăn học đường','Phụ huynh lo ngại chất lượng bữa ăn tại trường.','Tổ chức giám sát minh bạch, tiếp nhận phản ánh có căn cứ','Bỏ qua phản ánh để tránh phiền phức'],
['Không gian công cộng','Khu phố cần cải tạo một khoảng đất thành không gian chung.','Lấy ý kiến cư dân và chọn phương án nhiều người cùng sử dụng','Chiếm dụng không gian cho lợi ích riêng']
];
const rooms=new Map();
function code(){let c;do{c=crypto.randomBytes(3).toString('hex').toUpperCase()}while(rooms.has(c));return c}
function pairsFor(round){
 const arr=[0,1,2,3,4,5], fixed=arr[5], rot=arr.slice(0,5);
 for(let i=0;i<round%5;i++)rot.unshift(rot.pop());
 const base=[[fixed,rot[0]],[rot[1],rot[4]],[rot[2],rot[3]]];
 if(round>=5)base.forEach(p=>p.reverse());
 return base;
}
function pub(room){
 return {code:room.code,hostConnected:room.hostConnected,started:room.started,round:room.round,scenarios:SCENARIOS.length,scenario:SCENARIOS[room.round]||null,
 teams:room.teams.map((t,i)=>({id:i,name:t.name,connected:!!t.socketId,score:t.score,joined:!!t.socketId})),
 pairs:room.pairs.map((p,i)=>({id:i,teams:p.teams,choices:p.choices,done:p.done,points:p.points})),
 finished:room.finished};
}
function emit(room){io.to(room.code).emit('state',pub(room))}
function makePairs(room){room.pairs=pairsFor(room.round).map((teams,id)=>({id,teams,choices:{},done:false,points:{}}))}
io.on('connection',socket=>{
 socket.on('createRoom',(_,cb)=>{
  const c=code(),room={code:c,hostId:socket.id,hostConnected:true,started:false,round:0,finished:false,teams:TEAM_NAMES.map((name,i)=>({id:i,name,score:0,socketId:null})),pairs:[]};
  rooms.set(c,room);socket.join(c);makePairs(room);cb&&cb({ok:true,code:c,state:pub(room)});emit(room);
 });
 socket.on('joinTeam',({code,name},cb)=>{
  const room=rooms.get(String(code||'').toUpperCase());if(!room)return cb&&cb({ok:false,error:'Không tìm thấy phòng. Kiểm tra mã phòng.'});
  if(room.finished)return cb&&cb({ok:false,error:'Ván chơi đã kết thúc.'});
  const team=room.teams.find(t=>t.name===name);if(!team)return cb&&cb({ok:false,error:'Tên nhóm không hợp lệ.'});
  if(team.socketId&&io.sockets.sockets.has(team.socketId))return cb&&cb({ok:false,error:'Nhóm này đã đăng nhập trên thiết bị khác.'});
  team.socketId=socket.id;socket.data.roomCode=room.code;socket.data.teamId=team.id;socket.join(room.code);
  cb&&cb({ok:true,state:pub(room),teamId:team.id});emit(room);
 });
 socket.on('startGame',({code},cb)=>{
  const room=rooms.get(code);if(!room||room.hostId!==socket.id)return cb&&cb({ok:false,error:'Chỉ quản trò mới có thể bắt đầu.'});
  room.started=true;makePairs(room);emit(room);cb&&cb({ok:true});
 });
 socket.on('choose',({pairId,choice},cb)=>{
  const room=rooms.get(socket.data.roomCode),teamId=socket.data.teamId;
  if(!room||!room.started||room.finished)return cb&&cb({ok:false,error:'Ván chơi chưa bắt đầu hoặc đã kết thúc.'});
  const pair=room.pairs.find(p=>p.id===pairId);
  if(!pair||!pair.teams.includes(teamId)||pair.done)return cb&&cb({ok:false,error:'Lượt này không thuộc nhóm của bạn hoặc đã khóa.'});
  if(!['common','self'].includes(choice))return cb&&cb({ok:false,error:'Lựa chọn không hợp lệ.'});
  if(pair.choices[teamId])return cb&&cb({ok:false,error:'Nhóm đã chốt lựa chọn.'});
  pair.choices[teamId]=choice;
  if(pair.teams.every(id=>pair.choices[id])){
   const [a,b]=pair.teams,ca=pair.choices[a],cbx=pair.choices[b];pair.points={};
   if(ca==='common'&&cbx==='common'){pair.points[a]=10;pair.points[b]=10}
   else if(ca==='self'&&cbx==='common'){pair.points[a]=20;pair.points[b]=0}
   else if(ca==='common'&&cbx==='self'){pair.points[a]=0;pair.points[b]=20}
   else {pair.points[a]=0;pair.points[b]=0}
   pair.teams.forEach(id=>room.teams[id].score+=pair.points[id]);pair.done=true;
  }
  cb&&cb({ok:true});emit(room);
 });
 socket.on('nextRound',({code},cb)=>{
  const room=rooms.get(code);if(!room||room.hostId!==socket.id)return cb&&cb({ok:false,error:'Chỉ quản trò mới có thể chuyển lượt.'});
  if(!room.pairs.every(p=>p.done))return cb&&cb({ok:false,error:'Chưa đủ 3 cặp hoàn tất. Chờ các nhóm chốt lựa chọn.'});
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