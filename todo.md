# Arcane Sandbox — 구현 TODO 인수인계서

> 이 문서는 다음 개발자(또는 다음 Devin 세션)가 이어서 작업할 수 있도록 작성된 마일스톤별 작업 목록이다.
> 전체 기획 의도와 상세 데이터 모델은 `docs/IMPLEMENTATION_SPEC.md`에 그대로 보관되어 있다 (총 2329줄). 본 문서의 각 항목은 인수인계서의 라인 번호를 함께 표기한다.

## 핵심 원칙 (반드시 유지)

인수인계서 §69~149 요약:

1. **기존 코어를 갈아엎지 않는다.** `recognition.js`, `arrangement.js`, `rift.js`, `bone-interaction.js`, `sentence.js`, `particles.js`는 그대로 둔다. 그 위에 새 레이어(`magicPipeline.js`, `discoverySystem.js` 등)를 쌓는다.
2. **플레이어에게 정답명을 그대로 보여주지 않는다.** `compoundName === "마그마"`는 디버그용 legacy 값으로만 사용한다. UI는 관측값(공명/열/불안정성/문장 등급)만 노출하고, 플레이어가 직접 이름을 붙인다.
3. **장기 진행 상태는 `gameState.js`에서 단일 출처로 관리한다.** `main.js`의 기존 `state`는 캔버스/분석기 순간 상태만 유지한다.
4. **시스템 간 직접 import 금지. 항상 `eventBus.js` 통해 느슨하게 연결한다.**
5. **금지 사항** (인수인계서 §2300~2310): 정답명 UI 노출 금지, `main.js` 비대화 금지, 탐사가 정답 직접 알려주는 형태 금지, 논문 심사를 단순 점수 팝업으로 만들지 않기, 경제를 단순 돈벌이로 분리하지 않기, 10~12장 문법을 균열 게임에서만 쓰지 않기, 저장 구조 없이 진행 상태 관리 금지.

## 현재 진행 상태 (2026-05-06 기준)

