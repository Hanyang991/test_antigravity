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
const archives = [
  {
    id: 1,
    lore: '"투창은 흔들림 없이 솟구쳐야 한다. 수직선(기둥)을 세우고 양옆으로 날카로운 사선(가지)을 뻗어 티와즈(↑)의 맹렬함을 일깨워라."',
    svg: '<svg width="100" height="100" viewBox="0 0 100 100"><line x1="50" y1="90" x2="50" y2="10" stroke="rgba(255,255,255,0.5)" stroke-width="3"/><line x1="50" y1="10" x2="20" y2="40" stroke="rgba(255,255,255,0.5)" stroke-width="3"/><line x1="50" y1="10" x2="80" y2="40" stroke="rgba(255,255,255,0.5)" stroke-width="3"/></svg>'
  },
  {
    id: 2,
    lore: '"수호와 방벽의 룬 알기즈(Y). 기둥을 세우되 가지는 중간에서 위로 향하게 하라. 생명력을 감싸안는 형태가 될 것이다."',
    svg: '<svg width="100" height="100" viewBox="0 0 100 100"><line x1="50" y1="90" x2="50" y2="50" stroke="rgba(255,255,255,0.5)" stroke-width="3"/><line x1="50" y1="50" x2="20" y2="10" stroke="rgba(255,255,255,0.5)" stroke-width="3"/><line x1="50" y1="50" x2="80" y2="10" stroke="rgba(255,255,255,0.5)" stroke-width="3"/></svg>'
  },
  {
    id: 3,
    lore: '"두 룬의 기둥을 하나로 합쳐라. 교환을 상징하는 게보(X)와 얼음의 이사(|)가 만나면 폭풍이 몰아치리라."',
    svg: '<svg width="100" height="100" viewBox="0 0 100 100"><line x1="50" y1="10" x2="50" y2="90" stroke="rgba(0,255,255,0.8)" stroke-width="3"/><line x1="20" y1="20" x2="80" y2="80" stroke="rgba(255,51,102,0.8)" stroke-width="3"/><line x1="80" y1="20" x2="20" y2="80" stroke="rgba(255,51,102,0.8)" stroke-width="3"/></svg>'
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
  archiveBadge.innerText = `문서 #0${doc.id}`;
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
    // Only two points: start and current
    state.currentStroke = [
      { x: drawStartPt.x, y: drawStartPt.y, t: drawStartPt.t, mode: state.mode },
      { x: offsetX, y: offsetY, t: now, mode: state.mode }
    ];
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

  // Overload Check
  if (state.heat > maxHeat || state.instability >= 100) {
     state.overloaded = true;
  }

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
