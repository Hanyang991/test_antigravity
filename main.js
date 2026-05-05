import './style.css'
import { RecognitionEngine } from './recognition.js'

const recognizer = new RecognitionEngine();
const state = {
  mode: 'bone', // 'bone' or 'rune'
  assistMode: 'free', // 'free', 'ruler', 'compass'
  material: 'parchment', // 'parchment', 'obsidian', 'water'
  isDrawing: false,
  strokes: [],       // Array of strokes. Stroke = array of points {x, y, t}
  currentStroke: [],
  canvasWidth: window.innerWidth,
  canvasHeight: window.innerHeight,
  
  // Analyzer data
  resonance: 0,
  heat: 0,
  pressure: 0,
  instability: 0,
  currentMeaning: '',
  currentDynamics: '',
  overloaded: false
};

// Elements
const canvas = document.getElementById('magic-canvas');
const ctx = canvas.getContext('2d');
const graphCanvas = document.getElementById('graph-canvas');
const graphCtx = graphCanvas.getContext('2d');

const btnDrawBone = document.getElementById('btn-draw-bone');
const btnDrawRune = document.getElementById('btn-draw-rune');
const btnClear = document.getElementById('btn-clear');
const btnUndo = document.getElementById('btn-undo');

const valResonance = document.getElementById('val-resonance');
const valHeat = document.getElementById('val-heat');
const valInstability = document.getElementById('val-instability');
const systemStatus = document.getElementById('system-status');

// Archive Elements
const archiveBadge = document.getElementById('archive-badge');
const archiveText = document.getElementById('archive-text');
const archiveSketch = document.getElementById('archive-sketch');
const btnPrevDoc = document.getElementById('btn-prev-doc');
const btnNextDoc = document.getElementById('btn-next-doc');
const btnCastMagic = document.getElementById('btn-cast-magic');
const riftContainer = document.getElementById('rift-container');
const materialSelect = document.getElementById('material-select');

// Assist Tools UI
const btnAssistFree = document.getElementById('btn-assist-free');
const btnAssistRuler = document.getElementById('btn-assist-ruler');
const btnAssistCompass = document.getElementById('btn-assist-compass');

// Archive Data
const RUNE_STROKE = 'rgba(255,255,255,0.5)';
const RUNE_W = 3;
function lineSvg(segments) {
  const lines = segments.map(([x1, y1, x2, y2]) =>
    `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${RUNE_STROKE}" stroke-width="${RUNE_W}"/>`
  ).join('');
  return `<svg width="100" height="100" viewBox="0 0 100 100">${lines}</svg>`;
}

