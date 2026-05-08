import os

html_path = r'f:\test_antigravity\index.html'
with open(html_path, 'r', encoding='utf-8') as f:
    content = f.read()

old_block = """        <!-- Top Center: Abyssal Rift Game -->
        <div class="panel rift-panel glass-panel">
          <div class="panel-header">
            <h2>차원 균열</h2>
            <div class="panel-header-actions">
              <div class="rift-score-badge">점수 <span id="rift-score">0</span> · LV <span id="rift-level">1</span></div>
              <button class="panel-toggle" type="button" data-panel-toggle aria-expanded="true" aria-label="차원 균열 접기">▾</button>
            </div>
          </div>
          <div class="panel-content">
            <div class="threat-row">
              <span class="threat-label">위협도</span>
              <div class="threat-bar"><div class="threat-fill" id="rift-threat-fill"></div></div>
              <span class="threat-val" id="rift-threat-val">0%</span>
            </div>
            <div class="demand-block" id="rift-demand-block" style="display:none;">
              <div class="demand-label">균열의 요구</div>
              <div class="demand-name" id="rift-demand-name">--</div>
              <div class="demand-sketch" id="rift-demand-sketch"></div>
              <div class="timer-row">
                <span class="timer-label">남은 시간</span>
                <span class="timer-val" id="rift-timer">--</span>
              </div>
            </div>
            <div class="rift-message" id="rift-message">균열이 잠잠하다. 시작하면 첫 요구가 떨어진다.</div>
            <div class="rift-controls">
              <button class="tool-btn" id="btn-rift-start">차원 균열 시작</button>
              <button class="tool-btn" id="btn-rift-stop" style="display:none; border-color:#ff3366; color:#ff3366;">중단</button>
            </div>
          </div>
        </div>"""

old_block_cr = old_block.replace('\n', '\r\n')

new_block = """        <!-- Top Center: Professor Assignment -->
        <div class="panel rift-panel glass-panel" id="assignment-panel">
          <div class="panel-header">
            <h2>지도교수의 지시사항</h2>
            <div class="panel-header-actions">
              <div class="rift-score-badge">연구 자금 <span id="rift-score">0</span>G · <span id="rift-level">1</span>학기</div>
              <button class="panel-toggle" type="button" data-panel-toggle aria-expanded="true" aria-label="과제 접기">▾</button>
            </div>
          </div>
          <div class="panel-content">
            <div class="demand-block" id="rift-demand-block" style="display:none;">
              <div class="demand-label">요구 조건</div>
              <div class="demand-name" id="rift-demand-name">--</div>
              <div class="demand-sketch" id="rift-demand-sketch"></div>
              <div class="timer-row">
                <span class="timer-label">마감 기한</span>
                <span class="timer-val" id="rift-timer">--</span>
              </div>
            </div>
            <div class="rift-message" id="rift-message">현재 부여된 과제가 없습니다. 기초 연구에 매진하세요.</div>
          </div>
        </div>"""

content = content.replace(old_block, new_block)
content = content.replace(old_block_cr, new_block)

content = content.replace('균열에 마법 주입 (Cast)', '마법진 제출 (Submit Assignment)')

with open(html_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("HTML patched")
