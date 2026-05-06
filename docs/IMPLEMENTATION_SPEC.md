---
title: "아케인 샌드박스 상세 구현 계획서"
subtitle: "Hanyang991/test_antigravity 기준 구현 인수인계서 v2.0"
author: "프로젝트 기획 통합본"
date: "2026-05-06"
lang: ko-KR
---

# 문서 목적

이 문서는 `Hanyang991/test_antigravity` 저장소를 기준으로, 현재 구현된 메인 기능과 앞으로 추가할 연구·경제·학사·문법 시스템을 하나의 개발 계획으로 통합한 **상세 구현 인수인계서**이다.

목표는 다음과 같다.

1. 개발자가 기획 의도를 따로 질문하지 않아도 같은 방향으로 구현할 수 있게 한다.
2. 현재 GitHub 코드 구조를 기준으로 실제로 어떤 파일을 추가하고 어떤 함수에 훅을 걸지 명확히 한다.
3. 10장 뼈대 상호작용, 11장 접속사·조사, 12장 다중 룬 문장 시스템을 기존 1~9장 구조와 충돌 없이 통합한다.
4. 기존 게임의 핵심 재미인 "룬을 직접 그리고 균열에 주입하는 경험"을 유지하면서, 장기 목표를 "마법 학문을 발견하고 학계에 등재하는 연구 시뮬레이션"으로 확장한다.

이 문서는 단순 아이디어 문서가 아니다. 각 챕터는 다음 항목을 포함한다.

- 기능 목적
- 사용자 경험 흐름
- 데이터 구조
- 파일 단위 구현 위치
- 주요 함수 설계
- UI 변경 사항
- 저장/로드 규칙
- 테스트 케이스
- 완료 기준

# 현재 저장소 기준 요약

## 저장소 상태

현재 프로젝트는 Vite 기반 프론트엔드 앱이다.

- 패키지 이름: `arcane-sandbox`
- 실행: `npm run dev`
- 빌드: `npm run build`
- 주요 의존성: `vite`
- 현재 구조: `src/` 폴더 없이 루트에 핵심 JS 파일이 있다.

현재 중심 파일은 다음과 같다.

| 파일 | 현재 역할 | 확장 방향 |
|---|---|---|
| `main.js` | 캔버스 입력, UI 이벤트, 분석기 갱신, 균열 게임 연결 | 전체 시스템의 훅 지점. 너무 커지지 않게 새 모듈로 분리 |
| `recognition.js` | `$P Point-Cloud Recognizer`, 룬 템플릿, 조합 판정 | 직접 정답을 노출하지 않고 내부 분석 데이터로 사용 |
| `arrangement.js` | 다중 룬 공간 배열 분석 | 12장 문장 분석의 입력으로 재사용 |
| `rift.js` | 차원 균열 미니게임 루프 | 시험/기말 보스전/위기 이벤트로 확장 가능 |
| `index.html` | 전체 UI 패널 구성 | 연구 노트, 경제, 탐사, 논문 패널 추가 |
| `style.css` | 네온/글래스모피즘 UI 스타일 | 기존 스타일 변수 재사용 |

## 현재 구현된 핵심 경험

현재 플레이어 흐름은 다음과 같다.

1. `Bone` 또는 `Rune` 모드를 선택한다.
2. 자유 그리기, 직선 자, 컴퍼스 보조 도구를 사용해 캔버스에 획을 긋는다.
3. `RecognitionEngine`이 룬을 판정한다.
4. `arrangement.js`가 다중 룬 배치를 분석한다.
5. 에너지 분석기에 공명, 열, 불안정성, 배치 정보가 표시된다.
6. `Cast` 버튼을 누르면 균열에 마법을 주입한다.
7. 균열 게임이 활성화되어 있으면 현재 분석 결과가 균열 요구와 일치하는지 판정한다.

이 흐름은 유지한다. 앞으로 추가되는 모든 시스템은 이 흐름을 깨면 안 된다.

# 절대 유지해야 할 설계 원칙

## 1. 기존 코어를 바로 갈아엎지 않는다

`recognition.js`, `arrangement.js`, `rift.js`는 이미 작동하는 핵심 기능이다. 따라서 1차 구현에서는 다음 원칙을 지킨다.

- 기존 인식 엔진은 유지한다.
- 기존 조합 테이블도 유지한다.
- 단, 플레이어에게 표시하는 결과는 새 레이어에서 가공한다.
- 기존 `compoundName`은 내부 정답 또는 디버그 값으로만 사용한다.
- 플레이어 화면에는 처음부터 "마그마" 같은 정답명을 바로 보여주지 않는다.

즉, 기존 코드는 "정답표"가 아니라 "시뮬레이션 엔진의 내부 물리값"으로 격하한다.

## 2. 분석 파이프라인을 새로 만든다

현재는 `main.js`에서 인식, 분석, UI 갱신, 캐스팅이 강하게 연결되어 있다. 앞으로는 다음 파이프라인으로 정리한다.

```txt
canvas strokes
  -> recognition.js
  -> arrangement.js
  -> boneInteraction.js
  -> connectorLine.js
  -> grammarTokens.js
  -> sentenceAnalyzer.js
  -> magicPipeline.js
  -> discoverySystem.js
  -> UI / rift / economy / papers
```

이때 `main.js`는 모든 계산을 직접 하지 않고, 다음 역할만 맡는다.

- 캔버스 입력 수집
- 버튼 이벤트 연결
- 분석 파이프라인 호출
- 반환된 결과를 UI에 전달
- Cast 시점에 이벤트 발행

## 3. 모든 장기 진행 상태는 `gameState.js`에서 관리한다

현재 `main.js` 안의 `state`는 캔버스와 분석기 중심의 순간 상태다. 여기에 연구비, 논문, 탐사, 발견, 과제까지 넣으면 파일이 망가진다.

따라서 장기 상태는 새 파일 `gameState.js`에서 관리한다.

```js
export const gameState = {
  resources: {},
  progression: {},
  discoveries: {},
  papers: {},
  expeditions: {},
  economy: {},
  academic: {},
  settings: {}
};
```

`main.js`의 기존 `state`는 즉시 삭제하지 않는다. 대신 다음처럼 역할을 나눈다.

| 상태 | 위치 | 예시 |
|---|---|---|
| 순간 입력 상태 | `main.js` | 현재 획, 현재 모드, 현재 캔버스 크기 |
| 분석 결과 상태 | `magicPipeline.js` 반환값 | 열, 공명, 문장 분석, 시그니처 |
| 장기 저장 상태 | `gameState.js` | 발견 DB, 연구비, 학위 점수, 논문 |

## 4. 모든 시스템은 이벤트 기반으로 연결한다

새 시스템이 서로 직접 참조하지 않도록 `eventBus.js`를 둔다.

예시:

```js
emit('magic:analyzed', analysisResult);
emit('magic:cast', castPayload);
emit('discovery:recorded', discovery);
emit('paper:accepted', paper);
emit('week:ticked', gameState.progression.currentWeek);
```

이렇게 하면 경제, 논문, 퀘스트, 균열, 학사 시스템이 서로 느슨하게 연결된다.

# 목표 파일 구조

현재 루트 구조를 유지하면서 새 파일을 추가한다.

```txt
/
├── index.html
├── style.css
├── main.js
├── recognition.js
├── arrangement.js
├── rift.js
│
├── gameState.js              # 장기 게임 상태
├── saveLoad.js                # localStorage 저장/로드
├── eventBus.js                # 시스템 이벤트 허브
├── magicPipeline.js           # 전체 분석 파이프라인
│
├── boneInteraction.js         # 10장 뼈대 상호작용
├── connectorLine.js           # 10장 연결선 9종
├── grammarTokens.js           # 11장 접속사/조사/부사/시제 토큰
├── sentenceAnalyzer.js        # 12장 다중 룬 문장 분석
│
├── discoverySystem.js         # 블라인드 발견/시그니처
├── labNotebook.js             # 연구 노트
├── academicCanon.js           # 학술 정설
├── paperSystem.js             # 논문 작성/심사
│
├── expedition.js              # 탐사 시스템
├── economy.js                 # 연구비/과제/계약/판매
├── schedule.js                # 주차/마감/시험
├── phase.js                   # Phase 해금
├── academicUI.js              # 추가 UI 렌더링
│
└── data/
    ├── runeData.js
    ├── canonData.js
    ├── expeditionData.js
    ├── economyData.js
    ├── questData.js
    ├── grammarData.js
    └── paperReviewData.js
```