const archives = [
  {
    id: 1,
    lore: '"투창은 흔들림 없이 솟구쳐야 한다. 수직선(기둥)을 세우고 양옆으로 날카로운 사선(가지)을 뻗어 티와즈(↑)의 맹렬함을 일깨워라."',
    svg: lineSvg([[50,90,50,10],[50,10,20,40],[50,10,80,40]])
  },
  {
    id: 2,
    lore: '"수호와 방벽의 룬 알기즈(Y). 기둥을 세우되 가지는 중간에서 위로 향하게 하라. 생명력을 감싸안는 형태가 될 것이다."',
    svg: lineSvg([[50,90,50,50],[50,50,20,10],[50,50,80,10]])
  },
  {
    id: 3,
    lore: '"두 룬의 기둥을 하나로 합쳐라. 교환을 상징하는 게보(X)와 얼음의 이사(|)가 만나면 폭풍이 몰아치리라."',
    svg: '<svg width="100" height="100" viewBox="0 0 100 100"><line x1="50" y1="10" x2="50" y2="90" stroke="rgba(0,255,255,0.8)" stroke-width="3"/><line x1="20" y1="20" x2="80" y2="80" stroke="rgba(255,51,102,0.8)" stroke-width="3"/><line x1="80" y1="20" x2="20" y2="80" stroke="rgba(255,51,102,0.8)" stroke-width="3"/></svg>'
  },
  {
    id: 4,
    lore: '"얼음의 이사(|). 한 줄기 곧은 수직선을 그어라. 흐름을 멈추고 세상을 응결시킬 것이다."',
    svg: lineSvg([[50,10,50,90]])
  },
  {
    id: 5,
    lore: '"대지(ㅡ)의 룬은 가로로 단단히 뻗어야 한다. 수평선 한 줄로 발판을 세우라."',
    svg: lineSvg([[10,50,90,50]])
  },
  {
    id: 6,
    lore: '"태양의 원(○)은 끊김 없는 한 호다. 컴퍼스로 닫힌 고리를 그려 빛의 순환을 봉인하라."',
    svg: '<svg width="100" height="100" viewBox="0 0 100 100"><circle cx="50" cy="50" r="38" stroke="rgba(255,255,255,0.5)" stroke-width="3" fill="none"/></svg>'
  },
  {
    id: 7,
    lore: '"횃불의 케나즈(<). 한 점에서 두 빗금이 양옆으로 갈라져 빛을 토해내게 하라."',
    svg: lineSvg([[80,15,20,50],[20,50,80,85]])
  },
  {
    id: 8,
    lore: '"우박의 하갈라즈(H). 두 기둥 사이를 한 줄로 묶어라. 자연의 무자비한 균열을 부르리라."',
    svg: lineSvg([[15,15,15,85],[85,15,85,85],[15,50,85,50]])
  },
  {
    id: 9,
    lore: '"통로의 에와즈(M). 두 기둥과 그 사이의 골짜기로 이어지는 길을 새겨라. 무엇이든 지나갈 수 있다."',
    svg: lineSvg([[15,85,15,15],[15,15,50,85],[50,85,85,15],[85,15,85,85]])
  },
  {
    id: 10,
    lore: '"열기(△)의 부수. 세 빗금으로 뾰족한 봉우리를 만들어라. 다른 룬과 겹치면 새로운 권능이 깃든다."',
    svg: lineSvg([[50,15,15,85],[15,85,85,85],[85,85,50,15]])
  },
  {
    id: 11,
    lore: '"새벽의 다가즈(◇). 네 변의 마름모를 닫아 어둠과 빛이 교차하는 문을 열어라."',
    svg: lineSvg([[50,15,85,50],[85,50,50,85],[50,85,15,50],[15,50,50,15]])
  },
  {
    id: 12,
    lore: '"필요의 나우디즈(+). 수직과 수평이 정확히 교차해야 한다. 두 줄기가 만나는 그곳에 결핍을 못박아라."',
    svg: lineSvg([[50,15,50,85],[15,50,85,50]])
  },
  {
    id: 13,
    lore: '"흐름의 라구즈(L). 곧추선 기둥을 세우고 발치에서 가로로 흘려보내라. 물이 향하는 길을 일러줄 것이다."',
    svg: lineSvg([[15,15,15,85],[15,85,85,85]])
  }
];

let currentArchiveIndex = 0;

// Init
function init() {
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);
  
  // Events
  canvas.addEventListener('mousedown', startDrawing);
  canvas.addEventListener('mousemove', draw);
  canvas.addEventListener('mouseup', stopDrawing);
  canvas.addEventListener('mouseout', stopDrawing);
  
  // UI Events
  btnDrawBone.addEventListener('click', () => setMode('bone'));
  btnDrawRune.addEventListener('click', () => setMode('rune'));
  btnClear.addEventListener('click', clearCanvas);
  btnUndo.addEventListener('click', undoLastStroke);
  window.addEventListener('keydown', (e) => {
    // Ctrl+Z (and Cmd+Z on macOS) → undo last stroke. Ignore when typing
    // in form fields so the material <select> keeps its native behavior.
    const target = e.target;
    const inForm = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT');
    if (!inForm && (e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === 'z' || e.key === 'Z')) {
      e.preventDefault();
      undoLastStroke();
    }
  });
  
  btnAssistFree.addEventListener('click', () => setAssistMode('free'));
  btnAssistRuler.addEventListener('click', () => setAssistMode('ruler'));
  btnAssistCompass.addEventListener('click', () => setAssistMode('compass'));

  materialSelect.addEventListener('change', (e) => {
    state.material = e.target.value;
    clearCanvas();
  });
  
  btnPrevDoc.addEventListener('click', () => changeArchive(-1));
  btnNextDoc.addEventListener('click', () => changeArchive(1));
  btnCastMagic.addEventListener('click', castMagic);
  
  updateArchiveUI();

  // Start loop
  requestAnimationFrame(renderLoop);
}

function changeArchive(dir) {
  currentArchiveIndex += dir;
  if (currentArchiveIndex < 0) currentArchiveIndex = 0;
  if (currentArchiveIndex >= archives.length) currentArchiveIndex = archives.length - 1;
  updateArchiveUI();
}

