
// ======= Config =======
const CHAPTERS_URL = './chapters.json';
const MAX_LEVEL = 5;
const PRESET_FIRST = [2,3,4]; // 3 first questions start at difficulties 2,3,4

// ======= State =======
let state = {
  chapterKey: null,
  totalQuestions: 20,
  pools: {},         // {level: [questions]}
  currentIndex: 0,   // 1-based position in the quiz
  currentQuestion: null,
  currentDifficulty: 2,
  answered: [],      // [{difficulty, correct} ...]
  scoreSum: 0,       // sum of earned points (difficulty) -- starting count from Q4
  scoreCounted: 0,   // #counted questions (from Q4)
  tally: {           // per-level result counts
    1:{correct:0, wrong:0},
    2:{correct:0, wrong:0},
    3:{correct:0, wrong:0},
    4:{correct:0, wrong:0},
    5:{correct:0, wrong:0},
  }
};

// ======= DOM =======
const scrHome   = document.getElementById('screen-home');
const scrQuiz   = document.getElementById('screen-quiz');
const scrResult = document.getElementById('screen-result');

const chapterSelect   = document.getElementById('chapterSelect');
const questionCount   = document.getElementById('questionCount');
const btnStart        = document.getElementById('btnStart');

const metaIndex = document.getElementById('metaIndex');
const metaAvg   = document.getElementById('metaAvg');
const progressBar = document.getElementById('progressBar');

const quizQuestion = document.getElementById('quizQuestion');
const choicesWrap  = document.getElementById('choices');
const btnNext      = document.getElementById('btnNext');

const finalAverage = document.getElementById('finalAverage');
const btnRestart   = document.getElementById('btnRestart');
const histList     = document.getElementById('historyList');

// ======= Utils =======
function showScreen(el){
  [scrHome, scrQuiz, scrResult].forEach(s => s.classList.remove('active'));
  el.classList.add('active');
}

function katexRender(element, tex){
  element.innerHTML = katex.renderToString(tex, {throwOnError:false});
}

function clamp(n, lo, hi){ return Math.max(lo, Math.min(hi, n)); }

function nearestAvailableLevel(target){
  target = clamp(target, 1, MAX_LEVEL);
  if (state.pools[target] && state.pools[target].length) return target;
  for (let step=1; step<=MAX_LEVEL; step++){
    const lo = target - step, hi = target + step;
    if (lo >= 1 && state.pools[lo] && state.pools[lo].length) return lo;
    if (hi <= MAX_LEVEL && state.pools[hi] && state.pools[hi].length) return hi;
  }
  return null;
}

function computeAdaptiveScore(){
  if (state.answered.length === 0) return 3;
  let sum = 0;
  for (const a of state.answered){
    sum += a.difficulty + (a.correct ? 1 : -1);
  }
  return sum / state.answered.length;
}

function averageScoreText(){
  const avg = (state.scoreCounted>0) ? (state.scoreSum / state.scoreCounted) : 0;
  return avg.toFixed(2);
}

function pulseProgress(){
  progressBar.classList.remove('progress-pulse');
  // force reflow to restart animation
  void progressBar.offsetWidth;
  progressBar.classList.add('progress-pulse');
}

// ======= Celebration / Feedback =======
const CONFETTI_COLORS = ['#22d3ee','#a78bfa','#f472b6','#f59e0b','#10b981','#f43f5e'];

function celebrateAt(element){
  const rect = element.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  for (let i=0;i<24;i++){
    const span = document.createElement('span');
    span.className = 'confetti';
    const dx = (Math.random()*2-1) * 220;
    const dy = (Math.random()*-1) * (150 + Math.random()*120);
    span.style.setProperty('--cx', `${cx}px`);
    span.style.setProperty('--cy', `${cy}px`);
    span.style.setProperty('--tx', `${dx}px`);
    span.style.setProperty('--ty', `${dy}px`);
    span.style.background = CONFETTI_COLORS[(Math.random()*CONFETTI_COLORS.length)|0];
    document.body.appendChild(span);
    setTimeout(()=>span.remove(), 750);
  }
}

