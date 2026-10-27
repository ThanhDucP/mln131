const socket = io();
let role = 'guest', roomCode = '', playerId = null, state = null;
const $ = id => document.getElementById(id);
let countdownInterval = null;

function notice(s) { $('notice').textContent = s || ''; }
function names(st = state) { return st?.players?.map(p => p.name) || []; }
function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function enterGame(r, st) {
  role = r; roomCode = st.code; state = st;
  $('home').classList.add('hidden'); $('game').classList.remove('hidden'); $('playerView').classList.add('hidden');
  $('hostControls').classList.toggle('hidden', role !== 'host');
  $('roleTag').textContent = role === 'host' ? 'QUẢN TRÒ' : 'ĐANG CHƠI: ' + (names(st)[playerId] || 'Người chơi');
  $('gameTitle').textContent = 'Phòng ' + roomCode;
  render(st);
}
$('create').onclick = () => {
  const playerCount = Number($('playerCount').value);
  socket.emit('createRoom', { playerCount }, res => {
    if (!res?.ok) return notice(res?.error || 'Không tạo được phòng.');
    $('hostCodeWrap').classList.remove('hidden'); $('hostCode').textContent = res.code;
    enterGame('host', res.state);
  });
};
$('roomCode').addEventListener('input', e => { e.target.value = e.target.value.toUpperCase(); });
$('join').onclick = () => {
  notice('');
  const code = $('roomCode').value.trim().toUpperCase(), name = $('playerName').value.trim();
  if (!code) return notice('Nhập mã phòng trước.');
  if (!name) return notice('Nhập tên người chơi.');
  socket.emit('joinTeam', { code, name }, res => {
    if (!res?.ok) return notice(res?.error || 'Không thể vào phòng.');
    playerId = res.playerId; enterGame('player', res.state); notice('');
  });
};
$('start').onclick = () => socket.emit('startGame', { code: roomCode }, res => { if (!res?.ok) notice(res?.error || 'Không thể bắt đầu'); });
$('next').onclick = () => socket.emit('nextRound', { code: roomCode }, res => { if (!res?.ok) notice(res?.error || 'Các trận tự chuyển độc lập.'); });
$('publishFinal').onclick = () => socket.emit('publishFinalRanking', { code: roomCode }, res => {
  if (!res?.ok) notice(res?.error || 'Không thể công bố xếp hạng'); else notice('');
});
socket.on('state', st => {
  if (st.code !== roomCode) return;
  state = st; render(st); updateCountdown();
});
countdownInterval = setInterval(updateCountdown, 250);