향후 리팩터링 때는 `src/`로 옮길 수 있지만, 지금은 루트 파일을 유지한다. 이유는 현재 `index.html`이 `/main.js`를 직접 불러오고 있고, 기존 코드가 루트 상대 import를 사용하기 때문이다.

# 구현 단계 전체 로드맵

## M0. 저장소 정리

목표: 개발자가 코드를 읽고 빌드하기 쉬운 상태로 만든다.

작업:

1. `.gitignore` 추가 또는 수정.
2. `venv/`, `node_modules/`, `dist/`, `.vite/` 제외.
3. 이미 Git에 올라간 `venv/`는 별도 커밋으로 제거.
4. README에 실행법 작성.
5. 현재 핵심 파일 역할 주석 정리.

완료 기준:

- `npm install` 후 `npm run dev`로 실행된다.
- 저장소 검색 결과에 `venv/Lib/site-packages`가 더 이상 섞이지 않는다.
- README에 프로젝트 개요, 실행법, 주요 파일 설명이 있다.

## M1. 전역 상태와 저장/로드

목표: 장기 진행 데이터가 새로고침 후에도 유지된다.

추가 파일:

- `gameState.js`
- `saveLoad.js`
- `eventBus.js`

완료 기준:

- 연구비, 명성, 학위 점수, 발견 DB가 localStorage에 저장된다.
- 새로고침해도 연구 노트와 자원 값이 유지된다.
- 개발자 콘솔에서 `window.__ARCANE_STATE__`로 현재 상태를 확인할 수 있다.

## M2. 분석 파이프라인 분리

목표: `main.js` 안에 흩어진 분석 로직을 한 곳으로 모은다.

추가 파일:

- `magicPipeline.js`

작업:

1. 기존 `analyzeCurrentState()` 내부에서 계산하던 결과를 `analyzeMagic()`으로 이동한다.
2. `recognition.js`, `arrangement.js` 결과를 통합 객체로 만든다.
3. `lastAnalysis`에 새 통합 객체를 저장한다.
4. 기존 UI는 새 객체를 읽어 동일하게 표시한다.

완료 기준:

- 기존 단일 룬 인식이 깨지지 않는다.
- 기존 조합 인식이 깨지지 않는다.
- 기존 균열 게임이 정상 작동한다.
- 새 분석 결과 객체에 `signature`, `observables`, `legacy`, `arrangement`가 들어간다.

## M3. 10장 뼈대 상호작용 구현

목표: Bone 모드 획이 단순 장식이 아니라 마법 구조에 영향을 준다.

추가 파일:

- `boneInteraction.js`
- `connectorLine.js`

완료 기준:

- 가두기, 걸치기, 받치기 등 6유형이 판정된다.
- 연결선 9종이 판정된다.
- 분석기 UI에 뼈대 상호작용 결과가 표시된다.
- 불안정성, 공명, 열 계산에 영향이 반영된다.

## M4. 11장 접속사·조사 구현

목표: 다중 룬 조합을 단순 배치가 아니라 문법으로 읽는다.

추가 파일:

- `grammarTokens.js`

완료 기준:

- AND, THEN, INTO 등 6접속사가 인식된다.
- 격조사 6개가 룬의 문장 역할을 지정한다.
- 강도부사 7개가 수치 계산에 반영된다.
- 시제 6개가 발동 방식에 반영된다.
- 부정/반전/흡수가 문장 의미를 바꾼다.

## M5. 12장 다중 룬 문장 구현

목표: 여러 룬을 읽기 순서, 문장 등급, 패턴으로 분석한다.

추가 파일:

- `sentenceAnalyzer.js`

완료 기준:

- 읽기 순서 6방향이 작동한다.
- 문장 등급 5단계가 산출된다.
- 문장 패턴 5종이 판정된다.
- 균열, 논문, 연구 노트가 문장 분석 결과를 사용할 수 있다.

## M6. 블라인드 발견과 연구 노트

목표: 플레이어가 정답명을 보는 대신 현상을 발견하고 이름 붙인다.

추가 파일:

- `discoverySystem.js`
- `labNotebook.js`

완료 기준:

- 새로운 signature가 나오면 "미확인 반응"으로 표시된다.
- 플레이어가 이름과 설명을 저장할 수 있다.
- 같은 signature가 나오면 재현 횟수가 증가한다.
- 3회 이상 재현하면 논문 제출 가능 상태가 된다.

## M7. 논문과 학술 정설

목표: 발견을 공식 업적으로 바꾸고 기존 정설을 도전할 수 있다.

추가 파일:

- `academicCanon.js`
- `paperSystem.js`

완료 기준:

- 논문 초안 작성 UI가 있다.
- 학회별 심사 기준이 다르다.
- 신규 발견 논문과 도전 논문을 구분한다.
- 수락/반려/반박 이벤트가 발생한다.

## M8. 탐사와 연구 경제

목표: 연구비를 벌고 쓰는 장기 루프를 만든다.

추가 파일:

- `expedition.js`
- `economy.js`
- `schedule.js`
- `phase.js`

완료 기준:

- 탐사지 신청, 진행, 완료가 작동한다.
- 국가 과제, 산학협력, 스크롤 판매가 작동한다.
- 주차 흐름과 마감일이 있다.
- Phase별 해금이 작동한다.

## M9. UI 통합과 QA

목표: 모든 시스템을 플레이 가능한 형태로 통합한다.

작업:

- `index.html` 패널 추가.
- `style.css` 컴포넌트 스타일 추가.
- 키보드 단축키 정리.
- 저장/로드 QA.
- 수동 테스트 시나리오 작성.

완료 기준:

- 처음 실행한 사용자가 15분 안에 첫 발견, 첫 기록, 첫 재현을 경험한다.
- 1시간 플레이 시 논문 제출 또는 탐사 1회 완료까지 도달할 수 있다.

# 핵심 데이터 모델

## `gameState.js`

`gameState.js`는 장기 진행 상태의 단일 출처다.

```js
export const gameState = {
  version: 2,

  resources: {
    researchFunds: 500,
    reputation: 0,
    degreeScore: 0,
    mentalHealth: 100,
    stamina: 100
  },

  progression: {
    currentPhase: 1,
    currentWeek: 1,
    currentDay: 1,
    warnings: 0,
    unlockedRunes: [],
    unlockedMaterials: ['parchment'],
    unlockedEquipment: []
  },

  discoveries: {
    bySignature: {},
    recentSignatures: []
  },

  papers: {
    drafts: [],
    submitted: [],
    accepted: [],
    rejected: [],
    disputes: []
  },

  expeditions: {
    active: [],
    completed: [],
    unlockedSiteIds: []
  },

  economy: {
    activeGrants: [],
    activeContracts: [],
    scrollOrders: [],
    weeklyIncome: []
  },

  academic: {
    canonOverrides: {},
    npcRelations: {},
    citations: []
  },

  settings: {
    blindDiscovery: true,
    debugShowLegacyNames: false,
    autosave: true
  }
};
```

## 분석 결과 객체 `MagicAnalysis`

모든 시스템은 `MagicAnalysis`를 기준으로 연결된다.

```js
export const analysis = {
  id: 'analysis_...',
  createdAt: 123456789,

  input: {
    material: 'parchment',
    runeStrokeCount: 4,
    boneStrokeCount: 1,
    assistMode: 'free'
  },

  legacy: {
    meaning: '마그마',
    compoundName: '마그마',
    dynamics: '꿈틀거림(흐름)',
    instabilityModifier: 30
  },

  observables: {
    resonance: 47.2,
    heat: 820,
    pressure: 0,
    instability: 30,
    dynamics: '꿈틀거림(흐름)'
  },

  arrangement: {
    kind: 'overlapping',
    label: '중첩 배열',
    powerMul: 2.0,
    instabilityDelta: 0,
    units: []
  },

  bone: {
    interactions: [],
    totalInstabilityDelta: 0,
    totalResonanceMul: 1.0
  },

  connectors: {
    links: [],
    operators: []
  },

  grammar: {
    tokens: [],
    roles: [],
    modifiers: []
  },

  sentence: {
    readingOrder: 'left_to_right',
    grade: 'compound_word',
    pattern: null,
    normalizedText: '',
    semanticTags: []
  },

  discovery: {
    signature: 'sig_...',
    knownToPlayer: false,
    knownToAcademy: false,
    displayName: null,
    status: 'unknown'
  }
};
```