function updateArchiveUI() {
  const doc = archives[currentArchiveIndex];
  archiveBadge.innerText = `문서 #${String(doc.id).padStart(2, '0')}`;
  archiveText.innerText = doc.lore;
  archiveSketch.innerHTML = doc.svg;
}

function castMagic() {
  // Visual effect for casting into Rift
  riftContainer.style.animation = 'none'; // reset
  setTimeout(() => {
    riftContainer.style.animation = 'pulse 0.5s ease-out 3';
  }, 10);
  
  systemStatus.innerText = `[마법 주입!] ${state.currentMeaning}이(가) 균열로 빨려들어갑니다!`;
  systemStatus.style.color = '#fff';
  
  // Flash effect on canvas
  ctx.fillStyle = 'rgba(138, 43, 226, 0.5)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  setTimeout(() => {
    clearCanvas();
  }, 500);
}

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  state.canvasWidth = canvas.width;
  state.canvasHeight = canvas.height;
}

function setMode(mode) {
  state.mode = mode;
  btnDrawBone.classList.toggle('active', mode === 'bone');
  btnDrawRune.classList.toggle('active', mode === 'rune');
  systemStatus.innerText = mode === 'bone' ? '뼈대 스케치 모드' : '룬 문자 각인 모드';
}

function setAssistMode(assistMode) {
  state.assistMode = assistMode;
  btnAssistFree.classList.toggle('active', assistMode === 'free');
  btnAssistRuler.classList.toggle('active', assistMode === 'ruler');
  btnAssistCompass.classList.toggle('active', assistMode === 'compass');
}

function clearCanvas() {
  state.strokes = [];
  state.currentStroke = [];
  state.overloaded = false;
  state.resonance = 0;
  state.heat = 0;
  state.instability = 0;
  updateAnalyzerUI();
}

// Pop the most recent completed stroke and re-run the analyzer. We rebuild
// resonance/heat/instability from the remaining strokes via analyzeCurrentState
// rather than tracking deltas — that way Undo always shows the exact state the
// canvas would have had if the last stroke were never drawn.
function undoLastStroke() {
  if (state.isDrawing) return; // mid-stroke: ignore so we don't desync
  if (state.strokes.length === 0) return;
  state.strokes.pop();
  if (state.strokes.length === 0) {
    // Reset transient analyzer values when nothing remains
    state.resonance = 0;
    state.heat = 0;
    state.instability = 0;
    state.overloaded = false;
    state.currentMeaning = '';
    state.currentDynamics = '';
    systemStatus.innerText = '대기 중...';
    systemStatus.style.color = '#fff';
    btnCastMagic.style.display = 'none';
    updateAnalyzerUI();
    return;
  }
  analyzeCurrentState();
}

// Drawing Logic
let drawStartPt = null;

function startDrawing(e) {
  state.isDrawing = true;
  const { offsetX, offsetY } = e;
  drawStartPt = { x: offsetX, y: offsetY, t: Date.now() };
  state.currentStroke = [{
    x: offsetX,
    y: offsetY,
    t: Date.now(),
    mode: state.mode
  }];
}

function draw(e) {
  if (!state.isDrawing) return;
  const { offsetX, offsetY } = e;
  const now = Date.now();
  
  if (state.assistMode === 'free') {
    state.currentStroke.push({
      x: offsetX,
      y: offsetY,
      t: now,
      mode: state.mode
    });
  } else if (state.assistMode === 'ruler') {
    // Densify the straight line so the $P recognizer has enough samples.
    // Two raw points fail the `points.length < 5` early-return inside
    // identifyRune (and even with multiple ruler strokes, sparse points
    // produce poor resample/Scale results).
    const segments = 32;
    const linePoints = [];
    for (let i = 0; i <= segments; i++) {
      const a = i / segments;
      linePoints.push({
        x: drawStartPt.x + (offsetX - drawStartPt.x) * a,
        y: drawStartPt.y + (offsetY - drawStartPt.y) * a,
        t: i === 0 ? drawStartPt.t : now,
        mode: state.mode
      });
    }
    state.currentStroke = linePoints;
  } else if (state.assistMode === 'compass') {
    // Generate perfect circle
    const r = Math.hypot(offsetX - drawStartPt.x, offsetY - drawStartPt.y);
    const circlePoints = [];
    const segments = 32;
    for(let i=0; i<=segments; i++) {
        const theta = (i / segments) * Math.PI * 2;
        circlePoints.push({
            x: drawStartPt.x + r * Math.cos(theta),
            y: drawStartPt.y + r * Math.sin(theta),
            t: now,
            mode: state.mode
        });
    }
    state.currentStroke = circlePoints;
  }
  
  // Simple analysis update on draw
  analyzeCurrentState();
}