function compareFinal(a, b) {
  return a.betrayalsAgainstCooperators - b.betrayalsAgainstCooperators ||
    b.cooperationRate - a.cooperationRate || b.score - a.score;
}
function timeLeft(match) {
  return match?.endsAt ? Math.max(0, Math.ceil((match.endsAt - Date.now()) / 1000)) : null;
}
function updateCountdown() {
  if (!state || !state.started || state.finished) {
    if ($('roundTimer')) $('roundTimer').textContent = '';
    if ($('playerTimer')) $('playerTimer').textContent = '';
    return;
  }
  if (role === 'host') {
    const active = state.activeMatches || [];
    $('roundTimer').textContent = active.length ? active.length + ' trận đang chạy' : 'Đang ghép trận';
  } else if (role === 'player') {
    const left = timeLeft(state.activeMatch);
    $('playerTimer').textContent = left === null ? '' : 'Còn ' + left + ' giây';
  }
  if (role === 'host') {
    document.querySelectorAll('[data-match-timer]').forEach(el => {
      const match = (state.activeMatches || []).find(m => String(m.id) === el.dataset.matchTimer);
      const left = timeLeft(match);
      el.textContent = left === null ? 'Đang xử lý' : 'Còn ' + left + ' giây';
    });
  }
}
function render(st) {
  const playerNames = names(st);
  $('participantsTitle').textContent = 'Người chơi (' + st.players.length + ')';
  $('gameTitle').textContent = 'Phòng ' + st.code + ' · ' + st.players.length + ' người chơi';
  $('roundLabel').textContent = st.finished ? 'Đã kết thúc' : st.started ? 'Đã xong ' + st.completedMatches + ' / ' + st.totalMatches + ' trận' : 'Chờ bắt đầu';
  updateCountdown();
  $('gameDesc').textContent = st.finished
    ? 'Mỗi người đã hoàn thành tối đa 20 trận. Mỗi người có lịch điểm riêng: 6 trận × 5, 8 trận × 10, 4 trận × 20 và 2 trận × 30 điểm cơ sở.'
    : st.started
      ? 'Mỗi người chơi tối đa 20 trận. Mỗi cặp có đồng hồ 30 giây riêng; khi xong, hai người được đưa vào hàng chờ ghép trận tiếp theo.'
      : 'Người chơi tham gia bằng mã phòng. Cần ít nhất 2 người đã tham gia để bắt đầu.';
  $('teamList').innerHTML = st.players.map(p =>
    '<div class="team"><strong>' + esc(p.name) + '</strong><div class="' + (p.connected ? 'online' : 'offline') + '">' +
    (p.connected ? '● Đã tham gia' : '○ Đã ngắt kết nối') + '</div><div class="score">' + p.score + ' điểm</div>' +
    '<div class="muted">' + p.gamesPlayed + ' / ' + p.gamesTotal + ' trận</div></div>'
  ).join('');

  const sorted = [...st.players].sort(st.finished && st.finalRankingPublished ? compareFinal : (a, b) => b.score - a.score);
  const title = st.finished ? (st.finalRankingPublished ? 'Xếp hạng chính thức' : 'Kết quả theo điểm') : 'Xếp hạng tạm thời · theo điểm';
  $('leaderboard').innerHTML = '<p class="muted ranking-subtitle">' + title + '</p>' + sorted.map((p, i) => {
    let rank = i + 1;
    if (st.finished && st.finalRankingPublished && i > 0 && compareFinal(p, sorted[i - 1]) === 0) rank = sorted.findIndex(x => compareFinal(x, p) === 0) + 1;
    return '<article class="ranking-card"><div class="ranking-main"><span class="ranking-place">' + rank +
      '</span><span class="ranking-name">' + esc(p.name) + '</span><span class="ranking-score">' + p.score + ' <small>điểm</small></span></div>' +
      '<div class="muted">' + p.gamesPlayed + '/' + p.gamesTotal + ' trận · ' + Math.round(p.cooperationRate * 100) +
      '% hợp tác · ' + p.betrayalsAgainstCooperators + ' lần phản bội người hợp tác</div></article>';
  }).join('');

  $('publishFinal').classList.toggle('hidden', role !== 'host' || !st.finished || st.finalRankingPublished);
  $('start').classList.toggle('hidden', role !== 'host' || st.started || st.finished);
  $('next').classList.add('hidden');

  if (role === 'player' && st.started) {
    $('game').classList.add('hidden'); $('playerView').classList.remove('hidden');
    renderPlayerView(st); return;
  }
  $('playerView').classList.add('hidden'); $('game').classList.remove('hidden');
  const active = st.activeMatches || [];
  $('scenarioTitle').textContent = st.finished ? 'Đã hoàn thành tất cả trận' : st.started ? 'Các trận đang diễn ra (' + active.length + ')' : 'Chờ quản trò bắt đầu';
  $('scenarioDesc').textContent = st.started
    ? 'Các trận chạy độc lập. Người chơi không thể tham gia hai trận cùng lúc. Người hoàn thành 20 trận sẽ dừng.'
    : 'Khi bắt đầu, hệ thống lên lịch đủ 20 trận cho mỗi người.';
  $('myChoice').textContent = st.started ? 'Tiến độ chung: ' + st.completedMatches + ' / ' + st.totalMatches + ' trận đã hoàn thành.' : '';
  $('pairs').innerHTML = active.map(m => {
    const a = m.players[0], b = m.players[1];
    const submitted = m.submittedCount;
    return '<div class="pair"><div class="tag">TRẬN #' + (m.id + 1) + '</div>' +
      '<div class="versus"><span>' + esc(playerNames[a]) + '<small> · trận ' + m.gameNumbers[a] + '/20</small></span><b>VS</b><span>' +
      esc(playerNames[b]) + '<small> · trận ' + m.gameNumbers[b] + '/20</small></span></div>' +
      '<div class="status"><span data-match-timer="' + m.id + '">Còn ' + (timeLeft(m) ?? 30) + ' giây</span> · ' + submitted +
      '/2 đã chốt · lựa chọn được giữ kín</div></div>';
  }).join('') || (st.started && !st.finished ? '<p class="muted">Đang chờ các trận đang chạy hoàn tất để ghép lượt tiếp theo.</p>' : '');
  $('finish').classList.toggle('hidden', !st.finished);
}
function renderPlayerView(st) {
  const player = st.players.find(p => p.id === playerId);
  const match = st.activeMatch;
  if (!player) return;
  $('playerRole').textContent = player.name.toUpperCase();
  $('playerProgress').style.width = Math.min(100, player.gamesPlayed / player.gamesTotal * 100) + '%';
  $('playerRound').textContent = st.finished ? 'ĐÃ KẾT THÚC' : 'TRẬN ' + (player.gamesPlayed + (match ? 1 : 0)) + ' / ' + player.gamesTotal;
  $('playerBase').textContent = match ? 'Điểm cơ sở: ' + match.basePoints[playerId] : 'Điểm: ' + player.score;
  $('playerScoreline').innerHTML = '<div class="player-scorebox"><span>' + esc(player.name) + '</span><strong>' + player.score + ' điểm</strong><small>' + player.gamesPlayed + '/' + player.gamesTotal + ' trận hoàn thành</small></div>';
  if (st.finished) {
    $('playerStatus').innerHTML = '<div class="player-result"><strong>Trò chơi đã kết thúc.</strong><p>Xếp hạng chính thức ưu tiên ít lần phản bội người đã hợp tác; tiếp theo là tỷ lệ hợp tác cao hơn rồi tổng điểm cao hơn.</p></div>';
    $('playerChoices').innerHTML = '';
    $('playerHistory').innerHTML = historyMarkup(player, 'Lịch sử 5 trận gần nhất của bạn');
    return;
  }
  if (!match) {
    $('playerStatus').innerHTML = player.gamesPlayed >= player.gamesTotal
      ? '<strong>Bạn đã hoàn thành đủ 20 trận.</strong><p>Chờ những người chơi còn lại hoàn thành.</p>'
      : '<strong>Bạn đang chờ ghép trận.</strong><p>Trận tiếp theo sẽ bắt đầu khi có đối thủ đang rảnh.</p>';
    $('playerChoices').innerHTML = '';
    $('playerHistory').innerHTML = historyMarkup(player, 'Lịch sử 5 trận gần nhất của bạn');
    return;
  }
  const opponentId = match.players.find(id => id !== playerId);
  const opponent = st.players.find(p => p.id === opponentId);
  const myChoice = match.choices[playerId];
  const locked = !!myChoice;
  const opponentChoice = match.choices[opponentId];
  $('playerStatus').textContent = locked
    ? 'Bạn đã chốt lựa chọn. Đang chờ ' + opponent.name + ' chốt. Lựa chọn của đối thủ chưa được tiết lộ.'
    : 'Bạn đang đấu với ' + opponent.name + '. Cả hai có 30 giây; lựa chọn được giữ kín đến khi trận kết thúc.';
  $('playerChoices').innerHTML =
    '<button class="player-choice ' + (myChoice === 'common' ? 'selected' : '') + '" ' + (locked ? 'disabled' : '') + ' data-choice="common">Hợp tác<small>Cả hai hợp tác: mỗi người nhận điểm cơ sở của trận này.</small></button>' +
    '<button class="player-choice self ' + (myChoice === 'self' ? 'selected' : '') + '" ' + (locked ? 'disabled' : '') + ' data-choice="self">Phản bội<small>Nếu đối thủ hợp tác: bạn nhận gấp đôi điểm cơ sở của bạn, đối thủ nhận 0. Cả hai phản bội: cả hai nhận 0.</small></button>';
  document.querySelectorAll('[data-choice]').forEach(btn => btn.onclick = () => {
    btn.disabled = true; $('playerNotice').textContent = 'Đang ghi nhận lựa chọn…';
    socket.emit('choose', { matchId: match.id, choice: btn.dataset.choice }, res => {
      if (!res?.ok) { $('playerNotice').textContent = res?.error || 'Không thể gửi lựa chọn'; renderPlayerView(state); }
      else $('playerNotice').textContent = '';
    });
  });
  $('playerHistory').innerHTML = historyMarkup(opponent, '5 trận gần nhất của ' + opponent.name);
}
function historyMarkup(player, title) {
  const recent = [...(player?.history || [])].sort((a, b) => b.gameNumber - a.gameNumber).slice(0, 5);
  return '<section class="player-history"><h3>' + esc(title || '5 trận gần nhất của đối thủ') + '</h3>' +
    (recent.length ? '<ol>' + recent.map(h => '<li><strong>Trận ' + h.gameNumber + ' · Đối đầu với ' + esc(h.opponent) +
      '</strong><div>Đã chọn: <strong>' + (h.choice === 'common' ? 'Hợp tác' : h.choice === 'self' ? 'Phản bội' : 'Hết giờ') +
      '</strong> · Đối thủ: ' + (h.opponentChoice === 'common' ? 'Hợp tác' : h.opponentChoice === 'self' ? 'Phản bội' : 'Hết giờ') +
      ' · Điểm nhận: ' + h.points + ' · Điểm cơ sở: ' + h.basePoints + '</div></li>').join('') +
      '</ol>' : '<p>Người chơi này chưa có lịch sử lựa chọn.</p>') + '</section>';
}