## Signature 생성 규칙

Signature는 플레이어 발견을 식별하는 핵심 키다.

절대 단순히 `compoundName`만으로 만들면 안 된다. 위치, 문법, 뼈대, 바탕재가 달라지면 다른 현상일 수 있기 때문이다.

권장 생성 규칙:

```txt
signature = hash({
  version,
  mainLegacyEffect,
  normalizedRuneUnits,
  arrangementKind,
  boneInteractionTypes,
  connectorTypes,
  grammarOperators,
  sentencePattern,
  material,
  observableBand
})
```

`observableBand`는 수치 오차를 흡수하기 위한 구간화 값이다.

예시:

```js
function bandHeat(heat) {
  return Math.round(heat / 25) * 25;
}

function bandInstability(instability) {
  return Math.round(instability / 5) * 5;
}
```

같은 현상 판정 기준:

- signature가 같으면 같은 현상이다.
- signature는 다르지만 legacy 조합이 같고 수치 차이가 작으면 "유사 현상"이다.
- 유사 현상은 재현 횟수에 포함하지 않고 별도 변종으로 기록한다.

# 10장. 뼈대 상호작용 상세 설계

## 목적

현재 Bone 모드는 주로 시각적 보조 또는 간단한 광역/관통/결계 접두사로 사용된다. 10장에서는 Bone을 문법적 구조물로 확장한다.

뼈대는 룬의 의미를 직접 만들지 않는다. 대신 룬이 발현되는 **공간 조건**을 만든다.

예시:

- 원 안에 룬을 넣으면 가둔다.
- 선 위에 룬을 올리면 받친다.
- 룬이 경계에 걸쳐 있으면 불안정하지만 출력이 넓어진다.
- 두 룬을 선으로 연결하면 의미가 전달된다.

## 뼈대 분석 입력

`boneInteraction.js`는 다음 입력을 받는다.

```js
analyzeBoneInteractions({
  runeUnits,
  boneStrokes,
  material,
  arrangement
});
```

`runeUnits`는 `arrangement.js`가 반환하는 `units`를 우선 사용한다. 단, 단일 룬이나 compound 때문에 units가 비어 있으면 `magicPipeline.js`에서 fallback unit을 만든다.

Fallback unit 예시:

```js
{
  name: analysis.legacy.meaning,
  bbox: bboxOfStrokes(runeStrokes),
  center: { x, y },
  strokes: runeStrokes
}
```

## 뼈대 기본 도형 판정

Bone 획은 먼저 primitive로 분류한다.

| primitive | 판정 기준 | 예시 효과 |
|---|---|---|
| `line` | 한 획, 시작-끝 거리 길고 곡률 낮음 | 받치기, 연결, 관통 |
| `circle` | 한 획, 시작점과 끝점 근접, bbox 비율 0.6~1.6 | 가두기, 순환 |
| `triangle` | 3획 또는 1획 폐곡선에 3개 꼭짓점 | 안정, 균형 |
| `square` | 4획 또는 1획 폐곡선에 4개 꼭짓점 | 결계, 보존 |
| `arc` | 한 획, 폐곡선 아님, 곡률 높음 | 걸치기, 흐름 유도 |
| `polyline` | 꺾임 2개 이상 | 연결선 후보 |

기존 `recognition.js`의 bone 단순 판정은 유지하되, 새 시스템은 더 자세한 판정을 사용한다.

## 뼈대 상호작용 6유형

### 10-1. `contain` / 가두기

정의:

- 룬 중심점이 뼈대 폐곡선 내부에 있다.
- 룬 bbox의 70% 이상이 폐곡선 내부에 있다.

대표 뼈대:

- 원
- 사각형
- 삼각형

효과:

- 불안정성 감소
- 지속시간 증가
- 외부 확산 감소
- 논문 분류 태그에 `sealed`, `contained` 추가

수치:

```js
{
  instabilityDelta: -15,
  resonanceMul: 0.95,
  durationMul: 1.5,
  areaMul: 0.7
}
```

UI 문구:

> 뼈대 상호작용: 가두기 - 현상이 폐곡선 안에 봉인됨

테스트:

1. 원 Bone을 그리고 그 안에 이사(|)를 그린다.
2. 분석기에 `가두기`가 표시된다.
3. 불안정성이 기본보다 15 낮아진다.

### 10-2. `perch` / 걸치기

정의:

- 룬 bbox가 뼈대 경계와 교차한다.
- 룬 중심은 폐곡선 내부 또는 외부 한쪽에 치우쳐 있다.
- 전체 룬 면적의 20~70%만 뼈대 내부에 있다.

의미:

- 마법이 경계에 걸려 있다.
- 내부/외부 성질이 동시에 나타난다.
- 위험하지만 새로운 변종 발견 확률이 높다.

효과:

```js
{
  instabilityDelta: +20,
  resonanceMul: 1.2,
  discoveryNoveltyBonus: 0.15,
  durationMul: 0.8
}
```

UI 문구:

> 뼈대 상호작용: 걸치기 - 경계 위에 걸친 불안정 현상

테스트:

1. 원 Bone을 그린다.
2. 원 경계 위에 열기(△)를 반쯤 걸쳐 그린다.
3. `걸치기`가 표시되고 불안정성이 증가한다.

### 10-3. `support` / 받치기

정의:

- 선형 Bone이 룬 bbox 아래쪽에 있다.
- Bone의 y 좌표가 룬 bbox `maxY`에서 일정 거리 이내다.
- Bone이 룬 폭의 50% 이상을 가로지른다.

의미:

- 룬의 발현을 아래에서 지지한다.
- 대지, 안정, 축적 계열 효과와 잘 맞는다.

효과:

```js
{
  instabilityDelta: -10,
  resonanceMul: 1.1,
  heatRetentionMul: 1.15,
  collapseRiskDelta: -0.1
}
```

UI 문구:

> 뼈대 상호작용: 받치기 - 하단 지지선이 술식을 안정화함

테스트:

1. 열기(△) 아래에 Bone 직선을 긋는다.
2. `받치기`가 표시된다.
3. 불안정성이 감소하고 열 유지 보너스가 적용된다.

### 10-4. `pierce` / 꿰뚫기

정의:

- 선형 Bone이 룬 bbox를 관통한다.
- 선분이 룬 중심 근처를 지나간다.
- 선분과 룬 bbox의 교차점이 2개 이상이다.

의미:

- 룬의 힘이 한 방향으로 관통된다.
- 공격/투사/관통 계열에 적합하다.

효과:

```js
{
  instabilityDelta: +15,
  resonanceMul: 1.25,
  penetrationMul: 1.6,
  areaMul: 0.6
}
```

UI 문구:

> 뼈대 상호작용: 꿰뚫기 - 술식 중심을 관통하는 축이 형성됨

테스트:

1. 원(○)을 그리고 가운데를 Bone 선으로 관통한다.
2. `꿰뚫기`가 표시된다.
3. 공명 또는 관통 태그가 증가한다.

### 10-5. `bridge` / 잇기

정의:

- Bone 선의 시작점과 끝점이 서로 다른 두 룬 bbox 근처에 있다.
- 선이 두 룬 중심을 연결하는 방향과 대체로 일치한다.

의미:

- 룬 A의 성질이 룬 B로 전달된다.
- 11장 접속사와 12장 문장 순서의 기반이 된다.

효과:

```js
{
  instabilityDelta: +5,
  resonanceMul: 1.0,
  semanticLink: true
}
```

UI 문구:

> 뼈대 상호작용: 잇기 - 두 룬 사이에 의미 연결선이 형성됨

테스트:

1. 이사(|)와 열기(△)를 떨어뜨려 그린다.
2. Bone 선으로 둘을 연결한다.
3. connector가 생성되고 sentenceAnalyzer가 두 룬을 하나의 문장 후보로 읽는다.

### 10-6. `anchor` / 고정하기

정의:

- 룬 중심이 뼈대의 꼭짓점, 선 끝점, 원의 중심 등 anchor point에 가깝다.
- anchor point와 룬 중심 거리 <= 전체 bbox 대각선의 12%.

의미:

- 해당 룬이 문장의 기준점 또는 핵이 된다.
- 읽기 순서, 주어 판정, 핵심 룬 판정에 영향을 준다.

효과:

```js
{
  instabilityDelta: -5,
  resonanceMul: 1.05,
  sentencePriorityBonus: 100
}
```