| 영역 | 상태 | 비고 |
|---|---|---|
| §1~8 단일 룬 / 부수 / 조합 인식 | DONE | `recognition.js` |
| §9 배치 분석 (Arrangement) | DONE | `arrangement.js` |
| §10 Phase 1 뼈대 기본 6유형 | DONE | `bone-interaction.js` (PR #8) |
| §10 Phase 2 연결선 9종 + 감싸기 | DONE | `bone-interaction.js` (PR #9, #9의 354da26 fix) |
| §11 접속사 6종 (대지/이사/게보/나우디즈/케나즈/다가즈) | DONE | `sentence.js` (PR #9) |
| §11.2 조사 (격조사/강도부사/시제/부정) | DONE | `particles.js` (PR #11) — §2 부수와 의도적 동시 발화 |
| §12 문장 등급 / 읽기 방향 / 패턴 매칭 | DONE | `sentence.js` (PR #9) |
| 직선자 첫 클릭 OVERLOAD 버그 | FIXED | PR #12 |
| **M0 저장소 정리** | TODO | `.gitignore`, `venv/` 제거, README 갱신 |
| **M1 gameState + saveLoad + eventBus** | TODO | 핵심 인프라. 전부 새 파일 |
| **M2 magicPipeline 분리** | TODO | `main.js`의 분석 로직을 한 함수로 모은다 |
| **M3 boneInteraction 리네임 + 통합** | PARTIAL | 이미 `bone-interaction.js`에 거의 다 있음. 인수인계서가 요구하는 파일명(`boneInteraction.js`/`connectorLine.js` 분리)으로 정리하고 새 파이프라인에 연결만 하면 됨 |
| **M4 grammarTokens** | PARTIAL | `sentence.js`의 접속사 + `particles.js`의 조사·부사·시제·부정이 이미 있음. 새 파이프라인이 읽을 수 있게 export만 정리하면 됨 |
| **M5 sentenceAnalyzer** | PARTIAL | `sentence.js`가 이미 함. 파일명·인터페이스만 인수인계서 데이터 구조에 맞추면 됨 |
| **M6 발견·연구노트** | TODO | 신규. `discoverySystem.js` + `labNotebook.js` |
| **M7 논문·정설** | TODO | 신규. `academicCanon.js` + `paperSystem.js` |
| **M8 탐사·경제·학사** | TODO | 신규. `expedition.js` + `economy.js` + `schedule.js` + `phase.js` |
| **M9 UI 통합** | TODO | `index.html` 패널 추가 + `style.css` + 단축키 + QA |

## 마일스톤별 작업

각 마일스톤은 **별도 PR로 분리**한다. PR이 작아야 리뷰가 빠르고 회귀 가능성이 낮다. 한 마일스톤이 완료되면 todo.md의 상태를 갱신하고 머지한 후 다음 마일스톤 브랜치를 따자.

---

### M0. 저장소 정리

**상태**: TODO  
**인수인계서**: §199~215  
**예상 PR 크기**: 작음 (1~3 파일)

작업:

- [ ] `.gitignore`에 `venv/`, `node_modules/`, `dist/`, `.vite/` 명시 (현재 `dist/`는 추적되고 있어 별도 정리 필요)
- [ ] 만약 `venv/`가 이미 추적된 경우 `git rm -r --cached venv/`로 별도 커밋
- [ ] `dist/`를 git에서 제거 (`git rm -r --cached dist/`) — 빌드 산출물은 커밋 대상이 아님
- [ ] README.md에 다음을 명시: 프로젝트 개요, `npm install` / `npm run dev` / `npm run build`, 파일별 역할 (이 문서의 "현재 진행 상태" 표 참고)
- [ ] 핵심 파일(main.js, recognition.js 등) 상단 주석 정리 — 각 파일이 무엇을 export하는지

**완료 기준**: 깨끗한 클론에서 `npm install && npm run dev`로 즉시 실행됨. 검색 결과에 `venv/Lib/site-packages` 안 섞임.

---

### M1. 전역 상태 + 저장/로드 + 이벤트 버스

**상태**: TODO  
**인수인계서**: §217~232, §371~435 (gameState 데이터 모델), §135~149 (eventBus 사용 예)  
**예상 PR 크기**: 중간 (3~4 파일)

신규 파일:

- [ ] `gameState.js` — 인수인계서 §371~435의 객체 그대로 export. 초기값 포함. 단일 mutable 객체 (모듈 패턴).
- [ ] `saveLoad.js` — `saveGame()`, `loadGame()`, `clearSave()`. localStorage key `arcane-sandbox.v2`. version 마이그레이션 분기 포함.
- [ ] `eventBus.js` — `emit(name, payload)` / `on(name, fn)` / `off(name, fn)`. 단순 Map<string, Set<fn>>으로 충분.

main.js 수정:

- [ ] `init()` 시작에 `loadGame()` 호출
- [ ] 5분 또는 10분마다 `saveGame()` 자동 저장 (autosave 설정 ON일 때만)
- [ ] `cast` / `clear` / `undo` 직후에도 `saveGame()`
- [ ] `window.__ARCANE_STATE__ = gameState` 노출 (디버그)

**완료 기준** (인수인계서 §227~231):
- 새로고침해도 연구비, 명성, 학위 점수, 발견 DB가 유지된다
- 콘솔에서 `window.__ARCANE_STATE__`로 현재 상태 확인 가능
- 기존 룬 드로잉/균열 동작 회귀 없음

---

### M2. 분석 파이프라인 분리 (`magicPipeline.js`)

**상태**: TODO  
**인수인계서**: §233~253, §437~509 (MagicAnalysis 데이터 구조), §511~552 (signature 생성 규칙), §2037~2100 (main.js 수정 지점)  
**예상 PR 크기**: 중간 (1 신규 + main.js 리팩토링)

신규 파일:

- [ ] `magicPipeline.js` — `analyzeMagic({ runeStrokes, boneStrokes, material, recognizer })` 함수 export. 반환값은 인수인계서 §437~509의 `MagicAnalysis` 객체 그대로.
- [ ] 내부에서 `recognition.analyzeRune` → `analyzeArrangement` → `analyzeBoneInteraction` → `analyzeSentence` → `analyzeParticles`를 순서대로 호출해 `legacy`, `observables`, `arrangement`, `bone`, `connectors`, `grammar`, `sentence`, `discovery` 필드를 채운다.
- [ ] `signature` 생성: 인수인계서 §519~545의 hash 규칙. 위치/문법/뼈대/바탕재 모두 포함, `bandHeat(25 단위)` / `bandInstability(5 단위)` 적용.

main.js 수정:

- [ ] 기존 `analyzeCurrentState()` 본체를 `analyzeMagic()` 호출로 교체. UI 표시는 새 객체에서 읽음.
- [ ] `lastAnalysis` 타입을 `MagicAnalysis`로 교체.
- [ ] `analyzeCurrentState()` 끝에 `emit('magic:analyzed', lastAnalysis)`.
- [ ] `castMagic()` 시작에 `emit('magic:cast', { analysis: lastAnalysis, week, day })`.

**완료 기준** (인수인계서 §248~253):
- 기존 단일 룬 인식 / 조합 인식 / 균열 게임 회귀 없음
- 새 분석 결과 객체에 `signature`, `observables`, `legacy`, `arrangement`, `bone`, `connectors`, `grammar`, `sentence`, `discovery` 필드 모두 존재

---

### M3. 10장 뼈대 상호작용 — 이미 있음, 인수인계서 인터페이스로 정리

**상태**: PARTIAL  
**인수인계서**: §554~892  
**예상 PR 크기**: 작음 (리네임 + 어댑터)

기존 자산:

- `bone-interaction.js`에 이미 §10 Phase 1 (가두기/걸치기/받치기/꿰뚫기/잇기/고정하기 6유형) + §10 Phase 2 (연결선 9종 + 감싸기) 모두 구현됨.
- `analyzeBoneInteraction` 함수가 이미 `runeStrokes`, `boneStrokes`, `boneFirst`를 받아 결과를 돌려줌.

작업:

- [ ] `magicPipeline.js`가 `bone-interaction.js`의 결과를 인수인계서 §476~480 형식 (`{ interactions: [], totalInstabilityDelta, totalResonanceMul }`)으로 변환해서 `MagicAnalysis.bone`에 넣게 어댑터 작성.
- [ ] (선택) `bone-interaction.js`의 9종 연결선 분류 로직을 별도 `connectorLine.js`로 분리. 현재는 한 파일에 다 있어도 동작은 동일.
- [ ] (선택) `analyzeMagic` 출력의 `connectors.links` / `connectors.operators`를 채워 다음 마일스톤에서 grammar token 추출이 쉽게 만든다.

**완료 기준**: 기존 9종 연결선/감싸기 분류 회귀 없음 + `MagicAnalysis.bone` / `MagicAnalysis.connectors` 채워짐.

---

### M4. 11장 접속사·조사 — 이미 있음, 토큰 정규화 필요

**상태**: PARTIAL  
**인수인계서**: §894~1293  
**예상 PR 크기**: 작음~중간

기존 자산:

- `sentence.js`에 §11.1 접속사 6종 (대지/이사/게보/나우디즈/케나즈/다가즈) 구현됨.
- `particles.js`에 §11.2 조사 4 family (격조사/강도부사/시제/부정) 구현됨. §2 부수 시스템과 의도적으로 중첩 발화 (PR #11에서 결정된 설계).

작업:

- [ ] `grammarTokens.js` 신규 파일. 기존 `sentence.js` + `particles.js` 결과를 인수인계서 §1275~1293의 토큰 구조로 정규화:
  ```js
  { tokens: [{ type: 'AND'|'THEN'|'INTO'|..., source: 'connector'|'particle', subjectIdx, ... }],
    roles: [{ runeIdx, role: 'NOM'|'ACC'|... }],
    modifiers: [{ runeIdx, kind: 'AMPLIFY'|'SAFELY'|..., factor }] }
  ```
- [ ] 접속사 6종 (AND/THEN/INTO/IF/WHILE/OR) 매핑은 인수인계서 §925~1104 표 그대로.
- [ ] 격조사 6개, 강도부사 7개, 시제 6개, 부정/반전/흡수 모두 매핑.
- [ ] `magicPipeline.js`가 `MagicAnalysis.grammar` 필드를 채우도록 호출.

**완료 기준** (인수인계서 §279~285):
- 6 접속사 인식, 격조사 6개로 룬 역할 지정, 강도부사 7개 수치 반영, 시제 6개 발동방식 반영, NEGATE/INVERT/ABSORB 의미 변경.

---

### M5. 12장 다중 룬 문장 — 이미 있음, 패턴 정규화 필요

**상태**: PARTIAL  
**인수인계서**: §1294~1561  
**예상 PR 크기**: 작음

기존 자산:

- `sentence.js`에 문장 등급 5단계 (단어/구/절/문장/주문), 6방향 읽기 순서 (투사/흡수/하강/상승/증폭/소멸), 5 패턴 매칭 (S-V, S-V-O, 조건-결과, 봉인, 순환) 모두 구현됨.

작업:

- [ ] `sentenceAnalyzer.js` 신규 파일 (또는 `sentence.js` 리네임). 인수인계서 §1393~1521 표 기준 패턴 5종을 인수인계서 명칭(SVO / SVC / SOURCE_INTO_RESULT / CONDITION_THEN_EFFECT / CORE_ORBITAL)으로 재라벨링.
- [ ] `MagicAnalysis.sentence`를 §493~499 구조에 맞게 채우기 (`readingOrder`, `grade`, `pattern`, `normalizedText`, `semanticTags`).
- [ ] 균열 게임 / 논문 / 연구 노트가 `lastAnalysis.sentence`를 읽을 수 있도록 export 정리.

**완료 기준** (인수인계서 §295~300): 6방향 읽기, 5등급, 5패턴 모두 분류 가능 + `MagicAnalysis.sentence` 채워짐.

---

### M6. 블라인드 발견 + 연구 노트

**상태**: TODO (핵심 게임플레이 — MVP 필수)  
**인수인계서**: §1563~1654, §302~316 (M6 완료 기준)  
**예상 PR 크기**: 중간~큼 (2 신규 + UI)

신규 파일:

- [ ] `discoverySystem.js` — `recordDiscovery(analysis, gameState)`. signature가 처음이면 `gameState.discoveries.bySignature[sig] = { firstSeen, observables, reproductionCount: 1, displayName: null, status: 'unknown' }`. 두 번째부턴 `reproductionCount++`.
- [ ] `labNotebook.js` — UI 컴포넌트. 발견 목록, 이름 짓기 모달, 재현 카운트 표시. **legacy 정답명은 절대 노출 금지**.

UI:

- [ ] `index.html`에 "연구 노트" 탭 패널 추가
- [ ] cast 또는 analyze 시점에 새 signature가 나오면 "미확인 반응 감지" 토스트
- [ ] 플레이어가 이름 + 한 줄 설명을 저장할 수 있는 모달
- [ ] 같은 signature 재현 시 카운트 증가 알림
- [ ] 3회 이상 재현 시 "논문 제출 가능" 배지

이벤트:

- [ ] `on('magic:analyzed', ...)` — signature 비교 후 신규/재현 분기
- [ ] `emit('discovery:recorded', discovery)` — 다른 시스템(논문 등)이 구독

**완료 기준** (인수인계서 §311~316): 새 signature → 미확인 반응 표시, 이름·설명 저장, 같은 signature 재현 카운트 증가, 3회 재현 후 논문 제출 가능 상태.

> **참고**: 인수인계서 §2255~2298의 예시 플레이 시나리오(1~8주차)가 이 마일스톤의 의도된 경험을 가장 잘 보여줌. 구현 중 의심나면 다시 읽기.

---

### M7. 논문 + 학술 정설

**상태**: TODO  
**인수인계서**: §1655~1805  
**예상 PR 크기**: 큼 (2 신규 + UI + data)

신규 파일:

- [ ] `academicCanon.js` — 학회별 정설 데이터. 인수인계서 §1667~1710 구조. `data/canonData.js`에 4개 학회 (기본 마법 학회 / 열역학 마법 학회 / 고대 마법 학회 / 금서 마법 학회).
- [ ] `paperSystem.js` — `submitPaper(discoveryId, journalId)` / `reviewPaper(paper)` / `acceptPaper` / `rejectPaper`.
- [ ] `data/canonData.js`, `data/paperReviewData.js` — 정설 항목과 심사 기준 표.

UI:

- [ ] 논문 초안 작성 모달 (인수인계서 §1723~1745 구조)
- [ ] 학회 선택 / 신규 발견 vs 도전 논문 구분
- [ ] 수락/반려/반박 결과 패널

**완료 기준** (인수인계서 §327~332): 초안 UI, 학회별 심사 차이, 신규/도전 구분, 수락/반려/반박 이벤트.

> **MVP 단축**: 부록 A §2212처럼 "자동 심사로 단순화" 가능. 본격 NPC 반박은 부록 B 후순위.

---

### M8. 탐사 + 경제 + 학사/Phase

**상태**: TODO  
**인수인계서**: §1807~1981  
**예상 PR 크기**: 큼 (4 신규 + UI + data)

신규 파일:

- [ ] `expedition.js` — `startExpedition(siteId)` / `tickExpedition` / `completeExpedition`. 결과는 힌트(부록 §2213: MVP는 결과만 랜덤 생성).
- [ ] `economy.js` — `applyForGrant`, `signContract`, `sellScroll`. 연구비 차감/획득.
- [ ] `schedule.js` — 주차 흐름, 마감일, 이벤트 큐.
- [ ] `phase.js` — Phase 해금 조건 (인수인계서 §1933~1981). Phase 1~5.
- [ ] `data/expeditionData.js`, `data/economyData.js`, `data/questData.js`.

UI:

- [ ] 탐사지 / 과제 / 계약 / 스크롤 판매 / 주차 표시 / 시험 알림 패널.

**완료 기준** (인수인계서 §345~350): 탐사 신청·진행·완료, 국가 과제·산학협력·스크롤 판매, 주차 흐름과 마감일, Phase별 해금.

---

### M9. UI 통합 + QA

**상태**: TODO  
**인수인계서**: §1983~2035 (UI), §2102~2155 (QA 체크리스트), §2300~2310 (금지 사항)  
**예상 PR 크기**: 중간 (UI + 스타일 + QA 매뉴얼)

작업:

- [ ] `index.html`에 탭 모듈 추가 (인수인계서 §1997~2024)
- [ ] `style.css` 컴포넌트 스타일 추가 (기존 변수 재사용)
- [ ] 키보드 단축키 정리
- [ ] 저장/로드 QA
- [ ] 인수인계서 §2102~2155 QA 체크리스트 전부 통과
- [ ] 디버그 모드 토글 (`settings.debugShowLegacyNames` 등 — 인수인계서 §2228~2253)

**완료 기준** (인수인계서 §364~367):
- 처음 실행한 사용자가 15분 안에 첫 발견·기록·재현 경험
- 1시간 플레이로 논문 제출 또는 탐사 1회 완료에 도달

## 부록 A. 최소 MVP 범위 (시간 부족 시)

인수인계서 §2201~2214 그대로:

1. `magicPipeline.js`
2. signature 생성
3. 연구 노트 저장
4. 재현 카운트
5. 10장 상호작용 중 가두기/받치기/잇기 (이미 구현됨)
6. 11장 접속사 중 AND/THEN/INTO (이미 구현됨)
7. 12장 읽기 순서 중 좌→우/화살표/중심→외곽 (이미 구현됨)
8. 논문 제출은 자동 심사로 단순화
9. 탐사는 결과만 랜덤 생성
10. 경제는 연구비 차감/획득만 단순 구현

→ 실질적으로 **M0 + M1 + M2 + M6**만 구현해도 핵심 경험("발견·기록·재현")은 완성된다. M3~M5는 이미 구현된 코드를 어댑터로 연결만 하면 됨.

## 부록 B. 우선 구현 순서

인수인계서 §2186~2199:

1. M0 저장소 정리
2. M1 gameState/saveLoad/eventBus
3. M2 magicPipeline
4. M3 뼈대 상호작용 (PARTIAL — 어댑터만)
5. M4 접속사·조사 (PARTIAL — 토큰 정규화만)
6. M5 문장 분석 (PARTIAL — 패턴 라벨링만)
7. M6 블라인드 발견 + 연구 노트
8. M7 논문 시스템
9. M8 탐사
10. M8 경제
11. M8 학사/Phase/시험
12. M9 UI 폴리싱

## 부록 C. PR 작업 가이드

- 모든 마일스톤은 **별도 PR**. 한 PR이 600줄 넘으면 쪼개기.
- 브랜치 명명: `devin/<unix-ts>-<짧은-설명>` (예: `devin/1778063656-m1-gamestate`)
- PR 본문에 이 todo.md의 해당 마일스톤 섹션을 인용하고, 완료 기준 체크박스를 채운다.
- 매 PR 머지 후 todo.md 상태 표를 갱신한다 (`TODO` → `DONE`, `PARTIAL` → `DONE`).
- 인수인계서 데이터 구조(§371~552) 형식을 그대로 따라야 한다 — 다른 모양으로 만들면 다음 마일스톤에서 호환 안 된다.
- 기존 작업 회귀 방지: PR 작성 전 직선자/컴퍼스/자유그리기 모두 한 번씩 그려서 OVERLOAD 안 뜨고 분석기가 정상 동작하는지 확인.

## 부록 D. 개발자에게 전달할 핵심 의도

인수인계서 §2157~2182 (강조):

> 이 게임의 핵심은 "정답을 찾는 게임"이 아니다.  
> 정답은 코드 안에 있어도 된다. 하지만 플레이어가 보는 것은 정답명이 아니라 관측값이어야 한다.

판단이 갈리면 항상 다음 우선순위로 결정:

1. 플레이어가 **직접 발견**했다고 느끼는가?
2. 시스템이 정답을 **너무 빨리 알려주지 않는가**?
3. 실험 결과가 **다음 실험의 단서**가 되는가?
4. 탐사·경제·논문·학사가 **하나의 루프**로 연결되는가?
5. 기존 캔버스 드로잉 경험을 방해하지 않는가?

## 참고 문서

- `docs/IMPLEMENTATION_SPEC.md` — 전체 인수인계서 (2329줄)
- `RUNE_DICTIONARY.md` — 룬 사전 (이미 구현된 §1~12 + §11.2 포함)
- `.agents/skills/testing-arcane-sandbox/SKILL.md` — 캔버스 좌표 매핑, 테스트 워크플로우, 알려진 함정
