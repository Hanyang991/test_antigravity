import os

main_js_path = r'f:\test_antigravity\main.js'
with open(main_js_path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Imports
content = content.replace("import { RiftGame } from './rift.js';", "import { assignmentSystem } from './assignmentSystem.js';")
content = content.replace("const riftGame = new RiftGame();", "")

# 2. UI Updates
old_refresh = """function refreshRiftUI() {
  const elScore = document.getElementById('rift-score');
  const elLevel = document.getElementById('rift-level');
  const elThreatVal = document.getElementById('rift-threat-val');
  const elThreatFill = document.getElementById('rift-threat-fill');
  const elDemandBlock = document.getElementById('rift-demand-block');
  const elDemandName = document.getElementById('rift-demand-name');
  const elDemandSketch = document.getElementById('rift-demand-sketch');
  const elTimer = document.getElementById('rift-timer');
  const elMessage = document.getElementById('rift-message');
  const btnStart = document.getElementById('btn-rift-start');
  const btnStop = document.getElementById('btn-rift-stop');

  elScore.textContent = riftGame.score;
  elLevel.textContent = riftGame.getLevel();
  elThreatVal.textContent = Math.floor(riftGame.threat) + '%';
  elThreatFill.style.width = riftGame.threat + '%';

  // Set visual threat tier on body for background pulsing
  let threatTier = 'low';
  if (riftGame.threat > 85) threatTier = 'over';
  else if (riftGame.threat > 50) threatTier = 'high';
  else if (riftGame.threat > 20) threatTier = 'mid';
  document.body.setAttribute('data-threat', threatTier);

  elMessage.textContent = riftGame.message;
  elMessage.className = 'rift-message';
  if (riftGame.lastResult) {
    elMessage.classList.add(riftGame.lastResult);
  }

  if (riftGame.status === 'active') {
    btnStart.style.display = 'none';
    btnStop.style.display = 'block';
    if (riftGame.demand) {
      elDemandBlock.style.display = 'grid';
      elDemandName.textContent = riftGame.demand.label;
      elDemandSketch.innerHTML = riftGame.demand.sketch;
      elTimer.textContent = Math.ceil(riftGame.timeRemaining) + 's';
      if (riftGame.timeRemaining <= 5) {
        elTimer.style.color = '#ff3366';
        pulseUi(elDemandBlock, 'ui-pulse-soft');
      } else {
        elTimer.style.color = 'var(--color-secondary)';
      }
    } else {
      elDemandBlock.style.display = 'none';
    }
  } else {
    btnStart.style.display = 'block';
    btnStop.style.display = 'none';
    elDemandBlock.style.display = 'none';
    document.body.setAttribute('data-threat', 'low');
  }
}"""

old_refresh_cr = old_refresh.replace('\n', '\r\n')

new_refresh = """function refreshRiftUI() {
  const elScore = document.getElementById('rift-score');
  const elLevel = document.getElementById('rift-level');
  const elDemandBlock = document.getElementById('rift-demand-block');
  const elDemandName = document.getElementById('rift-demand-name');
  const elDemandSketch = document.getElementById('rift-demand-sketch');
  const elTimer = document.getElementById('rift-timer');
  const elMessage = document.getElementById('rift-message');

  elScore.textContent = assignmentSystem.score;
  elLevel.textContent = assignmentSystem.getLevel();

  elMessage.textContent = assignmentSystem.message;
  elMessage.className = 'rift-message';
  if (assignmentSystem.lastResult) {
    elMessage.classList.add(assignmentSystem.lastResult);
  }

  if (assignmentSystem.demand) {
    elDemandBlock.style.display = 'grid';
    elDemandName.textContent = assignmentSystem.demand.label;
    elDemandSketch.innerHTML = assignmentSystem.demand.sketch;
    elTimer.textContent = 'D-' + assignmentSystem.daysRemaining;
    if (assignmentSystem.daysRemaining <= 1) {
      elTimer.style.color = '#8b0000';
      pulseUi(elDemandBlock, 'ui-pulse-soft');
    } else {
      elTimer.style.color = 'var(--color-secondary)';
    }
  } else {
    elDemandBlock.style.display = 'none';
  }
  
  // Clean up any old threat styles
  document.body.setAttribute('data-threat', 'low');
}"""

content = content.replace(old_refresh, new_refresh)
content = content.replace(old_refresh_cr, new_refresh)

# 3. Cast Magic
content = content.replace('const castResult = riftGame.cast(result);', 'const castResult = assignmentSystem.cast(result);')

# 4. Render loop
content = content.replace("if (riftGame.status === 'active') {\n    riftGame.tick(performance.now());\n    refreshRiftUI();\n  }", "refreshRiftUI();")
content = content.replace("if (riftGame.status === 'active') {\r\n    riftGame.tick(performance.now());\r\n    refreshRiftUI();\r\n  }", "refreshRiftUI();")

# 5. Event listeners for start/stop (remove them)
remove_events = """  document.getElementById('btn-rift-start').addEventListener('click', () => {
    riftGame.start();
    refreshRiftUI();
    document.querySelector('.rift-panel').classList.add('is-active');
  });

  document.getElementById('btn-rift-stop').addEventListener('click', () => {
    riftGame.stop();
    refreshRiftUI();
    document.querySelector('.rift-panel').classList.remove('is-active');
  });"""
content = content.replace(remove_events, "")
content = content.replace(remove_events.replace('\n', '\r\n'), "")

# 6. Change cast magic button name in js
content = content.replace("btnCastMagic.textContent = '균열에 마법 주입 (Cast)';", "btnCastMagic.textContent = '마법진 제출 (Submit)';")

with open(main_js_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Main JS patched for Assignment System")