UI 문구:

> 뼈대 상호작용: 고정하기 - 이 룬이 술식의 기준점으로 고정됨

테스트:

1. 삼각형 Bone을 그리고 꼭짓점에 룬 3개를 둔다.
2. 각 룬에 `anchor`가 붙는다.
3. 삼각 배열과 문장 순서가 안정적으로 결정된다.

## 연결선 9종

연결선은 Bone 획 중에서 두 룬 또는 룬과 뼈대를 연결하는 선이다. `connectorLine.js`에서 처리한다.

### 연결선 공통 구조

```js
{
  id: 'conn_001',
  type: 'direct',
  fromUnitId: 'unit_a',
  toUnitId: 'unit_b',
  direction: 'a_to_b',
  confidence: 0.87,
  geometry: {
    strokeIndex: 2,
    length: 220,
    curvature: 0.03,
    intersections: []
  },
  operatorHint: 'AND'
}
```

### 9종 정의

| type | 이름 | 판정 | 의미 |
|---|---|---|---|
| `direct` | 직결선 | 거의 직선, 화살표 없음 | 단순 연결 |
| `arrow` | 방향선 | 끝점에 작은 V 또는 짧은 보조획 | A가 B로 작용 |
| `double` | 병렬선 | 가까운 평행선 2개 | AND, 동시 작용 |
| `broken` | 꺾임선 | 꺾임 1~2개 | THEN, 순차 작용 |
| `wavy` | 파동선 | 곡률이 반복됨 | 흐름, 지속 전달 |
| `spiral` | 나선선 | 중심을 감는 회전 | 반복, 순환, feedback |
| `dotted` | 점선 | 짧은 stroke 여러 개가 같은 경로 | 약한 연결, 조건부 |
| `crossed` | 차단선 | 연결선 위를 다른 선이 X로 가로지름 | NOT, 차단, 부정 |
| `chain` | 사슬선 | 작은 고리/짧은 반복 연결 | 결속, 동기화 |

### 연결선과 접속사의 관계

연결선은 11장의 접속사와 직접 연결된다.

- `double` -> `AND`
- `broken` -> `THEN`
- `arrow` -> `INTO` 또는 방향 작용
- `dotted` -> `IF`
- `wavy` -> `WHILE`
- `spiral` -> `LOOP`
- `crossed` -> `NOT`
- `chain` -> `BIND`

단, 접속사 최종 판정은 `grammarTokens.js`가 한다. `connectorLine.js`는 geometry 기반 후보만 제공한다.

## 10장 계산 반영 순서

Bone 효과는 다음 순서로 반영한다.

```txt
base observables
  -> arrangement modifier
  -> bone interaction modifier
  -> connector modifier
  -> grammar modifier
  -> material modifier
  -> final observables
```

이유:

- arrangement는 룬 자체의 배치다.
- bone은 배치 위에 놓이는 구조물이다.
- connector는 bone 중 의미 연결 역할을 한다.
- grammar는 connector와 marker를 해석한 상위 의미다.

# 11장. 접속사·조사 상세 설계

## 목적

11장은 룬을 단순히 "나란히 놓인 문양"에서 "읽을 수 있는 문장"으로 바꾸는 문법 토큰 시스템이다.

구성 요소:

1. 접속사 6개
2. 격조사 6개
3. 강도부사 7개
4. 시제 6개
5. 부정/반전/흡수

이 시스템은 `grammarTokens.js`에서 담당한다.

## 입력 방식 원칙

현재 UI에는 별도 텍스트 입력이 없다. 따라서 문법 토큰은 가급적 그림으로 인식한다.

MVP에서는 다음 두 방식을 함께 제공한다.

1. **드로잉 기반 인식**: 작은 marker나 연결선 형태로 자동 판정.
2. **디버그 선택 UI**: 개발 중에는 선택 드롭다운으로 토큰을 강제 지정할 수 있음.

디버그 UI는 최종 게임에서 숨길 수 있다.

## 접속사 6개

접속사는 룬과 룬 사이의 관계를 정의한다.

### 11-1. `AND` / 그리고

의미:

- 두 룬이 동시에 작용한다.
- 결과는 병렬 합성이다.

입력:

- 두 룬 사이의 `double` 연결선.
- 또는 두 룬 사이에 짧은 평행선 두 개.

효과:

```js
{
  operator: 'AND',
  powerMul: 1.15,
  instabilityDelta: +5,
  execution: 'parallel'
}
```

예시:

```txt
열기(△) AND 대지(ㅡ)
= 열기와 대지가 동시에 발현된다.
```

### 11-2. `THEN` / 그리고 나서

의미:

- 앞 룬이 먼저 발동하고 뒤 룬이 뒤따른다.
- 결과는 순차 반응이다.

입력:

- `broken` 연결선.
- 또는 A에서 B로 이어지는 꺾임선.

효과:

```js
{
  operator: 'THEN',
  powerMul: 1.0,
  instabilityDelta: -5,
  execution: 'sequence'
}
```

예시:

```txt
이사(|) THEN 열기(△)
= 먼저 고정하고, 이후 열을 부여한다.
```

### 11-3. `INTO` / 변하여

의미:

- A의 성질이 B로 변환된다.
- 연금술, 변환, 상전이 계열에 사용한다.

입력:

- `arrow` 연결선.
- 화살표가 A에서 B 방향이면 A INTO B.

효과:

```js
{
  operator: 'INTO',
  powerMul: 1.25,
  instabilityDelta: +15,
  execution: 'transform'
}
```

예시:

```txt
대지(ㅡ) INTO 열기(△)
= 대지가 열성으로 전환된다.
```

### 11-4. `IF` / 만약

의미:

- 조건이 충족될 때만 뒤 룬이 발동한다.
- 함정, 방어, 자동 반응에 사용한다.

입력:

- `dotted` 연결선.
- 조건 룬에서 결과 룬으로 이어지는 점선.

효과:

```js
{
  operator: 'IF',
  powerMul: 0.9,
  instabilityDelta: -10,
  execution: 'conditional'
}
```

예시:

```txt
IF 알기즈(Y) THEN 열기(△)
= 방어 조건이 깨질 때 열기가 발동한다.
```

### 11-5. `WHILE` / 동안

의미:

- A가 유지되는 동안 B가 지속된다.
- 지속장, 오라, 보호막에 사용한다.

입력:

- `wavy` 연결선.

효과:

```js
{
  operator: 'WHILE',
  powerMul: 0.95,
  instabilityDelta: +5,
  durationMul: 1.8,
  execution: 'sustain'
}
```

예시:

```txt
WHILE 이사(|), 알기즈(Y)
= 고정 상태 동안 방벽이 유지된다.
```

### 11-6. `OR` / 또는

의미:

- 여러 후보 중 하나가 상황에 따라 발동한다.
- 불확실성이 있지만 유연하다.

입력:

- 갈라지는 Y형 연결선.
- 또는 한 룬에서 두 룬으로 분기되는 connector.

효과:

```js
{
  operator: 'OR',
  powerMul: 1.0,
  instabilityDelta: +10,
  execution: 'branch'
}
```

예시:

```txt
라구즈(L) OR 이사(|)
= 흐름 또는 정지 중 조건에 맞는 쪽이 발현된다.
```

## 격조사 6개

격조사는 각 룬의 문장 역할을 지정한다. 룬 주변의 작은 점 marker 위치로 인식한다.

공통 인식 기준:

- marker는 짧은 stroke 또는 작은 점이다.
- marker bbox의 최대 크기가 대상 룬 bbox 대각선의 8% 이하이면 조사 후보로 본다.
- marker와 가장 가까운 룬을 대상 룬으로 한다.
- 대상 룬 주변을 6개 슬롯으로 나누어 격을 정한다.

### 격조사 슬롯

| case | 한국어 역할 | marker 위치 | 문장 역할 |
|---|---|---|---|
| `NOM` | 주격 | 룬 위 | 주어/발동 주체 |
| `ACC` | 목적격 | 룬 아래 | 대상/피작용체 |
| `INS` | 도구격 | 룬 왼쪽 | 수단/도구 |
| `LOC` | 처소격 | 룬 오른쪽 | 장소/장 |
| `DAT` | 여격/방향격 | 오른쪽 위 | 도착점/수혜자 |
| `GEN` | 소유/기원격 | 왼쪽 위 | 출처/속성/근원 |

