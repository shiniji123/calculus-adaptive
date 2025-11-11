// ======= Config =======
const CHAPTERS_URL = './chapters.json';
const MAX_LEVEL = 5;
const PRESET_FIRST = [2, 3, 4];

// ======= State =======
let state = {
  chapterKey: null,
  totalQuestions: 20,
  pools: {},
  currentIndex: 0,
  currentQuestion: null,
  currentDifficulty: 2,
  answered: [],
  scoreSum: 0,
  scoreCounted: 0,
  tally: {
    1: { correct: 0, wrong: 0 },
    2: { correct: 0, wrong: 0 },
    3: { correct: 0, wrong: 0 },
    4: { correct: 0, wrong: 0 },
    5: { correct: 0, wrong: 0 },
  },
};

// ======= DOM =======
const scrHome   = document.getElementById('screen-home');
const scrQuiz   = document.getElementById('screen-quiz');
const scrResult = document.getElementById('screen-result');

const chapterSelect = document.getElementById('chapterSelect');
const questionCount = document.getElementById('questionCount');
const btnStart      = document.getElementById('btnStart');

const metaIndex   = document.getElementById('metaIndex');
const metaAvg     = document.getElementById('metaAvg');
const progressBar = document.getElementById('progressBar');

const quizQuestion = document.getElementById('quizQuestion');
const choicesWrap  = document.getElementById('choices');
const btnNext      = document.getElementById('btnNext');

const finalAverage = document.getElementById('finalAverage');
const levelSummary = document.getElementById('levelSummary');
const btnRestart   = document.getElementById('btnRestart');

const themeToggle  = document.getElementById('themeToggle');

// ======= Utils =======
function showScreen(el){
  [scrHome, scrQuiz, scrResult].forEach(s => s.classList.remove('active'));
  el.classList.add('active');
}

function katexRender(element, tex){
  element.innerHTML = katex.renderToString(tex, {throwOnError:false});
}

function clamp(n, lo, hi){ return Math.max(lo, Math.min(hi, n)); }

