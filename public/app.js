const socket=io();
let role='guest',roomCode='',playerId=null,state=null;
const $=id=>document.getElementById(id);
let countdownInterval=null;
function updateCountdown(){const seconds=state?.started&&!state.finished&&state.roundEndsAt?Math.max(0,Math.ceil((state.roundEndsAt-Date.now())/1000)):null;const el=$('roundTimer');if(el)el.textContent=seconds===null?'':'Còn '+seconds+' giây';const playerEl=$('playerTimer');if(playerEl)playerEl.textContent=seconds===null?'':'Còn '+seconds+' giây';}
function notice(s){$('notice').textContent=s||''}
function names(st=state){return st?.players?.map(p=>p.name)||[]}
function esc(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function enterGame(r,st){role=r;roomCode=st.code;state=st;$('home').classList.add('hidden');$('game').classList.remove('hidden');$('playerView').classList.add('hidden');$('hostControls').classList.toggle('hidden',role!=='host');$('roleTag').textContent=role==='host'?'QUẢN TRÒ':'ĐANG CHƠI: '+(names(st)[playerId]||'Người chơi');$('gameTitle').textContent='Phòng '+roomCode;render(st)}
$('create').onclick=()=>{
 const playerCount=Number($('playerCount').value);
 socket.emit('createRoom',{playerCount},res=>{if(!res?.ok)return notice(res?.error||'Không tạo được phòng.');$('hostCodeWrap').classList.remove('hidden');$('hostCode').textContent=res.code;enterGame('host',res.state)});
};
$('roomCode').addEventListener('input',e=>{e.target.value=e.target.value.toUpperCase()});
$('join').onclick=()=>{
 notice('');const code=$('roomCode').value.trim().toUpperCase(),name=$('playerName').value.trim();
 if(!code)return notice('Nhập mã phòng trước.');if(!name)return notice('Nhập tên người chơi.');
 socket.emit('joinTeam',{code,name},res=>{if(!res?.ok)return notice(res?.error||'Không thể vào phòng.');playerId=res.playerId;enterGame('player',res.state);notice('')});
};
$('start').onclick=()=>socket.emit('startGame',{code:roomCode},res=>{if(!res?.ok)notice(res?.error||'Không thể bắt đầu')});
$('next').onclick=()=>socket.emit('nextRound',{code:roomCode},res=>{if(!res?.ok)notice(res?.error||'Chưa thể chuyển lượt');else notice('')});
$('publishFinal').onclick=()=>socket.emit('publishFinalRanking',{code:roomCode},res=>{if(!res?.ok)notice(res?.error||'Không thể công bố xếp hạng');else notice('')});
socket.on('state',st=>{if(st.code!==roomCode)return;state=st;render(st);updateCountdown()});
if(countdownInterval)clearInterval(countdownInterval);countdownInterval=setInterval(updateCountdown,250);
function compareFinal(a,b){return a.betrayalsAgainstCooperators-b.betrayalsAgainstCooperators||b.cooperationRate-a.cooperationRate||b.score-a.score}
function render(st){
 const playerNames=names(st);
 $('participantsTitle').textContent='Người chơi ('+st.players.length+')';
 $('gameTitle').textContent='Phòng '+st.code+' · '+st.players.length+' người chơi';
 $('roundLabel').textContent=st.finished?'Đã kết thúc':st.started?'Lượt '+(st.round+1)+' / '+st.rounds:'Chờ bắt đầu';
 updateCountdown();
 $('gameDesc').textContent=st.finished?'Đã hoàn thành '+st.rounds+' lượt. Xếp hạng chính thức ưu tiên ít phản bội người đã hợp tác; tiếp theo là tỷ lệ hợp tác và tổng điểm.':st.started?'Điểm cơ sở lượt này: '+st.basePoints+'. Ghép cặp ngẫu nhiên; tự chuyển lượt khi tất cả đã chọn hoặc hết 30 giây.':'Người chơi tham gia bằng mã phòng. Cần ít nhất 2 người để bắt đầu.';
 $('teamList').innerHTML=st.players.map(p=>'<div class="team"><strong>'+esc(p.name)+'</strong><div class="'+(p.connected?'online':'offline')+'">'+(p.connected?'● Đã tham gia':'○ Chưa tham gia')+'</div><div class="score">'+p.score+' điểm</div></div>').join('');
 const sorted=[...st.players].sort(st.finished&&st.finalRankingPublished?compareFinal:(a,b)=>b.score-a.score);
 const title=st.finished?(st.finalRankingPublished?'Xếp hạng chính thức':'Kết quả theo điểm'):'Xếp hạng tạm thời · theo điểm';
 $('leaderboard').innerHTML='<p class="muted ranking-subtitle">'+title+'</p>'+sorted.map((p,i)=>{
  let rank=i+1;if(st.finished&&st.finalRankingPublished&&i>0&&compareFinal(p,sorted[i-1])===0)rank=sorted.findIndex(x=>compareFinal(x,p)===0)+1;
  return '<article class="ranking-card"><div class="ranking-main"><span class="ranking-place">'+rank+'</span><span class="ranking-name">'+esc(p.name)+(st.finished&&st.finalRankingPublished&&p.isGood?' <span class="good-badge">NGƯỜI TỐT</span>':'')+'</span><span class="ranking-score">'+p.score+' <small>điểm</small></span></div>'+(st.finished&&st.finalRankingPublished?'<div class="ranking-metrics"><div class="ranking-metric"><span>Số lần phản bội người hợp tác</span><strong>'+p.betrayalsAgainstCooperators+'</strong></div><div class="ranking-metric"><span>Tỷ lệ hợp tác</span><strong>'+Math.round(p.cooperationRate*100)+'%</strong></div></div>':'')+'</article>'
 }).join('');
 $('publishFinal').classList.toggle('hidden',role!=='host'||!st.finished||st.finalRankingPublished);
 $('start').classList.toggle('hidden',role!=='host'||st.started||st.finished);
 $('next').classList.add('hidden');
 $('next').disabled=!st.pairs.every(p=>p.done);
 $('next').textContent=st.round===st.rounds-1?'Kết thúc trò chơi':'Lượt tiếp theo';
 if(role==='player'&&st.started){$('game').classList.add('hidden');$('playerView').classList.remove('hidden');renderPlayerView(st);return}
 $('playerView').classList.add('hidden');$('game').classList.remove('hidden');
 $('scenarioTitle').textContent=st.finished?'Đã hoàn thành '+st.rounds+' lượt':'Các cặp đấu của lượt '+(st.round+1);
 $('scenarioDesc').textContent=st.started?'Ghép cặp ngẫu nhiên; không cần gặp đủ tất cả người chơi.':'';
 $('myChoice').textContent=st.started?(st.byePlayerId!==null?playerNames[st.byePlayerId]+' sẽ nghỉ lượt này. ':'')+'Chỉ chuyển lượt khi tất cả cặp đấu đã chốt.':'';
 $('pairs').innerHTML=st.pairs.map(p=>{
  const a=p.players[0],b=p.players[1];
  return '<div class="pair"><div class="tag">CẶP NGẪU NHIÊN '+(p.id+1)+'</div><div class="versus"><span>'+esc(playerNames[a])+'</span><b>VS</b><span>'+esc(playerNames[b])+'</span></div><div class="status">'+(p.done?'Kết quả: '+esc(playerNames[a])+' '+(p.choices[a]==='common'?'Hợp tác':'Phản bội')+' · '+p.points[a]+' điểm; '+esc(playerNames[b])+' '+(p.choices[b]==='common'?'Hợp tác':'Phản bội')+' · '+p.points[b]+' điểm':p.submittedCount+'/2 đã chốt · lựa chọn đang được giữ kín')+'</div></div>'
 }).join('');
 if(st.finished)$('finish').classList.remove('hidden');else $('finish').classList.add('hidden');
}
function renderPlayerView(st){
 const player=st.players.find(p=>p.id===playerId),pair=st.pairs.find(p=>p.players.includes(playerId));
 $('playerRole').textContent=player?player.name.toUpperCase():'NGƯỜI CHƠI';
 $('playerProgress').style.width=(st.finished?100:((st.round+1)/st.rounds*100))+'%';
 $('playerRound').textContent=st.finished?'ĐÃ KẾT THÚC':'LƯỢT '+(st.round+1)+' / '+st.rounds;
 $('playerTimer').textContent=st.finished?'':(st.roundEndsAt?'Còn '+Math.max(0,Math.ceil((st.roundEndsAt-Date.now())/1000))+' giây':'');
 $('playerBase').textContent='Điểm cơ sở: '+st.basePoints;
 $('playerScoreline').innerHTML='<div class="player-scorebox"><span>'+esc(player.name)+'</span><strong>'+player.score+' điểm</strong></div>';
 if(st.finished){
  $('playerStatus').innerHTML='<div class="player-result"><strong>Trò chơi đã kết thúc.</strong><p>Xếp hạng ưu tiên ít phản bội người đã hợp tác; tiếp theo là tỷ lệ hợp tác cao hơn rồi tổng điểm cao hơn. Người chơi bằng nhau ở cả ba tiêu chí sẽ đồng hạng.</p></div>';
  $('playerChoices').innerHTML='';$('playerHistory').innerHTML=historyMarkup(player,'Lịch sử 5 lựa chọn gần nhất của bạn');return;
 }
 if(!pair){
  $('playerStatus').innerHTML='<strong>Bạn được nghỉ lượt này.</strong><p>Số người chơi lẻ nên mỗi lượt có thể có một người nghỉ. Lượt sau sẽ ghép cặp ngẫu nhiên lại.</p>';
  $('playerChoices').innerHTML='';$('playerHistory').innerHTML=historyMarkup(player,'Lịch sử 5 lựa chọn gần nhất của bạn');return;
 }
 const opponentId=pair.players.find(id=>id!==playerId),opponent=st.players.find(p=>p.id===opponentId),myChoice=pair.choices[playerId],locked=!!myChoice&&!pair.done;
 $('playerStatus').textContent=pair.done?'Lượt đã hoàn tất. '+opponent.name+': '+(pair.choices[opponentId]==='common'?'Hợp tác':'Phản bội')+' · '+pair.points[opponentId]+' điểm.':locked?'Bạn đã chốt lựa chọn. Đang chờ '+opponent.name+' chốt.':'Bạn đang đấu với '+opponent.name+'. Lựa chọn của hai bên được giữ kín đến khi cả hai chốt.';
 $('playerChoices').innerHTML='<button class="player-choice '+(myChoice==='common'?'selected':'')+'" '+(locked||pair.done?'disabled':'')+' data-choice="common">Hợp tác<small>Cùng hợp tác: cả hai nhận điểm cơ sở.</small></button><button class="player-choice self '+(myChoice==='self'?'selected':'')+'" '+(locked||pair.done?'disabled':'')+' data-choice="self">Phản bội<small>Phản bội người hợp tác: bạn nhận gấp đôi điểm cơ sở; đối thủ nhận 0. Cả hai phản bội: cả hai nhận 0.</small></button>';
 document.querySelectorAll('[data-choice]').forEach(btn=>btn.onclick=()=>{
  btn.disabled=true;$('playerNotice').textContent='Đang ghi nhận lựa chọn…';
  socket.emit('choose',{pairId:pair.id,choice:btn.dataset.choice},res=>{if(!res?.ok){$('playerNotice').textContent=res?.error||'Không thể gửi lựa chọn';renderPlayerView(state)}else $('playerNotice').textContent=''});
 });
 $('playerHistory').innerHTML=historyMarkup(opponent,'5 lựa chọn gần nhất của '+opponent.name);
}
function historyMarkup(player,title){
 const recent=[...(player?.history||[])].sort((a,b)=>b.round-a.round).slice(0,5);
 return '<section class="player-history"><h3>'+esc(title||'5 lựa chọn gần nhất của đối thủ')+'</h3>'+(recent.length?'<ol>'+recent.map(h=>'<li><strong>Lượt '+h.round+' · Đối đầu với '+esc(h.opponent)+'</strong><div>Đã chọn: <strong>'+(h.choice==='common'?'Hợp tác':'Phản bội')+'</strong> · Điểm nhận: '+h.points+'</div></li>').join('')+'</ol>':'<p>Người chơi này chưa có lịch sử lựa chọn.</p>')+'</section>';
}
