/**
 * Online multiplayer rooms — Firebase Realtime Database (Phase 2–4, with chat).
 * Firebase SDK is loaded lazily so local/offline play works in Capacitor WebView.
 */
import { firebaseConfig, isFirebaseConfigured } from './firebase-config.js';
import { PLAYER_COLORS } from './board-data.js';

const ROOM_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ROOM_CODE_LENGTH = 6;
const MAX_PLAYERS = 6;
const MAX_MESSAGES = 50;
const MAX_MESSAGE_LENGTH = 200;
const PLAYER_ID_KEY = 'pal-train-player-id';

const FIREBASE_APP_URL = 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
const FIREBASE_DB_URL = 'https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js';

/** @type {readonly string[]} */
export const PRESET_MESSAGES = [
  'دوري',
  'أحسنت',
  'بالتوفيق',
  'انتظر',
  'ههه',
  'مبروك',
  'شكراً',
  'حظاً سعيداً',
  'علّمني',
  'يا سلام',
];

const BAD_WORDS = [
  'كس',
  'زب',
  'شرمو',
  'عرص',
  'منيك',
  'طيز',
  'لعن',
  'كلب',
  'حمار',
];

let firebaseApp = null;
let db = null;
/** @type {null | { initializeApp: Function, getDatabase: Function, ref: Function, set: Function, get: Function, update: Function, onValue: Function, off: Function, remove: Function, runTransaction: Function }} */
let firebaseApi = null;
let firebaseLoadPromise = null;

async function loadFirebaseApi() {
  if (firebaseApi) return firebaseApi;
  if (firebaseLoadPromise) return firebaseLoadPromise;

  firebaseLoadPromise = (async () => {
    if (!isFirebaseConfigured()) return null;
    try {
      const [appMod, dbMod] = await Promise.all([
        import(FIREBASE_APP_URL),
        import(FIREBASE_DB_URL),
      ]);
      firebaseApi = {
        initializeApp: appMod.initializeApp,
        getDatabase: dbMod.getDatabase,
        ref: dbMod.ref,
        set: dbMod.set,
        get: dbMod.get,
        update: dbMod.update,
        onValue: dbMod.onValue,
        off: dbMod.off,
        remove: dbMod.remove,
        runTransaction: dbMod.runTransaction,
      };
      return firebaseApi;
    } catch (err) {
      console.warn('[Online] Firebase SDK failed to load — online play disabled', err);
      firebaseLoadPromise = null;
      return null;
    }
  })();

  return firebaseLoadPromise;
}

async function getDbAsync() {
  const api = await loadFirebaseApi();
  if (!api || !isFirebaseConfigured()) return null;
  if (!db) {
    firebaseApp = api.initializeApp(firebaseConfig);
    db = api.getDatabase(firebaseApp);
  }
  return { api, db };
}

/** Sync accessor — returns db only after async init completed */
function getDb() {
  return db;
}

async function roomRef(code) {
  const loaded = await getDbAsync();
  if (!loaded) return null;
  return loaded.api.ref(loaded.db, `rooms/${code}`);
}

async function messagesRef(code) {
  const loaded = await getDbAsync();
  if (!loaded) return null;
  return loaded.api.ref(loaded.db, `rooms/${code}/messages`);
}

function generateRoomCode() {
  let code = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i += 1) {
    code += ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)];
  }
  return code;
}

/**
 * Persistent client id for this browser/device.
 * @returns {string}
 */
