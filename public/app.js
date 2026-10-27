const socket=io();
let role='guest',roomCode='',teamId=null,state=null,availableNames=[];
const $=id=>document.getElementById(id);
function notice(s){$('notice').textContent=s||''}
function names(st=state){return st?.teams?.map(t=>t.name)||[]}
function enterGame(r,st){
 role=r;roomCode=st.code;state=st;
 $('home').classList.add('hidden');$('game').classList.remove('hidden');
 $('hostControls').classList.toggle('hidden',role!=='host');
 $('roleTag').textContent=role==='host'?'QUẢN TRÒ':('ĐANG CHƠI: '+(names(st)[teamId]||'Người chơi'));
 $('gameTitle').textContent='Phòng '+roomCode;
 render(st);
}
function loadRoom(){
 const code=$('roomCode').value.trim().toUpperCase();
 if(!code)return notice('Nhập mã phòng trước.');
 socket.emit('roomInfo',{code},res=>{
  if(!res?.ok)return notice(res?.error||'Không tải được danh sách.');
  if(res.started)return notice('Ván chơi đã bắt đầu, không thể tham gia thêm.');
  if(res.finished)return notice('Ván chơi đã kết thúc.');
  const select=$('teamName');
  select.innerHTML='<option value="">Chọn vị trí tham gia</option>'+res.teams.map(t=>'<option value="'+esc(t.name)+'" '+(t.connected?'disabled':'')+'>'+esc(t.name)+(t.connected?' (đã có người)':'')+'</option>').join('');
  availableNames=res.teams.map(t=>t.name);
  notice('Phòng '+code+' · '+(res.mode==='duo'?'chế độ 2 người chơi':'chế độ 6 nhóm')+'. Chọn vị trí chưa có người.');
 });
}
function esc(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
$('create').onclick=()=>{
 const mode=$('gameMode').value;
 socket.emit('createRoom',{mode},res=>{
  if(!res?.ok)return notice('Không tạo được phòng. Vui lòng thử lại.');
  $('hostCodeWrap').classList.remove('hidden');$('hostCode').textContent=res.code;
  $('hostCodeWrap').querySelector('.muted').textContent='Người chơi truy cập cùng địa chỉ web, nhập mã phòng và tải danh sách vị trí.';
  enterGame('host',res.state);
 });
};
$('loadRoom').onclick=loadRoom;
$('roomCode').addEventListener('input',e=>{e.target.value=e.target.value.toUpperCase();$('teamName').innerHTML='<option value="">Nhập mã rồi tải danh sách</option>';availableNames=[]});
$('join').onclick=()=>{
 notice('');
 const code=$('roomCode').value.trim().toUpperCase(),name=$('teamName').value;
 if(!code)return notice('Nhập mã phòng trước.');
 if(!name)return notice('Bấm “Tải danh sách”, sau đó chọn vị trí tham gia.');
 socket.emit('joinTeam',{code,name},res=>{
  if(!res?.ok){notice(res?.error||'Không thể vào phòng.');return}
  teamId=res.teamId;enterGame('team',res.state);notice('');
 });
};
$('start').onclick=()=>socket.emit('startGame',{code:roomCode},res=>{if(!res?.ok)notice(res?.error||'Không thể bắt đầu')});
$('next').onclick=()=>socket.emit('nextRound',{code:roomCode},res=>{if(!res?.ok)notice(res?.error||'Chưa thể chuyển lượt');else notice('')});
socket.on('state',st=>{if(st.code!==roomCode)return;state=st;render(st)});
function render(st){
 const teamNames=names(st),duo=st.mode==='duo',participantsTitle=duo?'2 người chơi':'6 nhóm tham gia';
 $('participantsTitle').textContent=participantsTitle;
 $('gameTitle').textContent='Phòng '+st.code+(duo?' · Đấu 2 người':' · 6 nhóm');
 $('roundLabel').textContent=st.finished?'Đã kết thúc':st.started?'Tình huống '+(st.round+1)+' / '+st.scenarios:'Chờ bắt đầu';
 $('gameDesc').textContent=st.finished?'Đã hoàn thành 10 tình huống.':st.started?'Điểm cơ sở lượt này: '+st.basePoints+'. Hai bên chọn độc lập; kết quả công khai khi cả hai đã chốt.':'Chờ người chơi tham gia, sau đó quản trò bắt đầu.';
 $('teamList').innerHTML=st.teams.map(t=>'<div class="team"><strong>'+esc(t.name)+'</strong><div class="'+(t.connected?'online':'offline')+'">'+(t.connected?'● Đã vào phòng':'○ Chưa kết nối')+'</div><div class="score">'+t.score+' điểm</div></div>').join('');
 const sorted=[...st.teams].sort((a,b)=>b.score-a.score);
 $('leaderboard').innerHTML=sorted.map((t,i)=>'<div class="leader"><span>'+(i+1)+'. '+esc(t.name)+'</span><strong>'+t.score+' đ</strong></div>').join('');
 $('start').classList.toggle('hidden',role!=='host'||st.started||st.finished);
 $('next').classList.toggle('hidden',role!=='host'||!st.started||st.finished);
 $('next').disabled=!st.pairs.every(p=>p.done);
 $('next').textContent=st.round===st.scenarios-1?'Kết thúc trò chơi':'Tình huống tiếp theo';
 if(!st.started){
  $('scenarioTitle').textContent='Chờ quản trò bắt đầu';
  $('scenarioDesc').textContent=duo?'Khi bắt đầu, hai người chơi sẽ đối đầu trong 10 lượt.':'Khi bắt đầu, 3 cặp sẽ đấu song song trong 10 lượt.';
  $('pairs').innerHTML='';$('myChoice').textContent='';$('finish').classList.add('hidden');return;
 }
 if(st.finished){
  $('scenarioTitle').textContent='Đã hoàn thành 10 tình huống';
  $('scenarioDesc').textContent='Bảng xếp hạng cuối cùng được hiển thị phía trên.';
  $('pairs').innerHTML='';$('myChoice').textContent='';$('finish').classList.remove('hidden');return;
 }
 $('finish').classList.add('hidden');
 $('scenarioTitle').textContent=st.scenario[0]+' · '+st.basePoints+' điểm cơ sở';
 $('scenarioDesc').textContent=st.scenario[1];
 const myPair=role==='team'?st.pairs.find(p=>p.teams.includes(teamId)):null;
 if(role==='team'){
  $('myChoice').textContent=myPair?(myPair.done?'Lượt đã hoàn tất.':myPair.choices[teamId]?'Bạn đã chốt lựa chọn; chờ đối thủ.':'Bạn đấu với '+teamNames[myPair.teams.find(id=>id!==teamId)]+'. Chọn một phương án bên dưới.'):'Không tìm thấy cặp đấu.';
 } else {
  $('myChoice').textContent='Quản trò: '+(duo?'chờ hai người chơi chốt lựa chọn.':'theo dõi tiến độ 3 cặp. ')+(duo?'Chỉ chuyển lượt sau khi cả hai đã chốt.':'Chỉ chuyển lượt khi cả 3 cặp hoàn tất.');
 }
 $('pairs').innerHTML=st.pairs.map(p=>{
  const a=p.teams[0],b=p.teams[1],mine=role==='team'&&p.teams.includes(teamId),locked=!!(mine&&(p.done||p.choices[teamId])),base=st.basePoints;
  const result=p.done
   ?'<div class="status">Kết quả: '+esc(teamNames[a])+' +'+p.points[a]+' điểm · '+esc(teamNames[b])+' +'+p.points[b]+' điểm</div>'
   :'<div class="status">'+p.submittedCount+'/2 đã chốt lựa chọn · chưa công khai đáp án</div>';
  let buttons='';
  if(mine&&!p.done){
   buttons='<button class="choice common '+(p.choices[teamId]==='common'?'selected':'')+'" '+(locked?'disabled':'')+' data-pair="'+p.id+'" data-choice="common">Hợp tác vì lợi ích chung <small>'+esc(st.scenario[2])+' · +'+base+' nếu cả hai hợp tác</small></button><button class="choice self '+(p.choices[teamId]==='self'?'selected':'')+'" '+(locked?'disabled':'')+' data-pair="'+p.id+'" data-choice="self">Ưu tiên lợi ích cá nhân <small>'+esc(st.scenario[3])+' · +'+(base*2)+' nếu đối thủ hợp tác; 0 nếu cả hai chọn phương án này</small></button>';
  }
  const summary=p.done?'<p class="muted">Lựa chọn: '+(p.choices[a]==='common'?'Hợp tác':'Lợi ích cá nhân')+' / '+(p.choices[b]==='common'?'Hợp tác':'Lợi ích cá nhân')+'</p>':'';
  return '<div class="pair"><div class="tag">'+(duo?'ĐỐI KHÁNG':'CẶP '+(p.id+1))+'</div><div class="versus"><span>'+esc(teamNames[a])+'</span><b>VS</b><span>'+esc(teamNames[b])+'</span></div>'+result+summary+buttons+'</div>';
 }).join('');
 document.querySelectorAll('[data-pair]').forEach(btn=>btn.onclick=()=>{
  btn.disabled=true;
  socket.emit('choose',{pairId:Number(btn.dataset.pair),choice:btn.dataset.choice},res=>{
   if(!res?.ok){notice(res?.error||'Không thể gửi lựa chọn');btn.disabled=false}else notice('');
  });
 });
}