function stopDrawing() {
  if (state.isDrawing && state.currentStroke.length > 0) {
    // Assist tool benefit: Reduce time penalty by marking them drawn very slowly = low resistance
    if (state.assistMode !== 'free') {
       state.currentStroke.forEach(pt => pt.t = Date.now() - 5000); // Hack to simulate slow, careful drawing
    }
    state.strokes.push([...state.currentStroke]);
    state.currentStroke = [];
  }
  state.isDrawing = false;
  drawStartPt = null;
  analyzeCurrentState();
}

// Rendering Loop
function renderLoop() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  if (state.overloaded) {
     ctx.fillStyle = 'rgba(255, 0, 0, 0.2)';
     ctx.fillRect(0, 0, canvas.width, canvas.height);
     ctx.fillStyle = '#ff3366';
     ctx.font = '40px sans-serif';
     ctx.textAlign = 'center';
     ctx.fillText('OVERLOAD', canvas.width/2, canvas.height/2);
     requestAnimationFrame(renderLoop);
     return;
  }

  const now = Date.now() / 1000;

  if (state.material === 'water') {
     ctx.fillStyle = 'rgba(0, 50, 100, 0.1)';
     ctx.fillRect(0, 0, canvas.width, canvas.height);
  } else if (state.material === 'obsidian') {
     ctx.fillStyle = 'rgba(20, 10, 30, 0.3)';
     ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  const allStrokes = [...state.strokes];
  if (state.isDrawing && state.currentStroke.length > 0) {
    allStrokes.push(state.currentStroke);
  }

  allStrokes.forEach((stroke) => {
    if (stroke.length < 2) return;
    
    ctx.beginPath();
    for (let i = 0; i < stroke.length; i++) {
      let pt = stroke[i];
      let dx = 0;
      let dy = 0;
      
      if (state.material === 'water' && !state.isDrawing) {
         const timeDiff = now - (pt.t / 1000);
         dx = Math.sin(timeDiff * 2 + pt.y * 0.05) * (timeDiff * 2);
         dy = Math.cos(timeDiff * 2 + pt.x * 0.05) * (timeDiff * 2);
      }
      
      if (i === 0) ctx.moveTo(pt.x + dx, pt.y + dy);
      else ctx.lineTo(pt.x + dx, pt.y + dy);
    }
  
    const mode = stroke[0].mode;
    if (mode === 'bone') {
      ctx.strokeStyle = 'rgba(0, 255, 255, 0.8)';
      ctx.lineWidth = 2;
      ctx.shadowColor = 'rgba(0, 255, 255, 0.5)';
      ctx.shadowBlur = 10;
    } else {
      ctx.strokeStyle = 'rgba(255, 51, 102, 0.9)';
      ctx.lineWidth = 4;
      ctx.shadowColor = 'rgba(255, 51, 102, 0.8)';
      ctx.shadowBlur = 15;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
    }
    ctx.stroke();
    ctx.shadowBlur = 0;
  });
  renderGraph();
  
  requestAnimationFrame(renderLoop);
}

