const socket=io();
let role='guest',roomCode='',teamId=null,state=null,availableNames=[];
const $=id=>document.getElementById(id);
function notice(s){$('notice').textContent=s||''}
function names(st=state){return st?.teams?.map(t=>t.name)||[]}
function enterGame(r,st){
 role=r;roomCode=st.code;state=st;
 $('home').classList.add('hidden');$('game').classList.remove('hidden');$('playerView').classList.add('hidden');
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
 const teamNames=names(st),duo=st.mode==='duo';
 $('participantsTitle').textContent=duo?'2 người chơi':'6 nhóm tham gia';
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

 if(role==='team'&&st.started){
  $('game').classList.add('hidden');$('playerView').classList.remove('hidden');
  renderPlayerView(st);return;
 }
 $('playerView').classList.add('hidden');$('game').classList.remove('hidden');
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
 $('myChoice').textContent='Quản trò: '+(duo?'chờ hai người chơi chốt lựa chọn.':'theo dõi tiến độ 3 cặp. ')+(duo?'Chỉ chuyển lượt sau khi cả hai đã chốt.':'Chỉ chuyển lượt khi cả 3 cặp hoàn tất.');
 $('pairs').innerHTML=st.pairs.map(p=>{
  const a=p.teams[0],b=p.teams[1];
  const result=p.done
   ?'<div class="status">Kết quả: '+esc(teamNames[a])+' +'+p.points[a]+' điểm · '+esc(teamNames[b])+' +'+p.points[b]+' điểm</div>'
   :'<div class="status">'+p.submittedCount+'/2 đã chốt lựa chọn · chưa công khai đáp án</div>';
  const summary=p.done?'<p class="muted">Lựa chọn: '+(p.choices[a]==='common'?'Hợp tác':'Lợi ích cá nhân')+' / '+(p.choices[b]==='common'?'Hợp tác':'Lợi ích cá nhân')+'</p>':'';
  return '<div class="pair"><div class="tag">'+(duo?'ĐỐI KHÁNG':'CẶP '+(p.id+1))+'</div><div class="versus"><span>'+esc(teamNames[a])+'</span><b>VS</b><span>'+esc(teamNames[b])+'</span></div>'+result+summary+'</div>';
 }).join('');
}
function renderPlayerView(st){
 const teamNames=names(st),myTeam=st.teams.find(t=>t.id===teamId),pair=st.pairs.find(p=>p.teams.includes(teamId));
 $('playerRole').textContent=myTeam?myTeam.name.toUpperCase():'NGƯỜI CHƠI';
 $('playerProgress').style.width=(st.finished?100:((st.round+1)/st.scenarios*100))+'%';
 $('playerRound').textContent=st.finished?'ĐÃ KẾT THÚC':'TÌNH HUỐNG '+(st.round+1)+' / '+st.scenarios;
 $('playerBase').textContent='Điểm cơ sở: '+(st.basePoints||0);
 $('playerScoreline').innerHTML=st.teams.filter(t=>pair?pair.teams.includes(t.id):t.id===teamId).map(t=>'<div class="player-scorebox"><span>'+esc(t.name)+'</span><strong>'+t.score+' điểm</strong></div>').join('');
 if(st.finished){
  $('playerQuestion').textContent='Trò chơi kết thúc';
  $('playerContext').textContent='Bạn đã hoàn thành 10 tình huống. Hãy nhìn lại những lựa chọn đã đưa ra và cách chúng tác động đến kết quả của cả hai bên.';
  $('playerStatus').innerHTML='<div class="player-result"><strong>Giữa lợi ích cá nhân và lợi ích cộng đồng</strong><p>Không ai khuyên bạn ngừng nghĩ cho bản thân hay từ bỏ quyền lợi chính đáng. Nhưng một xã hội công bằng không thể được xây dựng nếu mỗi người chỉ quan tâm đến lợi ích riêng mà bỏ qua những người xung quanh.</p><p>Chủ nghĩa xã hội hướng đến một xã hội vì nhân dân, do nhân dân làm chủ, trong đó lợi ích chính đáng của cá nhân gắn liền với lợi ích chung của cộng đồng.</p><p>Bước đầu tiên cho những thay đổi tích cực là vượt qua tư tưởng vị kỷ và biết ưu tiên lợi ích chung khi lợi ích ấy gắn với sự công bằng và hạnh phúc của mọi người.</p></div>';
  $('playerChoices').innerHTML='';return;
 }
 $('playerQuestion').textContent=st.scenario[0];
 $('playerContext').textContent=st.scenario[1];
 if(!pair){
  $('playerStatus').textContent='Chưa xác định được cặp đấu. Vui lòng báo quản trò.';
  $('playerChoices').innerHTML='';return;
 }
 const opponentId=pair.teams.find(id=>id!==teamId),opponent=teamNames[opponentId],myChoice=pair.choices[teamId],locked=!!myChoice&&!pair.done;
 if(pair.done){
  $('playerStatus').innerHTML='<div class="player-result"><strong>Lượt đã hoàn tất.</strong><br>'+esc(teamNames[pair.teams[0]])+': '+(pair.choices[pair.teams[0]]==='common'?'Hợp tác':'Lợi ích cá nhân')+' · +'+pair.points[pair.teams[0]]+' điểm<br>'+esc(teamNames[pair.teams[1]])+': '+(pair.choices[pair.teams[1]]==='common'?'Hợp tác':'Lợi ích cá nhân')+' · +'+pair.points[pair.teams[1]]+' điểm</div>';
 }else if(locked){
  $('playerStatus').textContent='Bạn đã chốt lựa chọn. Đang chờ '+opponent+' hoàn tất lựa chọn. Lựa chọn của đối thủ vẫn được giữ kín.';
 }else{
  $('playerStatus').textContent='Bạn đang đối đầu với '+opponent+'. Hãy cân nhắc tình huống và chọn một phương án. Lựa chọn của hai bên được giữ kín cho đến khi cả hai chốt.';
 }
 $('playerChoices').innerHTML='<button class="player-choice '+(myChoice==='common'?'selected':'')+'" '+(locked||pair.done?'disabled':'')+' data-player-choice="common">Hợp tác vì lợi ích chung<small>'+esc(st.scenario[2])+'<br><br>Nhận '+st.basePoints+' điểm nếu cả hai cùng hợp tác.</small></button><button class="player-choice self '+(myChoice==='self'?'selected':'')+'" '+(locked||pair.done?'disabled':'')+' data-player-choice="self">Ưu tiên lợi ích cá nhân<small>'+esc(st.scenario[3])+'<br><br>Nhận '+(st.basePoints*2)+' điểm nếu đối thủ hợp tác; nhận 0 điểm nếu cả hai chọn phương án này.</small></button>';
 document.querySelectorAll('[data-player-choice]').forEach(btn=>btn.onclick=()=>{
  btn.disabled=true;$('playerStatus').textContent='Đang ghi nhận lựa chọn của bạn…';
  socket.emit('choose',{pairId:pair.id,choice:btn.dataset.playerChoice},res=>{
   if(!res?.ok){$('playerNotice').textContent=res?.error||'Không thể gửi lựa chọn';renderPlayerView(state)}
   else $('playerNotice').textContent='';
  });
 });
}