function shuffle(array){
  for (let i = array.length - 1; i > 0; i--){
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function nearestAvailableLevel(target){
  target = clamp(target, 1, MAX_LEVEL);
  if (state.pools[target] && state.pools[target].length) return target;
  for (let step=1; step<=MAX_LEVEL; step++){
    const lo = target - step;
    const hi = target + step;
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
  void progressBar.offsetWidth;
  progressBar.classList.add('progress-pulse');
}

// ======= Theme =======
function applyTheme(theme){
  if (!themeToggle) return;
  if (theme === 'dark'){
    document.body.setAttribute('data-theme', 'dark');
    themeToggle.textContent = '☀';
    themeToggle.setAttribute('aria-label', 'สลับเป็นโหมดสว่าง');
  } else {
    document.body.removeAttribute('data-theme');
    themeToggle.textContent = '🌙';
    themeToggle.setAttribute('aria-label', 'สลับเป็นโหมดมืด');
  }
  localStorage.setItem('calc_theme', theme);
}

function initTheme(){
  if (!themeToggle) return;
  const saved = localStorage.getItem('calc_theme');
  if (saved === 'dark' || saved === 'light'){
    applyTheme(saved);
  } else {
    const prefersDark = window.matchMedia &&
      window.matchMedia('(prefers-color-scheme: dark)').matches;
    applyTheme(prefersDark ? 'dark' : 'light');
  }
}

if (themeToggle){
  themeToggle.addEventListener('click', () => {
    const isDark = document.body.getAttribute('data-theme') === 'dark';
    applyTheme(isDark ? 'light' : 'dark');
  });
}

// ======= Feedback =======
const CONFETTI_COLORS = ['#22d3ee','#a78bfa','#f472b6','#f59e0b','#10b981','#f43f5e'];

function celebrateAt(element){
  if (!element) return;
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
    const cloned = datasets[lvl-1].slice();
    pools[lvl] = shuffle(cloned);
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

function renderQuestion(rawQ){
  const card = document.getElementById('quizCard');
  card.classList.remove('pop-in');
  void card.offsetWidth;
  card.classList.add('pop-in');

  // ปุ่มเริ่มต้นเป็น "ข้าม"
  btnNext.textContent = 'ข้าม';
  btnNext.dataset.mode = 'skip';

  // สุ่มตำแหน่งช้อยส์
  const order = [0,1,2,3];
  shuffle(order);
  const shuffledChoices = [];
  let newCorrectIndex = 0;
  order.forEach((oldIdx, newIdx) => {
    shuffledChoices[newIdx] = rawQ.choices[oldIdx];
    if (oldIdx === rawQ.correctIndex){
      newCorrectIndex = newIdx;
    }
  });

  const q = {
    ...rawQ,
    choices: shuffledChoices,
    correctIndex: newCorrectIndex
  };
  state.currentQuestion = q;

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
    difficulty = clamp(Math.round(adaptive), 1, MAX_LEVEL);
  }
  const level = nearestAvailableLevel(difficulty);
  if (level === null) return null;
  state.currentDifficulty = level;
  const arr = state.pools[level];
  return arr.shift() || null;
}

function markChoiceButtons(correctIndex, pickedIndex){
  const btns = Array.from(choicesWrap.children);
  btns.forEach((btn, idx) => {
    if (idx === correctIndex) btn.classList.add('correct');
    if (pickedIndex !== null && idx === pickedIndex && pickedIndex !== correctIndex){
      btn.classList.add('wrong');
    }
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

  // เปลี่ยนปุ่มเป็น "ข้อถัดไป"
  btnNext.textContent = 'ข้อถัดไป';
  btnNext.dataset.mode = 'next';
}

function forceWrongIfSkipped(){
  const anyColored = Array.from(choicesWrap.children)
    .some(b => b.classList.contains('correct') || b.classList.contains('wrong'));
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
  const rawQ = getNextQuestion();
  if (!rawQ){
    showResult();
    return;
  }
  renderQuestion(rawQ);
}

// ======= Result helpers =======
function renderLevelSummary(){
  levelSummary.innerHTML = '';
  let hasData = false;
  for (let lvl = 1; lvl <= MAX_LEVEL; lvl++){
    const {correct, wrong} = state.tally[lvl];
    const total = correct + wrong;
    if (!total) continue;
    hasData = true;
    const acc = total ? Math.round((correct / total) * 100) : 0;

    const pill = document.createElement('div');
    pill.className = 'level-pill';

    const label = document.createElement('div');
    label.className = 'level-pill-label';
    label.textContent = `ระดับความยาก ${lvl}`;
    pill.appendChild(label);

    const bar = document.createElement('div');
    bar.className = 'level-pill-bar';
    const fill = document.createElement('span');
    fill.className = 'level-pill-correct';
    fill.style.width = `${acc}%`;
    bar.appendChild(fill);
    pill.appendChild(bar);

    const text = document.createElement('div');
    text.className = 'level-pill-text';
    text.textContent = `${correct}/${total} ข้อถูก (${acc}%)`;
    pill.appendChild(text);

    levelSummary.appendChild(pill);
  }

  if (!hasData){
    const p = document.createElement('p');
    p.className = 'hint';
    p.textContent = 'ยังไม่มีข้อมูลเพียงพอในการสรุประดับความยาก';
    levelSummary.appendChild(p);
  }
}

function showResult(){
  showScreen(scrResult);

  const avg = averageScoreText();
  finalAverage.textContent =
    `คะแนนเฉลี่ยรวม (นับตั้งแต่ข้อที่ 4): ${avg}`;

  renderLevelSummary();

  const labels = ['ความยาก 1','ความยาก 2','ความยาก 3','ความยาก 4','ความยาก 5'];
  const correct = [1,2,3,4,5].map(l => state.tally[l].correct);
  const wrong   = [1,2,3,4,5].map(l => state.tally[l].wrong);

  const ctx = document.getElementById('resultChart').getContext('2d');
  const styles = getComputedStyle(document.body);
  const axisColor = styles.getPropertyValue('--muted').trim() || '#6b7280';

  if (window._chart) window._chart.destroy();
  window._chart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label:'ตอบถูก',
          data: correct,
          backgroundColor:'rgba(34,197,94,.78)'
        },
        {
          label:'ตอบผิด',
          data: wrong,
          backgroundColor:'rgba(239,68,68,.72)'
        }
      ]
    },
    options: {
      responsive:true,
      maintainAspectRatio:false, // ใช้ความสูงจาก CSS
      scales:{
        x:{
          stacked:false,
          ticks:{ color: axisColor, font:{ size:10 } },
          grid:{ display:false }
        },
        y:{
          beginAtZero:true,
          precision:0,
          ticks:{ color: axisColor, stepSize:1, font:{ size:10 } },
          grid:{ color:'rgba(148,163,253,.25)' }
        }
      },
      plugins:{
        legend:{
          position:'top',
          labels:{
            boxWidth:10,
            boxHeight:10,
            padding:6,
            font:{ size:10 },
            color: axisColor
          }
        }
      }
    }
  });

  // save history

  celebrateAt(document.querySelector('#screen-result .card'));
}

// ======= Start Quiz =======
async function startQuiz(){
  const chapterKey = chapterSelect.value;
  let total = parseInt(questionCount.value, 10);
  if (isNaN(total)) total = 20;
  total = clamp(total, 15, 100);

  state.pools = await loadPools(chapterKey);
  const available = Object.values(state.pools).reduce((s,a)=>s+a.length,0);
  if (total > available) total = available;

  state.chapterKey = chapterKey;
  state.totalQuestions = total;
  state.currentIndex = 1;
  state.answered = [];
  state.scoreSum = 0;
  state.scoreCounted = 0;
  state.tally = {
    1:{correct:0,wrong:0},
    2:{correct:0,wrong:0},
    3:{correct:0,wrong:0},
    4:{correct:0,wrong:0},
    5:{correct:0,wrong:0}
  };

  updateUIHeader();
  const rawQ = getNextQuestion();
  renderQuestion(rawQ);
  showScreen(scrQuiz);
}

// ======= Events =======
btnStart.addEventListener('click', startQuiz);

btnNext.addEventListener('click', () => {
  const mode = btnNext.dataset.mode || 'skip';
  if (mode === 'skip'){
    forceWrongIfSkipped();
    nextStep();
  } else {
    nextStep();
  }
});

btnRestart.addEventListener('click', () => {
  showScreen(scrHome);
});

// ======= Init =======
initTheme();
loadChapters();