// Analysis Logic
function analyzeCurrentState() {
  const allStrokes = [...state.strokes];
  if (state.isDrawing && state.currentStroke.length > 0) {
    allStrokes.push(state.currentStroke);
  }

  const runeStrokes = allStrokes.filter(s => s.length > 0 && s[0].mode === 'rune');
  const boneStrokes = allStrokes.filter(s => s.length > 0 && s[0].mode === 'bone');

  let boneLines = boneStrokes.length;
  let runeLines = runeStrokes.length;

  const analysis = recognizer.analyzeRune(runeStrokes, boneStrokes);

  // Thermodynamics: Volume (V) = Area of Bones
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  boneStrokes.forEach(stroke => {
    stroke.forEach(pt => {
      if(pt.x < minX) minX = pt.x;
      if(pt.y < minY) minY = pt.y;
      if(pt.x > maxX) maxX = pt.x;
      if(pt.y > maxY) maxY = pt.y;
    });
  });
  
  let volume = 1;
  if (minX !== Infinity) {
    volume = Math.max(((maxX - minX) * (maxY - minY)) / 10000, 1);
  }

  // Thermodynamics: Density (n)
  let density = 0;
  runeStrokes.forEach(stroke => {
    density += stroke.length;
  });

  // Calculate Heat based on drawing speed (Resistance Heat = I^2R)
  let newHeat = 0;
  allStrokes.forEach(stroke => {
    if (stroke.length > 5) {
       const timeTaken = stroke[stroke.length-1].t - stroke[0].t;
       if (timeTaken > 0) {
         const speed = stroke.length / timeTaken; // Points per ms
         // Fast speed = high resistance = high heat
         newHeat += speed * 500;
       }
    }
  });

  state.resonance = Math.min(boneLines * 12.5, 100);
  state.heat = Math.floor(newHeat + (analysis.radicals.length * 50));
  
  // Thermodynamics: Pressure (P) = (n * T) / V
  state.pressure = Math.floor((density * Math.max(state.heat, 1)) / (volume * 10));

  let baseInstability = (state.pressure * 0.1) + (state.heat * 0.05) - (state.resonance * 0.5);
  
  // Material Modifiers
  let maxHeat = 150;
  if (state.material === 'obsidian') {
    maxHeat = 9999;
    baseInstability -= 20; // Obsidian is very stable
  } else if (state.material === 'water') {
    maxHeat = 300;
    baseInstability += 10;
  }
  
  state.instability = Math.max(Math.min(baseInstability + analysis.instabilityModifier, 100), 0);

  // Overload reflects whether the current stroke set exceeds limits. Recompute
  // every analysis so removing a stroke (Undo) or pure clear can take the canvas
  // out of overload without an explicit reset, and so the OVERLOAD overlay can't
  // be left stuck on top of a perfectly safe heat/instability reading.
  state.overloaded = state.heat > maxHeat || state.instability >= 100;

  state.currentMeaning = analysis.meaning;
  state.currentDynamics = analysis.dynamics;

  updateAnalyzerUI();
}

function updateAnalyzerUI() {
  valResonance.innerText = state.resonance.toFixed(1) + ' Hz';
  valHeat.innerText = state.heat + ' °C';
  valInstability.innerText = state.instability.toFixed(0) + '%';
  
  
  if (state.instability > 80) {
    systemStatus.innerText = `[경고] 붕괴 임박! (${state.currentMeaning})`;
    systemStatus.style.color = '#ff3366';
    btnCastMagic.style.display = 'none';
  } else if (state.resonance > 30 && runeStrokesCount() > 0) {
    systemStatus.innerText = `발현 중: ${state.currentMeaning} - ${state.currentDynamics}`;
    systemStatus.style.color = '#8a2be2';
    btnCastMagic.style.display = 'block'; // Show cast button when magic is active
  } else if (state.strokes.length > 0) {
    systemStatus.innerText = `분석 중: ${state.currentMeaning}`;
    systemStatus.style.color = '#00ffff';
    btnCastMagic.style.display = 'none';
  } else {
    systemStatus.innerText = '대기 중...';
    systemStatus.style.color = '#8a2be2';
    btnCastMagic.style.display = 'none';
  }
}

function runeStrokesCount() {
  return state.strokes.filter(s => s.length > 0 && s[0].mode === 'rune').length;
}

// Mini Graph render
let graphTime = 0;
function renderGraph() {
  graphTime += 0.05;
  graphCtx.clearRect(0, 0, graphCanvas.width, graphCanvas.height);
  
  // Draw a sine wave based on resonance and instability
  const amplitude = 10 + (state.instability * 0.4);
  const frequency = 0.05 + (state.resonance * 0.002);
  
  graphCtx.beginPath();
  for(let x = 0; x < graphCanvas.width; x++) {
    const y = (graphCanvas.height / 2) + Math.sin(x * frequency + graphTime) * amplitude;
    if(x === 0) graphCtx.moveTo(x, y);
    else graphCtx.lineTo(x, y);
  }
  
  graphCtx.strokeStyle = state.instability > 80 ? '#ff3366' : '#00ffff';
  graphCtx.lineWidth = 2;
  graphCtx.stroke();
}

init();