예시:

```txt
[열기] 위 marker -> 열기가 주어
[대지] 아래 marker -> 대지가 목적어
```

격조사 우선순위:

1. marker가 있으면 marker를 따른다.
2. marker가 없으면 문장 패턴과 위치로 추론한다.
3. 그래도 불명확하면 `role: unknown`으로 둔다.

## 강도부사 7개

강도부사는 룬 또는 전체 문장에 수치 보정치를 준다.

### 인식 방식

강도부사는 룬 주변의 작은 보조 glyph로 입력한다.

| adverb | 이름 | glyph | 효과 |
|---|---|---|---|
| `AMPLIFY` | 강하게 | `>` 모양 marker | power +30%, instability +10 |
| `WEAKEN` | 약하게 | `<` 모양 marker | power -25%, instability -10 |
| `QUICKLY` | 빠르게 | `//` marker | 발동 속도 +40%, 지속 -20% |
| `SLOWLY` | 느리게 | `~` marker | 발동 속도 -30%, 지속 +40% |
| `WIDELY` | 넓게 | 바깥쪽 작은 원 | 범위 +50%, instability +15 |
| `NARROWLY` | 집중해서 | 안쪽 점 2개 | 범위 -40%, power +20% |
| `SAFELY` | 안정적으로 | 작은 사각 marker | instability -20, power -10% |

데이터 구조:

```js
{
  type: 'adverb',
  name: 'AMPLIFY',
  targetUnitId: 'unit_001',
  scope: 'unit',
  modifiers: {
    powerMul: 1.3,
    instabilityDelta: 10
  }
}
```

## 시제 6개

시제는 마법이 언제, 어떻게 발동하는지를 나타낸다.

| tense | 이름 | marker | 의미 |
|---|---|---|---|
| `PRESENT` | 현재/즉발 | marker 없음 | 즉시 발동 |
| `PAST` | 과거/잔류 | 룬 뒤쪽 작은 짧은 선 | 이미 남은 흔적을 불러옴 |
| `FUTURE` | 미래/지연 | 룬 앞쪽 작은 짧은 선 | 일정 시간 뒤 발동 |
| `PROGRESSIVE` | 진행 | 룬 위 물결 marker | 계속 발동 중 |
| `PERFECT` | 완료 | 룬을 감싸는 작은 닫힌 marker | 완료 상태를 고정 |
| `HABITUAL` | 반복 | 작은 나선 marker | 주기적으로 반복 |

수치 효과:

| tense | 발동 속도 | 지속 | 불안정성 | 특수 효과 |
|---|---:|---:|---:|---|
| `PRESENT` | 1.0 | 1.0 | 0 | 없음 |
| `PAST` | 0.8 | 1.2 | +5 | 흔적/잔류 태그 |
| `FUTURE` | 0.5 | 1.0 | -5 | 지연 발동 |
| `PROGRESSIVE` | 0.8 | 1.8 | +10 | channeling |
| `PERFECT` | 0.9 | 2.0 | -10 | 상태 보존 |
| `HABITUAL` | 0.7 | 1.5 | +15 | 반복 발동 |

## 부정/반전/흡수

### `NEGATE` / 부정

입력:

- 대상 룬 또는 연결선 위의 `crossed` marker.

의미:

- 대상 효과를 금지하거나 제거한다.

예시:

```txt
NOT 열기(△)
= 열을 없애거나 냉각 성질을 만든다.
```

효과:

```js
{
  semanticTransform: 'negate',
  instabilityDelta: +10
}
```

### `INVERT` / 반전

입력:

- 대상 룬의 반대편에 거울 marker.
- 또는 좌우 대칭으로 그어진 짧은 쌍선.

의미:

- 효과 방향이나 성질을 뒤집는다.

예시:

```txt
INVERT 라구즈(L)
= 흐름을 역류시킨다.
```

효과:

```js
{
  semanticTransform: 'invert',
  instabilityDelta: +20,
  noveltyBonus: 0.2
}
```

### `ABSORB` / 흡수

입력:

- 대상 룬을 향해 들어가는 작은 화살표 2개.
- 또는 INTO 연결선이 폐곡선 내부로 들어가는 구조.

의미:

- 주변 효과를 흡수해 저장한다.

효과:

```js
{
  semanticTransform: 'absorb',
  powerMul: 0.8,
  storageMul: 1.5,
  instabilityDelta: +5
}
```

## Grammar token 결과 구조

```js
{
  tokens: [
    { type: 'conjunction', name: 'THEN', from: 'unit_1', to: 'unit_2' },
    { type: 'case', name: 'NOM', target: 'unit_1' },
    { type: 'adverb', name: 'SAFELY', target: 'unit_2' },
    { type: 'tense', name: 'FUTURE', target: 'sentence' }
  ],
  roles: [
    { unitId: 'unit_1', role: 'subject' },
    { unitId: 'unit_2', role: 'object' }
  ],
  operators: ['THEN'],
  transforms: ['NEGATE']
}
```

# 12장. 다중 룬 문장 상세 설계

## 목적

12장은 여러 룬을 하나의 문장으로 읽고, 그 문장이 어떤 등급과 패턴을 가지는지 판정한다.

현재 `arrangement.js`는 이미 다음 배열을 분석한다.

- 직선 배열
- 원형 배열
- 삼각 배열
- 방사형 배열
- 중첩 배열
- 대칭 배열

12장은 이 결과를 바탕으로 다음을 추가한다.

1. 읽기 순서 6방향
2. 문장 등급 5단계
3. 문장 패턴 5종
4. 문장 의미 정규화
5. 논문/퀘스트/균열에서 사용할 수 있는 semantic tag 생성

## 입력

`sentenceAnalyzer.js`는 다음 입력을 받는다.

```js
analyzeSentence({
  units,
  arrangement,
  connectors,
  grammar,
  boneInteractions,
  material
});
```

## 읽기 순서 6방향

읽기 순서는 문장 해석의 첫 단계다.

| order | 이름 | 판정 기준 | 사용 상황 |
|---|---|---|---|
| `left_to_right` | 좌->우 | x 좌표 오름차순 | 기본 직선 문장 |
| `right_to_left` | 우->좌 | x 좌표 내림차순 | 반전/금서/역류 문장 |
| `top_to_bottom` | 상->하 | y 좌표 오름차순 | 하강, 봉인, 낙하 |
| `bottom_to_top` | 하->상 | y 좌표 내림차순 | 상승, 소환, 발화 |
| `center_outward` | 중심->외곽 | 중심 룬 먼저, 거리 증가 | 방사/확산 |
| `outside_inward` | 외곽->중심 | 거리 감소, 중심 룬 마지막 | 수렴/흡수 |

### 읽기 순서 결정 규칙

우선순위:

1. 화살표 연결선이 있으면 화살표 방향을 따른다.
2. `anchor`가 있으면 anchor 룬을 시작점으로 한다.
3. `INTO`, `THEN` 같은 접속사가 있으면 connector 방향을 따른다.
4. 배열이 radial이면 `center_outward` 또는 `outside_inward`를 선택한다.
5. 배열이 circular이면 기본값은 시계방향이지만, 6방향 체계에서는 가까운 축으로 투영해 `center_outward`/`outside_inward`를 우선 사용한다.
6. 아무 정보가 없으면 `left_to_right`를 기본값으로 한다.

주의:

- `right_to_left`는 단순히 우측 룬이 먼저 있는 경우만으로 판정하지 않는다.
- 반전 marker, crossed connector, 금서 계열 phase, 또는 우->좌 화살표가 있을 때 명시적으로 사용한다.

## 문장 등급 5단계

문장 등급은 룬 수, 접속사 수, 뼈대 구조, 문법 완성도를 기준으로 한다.

| grade | 이름 | 조건 | 게임 내 의미 |
|---|---|---|---|
| `single_rune` | 단일 룬 | 룬 1개 | 기초 현상 |
| `compound_word` | 복합어 | 룬 2개 또는 compound | 단순 조합 현상 |
| `phrase` | 구 | 룬 3~4개, 접속사 0~1개 | 방향성 있는 술식 |
| `sentence` | 문장 | 룬 5~7개, 역할 2개 이상 | 논문 가치 높은 술식 |
| `incantation` | 주문 | 룬 8개 이상 또는 조건/시제/뼈대 모두 포함 | 고위/금서 학회 대상 |

등급 계산:

```js
function classifySentenceGrade(ctx) {
  const n = ctx.units.length;
  const opCount = ctx.grammar.operators.length;
  const roleCount = ctx.grammar.roles.length;
  const hasBone = ctx.boneInteractions.length > 0;

  if (n <= 1) return 'single_rune';
  if (n === 2 || ctx.legacy.compoundName) return 'compound_word';
  if (n <= 4) return 'phrase';
  if (n <= 7 && roleCount >= 2) return 'sentence';
  if (n >= 8 || (opCount >= 2 && hasBone)) return 'incantation';
  return 'phrase';
}
```

## 문장 패턴 5종

### 12-1. `SVO` / 주체-작용-대상

구조:

```txt
Subject -> Verb/Effect -> Object
```

판정:

- `NOM`이 붙은 룬이 있다.
- `ACC`가 붙은 룬이 있다.
- 둘 사이에 작용 룬 또는 접속사가 있다.

예시:

```txt
열기(NOM) THEN 대지(ACC)
= 열기가 대지에 작용한다.
```

게임 효과:

- 가장 표준적인 논문 패턴.
- 기초/열역학 학회에서 선호.

### 12-2. `SVC` / 주체-상태-보어

구조:

```txt
Subject -> State -> Complement
```

판정:

- 주격 룬 1개.
- 상태 계열 룬 또는 가두기/고정 뼈대.
- 보어 역할 룬 1개.

예시:

```txt
이사(NOM) WHILE 원(LOC)
= 이사가 원 내부에서 고정 상태를 유지한다.
```

게임 효과:

- 유지/결계/봉인 계열.
- 불안정성 낮고 지속시간 높음.

### 12-3. `SOURCE_INTO_RESULT` / 근원-변환-결과

구조:

```txt
Source INTO Result
```

판정:

- `INTO` 접속사가 있다.
- `GEN` 또는 source 역할이 있다.
- 결과 룬이 `DAT` 또는 우측 target으로 지정된다.

예시:

```txt
대지(GEN) INTO 열기(DAT)
= 대지의 성질이 열기로 전환된다.
```

게임 효과:

- 연금술/변환/Phase 2 이상 연구에 중요.
- 신규 발견 확률 높음.
- 불안정성 증가.

### 12-4. `CONDITION_THEN_EFFECT` / 조건-결과

구조:

```txt
IF Condition THEN Effect
```

판정:

- `IF` 또는 dotted connector가 있다.
- `THEN` 또는 결과 방향이 있다.

예시:

```txt
IF 알기즈 THEN 열기
= 방어 조건이 깨질 때 열기가 발동한다.
```

게임 효과:

- 함정, 자동 방어, 균열 대응 퀘스트에 사용.
- 즉발성은 낮지만 안정성이 높음.

### 12-5. `CORE_ORBITAL` / 핵-궤도

구조:

```txt
Core surrounded by Orbitals
```

판정:

- 원형 배열 또는 가두기/anchor가 있다.
- 중심 룬 1개와 외곽 룬 2개 이상.

예시:

```txt
원 중심에 열기, 둘레에 이사와 알기즈
= 열기를 중심으로 고정과 방어가 순환한다.
```

게임 효과:

- 고급 배열 문법.
- Phase 3 이상의 논문/주문 등급에 적합.
- 강력하지만 계산량과 불안정성 증가.

## 문장 결과 구조

```js
{
  readingOrder: 'left_to_right',
  orderedUnits: ['unit_1', 'unit_2', 'unit_3'],
  grade: 'sentence',
  pattern: 'SVO',
  normalizedText: '열기 THEN 대지',
  semanticTags: [
    'heat',
    'earth',
    'sequential',
    'subject_object'
  ],
  confidence: 0.82,
  warnings: []
}
```

## 문장 분석 실패 처리

문장 분석이 실패해도 마법 자체가 실패하면 안 된다.

실패 시:

- `grade`는 룬 수 기반으로만 산출한다.
- `pattern`은 `unknown`으로 둔다.
- UI에는 "문법 불명확"을 표시한다.
- 연구 노트에는 "불명확한 문장 구조"로 기록한다.

예시 UI:

```txt
문장 분석: 구 단계
읽기 순서: 좌->우
패턴: 불명확
경고: 조사 또는 접속사가 없어 주체/대상이 모호함
```

# 블라인드 발견 시스템 상세

## 목적

플레이어가 조합표를 맞히는 느낌을 없애고, 실제 연구자처럼 관찰값을 바탕으로 현상을 발견하게 한다.

현재 `recognition.js`는 `compoundName`을 반환한다. 이 값은 내부적으로 유지하되, 플레이어 UI에서는 다음 조건을 따른다.

| 상태 | UI 표시 |
|---|---|
| 처음 본 signature | 미확인 반응 |
| 플레이어가 이름 붙임 | 플레이어 명명 표시 |
| 학술 정설에 있음 | 정설명 표시 |
| 정설과 실제가 다름 | 정설 불일치 경고 |
| 디버그 모드 | legacy compoundName 표시 |

## 발견 저장 구조

```js
{
  signature: 'sig_heat_820_inst_30_flow_...',
  firstSeenAt: {
    week: 2,
    day: 3
  },
  playerName: null,
  playerDescription: '',
  reproducibility: {
    count: 1,
    requiredForPaper: 3,
    records: [
      {
        heat: 820,
        instability: 30,
        resonance: 42.4,
        material: 'parchment',
        sentenceGrade: 'compound_word'
      }
    ]
  },
  academic: {
    knownToAcademy: false,
    canonId: null,
    canonName: null,
    canonCorrect: null
  },
  status: 'observed'
}
```

## 연구 노트 UI 흐름

1. 플레이어가 미확인 반응을 만든다.
2. 에너지 분석기에 "미확인 반응 감지"가 뜬다.
3. `연구 노트에 기록` 버튼이 나타난다.
4. 버튼을 누르면 모달이 열린다.
5. 플레이어가 이름과 설명을 입력한다.
6. 저장하면 발견 DB에 등록된다.
7. 같은 signature를 다시 만들면 재현 횟수가 증가한다.

모달 필드:

```txt
현상 이름: [             ]
간단 설명: [             ]
사용 룬: 자동 표시
뼈대 상호작용: 자동 표시
문장 패턴: 자동 표시
측정값: 자동 표시
[이름 없이 저장] [저장]
```

## 재현 판정

재현은 완전히 같은 stroke를 요구하지 않는다. signature가 같으면 재현이다.

추가로 다음 허용 오차를 둔다.

| 값 | 허용 오차 |
|---|---:|
| heat | ±15% |
| instability | ±10%p |
| resonance | ±20% |
| sentence pattern | 동일해야 함 |
| bone interaction | 핵심 유형 동일해야 함 |

재현 실패 시:

- "유사 현상"으로 기록한다.
- 논문 재현 횟수에는 포함하지 않는다.
- 플레이어에게 조건 차이를 알려준다.

# 학술 정설 시스템 상세

## 목적

게임 시작 시 학계에는 일부 정설이 존재한다. 하지만 모든 정설이 정확하지는 않다.

정설 종류:

1. 정확한 정설
2. 불완전한 정설
3. 틀린 정설

## Canon 구조

```js
{
  id: 'canon_002',
  title: '봉인된 달 정설',
  expectedSignature: 'sig_old_...',
  legacyHint: {
    mainRune: '원(○)',
    radical: '이사(|)',
    position: 'middle'
  },
  officialName: '봉인된 달',
  officialObservables: {
    dynamics: '갇힘(침묵)',
    instabilityBand: 35
  },
  isCorrect: false,
  actualSignature: 'sig_real_...',
  challengeable: true,
  discoveredBy: '오르무스 아카데미',
  year: 891,
  notes: '원본 논문 소실. 사본만 존재.'
}
```

## 정설 비교 로직

새 분석 결과가 나오면 다음을 수행한다.

1. signature가 canon의 expectedSignature와 일치하는지 확인한다.
2. legacy 조합이 canon의 legacyHint와 같은지 확인한다.
3. 관측값이 officialObservables와 다른지 확인한다.
4. 다르면 `canonMismatch`를 생성한다.

UI 문구:

```txt
학술 정설과 불일치:
오르무스 891년 정설은 이 현상을 '봉인된 달'로 기록했으나,
현재 관측값은 '불안정한 양면성'에 가깝습니다.
도전 논문 후보입니다.
```

# 논문 시스템 상세

## 논문 유형