function shakeCard(){
  const card = document.getElementById('quizCard');
  card.classList.remove('shake');
  void card.offsetWidth;
  card.classList.add('shake');
}

// ======= Data Loading =======
async function loadChapters(){
  const meta = await fetch(CHAPTERS_URL).then(r => r.json());
  chapterSelect.innerHTML = '';
  meta.chapters.forEach(ch => {
    const op = document.createElement('option');
    op.value = ch.key;
    op.textContent = ch.title;
    chapterSelect.appendChild(op);
  });
}

async function loadPools(chapterKey){
  const promises = [];
  for (let lvl=1; lvl<=MAX_LEVEL; lvl++){
    promises.push(fetch(`./problems/${chapterKey}/level${lvl}.json`).then(r => r.json()));
  }
  const datasets = await Promise.all(promises);
  const pools = {};
  for (let lvl=1; lvl<=MAX_LEVEL; lvl++){
    pools[lvl] = datasets[lvl-1].slice();
  }
  return pools;
}

// ======= Quiz Flow =======
function updateUIHeader(){
  metaIndex.textContent = `ข้อ ${state.currentIndex}/${state.totalQuestions}`;
  metaAvg.textContent = `คะแนนเฉลี่ยปัจจุบัน: ${averageScoreText()}`;
  const pct = Math.round((state.currentIndex-1)*100/state.totalQuestions);
  progressBar.style.width = pct + '%';
  pulseProgress();
}

function renderQuestion(q){
  const card = document.getElementById('quizCard');
  card.classList.remove('pop-in');
  void card.offsetWidth;
  card.classList.add('pop-in');

  katexRender(quizQuestion, q.question);
  choicesWrap.innerHTML = '';
  q.choices.forEach((ch, idx) => {
    const btn = document.createElement('button');
    btn.className = 'choice-btn';
    katexRender(btn, ch);
    btn.addEventListener('click', () => onChoose(idx, btn));
    choicesWrap.appendChild(btn);
  });
}

function getNextQuestion(){
  let difficulty;
  if (state.currentIndex <= PRESET_FIRST.length){
    difficulty = PRESET_FIRST[state.currentIndex - 1];
  } else {
    const adaptive = computeAdaptiveScore();
    difficulty = Math.round(adaptive);
    difficulty = clamp(difficulty, 1, MAX_LEVEL);
  }
  const level = nearestAvailableLevel(difficulty);
  if (level === null) return null;
  state.currentDifficulty = level;
  const arr = state.pools[level];
  const q = arr.shift();
  return q;
}

function markChoiceButtons(correctIndex, pickedIndex){
  const btns = Array.from(choicesWrap.children);
  btns.forEach((btn, idx) => {
    if (idx === correctIndex) btn.classList.add('correct');
    if (pickedIndex !== null && idx === pickedIndex && pickedIndex !== correctIndex) btn.classList.add('wrong');
    btn.disabled = true;
  });
}

function onChoose(idx, btnEl){
  if (!state.currentQuestion) return;
  const correct = (idx === state.currentQuestion.correctIndex);
  markChoiceButtons(state.currentQuestion.correctIndex, idx);

  const diff = state.currentDifficulty;
  state.answered.push({difficulty: diff, correct});
  if (correct){
    state.tally[diff].correct++;
    celebrateAt(btnEl);
  } else {
    state.tally[diff].wrong++;
    shakeCard();
  }
  if (state.currentIndex >= 4){
    if (correct) state.scoreSum += diff;
    state.scoreCounted += 1;
  }
}

