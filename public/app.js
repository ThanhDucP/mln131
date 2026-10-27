const socket=io();
let role='guest',roomCode='',teamId=null,state=null,chosen={};
const $=id=>document.getElementById(id);
function notice(s){$('notice').textContent=s||''}
function enterGame(r,st){role=r;roomCode=st.code;state=st;$('home').classList.add('hidden');$('game').classList.remove('hidden');$('hostControls').classList.toggle('hidden',role!=='host');$('roleTag').textContent=role==='host'?'QUẢN TRÒ':'ĐANG CHƠI: '+TEAM_NAMES[teamId];$('gameTitle').textContent='Phòng '+roomCode;render(st)}
const TEAM_NAMES=['Nhóm 1','Nhóm 3','Nhóm 4','Nhóm 5','Nhóm 6','Nhóm 7'];
$('create').onclick=()=>socket.emit('createRoom',{},res=>{if(!res?.ok)return notice('Không tạo được phòng. Vui lòng thử lại.');$('hostCodeWrap').classList.remove('hidden');$('hostCode').textContent=res.code;enterGame('host',res.state)});
$('join').onclick=()=>{notice('');const code=$('roomCode').value.trim().toUpperCase(),name=$('teamName').value;if(!code)return notice('Nhập mã phòng trước.');socket.emit('joinTeam',{code,name},res=>{if(!res?.ok)return notice(res?.error||'Không thể vào phòng.');teamId=res.teamId;enterGame('team',res.state)})};
$('roomCode').addEventListener('input',e=>e.target.value=e.target.value.toUpperCase());
$('start').onclick=()=>socket.emit('startGame',{code:roomCode},res=>{if(!res?.ok)notice(res?.error||'Không thể bắt đầu')});
$('next').onclick=()=>socket.emit('nextRound',{code:roomCode},res=>{if(!res?.ok)notice(res?.error||'Chưa thể chuyển lượt')});
socket.on('state',st=>{if(st.code!==roomCode)return;state=st;render(st)});
function esc(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function render(st){
 $('gameTitle').textContent='Phòng '+st.code;
 $('roundLabel').textContent=st.finished?'Đã kết thúc':st.started?'Tình huống '+(st.round+1)+' / '+st.scenarios:'Chờ quản trò bắt đầu';
 $('gameDesc').textContent=st.finished?'Hoàn thành 10 tình huống.':st.started?'Mỗi cặp chọn cách xử lý; điểm được cộng khi cả hai đội chốt lựa chọn.':'Chờ đủ nhóm tham gia, sau đó quản trò bắt đầu.';
 $('teamList').innerHTML=st.teams.map(t=>'<div class="team"><strong>'+esc(t.name)+'</strong><div class="'+(t.connected?'online':'offline')+'">'+(t.connected?'● Đã vào phòng':'○ Chưa kết nối')+'</div><div class="score">'+t.score+' điểm</div></div>').join('');
 const sorted=[...st.teams].sort((a,b)=>b.score-a.score);$('leaderboard').innerHTML=sorted.map((t,i)=>'<div class="leader"><span>'+(i+1)+'. '+esc(t.name)+'</span><strong>'+t.score+' đ</strong></div>').join('');
 $('start').classList.toggle('hidden',role!=='host'||st.started);$('next').classList.toggle('hidden',role!=='host'||!st.started||st.finished);
 $('next').disabled=!st.pairs.every(p=>p.done);
 if(!st.started){$('scenarioTitle').textContent='Chờ quản trò bắt đầu';$('scenarioDesc').textContent='Khi trò chơi bắt đầu, 3 cặp sẽ đấu song song.';$('pairs').innerHTML='';$('myChoice').textContent='';return}
 if(st.finished){$('scenarioTitle').textContent='Đã hoàn thành 10 tình huống';$('scenarioDesc').textContent='Bảng xếp hạng cuối cùng được hiển thị phía trên.';$('pairs').innerHTML='';$('finish').classList.remove('hidden');return}
 $('finish').classList.add('hidden');$('scenarioTitle').textContent=st.scenario[0];$('scenarioDesc').textContent=st.scenario[1];
 const myPair=role==='team'?st.pairs.find(p=>p.teams.includes(teamId)):null;
 if(role==='team'){$('myChoice').textContent=myPair?(myPair.done?'Cặp đã hoàn tất.':myPair.choices[teamId]?'Bạn đã chốt lựa chọn; chờ đội đối thủ.':'Bạn đấu với '+TEAM_NAMES[myPair.teams.find(id=>id!==teamId)]+'. Chọn một phương án bên dưới.'):'Không tìm thấy cặp đấu.'}
 else $('myChoice').textContent='Quản trò: theo dõi tiến độ 3 cặp. Chỉ chuyển sang tình huống tiếp theo khi cả 3 cặp hoàn tất.';
 $('pairs').innerHTML=st.pairs.map(p=>{
  const a=p.teams[0],b=p.teams[1],mine=role==='team'&&p.teams.includes(teamId),locked=!!(mine&&(p.done||p.choices[teamId]));
  let result=p.done?'<div class="status">Kết quả: '+TEAM_NAMES[a]+' +'+p.points[a]+' điểm · '+TEAM_NAMES[b]+' +'+p.points[b]+' điểm</div>':'<div class="status">'+Object.keys(p.choices).length+'/2 nhóm đã chốt lựa chọn</div>';
  let buttons='';
  if(mine&&!p.done){buttons='<button class="choice common '+(p.choices[teamId]==='common'?'selected':'')+'" '+(locked?'disabled':'')+' data-pair="'+p.id+'" data-choice="common">Lợi ích chung <small>'+esc(st.scenario[2])+' · +10 nếu cả hai cùng chọn</small></button><button class="choice self '+(p.choices[teamId]==='self'?'selected':'')+'" '+(locked?'disabled':'')+' data-pair="'+p.id+'" data-choice="self">Lợi ích cá nhân <small>'+esc(st.scenario[3])+' · +20 nếu đối thủ chọn chung, 0 nếu cả hai chọn cá nhân</small></button>'}
  let choiceSummary=p.done?'<p class="muted">Lựa chọn: '+(p.choices[a]==='common'?'Chung':'Cá nhân')+' / '+(p.choices[b]==='common'?'Chung':'Cá nhân')+'</p>':'';
  return '<div class="pair"><div class="tag">CẶP '+(p.id+1)+'</div><div class="versus"><span>'+TEAM_NAMES[a]+'</span><b>VS</b><span>'+TEAM_NAMES[b]+'</span></div>'+result+choiceSummary+buttons+'</div>'
 }).join('');
 document.querySelectorAll('[data-pair]').forEach(btn=>btn.onclick=()=>{btn.disabled=true;socket.emit('choose',{pairId:Number(btn.dataset.pair),choice:btn.dataset.choice},res=>{if(!res?.ok){notice(res?.error||'Không thể gửi lựa chọn');btn.disabled=false}else notice('')})});
}