| type | 설명 | 조건 |
|---|---|---|
| `new_discovery` | 신규 현상 발표 | 재현 3회 이상 |
| `refinement` | 기존 정설 보완 | 정설과 일부 조건 차이 발견 |
| `challenge` | 기존 정설 반박 | 정설 불일치 + 재현 10회 이상 |
| `sentence_formula` | 다중 룬 문장 술식 발표 | 문장 등급 `sentence` 이상 |
| `forbidden` | 금서급 주문 발표 | Phase 3 이상, 고위험 |

## 논문 초안 구조

```js
{
  id: 'paper_001',
  type: 'new_discovery',
  title: '',
  discoverySignature: 'sig_...',
  authorName: '플레이어',
  targetSociety: 'basic_magic_society',
  claim: '',
  evidence: {
    reproductionCount: 3,
    averageHeat: 821,
    averageInstability: 31,
    materialsTested: ['parchment'],
    sentenceGrade: 'compound_word'
  },
  status: 'draft'
}
```

## 학회별 기준

### 기초 마법 학회

조건:

- 재현 3회 이상
- 불안정성 50 이하
- 단일 룬, 복합어, 구 단계까지 허용
- 도전 논문은 받지 않음

보상:

- 학위 점수 +10~25
- 명성 +5~15
- 연구비 +300

### 열역학 마법 학회

조건:

- 재현 5회 이상
- 열 또는 불안정성 관련 관측 포함
- 최소 2개 바탕재 중 하나 이상에서 재현
- 문장 등급 `phrase` 이상이면 가산점

보상:

- 학위 점수 +25
- 명성 +15
- 연구비 +800

### 고위 마법 학회

조건:

- 문장 등급 `sentence` 이상 또는 도전 논문
- 재현 10회 이상
- 오차 범위 5~10% 이내
- NPC 심사 반응 발생

보상:

- 학위 점수 +50
- 명성 +30
- 고급 장비 또는 탐사 권한

### 금서 마법 학회

조건:

- Phase 3 이상
- 문장 등급 `incantation`
- 불안정성 70 이상 또는 금서 룬 포함
- 비공개 심사

보상:

- 학위 점수 +100
- 명성 대폭 상승 또는 평판 위험
- 금서 연구 루트 해금

# 탐사 시스템 상세

## 목적

탐사는 정답을 알려주지 않는다. 막힌 플레이어에게 방향만 준다.

탐사 결과는 다음 중 하나다.

- 룬 파편
- 고문헌 단편
- 실패 실험 노트
- 특수 바탕재
- 억압된 논문
- 틀린 정설 원본

## 탐사 흐름

```txt
탐사지 선택
  -> 비용 확인
  -> 신청
  -> active expedition 등록
  -> 일정 진행
  -> 완료 알림
  -> 결과 뽑기
  -> archive / materials / canon evidence에 반영
```

## Expedition 구조

```js
{
  id: 'site_ruins_of_ignar',
  name: '이그나르 폐허',
  phase: 1,
  cost: { funds: 200, days: 3 },
  region: 'fire',
  possibleFinds: [
    {
      type: 'rune_fragment',
      content: '상단이 갈라진 수직선 형태...',
      probability: 0.7
    }
  ]
}
```

## 완료 결과 구조

```js
{
  expeditionId: 'site_ruins_of_ignar',
  completedAt: { week: 2, day: 5 },
  finds: [
    {
      type: 'ancient_record',
      title: '고문헌 단편 #14-A',
      content: '열기와 (판독불가)의 결합은...',
      addedToArchive: true
    }
  ]
}
```

# 연구 경제 시스템 상세

## 목적

연구비는 플레이어의 선택을 만든다.

플레이어는 항상 다음 사이에서 고민해야 한다.

```txt
독립 연구를 유지할 것인가?
돈을 받는 대신 연구 방향을 제한받을 것인가?
위험한 연구를 감수할 것인가?
```

## 수입원

1. 스크롤 판매
2. 국가 연구 과제
3. 산학협력
4. 강의료
5. 논문 인용료
6. 로열티

## 지출처

1. 탐사 비용
2. 장비 구매
3. 재료 구매
4. 사고 복구
5. 논문 추가 실험
6. 학회 제출 비용

## 스크롤 판매 조건

```js
function canSellScroll(analysis, discovery) {
  return analysis.observables.instability <= 25
    && discovery.reproducibility.count >= 3
    && discovery.status !== 'disputed';
}
```

가격:

```js
price = 100
  + resonance * 2
  - instability * 3
  + gradeBonus
  + noveltyBonus
```

문장 등급 보너스:

| grade | bonus |
|---|---:|
| `single_rune` | 0 |
| `compound_word` | 50 |
| `phrase` | 120 |
| `sentence` | 300 |
| `incantation` | 800 |

# 학사·Phase 시스템 상세

## Phase

| Phase | 이름 | 핵심 해금 |
|---|---|---|
| 1 | 석사 1년차 | 기본 룬, 기초 논문, 기초 탐사 |
| 2 | 석사 졸업반 | 스크롤 판매, 열역학 학회, 정령의 수면 |
| 3 | 박사 과정 | 흑요석, 고위 학회, 도전 논문 본격화 |
| 4 | 교수 임용 | 금서 학회, 학계 표준 등록 |

## Phase 전환 조건

Phase는 단순 점수가 아니라 다음 조건을 함께 본다.

```js
{
  minDegreeScore: 100,
  minAcceptedPapers: 2,
  requiredExamPassed: true,
  requiredDiscoveryCount: 3
}
```

## 중간고사

현재 `rift.js`를 응용해서 제한 시간 안에 룬을 그리는 시험으로 구현한다.

- 10문제
- 문제당 15초
- 기존 `RecognitionEngine.identifyRune()` 사용
- 80점 이상 A
- 50점 미만 학사 경고

## 기말고사

기말은 균열 게임의 보스전 버전이다.

예시 Phase 1 기말:

```txt
조건:
- 불안정성 50 이상
- 열 100도 미만
- 오버로드 금지
- 제한 시간 120초
```

성공 시 Phase 2 해금.

# UI 통합 계획

## 현재 UI 유지

현재 화면에는 다음 패널이 있다.

- 상단 중앙: 차원 균열
- 좌상단: 고문헌 보관소
- 우측: 에너지 분석기
- 하단: 도구 패널
- 바탕재 선택

이를 유지한다.

## 추가 UI는 탭/모달 중심으로 만든다

화면이 이미 꽉 차 있으므로 새 패널을 무작정 늘리지 않는다.

추가 권장 UI:

1. 좌측 아카이브 패널 내부 탭
   - 고문헌
   - 연구 노트
   - 탐사

2. 우측 분석기 하단 접이식 영역
   - 문장 분석
   - 뼈대 상호작용
   - 문법 토큰

3. 하단 우측 작은 자원 HUD
   - 연구비
   - 명성
   - 학위 점수
   - 주차

4. 모달
   - 발견 기록
   - 논문 작성
   - 과제 신청
   - 산학협력 계약

## 신규 DOM ID 제안

```html
<div id="resource-hud"></div>
<div id="analysis-grammar-block"></div>
<div id="bone-interaction-block"></div>
<div id="lab-notebook-tab"></div>
<div id="expedition-tab"></div>
<div id="paper-modal"></div>
<div id="discovery-modal"></div>
```

# `main.js` 수정 지점

## import 추가

```js
import { analyzeMagic } from './magicPipeline.js';
import { gameState } from './gameState.js';
import { loadGame, saveGame } from './saveLoad.js';
import { emit } from './eventBus.js';
import { renderAcademicUI } from './academicUI.js';
```

## init 수정

```js
function init() {
  loadGame();
  // 기존 초기화 유지
  updateArchiveUI();
  refreshRiftUI();
  renderAcademicUI(gameState);
  requestAnimationFrame(renderLoop);
}
```

## analyzeCurrentState 수정

기존 분석 계산 후 또는 대체로 다음을 호출한다.

```js
function analyzeCurrentState() {
  const runeStrokes = state.strokes.filter(...);
  const boneStrokes = state.strokes.filter(...);

  lastAnalysis = analyzeMagic({
    runeStrokes,
    boneStrokes,
    material: state.material,
    recognizer
  });

  applyAnalysisToLegacyState(lastAnalysis);
  updateAnalyzerUI(lastAnalysis);
  emit('magic:analyzed', lastAnalysis);
}
```

## castMagic 수정