export function getPlayerId() {
  try {
    let id = localStorage.getItem(PLAYER_ID_KEY);
    if (!id) {
      id = `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
      localStorage.setItem(PLAYER_ID_KEY, id);
    }
    return id;
  } catch {
    return `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
  }
}

/**
 * @param {Record<string, object>|object[]|null|undefined} raw
 * @returns {Array<{id:string,name:string,color:string,position:number,order:number}>}
 */
export function playersToArray(raw) {
  if (!raw) return [];
  const list = Array.isArray(raw) ? raw : Object.values(raw);
  return list
    .filter(Boolean)
    .map((p, i) => ({
      id: p.id,
      name: p.name || 'لاعب',
      color: p.color || PLAYER_COLORS[i % PLAYER_COLORS.length],
      position: typeof p.position === 'number' ? p.position : 1,
      order: typeof p.order === 'number' ? p.order : i,
      startScore: typeof p.startScore === 'number' ? p.startScore : undefined,
    }))
    .sort((a, b) => a.order - b.order);
}

function playersToMap(players) {
  const map = {};
  players.forEach((p, i) => {
    map[p.id] = { ...p, order: i };
  });
  return map;
}

function defaultBoardState() {
  return {
    waitingForMove: false,
    processingMove: false,
    gameOver: false,
    highlightSquare: null,
  };
}

function normalizeRoom(snap) {
  const data = snap.val();
  if (!data) return null;
  return {
    code: data.code,
    hostId: data.hostId,
    players: playersToArray(data.players),
    currentTurn: typeof data.currentTurn === 'number' ? data.currentTurn : 0,
    started: !!data.started,
    lotteryPhase: !!data.lotteryPhase,
    lotteryTurnIndex:
      typeof data.lotteryTurnIndex === 'number' ? data.lotteryTurnIndex : 0,
    level: data.level || 'ashbal',
    stateVersion: typeof data.stateVersion === 'number' ? data.stateVersion : 0,
    boardState: { ...defaultBoardState(), ...(data.boardState || {}) },
  };
}

async function findUniqueRoomCode(maxAttempts = 12) {
  for (let i = 0; i < maxAttempts; i += 1) {
    const code = generateRoomCode();
    const rRef = await roomRef(code);
    if (!rRef) throw new Error('FIREBASE_NOT_CONFIGURED');
    const loaded = await getDbAsync();
    const snap = await loaded.api.get(rRef);
    if (!snap.exists()) return code;
  }
  throw new Error('تعذّر إنشاء رمز غرفة فريد — حاول مجدداً');
}

/**
 * @returns {Promise<{code:string, hostId:string, player:object}>}
 */
export async function createRoom(hostName, level = 'ashbal') {
  const loaded = await getDbAsync();
  if (!loaded) {
    throw new Error('FIREBASE_NOT_CONFIGURED');
  }

  const hostId = getPlayerId();
  const name = (hostName || 'المضيف').trim().slice(0, 24) || 'المضيف';
  const code = await findUniqueRoomCode();

  const room = {
    code,
    hostId,
    level,
    started: false,
    currentTurn: 0,
    players: {
      [hostId]: {
        id: hostId,
        name,
        color: PLAYER_COLORS[0],
        position: 1,
        order: 0,
      },
    },
    boardState: defaultBoardState(),
    messages: [],
    createdAt: Date.now(),
  };

  const rRef = await roomRef(code);
  await loaded.api.set(rRef, room);
  return { code, hostId, player: room.players[hostId] };
}

/**
 * @returns {Promise<{code:string, player:object, room:object}>}
 */
export async function joinRoom(code, playerName) {
  const loaded = await getDbAsync();
  if (!loaded) {
    throw new Error('FIREBASE_NOT_CONFIGURED');
  }

  const normalized = (code || '').trim().toUpperCase();
  if (normalized.length !== ROOM_CODE_LENGTH) {
    throw new Error('رمز الغرفة يجب أن يكون 6 أحرف');
  }

  const playerId = getPlayerId();
  const name = (playerName || 'لاعب').trim().slice(0, 24) || 'لاعب';
  const rRef = await roomRef(normalized);
  if (!rRef) throw new Error('FIREBASE_NOT_CONFIGURED');

  const result = await loaded.api.runTransaction(rRef, (room) => {
    if (!room) return room;

    const players = room.players || {};
    const existing = players[playerId];
    if (existing) {
      players[playerId] = { ...existing, name };
      return { ...room, players };
    }

    const count = Object.keys(players).length;
    if (count >= MAX_PLAYERS) return;

    players[playerId] = {
      id: playerId,
      name,
      color: PLAYER_COLORS[count % PLAYER_COLORS.length],
      position: 1,
      order: count,
    };

    return { ...room, players };
  });

  if (!result.committed || !result.snapshot.exists()) {
    throw new Error('الغرفة غير موجودة أو ممتلئة');
  }

  const room = normalizeRoom(result.snapshot);
  const player = room.players.find((p) => p.id === playerId);
  if (!player) {
    throw new Error('تعذّر الانضمام للغرفة');
  }

  return { code: normalized, player, room };
}

/**
 * Push full game snapshot to the room.
 * @param {string} code
 * @param {object} gameState
 */
export async function syncGameState(code, gameState) {
  const loaded = await getDbAsync();
  if (!loaded || !code) return;

  const payload = {
    players: playersToMap(gameState.players || []),
    currentTurn: gameState.currentTurn ?? gameState.currentIndex ?? 0,
    started: !!gameState.started,
    level: gameState.level || 'ashbal',
    stateVersion: typeof gameState.stateVersion === 'number' ? gameState.stateVersion : Date.now(),
    boardState: {
      ...defaultBoardState(),
      ...(gameState.boardState || {}),
    },
  };

  if (typeof gameState.started === 'boolean') payload.started = gameState.started;
  if (typeof gameState.lotteryPhase === 'boolean') payload.lotteryPhase = gameState.lotteryPhase;
  const rRef = await roomRef(code);
  if (rRef) await loaded.api.update(rRef, payload);
}

/**
 * Host starts the online lottery (each player answers one tiebreak question).
 */
export async function beginOnlineLottery(code) {
  const loaded = await getDbAsync();
  if (!loaded || !code) return;

  const rRef = await roomRef(code);
  if (!rRef) return;
  const snap = await loaded.api.get(rRef);
  if (!snap.exists()) {
    throw new Error('الغرفة غير موجودة');
  }

  const room = snap.val();
  const players = { ...(room.players || {}) };
  Object.keys(players).forEach((id) => {
    const { startScore, ...rest } = players[id];
    players[id] = rest;
  });

  await loaded.api.update(rRef, {
    lotteryPhase: true,
    lotteryTurnIndex: 0,
    started: false,
    currentTurn: 0,
    players,
    boardState: defaultBoardState(),
    stateVersion: Date.now(),
  });
}

/**
 * Save one player's lottery score during the tiebreak phase.
 */
export async function syncPlayerLotteryScore(code, playerId, score) {
  const loaded = await getDbAsync();
  if (!loaded || !code || !playerId) return;

  const rRef = await roomRef(code);
  if (!rRef) return;
  const snap = await loaded.api.get(rRef);
  if (!snap.exists()) {
    throw new Error('الغرفة غير موجودة');
  }

  const room = snap.val();
  const players = playersToArray(room.players);
  const currentTurn =
    typeof room.lotteryTurnIndex === 'number' ? room.lotteryTurnIndex : 0;
  const activePlayer = players[currentTurn];
  if (!activePlayer || String(activePlayer.id) !== String(playerId)) {
    throw new Error('ليس دورك في القرعة بعد');
  }

  const nextTurn = currentTurn + 1;

  await loaded.api.update(rRef, {
    [`players/${playerId}/startScore`]: Math.max(0, Number(score) || 0),
    lotteryTurnIndex: nextTurn,
    stateVersion: Date.now(),
  });
}

/**
 * Host starts the online game.
 */
export async function startOnlineGame(code, { currentTurn, level, players }) {
  const loaded = await getDbAsync();
  if (!loaded || !code) return;

  const rRef = await roomRef(code);
  if (!rRef) return;
  await loaded.api.update(rRef, {
    started: true,
    lotteryPhase: false,
    currentTurn: currentTurn ?? 0,
    level: level || 'ashbal',
    stateVersion: Date.now(),
    players: playersToMap(
      (players || []).map((p) => {
        const { startScore, ...rest } = p;
        return { ...rest, position: 1 };
      }),
    ),
    boardState: {
      waitingForMove: true,
      processingMove: false,
      gameOver: false,
      highlightSquare: null,
    },
  });
}

/**
 * Update lobby level (host only, before start).
 */
export async function updateRoomLevel(code, level) {
  const loaded = await getDbAsync();
  if (!loaded || !code) return;
  const rRef = await roomRef(code);
  if (rRef) await loaded.api.update(rRef, { level });
}

/**
 * @param {string} code
 * @param {(room: object|null) => void} callback
 * @returns {() => void} unsubscribe
 */
export function listenToRoom(code, callback) {
  if (!code) {
    callback(null);
    return () => {};
  }

  let unsub = () => {};
  let cancelled = false;

  getDbAsync().then(async (loaded) => {
    if (cancelled) return;
    if (!loaded) {
      callback(null);
      return;
    }
    const rRef = await roomRef(code);
    if (!rRef || cancelled) {
      callback(null);
      return;
    }
    const handler = (snap) => callback(normalizeRoom(snap));
    loaded.api.onValue(rRef, handler);
    unsub = () => loaded.api.off(rRef, 'value', handler);
  }).catch(() => {
    if (!cancelled) callback(null);
  });

  return () => {
    cancelled = true;
    unsub();
  };
}

/**
 * Remove player from room; delete room if host leaves.
 */
export async function leaveRoom(code, playerId) {
  const loaded = await getDbAsync();
  if (!loaded || !code) return;

  const rRef = await roomRef(code);
  if (!rRef) return;
  const snap = await loaded.api.get(rRef);
  if (!snap.exists()) return;

  const room = snap.val();
  if (room.hostId === playerId) {
    await loaded.api.remove(rRef);
    return;
  }

  const players = { ...(room.players || {}) };
  delete players[playerId];
  await loaded.api.update(rRef, { players });
}

/**
 * @param {Record<string, object>|object[]|null|undefined} raw
 * @returns {Array<{id:string,playerId:string,playerName:string,text:string,timestamp:number,type:string}>}
 */
export function normalizeMessages(raw) {
  if (!raw) return [];
  const list = Array.isArray(raw) ? raw : Object.values(raw);
  return list
    .filter((m) => m && typeof m.text === 'string')
    .map((m) => ({
      id: m.id || `m_${m.timestamp || 0}`,
      playerId: m.playerId || '',
      playerName: m.playerName || 'لاعب',
      text: m.text,
      timestamp: typeof m.timestamp === 'number' ? m.timestamp : 0,
      type: m.type === 'preset' ? 'preset' : 'chat',
    }))
    .sort((a, b) => a.timestamp - b.timestamp);
}

/**
 * Keep only the most recent messages.
 * @param {Array<object>} messages
 * @returns {Array<object>}
 */
export function pruneMessages(messages) {
  const sorted = normalizeMessages(messages);
  if (sorted.length <= MAX_MESSAGES) return sorted;
  return sorted.slice(-MAX_MESSAGES);
}

function collapseWhitespace(text) {
  return (text || '').replace(/\s+/g, ' ').trim();
}

function filterProfanity(text) {
  let result = text;
  BAD_WORDS.forEach((word) => {
    if (!word) return;
    const re = new RegExp(word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    result = result.replace(re, '***');
  });
  return result;
}

/**
 * Sanitize free-form chat text.
 * @param {string} text
 * @returns {string}
 */
export function sanitizeChatText(text) {
  let cleaned = collapseWhitespace(text);
  if (!cleaned) return '';
  if (cleaned.length > MAX_MESSAGE_LENGTH) {
    cleaned = cleaned.slice(0, MAX_MESSAGE_LENGTH);
  }
  return filterProfanity(cleaned);
}

async function appendMessage(code, playerId, playerName, text, type) {
  const loaded = await getDbAsync();
  if (!loaded || !code) {
    throw new Error('FIREBASE_NOT_CONFIGURED');
  }

  const trimmed = type === 'preset' ? collapseWhitespace(text) : sanitizeChatText(text);
  if (!trimmed) {
    throw new Error('رسالة فارغة');
  }

  const message = {
    id: `m_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    playerId,
    playerName: (playerName || 'لاعب').trim().slice(0, 24) || 'لاعب',
    text: trimmed,
    timestamp: Date.now(),
    type: type === 'preset' ? 'preset' : 'chat',
  };

  const mRef = await messagesRef(code);
  if (!mRef) throw new Error('FIREBASE_NOT_CONFIGURED');
  const snap = await loaded.api.get(mRef);
  const messages = pruneMessages([...normalizeMessages(snap.val()), message]);
  await loaded.api.set(mRef, messages);
  return message;
}

/**
 * Send a preset phrase to the room chat.
 */
export async function sendPresetMessage(code, playerId, playerName, text) {
  const trimmed = collapseWhitespace(text);
  if (!PRESET_MESSAGES.includes(trimmed)) {
    throw new Error('رسالة غير مسموحة');
  }
  return appendMessage(code, playerId, playerName, trimmed, 'preset');
}

/**
 * Send a free-form chat message.
 */
export async function sendChatMessage(code, playerId, playerName, text) {
  return appendMessage(code, playerId, playerName, text, 'chat');
}

/**
 * Listen to room chat messages in real time.
 * @param {string} code
 * @param {(messages: Array<object>) => void} callback
 * @returns {() => void} unsubscribe
 */
export function listenToMessages(code, callback) {
  if (!code) {
    callback([]);
    return () => {};
  }

  let unsub = () => {};
  let cancelled = false;

  getDbAsync().then(async (loaded) => {
    if (cancelled) return;
    if (!loaded) {
      callback([]);
      return;
    }
    const mRef = await messagesRef(code);
    if (!mRef || cancelled) {
      callback([]);
      return;
    }
    const handler = (snap) => callback(normalizeMessages(snap.val()));
    loaded.api.onValue(mRef, handler);
    unsub = () => loaded.api.off(mRef, 'value', handler);
  }).catch(() => {
    if (!cancelled) callback([]);
  });

  return () => {
    cancelled = true;
    unsub();
  };
}

export { isFirebaseConfigured, getDb, MAX_MESSAGE_LENGTH };