function forceWrongIfSkipped(){
  const anyColored = Array.from(choicesWrap.children).some(b => b.classList.contains('correct') || b.classList.contains('wrong'));
  if (!anyColored && state.currentQuestion){
    markChoiceButtons(state.currentQuestion.correctIndex, null);
    const diff = state.currentDifficulty;
    state.answered.push({difficulty: diff, correct:false});
    state.tally[diff].wrong++;
    if (state.currentIndex >= 4){
      state.scoreCounted += 1;
    }
    shakeCard();
  }
}

function nextStep(){
  if (state.currentIndex >= state.totalQuestions){
    showResult();
    return;
  }
  state.currentIndex += 1;
  updateUIHeader();
  const q = getNextQuestion();
  state.currentQuestion = q;
  if (!q){
    showResult();
    return;
  }
  renderQuestion(q);
}

function showResult(){
  showScreen(scrResult);
  const avg = averageScoreText();
  finalAverage.textContent = `คะแนนเฉลี่ยรวม (นับตั้งแต่ข้อที่ 4): ${avg}`;

  // draw chart
  const ctx = document.getElementById('resultChart').getContext('2d');
  const labels = ['ความยาก 1','ความยาก 2','ความยาก 3','ความยาก 4','ความยาก 5'];
  const correct = [1,2,3,4,5].map(l => state.tally[l].correct);
  const wrong   = [1,2,3,4,5].map(l => state.tally[l].wrong);
  if (window._chart) window._chart.destroy();
  window._chart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {label:'ตอบถูก', data: correct, backgroundColor: 'rgba(34,197,94,.75)'},
        {label:'ตอบผิด', data: wrong,   backgroundColor: 'rgba(239,68,68,.65)'}
      ]
    },
    options: {
      responsive: true,
      scales: { x: {stacked:false}, y:{beginAtZero:true, precision:0} }
    }
  });

  // history
  const record = {
    chapter: state.chapterKey,
    avg: parseFloat(avg),
    when: new Date().toISOString(),
    tally: state.tally
  };
  const key = 'calc_adaptive_history_v1';
  const arr = JSON.parse(localStorage.getItem(key) || '[]');
  arr.unshift(record);
  localStorage.setItem(key, JSON.stringify(arr.slice(0,10)));
  renderHistory(arr.slice(0,5));

  // splash confetti once on result
  celebrateAt(document.querySelector('#screen-result .card'));
}

function renderHistory(arr){
  histList.innerHTML = '';
  if (!arr || !arr.length){
    const li = document.createElement('li');
    li.textContent = 'ยังไม่มีประวัติ';
    histList.appendChild(li);
    return;
  }
  arr.forEach(rec => {
    const dt = new Date(rec.when);
    const li = document.createElement('li');
    li.textContent = `${dt.toLocaleString()} • บท: ${rec.chapter} • Avg: ${rec.avg.toFixed(2)}`;
    histList.appendChild(li);
  });
}

async function startQuiz(){
  const chapterKey = chapterSelect.value;
  let total = parseInt(questionCount.value, 10);
  if (isNaN(total)) total = 20;
  total = clamp(total, 15, 100);

  state.pools = await loadPools(chapterKey);
  const available = Object.values(state.pools).reduce((s, a) => s + a.length, 0);
  if (total > available) total = available;

  state.chapterKey = chapterKey;
  state.totalQuestions = total;
  state.currentIndex = 1;
  state.answer = [];
  state.scoreSum = 0;
  state.scoreCounted = 0;
  state.tally = {1:{correct:0,wrong:0},2:{correct:0,wrong:0},3:{correct:0,wrong:0},4:{correct:0,wrong:0},5:{correct:0,wrong:0}};
  state.answered = [];

  updateUIHeader();
  state.currentQuestion = getNextQuestion();
  renderQuestion(state.currentQuestion);

  showScreen(scrQuiz);
}

btnStart.addEventListener('click', startQuiz);
btnNext.addEventListener('click', () => { forceWrongIfSkipped(); nextStep(); });
btnRestart.addEventListener('click', () => { showScreen(scrHome); });
loadChapters();