기존 균열 로직은 유지하되, cast 이벤트를 추가한다.

```js
function castMagic() {
  const payload = {
    analysis: lastAnalysis,
    week: gameState.progression.currentWeek,
    day: gameState.progression.currentDay
  };

  emit('magic:cast', payload);

  // 기존 riftGame.cast 로직 유지
}
```

# QA 체크리스트

## 기본 인식 QA

- 이사(|) 인식됨
- 대지(ㅡ) 인식됨
- 열기(△) 인식됨
- 원(○) 인식됨
- 열기+대지 below가 내부적으로 compound로 잡힘
- 하지만 UI에는 처음부터 "마그마"라고 바로 뜨지 않음

## 10장 QA

- 원 안 룬 = 가두기
- 원 경계 룬 = 걸치기
- 룬 아래 선 = 받치기
- 룬 관통 선 = 꿰뚫기
- 두 룬 연결 선 = 잇기
- 꼭짓점 위 룬 = 고정하기
- 연결선 9종 중 최소 5종은 MVP에서 동작해야 함

## 11장 QA

- double connector = AND
- broken connector = THEN
- arrow connector = INTO
- dotted connector = IF
- marker 위치로 NOM/ACC 구분
- AMPLIFY/SAFELY가 수치에 반영됨
- NOT marker가 의미를 부정함

## 12장 QA

- 좌->우 읽기 순서 작동
- 화살표 방향 읽기 작동
- 중심->외곽 읽기 작동
- 단일 룬/복합어/구/문장/주문 등급 산출
- SVO, INTO, IF-THEN 패턴 판정

## 연구 시스템 QA

- 미확인 반응 기록 가능
- 같은 signature 재현 카운트 증가
- 3회 재현 후 논문 버튼 활성화
- 논문 수락 시 학위 점수 증가
- 정설 불일치 시 도전 논문 후보 표시

## 경제/탐사 QA

- 탐사 신청 시 연구비 차감
- 일정 경과 후 결과 생성
- 안정 마법 스크롤 판매 가능
- 과제 수락 후 마감일 표시
- 산학협력 독점 조건 적용

# 개발자에게 전달할 핵심 의도

이 게임의 핵심은 "정답을 찾는 게임"이 아니다.

정답은 코드 안에 있어도 된다. 하지만 플레이어가 보는 것은 정답명이 아니라 관측값이어야 한다.

플레이어는 다음 과정을 경험해야 한다.

```txt
알 수 없는 문양을 그린다.
이상한 수치가 나온다.
연구 노트에 기록한다.
이름을 붙인다.
다시 실험해 재현한다.
논문을 낸다.
학회가 인정하거나 반박한다.
내 이름이 정설에 남는다.
```

따라서 구현 중 판단이 갈리면 항상 다음 기준을 우선한다.

1. 플레이어가 직접 발견했다고 느끼는가?
2. 시스템이 정답을 너무 빨리 알려주지 않는가?
3. 실험 결과가 다음 실험의 단서가 되는가?
4. 탐사, 경제, 논문, 학사가 하나의 루프로 연결되는가?
5. 기존 캔버스 드로잉 경험을 방해하지 않는가?

# 우선 구현 순서 요약

실제 개발 순서는 다음이 가장 안전하다.

1. 저장소 정리 및 README 정비
2. `gameState.js`, `saveLoad.js`, `eventBus.js`
3. `magicPipeline.js`로 분석 결과 통합
4. 10장 뼈대 상호작용
5. 11장 접속사·조사
6. 12장 문장 분석
7. 블라인드 발견과 연구 노트
8. 논문 시스템
9. 탐사 시스템
10. 경제 시스템
11. 학사/Phase/시험
12. UI 폴리싱과 밸런싱

# 부록 A. 최소 MVP 범위

시간이 부족하면 다음까지만 구현해도 핵심 경험은 살아난다.

1. `magicPipeline.js`
2. signature 생성
3. 연구 노트 저장
4. 재현 카운트
5. 10장 상호작용 중 가두기/받치기/잇기
6. 11장 접속사 중 AND/THEN/INTO
7. 12장 읽기 순서 중 좌->우/화살표/중심->외곽
8. 논문 제출은 자동 심사로 단순화
9. 탐사는 결과만 랜덤 생성
10. 경제는 연구비 차감/획득만 단순 구현

# 부록 B. 나중에 해도 되는 것

다음은 후순위다.

- NPC별 세부 대사 시스템
- 반박 논문 장기 분쟁
- 금서 학회 전체 구현
- 군사 계약 윤리 루트
- 고급 애니메이션
- 완전한 튜토리얼 시네마틱
- 자동 밸런스 시뮬레이터

# 부록 C. 개발 중 디버그 모드

디버그 모드는 반드시 필요하다.

```js
settings: {
  debugShowLegacyNames: true,
  debugShowSignature: true,
  debugForceGrammarToken: false,
  debugUnlockAllPhases: false
}
```

디버그 패널 표시 항목:

- legacy meaning
- compoundName
- signature
- arrangement kind
- bone interactions
- connector links
- grammar tokens
- sentence pattern
- final observables

최종 빌드에서는 기본적으로 숨긴다.

# 부록 D. 예시 플레이 시나리오

## 1주차

플레이어는 이사(|), 대지(ㅡ), 열기(△)를 배운다. 고문헌 보관소에는 기본 룬을 그리는 법만 있다.

## 2주차

플레이어가 열기(△) 아래에 대지(ㅡ)를 그린다.

시스템 내부적으로는 기존 조합 테이블 때문에 `마그마`로 잡히지만, UI에는 다음처럼 뜬다.

```txt
미확인 반응 감지
열: 820°C
불안정성: 30%
역학: 꿈틀거림/흐름
문장 등급: 복합어
```

플레이어는 이 현상에 "용암류"라는 이름을 붙인다.

## 3주차

플레이어가 같은 현상을 3회 재현한다. 연구 노트에서 논문 제출 버튼이 열린다.

## 4주차

플레이어가 원(○)과 이사(|) 조합을 실험한다. 고문헌에는 "봉인된 달"이라고 되어 있지만 관측값이 다르다.

시스템은 다음 경고를 띄운다.

```txt
학술 정설과 불일치합니다.
도전 논문 후보입니다.
```

## 6주차

플레이어는 10회 재현 후 도전 논문을 제출한다. 오르무스 교수가 반박 논문을 낸다.

## 8주차

루민이 독립 재현에 성공하고, 학회가 정설 수정을 결의한다. 플레이어가 붙인 이름이 학계 표준으로 등록된다.

# 부록 E. 구현 시 금지 사항

다음은 하지 않는다.

1. `recognition.js`의 조합명을 그대로 UI 메인에 노출하지 않는다.
2. 모든 시스템을 `main.js`에 계속 추가하지 않는다.
3. 탐사가 정답 조합을 직접 알려주게 하지 않는다.
4. 논문 심사를 단순 점수 보상 팝업으로만 만들지 않는다.
5. 경제 시스템이 단순 돈벌이 미니게임으로 분리되지 않게 한다.
6. 10~12장 문법을 균열 게임에서만 쓰고 연구 시스템에는 연결하지 않는 실수를 하지 않는다.
7. 저장 구조 없이 임시 변수만으로 진행 상태를 관리하지 않는다.

# 부록 F. 최종 완료 기준

이 프로젝트가 통합 설계대로 구현되었다고 판단하려면 다음 조건을 만족해야 한다.

1. 플레이어가 미확인 현상을 최소 1개 발견할 수 있다.
2. 발견에 이름을 붙이고 연구 노트에 저장할 수 있다.
3. 같은 현상을 재현하면 카운트가 오른다.
4. 재현 3회 후 논문을 제출할 수 있다.
5. 논문 수락 시 학위 점수와 명성이 오른다.
6. 탐사를 보내 힌트를 얻을 수 있다.
7. 연구비가 부족해 선택을 강제한다.
8. 뼈대 상호작용이 수치와 문장 분석에 반영된다.
9. 접속사·조사·시제가 다중 룬 문장에 반영된다.
10. 문장 등급과 패턴이 논문/퀘스트 조건에 쓰인다.
11. 균열 게임은 기존처럼 작동한다.
12. 기존 룬 드로잉 감각이 유지된다.

이 12개가 만족되면, 아케인 샌드박스는 단순 조합 게임이 아니라 "마법을 연구하는 학문 시뮬레이션"으로 기능한다.
