/**
 * Inbox system — 학내 메일함.
 * 게임 이벤트(논문 채택, 시험 결과, 답사 보고, 정설 불일치 등)에 반응해
 * 학과 사무실/지도교수/학회/후원 기관 등이 보내는 메일을 자동 생성한다.
 */

import { gameState } from './gameState.js';
import { on, emit } from './eventBus.js';
import { saveGame } from './saveLoad.js';
import { WELCOME_MAIL, buildMailFromEvent } from './data/inboxSeed.js';

let initialized = false;

function ensureInbox() {
  if (!gameState.inbox || typeof gameState.inbox !== 'object') {
    gameState.inbox = { messages: [] };
  }
  if (!Array.isArray(gameState.inbox.messages)) {
    gameState.inbox.messages = [];
  }
}

function nextMailId() {
  return `mail_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export function initInbox() {
  if (initialized) return;
  initialized = true;

  ensureInbox();

  if (gameState.inbox.messages.length === 0) {
    addMail(WELCOME_MAIL);
  }

  on('paper:accepted', (payload) => addFromEvent('paper:accepted', payload));
  on('paper:rejected', (payload) => addFromEvent('paper:rejected', payload));
  on('exam:midtermTaken', (payload) => addFromEvent('exam:midtermTaken', payload));
  on('exam:finalTaken', (payload) => addFromEvent('exam:finalTaken', payload));
  on('phase:advanced', (payload) => addFromEvent('phase:advanced', payload));
  on('economy:grantAccepted', (payload) => addFromEvent('economy:grantAccepted', payload));
  on('economy:contractSigned', (payload) => addFromEvent('economy:contractSigned', payload));
  on('expedition:completed', (payload) => addFromEvent('expedition:completed', payload));
  on('canon:mismatch', (payload) => addFromEvent('canon:mismatch', payload));
  // PR-J: 학회지 NPC 논문 게재/반박 알림.
  on('publication:released', (payload) => addFromEvent('publication:released', payload));
  on('publication:rebutted', (payload) => addFromEvent('publication:rebutted', payload));
}

function addFromEvent(kind, payload) {
  const tpl = buildMailFromEvent(kind, payload);
  if (!tpl) return;
  addMail(tpl);
}

export function addMail(template) {
  ensureInbox();
  const mail = {
    id: nextMailId(),
    sender: template.sender,
    senderRole: template.senderRole || 'system',
    subject: template.subject,
    body: template.body,
    kind: template.kind || 'announcement',
    receivedWeek: gameState.progression.currentWeek,
    receivedDay: gameState.progression.currentDay,
    read: false,
    createdAt: Date.now(),
  };
  gameState.inbox.messages.unshift(mail);
  emit('inbox:received', mail);
  saveGame();
  return mail;
}

export function getMessages() {
  ensureInbox();
  return gameState.inbox.messages;
}

export function getUnreadCount() {
  ensureInbox();
  return gameState.inbox.messages.filter((m) => !m.read).length;
}

export function markRead(id) {
  ensureInbox();
  const mail = gameState.inbox.messages.find((m) => m.id === id);
  if (mail && !mail.read) {
    mail.read = true;
    emit('inbox:read', mail);
    saveGame();
  }
  return mail;
}

export function markAllRead() {
  ensureInbox();
  let changed = false;
  for (const m of gameState.inbox.messages) {
    if (!m.read) {
      m.read = true;
      changed = true;
    }
  }
  if (changed) {
    emit('inbox:read', null);
    saveGame();
  }
}
