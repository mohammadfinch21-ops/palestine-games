import {
  BARRIERS,
  BLUE_ARROWS,
  YELLOW_ARROWS,
  PLAYER_COLORS,
  TRAIN_RULES,
  getCityAtSquare,
} from './board-data.js';
import { MAP_IMAGE, getMapPosition } from './board-path-coords.js';
import {
  drawQuestion,
  pickTiebreakCard,
  beginMainGameSession,
  resetQuestionSession,
  areCardsReady,
  getCardsLoadState,
  getTrainLevel,
  setTrainLevel,
  getTrainLevelInfo,
  getLevelCounts,
  getSessionQuestionStats,
  getLowPoolMessage,
  LOW_POOL_THRESHOLD,
} from './questions.js';
import { showModal, hideModal, showQuestionCardModal, isModalOpen } from './modal.js';
import {
  pickCityQuestion,
  resetCityQuestionSession,
  areCityQuestionsReady,
  loadCityQuestions,
} from './city-questions.js';
import {
  onTrainGameOver,
  onTrainTurnComplete,
  onTrainReset,
  showRewardedAd,
} from './ads/ad-manager.js';
import { isFirebaseConfigured } from './firebase-config.js';
import { bindTap, isNativeApp, resolveAssetUrl } from './native-app.js';
import {
  getPlayerId,
  createRoom,
  joinRoom,
  syncGameState,
  listenToRoom,
  leaveRoom,
  startOnlineGame,
  beginOnlineLottery,
  syncPlayerLotteryScore,
  updateRoomLevel,
  sendPresetMessage,
  sendChatMessage,
  listenToMessages,
  PRESET_MESSAGES,
  MAX_MESSAGE_LENGTH,
} from './online-room.js';

const BOARD_SIZE = 100;
const MIN_PLAYERS = 2;
const MAX_PLAYERS = 6;

export function initTrainGame() {
  const state = {
    players: [
      { id: 1, name: 'اللاعب 1', position: 1, color: PLAYER_COLORS[0] },
      { id: 2, name: 'اللاعب 2', position: 1, color: PLAYER_COLORS[1] },
    ],
    currentIndex: 0,
    started: false,
    waitingForMove: false,
    processingMove: false,
    gameOver: false,
    highlightSquare: null,
    cityQuestionPending: null,
  };

  let cityModalRetryTimer = null;
  let squareWatchdogTimer = null;
  const SQUARE_WATCHDOG_MS = 5000;

  function clearSquareWatchdog() {
    if (squareWatchdogTimer) {
      clearTimeout(squareWatchdogTimer);
      squareWatchdogTimer = null;
    }
  }

  function armSquareWatchdog() {
    clearSquareWatchdog();
    squareWatchdogTimer = setTimeout(() => {
      squareWatchdogTimer = null;
      if (!state.started || state.gameOver || lotteryActive) return;
      if (isModalOpen()) return;
      if (state.waitingForMove) return;
      console.warn('train-game: square watchdog — recovering stuck state');
      recoverFromStuckSquare('watchdog');
    }, SQUARE_WATCHDOG_MS);
  }

  function recoverFromStuckSquare(reason = 'unknown') {
    clearSquareWatchdog();
    state.processingMove = false;
    if (
      state.cityQuestionPending &&
      shouldAnswerCityQuestion() &&
      !isModalOpen() &&
      reason !== 'city-modal-retry'
    ) {
      scheduleCityQuestionModal(0);
      armSquareWatchdog();
      return;
    }
    clearCityQuestionPending();
    if (!state.gameOver && state.started) {
      state.waitingForMove = true;
      updateUI('↻ استُعيد الدور — اسحب سؤالاً.');
      pushOnlineState();
    }
  }

  function beginSquareProcessing() {
    state.waitingForMove = false;
    state.processingMove = true;
    armSquareWatchdog();
    updateUI();
    pushOnlineState();
  }

  function finishSquareProcessing({ nextTurn: advance = false, resumeTurn = false } = {}) {
    clearSquareWatchdog();
    if (advance) {
      nextTurn();
      return;
    }
    state.processingMove = false;
    if (resumeTurn) state.waitingForMove = true;
    updateUI();
    pushOnlineState();
  }

  const online = {
    mode: false,
    myId: getPlayerId(),
    hostId: null,
    roomCode: null,
    isHost: false,
    inRoom: false,
    applyingRemote: false,
    unsubscribe: null,
    chatUnsubscribe: null,
    chatCollapsed: false,
    seenMessageIds: new Set(),
    chatInitialSyncDone: false,
    chatInitialized: false,
    lotteryPhase: false,
    lotteryPromptOpen: false,
    resolvingLottery: false,
    lotteryTieModalOpen: false,
    lotteryPromptRetryTimer: null,
    lotteryTurnIndex: 0,
    localStateVersion: 0,
    lastAppliedStateVersion: 0,
  };

  let lotteryActive = false;

  const DEFAULT_LOCAL_PLAYERS = () => [
    { id: 1, name: 'اللاعب 1', position: 1, color: PLAYER_COLORS[0] },
    { id: 2, name: 'اللاعب 2', position: 1, color: PLAYER_COLORS[1] },
  ];

  const boardEl = document.getElementById('board');
  const playersList = document.getElementById('players-list');
  const currentTurnDisplay = document.getElementById('current-turn-display');
  const currentPlayerDot = document.getElementById('current-player-dot');
  const currentPlayerName = document.getElementById('current-player-name');
  const gameStatus = document.getElementById('game-status');
  const startBtn = document.getElementById('start-game-btn');
  const drawBtn = document.getElementById('draw-question-btn');
  const addPlayerBtn = document.getElementById('add-player-btn');
  const playerCountPicker = document.getElementById('player-count-picker');
  const rulesBtn = document.getElementById('train-rules-btn');
  const rewardHintBtn = document.getElementById('train-reward-hint-btn');
  const levelSelectorEl = document.getElementById('train-level-selector');
  const poolWarningEl = document.getElementById('train-pool-warning');

  const modeLocalBtn = document.getElementById('mode-local-btn');
  const modeOnlineBtn = document.getElementById('mode-online-btn');
  const onlinePanel = document.getElementById('online-panel');
  const localPlayersPanel = document.getElementById('local-players-panel');
  const firebaseSetupMsg = document.getElementById('firebase-setup-msg');
  const onlineAuth = document.getElementById('online-auth');
  const onlineLobby = document.getElementById('online-lobby');
  const onlineUsernameInput = document.getElementById('online-username');
  const onlineCreateBtn = document.getElementById('online-create-btn');
  const onlineJoinBtn = document.getElementById('online-join-btn');
  const onlineRoomCodeInput = document.getElementById('online-room-code-input');
  const onlineRoomCodeDisplay = document.getElementById('online-room-code-display');
  const onlineCopyCodeBtn = document.getElementById('online-copy-code-btn');
  const onlineRoomStatus = document.getElementById('online-room-status');
  const onlineLobbyPlayers = document.getElementById('online-lobby-players');
  const onlineStartBtn = document.getElementById('online-start-btn');
  const onlineLeaveBtn = document.getElementById('online-leave-btn');

  const chatPanel = document.getElementById('online-chat-panel');
  const chatToggle = document.getElementById('online-chat-toggle');
  const chatBody = document.getElementById('online-chat-body');
  const chatToasts = document.getElementById('online-chat-toasts');
  const chatMessagesEl = document.getElementById('online-chat-messages');
  const chatPresetsEl = document.getElementById('online-chat-presets');
  const chatInput = document.getElementById('online-chat-input');
  const chatSendBtn = document.getElementById('online-chat-send-btn');

  const trainSidebar = document.getElementById('train-sidebar-sheet');
  const trainSidebarBackdrop = document.getElementById('train-sidebar-backdrop');
  const trainSidebarToggle = document.getElementById('train-sidebar-toggle');
  const mobileLevelWrap = document.getElementById('train-mobile-level-wrap');
  const levelPanel = document.querySelector('.panel-level');
  const mobileStartBtn = document.getElementById('train-mobile-start-btn');
  const mobileDrawBtn = document.getElementById('train-mobile-draw-btn');
  const mobileMenuBtn = document.getElementById('train-mobile-menu-btn');
  const mobileTurnDot = document.getElementById('train-mobile-turn-dot');
  const mobileTurnLabel = document.getElementById('train-mobile-turn-label');
  const mobileLayoutMq = window.matchMedia('(max-width: 900px)');

  function isMobileTrainLayout() {
    return mobileLayoutMq.matches || document.documentElement.classList.contains('native-app');
  }

  function setTrainSidebarOpen(open) {
    trainSidebar?.classList.toggle('is-open', open);
    trainSidebarBackdrop?.classList.toggle('is-visible', open);
    trainSidebarBackdrop?.setAttribute('aria-hidden', open ? 'false' : 'true');
    trainSidebarToggle?.setAttribute('aria-expanded', open ? 'true' : 'false');
    mobileMenuBtn?.setAttribute('aria-expanded', open ? 'true' : 'false');
    document.body.classList.toggle('train-sidebar-open', open);
  }

  function closeTrainSidebar() {
    setTrainSidebarOpen(false);
  }

  function toggleTrainSidebar() {
    setTrainSidebarOpen(!trainSidebar?.classList.contains('is-open'));
  }

  function relocateLevelSelector(mobile) {
    if (!levelSelectorEl || !levelPanel || !mobileLevelWrap) return;
    if (mobile) {
      mobileLevelWrap.appendChild(levelSelectorEl);
    } else if (levelSelectorEl.parentElement !== levelPanel) {
      const anchor = poolWarningEl || null;
      levelPanel.insertBefore(levelSelectorEl, anchor);
    }
  }

  function applyMobileTrainLayout() {
    const mobile = isMobileTrainLayout();
    document.body.classList.toggle('train-mobile-layout', mobile);
    relocateLevelSelector(mobile);
    if (!mobile) closeTrainSidebar();
  }

  function initMobileTrainBar() {
    bindTap(trainSidebarToggle, toggleTrainSidebar);
    bindTap(mobileMenuBtn, toggleTrainSidebar);
    bindTap(trainSidebarBackdrop, closeTrainSidebar);

    const handleMobileStart = () => {
      if (startBtn?.disabled) {
        if (!areCardsReady()) {
          showModal({
            title: 'انتظر',
            bodyHtml: '<p>بطاقات الأسئلة ما زالت تُحمَّل. انتظر ثوانٍ ثم حاول مجدداً.</p>',
          });
        }
        return;
      }
      startGame();
    };
    if (mobileStartBtn) {
      bindTap(mobileStartBtn, handleMobileStart, 'train-mobile-start');
    }

    bindTap(mobileDrawBtn, () => handleDrawAction());

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && trainSidebar?.classList.contains('is-open')) {
        closeTrainSidebar();
      }
    });

    mobileLayoutMq.addEventListener('change', () => {
      applyMobileTrainLayout();
      renderBoard();
    });
    applyMobileTrainLayout();

    let resizeBoardTimer;
    window.addEventListener('resize', () => {
      if (!document.body.classList.contains('train-mobile-layout')) return;
      clearTimeout(resizeBoardTimer);
      resizeBoardTimer = setTimeout(() => renderBoard(), 120);
    });
  }

  function syncMobileBar() {
    const mobileBarActive =
      document.body.classList.contains('train-mobile-layout')
      || document.documentElement.classList.contains('native-app');
    if (!mobileBarActive) return;
    if (mobileStartBtn) {
      mobileStartBtn.disabled = false;
      mobileStartBtn.hidden = startBtn.hidden;
    }
    if (mobileDrawBtn) {
      mobileDrawBtn.disabled = drawBtn.disabled;
      mobileDrawBtn.classList.toggle('btn-pulse-ready', drawBtn.classList.contains('btn-pulse-ready'));
      mobileDrawBtn.textContent = '🃏 سؤال';
    }
    if (mobileTurnLabel) {
      mobileTurnLabel.textContent = currentPlayerName?.textContent || '—';
      mobileTurnLabel.style.color = currentPlayerName?.style.color || '';
      mobileTurnLabel.classList.toggle('is-waiting', currentPlayerName?.classList.contains('is-waiting') ?? false);
    }
    if (mobileTurnDot) {
      mobileTurnDot.hidden = currentPlayerDot?.hidden ?? true;
      mobileTurnDot.innerHTML = currentPlayerDot?.innerHTML || '';
    }
  }

  function getPlayerColor(playerId) {
    const player = state.players.find((p) => p.id === playerId);
    return player?.color || 'var(--green-dark)';
  }

  function formatChatTime(timestamp) {
    if (!timestamp) return '';
    const d = new Date(timestamp);
    return d.toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit' });
  }

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function updateChatVisibility() {
    const show = online.mode && online.inRoom;
    chatPanel?.classList.toggle('hidden', !show);
    if (!show) {
      chatPanel?.classList.remove('is-collapsed');
      chatToggle?.setAttribute('aria-expanded', 'true');
    }
  }

  function showChatToast(message) {
    if (!chatToasts || !message) return;
    const isMe = message.playerId === online.myId;
    const toast = document.createElement('div');
    toast.className = `online-chat-toast${isMe ? ' is-me' : ''}`;
    toast.textContent = `${message.playerName}: ${message.text}`;
    chatToasts.appendChild(toast);
    setTimeout(() => toast.remove(), 3200);
  }

  function renderChatMessages(messages) {
    if (!chatMessagesEl) return;

    chatMessagesEl.innerHTML = messages
      .map((msg) => {
        const isMe = msg.playerId === online.myId;
        const color = getPlayerColor(msg.playerId);
        return `
        <div class="online-chat-msg${isMe ? ' is-me' : ''}${msg.type === 'preset' ? ' is-preset' : ''}" data-id="${escapeHtml(msg.id)}">
          <span class="online-chat-msg-name" style="color:${color}">${escapeHtml(msg.playerName)}</span>
          <div class="online-chat-msg-bubble">${escapeHtml(msg.text)}</div>
          <span class="online-chat-msg-time">${formatChatTime(msg.timestamp)}</span>
        </div>`;
      })
      .join('');

    chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
  }

  function handleIncomingMessages(messages) {
    const list = messages || [];
    renderChatMessages(list);

    list.forEach((msg) => {
      if (!msg?.id || online.seenMessageIds.has(msg.id)) return;
      online.seenMessageIds.add(msg.id);
      if (online.chatInitialSyncDone && msg.playerId !== online.myId) {
        showChatToast(msg);
      }
    });
    online.chatInitialSyncDone = true;
  }

  function subscribeToChat(code) {
    if (online.chatUnsubscribe) {
      online.chatUnsubscribe();
      online.chatUnsubscribe = null;
    }
    online.seenMessageIds = new Set();
    online.chatInitialSyncDone = false;
    online.chatUnsubscribe = listenToMessages(code, handleIncomingMessages);
  }

  function teardownChat() {
    if (online.chatUnsubscribe) {
      online.chatUnsubscribe();
      online.chatUnsubscribe = null;
    }
    online.seenMessageIds = new Set();
    online.chatInitialSyncDone = false;
    if (chatMessagesEl) chatMessagesEl.innerHTML = '';
    if (chatToasts) chatToasts.innerHTML = '';
    if (chatInput) chatInput.value = '';
    updateChatVisibility();
  }

  function initChatUI() {
    if (online.chatInitialized || !chatPresetsEl) return;
    online.chatInitialized = true;

    chatPresetsEl.innerHTML = PRESET_MESSAGES.map(
      (text) => `<button type="button" class="online-chat-preset-btn" data-preset="${escapeHtml(text)}">${escapeHtml(text)}</button>`,
    ).join('');

    bindTap(chatPresetsEl, async (e) => {
      const btn = e.target.closest('[data-preset]');
      if (!btn || !online.inRoom || !online.roomCode) return;
      const text = btn.dataset.preset;
      btn.disabled = true;
      try {
        await sendPresetMessage(online.roomCode, online.myId, getOnlineUsername(), text);
      } catch (err) {
        console.warn('preset message', err);
      } finally {
        btn.disabled = false;
      }
    });

    bindTap(chatSendBtn, () => sendFreeformChat());
    chatInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        sendFreeformChat();
      }
    });
    if (chatInput) chatInput.maxLength = MAX_MESSAGE_LENGTH;

    bindTap(chatToggle, () => {
      online.chatCollapsed = !online.chatCollapsed;
      chatPanel?.classList.toggle('is-collapsed', online.chatCollapsed);
      chatToggle.setAttribute('aria-expanded', online.chatCollapsed ? 'false' : 'true');
    });
  }

  async function sendFreeformChat() {
    if (!online.inRoom || !online.roomCode || !chatInput) return;
    const text = chatInput.value;
    if (!text.trim()) return;

    chatSendBtn.disabled = true;
    chatInput.disabled = true;
    try {
      await sendChatMessage(online.roomCode, online.myId, getOnlineUsername(), text);
      chatInput.value = '';
    } catch (err) {
      if (err.message === 'رسالة فارغة') return;
      console.warn('chat message', err);
    } finally {
      chatSendBtn.disabled = false;
      chatInput.disabled = false;
      chatInput.focus();
    }
  }

  function getOnlineUsername() {
    const saved = onlineUsernameInput?.value?.trim();
    if (saved) return saved.slice(0, 24);
    try {
      return localStorage.getItem('pal-train-username')?.trim().slice(0, 24) || '';
    } catch {
      return '';
    }
  }

  function saveOnlineUsername(name) {
    try {
      localStorage.setItem('pal-train-username', name);
    } catch {
      /* ignore */
    }
  }

  function syncOnlineIdentity() {
    online.myId = getPlayerId();
  }

  function isHostOf(room) {
    return String(room?.hostId) === String(online.myId);
  }

  function isMyTurn() {
    if (!online.mode || !online.inRoom) return true;
    const current = getCurrentPlayer();
    return String(current?.id) === String(online.myId);
  }

  function serializeOnlineState() {
    return {
      players: state.players.map((p) => ({
        id: p.id,
        name: p.name,
        color: p.color,
        position: p.position,
        ...(typeof p.startScore === 'number' ? { startScore: p.startScore } : {}),
      })),
      currentTurn: state.currentIndex,
      started: state.started,
      lotteryPhase: online.lotteryPhase,
      level: getTrainLevel(),
      boardState: {
        waitingForMove: state.waitingForMove,
        processingMove: state.processingMove,
        gameOver: state.gameOver,
        highlightSquare: state.highlightSquare,
        cityQuestionPending: state.cityQuestionPending,
      },
    };
  }

  function pushOnlineState() {
    if (!online.mode || !online.inRoom || !online.roomCode || online.applyingRemote) return;
    online.localStateVersion = (online.localStateVersion || 0) + 1;
    syncGameState(online.roomCode, {
      ...serializeOnlineState(),
      stateVersion: online.localStateVersion,
    }).catch((err) => {
      console.warn('فشل مزامنة الغرفة', err);
    });
  }

  function clampTurnIndex(turn, playerCount) {
    return Math.min(Math.max(0, turn), Math.max(0, playerCount - 1));
  }

  function getLotteryTurnIndex() {
    const raw = online.lotteryTurnIndex ?? 0;
    return Math.max(0, Math.min(raw, Math.max(0, state.players.length - 1)));
  }

  function getLotteryActivePlayer() {
    return getPlayerByIndex(getLotteryTurnIndex());
  }

  function isMyLotteryTurn() {
    if (!online.mode || !online.inRoom) return true;
    const turnIdx = online.lotteryTurnIndex ?? 0;
    if (turnIdx >= state.players.length) return false;
    const active = getLotteryActivePlayer();
    return Boolean(active && String(active.id) === String(online.myId));
  }

  function getLotteryWaitingLabel() {
    const me = state.players.find((p) => String(p.id) === String(online.myId));
    if (typeof me?.startScore === 'number') {
      return 'انتظر انتهاء القرعة…';
    }
    const active = getLotteryActivePlayer();
    if (active && !isMyLotteryTurn()) {
      return `انتظر دور ${active.name}…`;
    }
    return 'أجب على سؤال القرعة في النافذة';
  }

  function adoptRemoteStateVersion(remoteVersion) {
    if (typeof remoteVersion !== 'number' || remoteVersion <= 0) return;
    online.lastAppliedStateVersion = Math.max(online.lastAppliedStateVersion || 0, remoteVersion);
    online.localStateVersion = Math.max(online.localStateVersion || 0, remoteVersion);
  }

  function hasNewLotteryProgress(room) {
    if (!room?.lotteryPhase || room.started) return false;
    if (
      typeof room.lotteryTurnIndex === 'number' &&
      room.lotteryTurnIndex !== (online.lotteryTurnIndex ?? 0)
    ) {
      return true;
    }
    return room.players.some((rp) => {
      const local = state.players.find((p) => String(p.id) === String(rp.id));
      if (!local) return typeof rp.startScore === 'number';
      if (typeof rp.startScore === 'number' && typeof local.startScore !== 'number') return true;
      if (typeof rp.startScore === 'number' && typeof local.startScore === 'number') {
        return rp.startScore !== local.startScore;
      }
      return typeof local.startScore === 'number' && typeof rp.startScore !== 'number';
    });
  }

  function mergeLotteryPlayerScores(remotePlayers) {
    remotePlayers.forEach((rp) => {
      let local = state.players.find((p) => String(p.id) === String(rp.id));
      if (!local) {
        state.players.push({ ...rp });
        return;
      }
      local.name = rp.name;
      local.color = rp.color;
      local.position = rp.position;
      if (typeof rp.startScore === 'number') local.startScore = rp.startScore;
      else delete local.startScore;
    });
  }

  function clearLotteryPromptRetry() {
    if (online.lotteryPromptRetryTimer) {
      clearTimeout(online.lotteryPromptRetryTimer);
      online.lotteryPromptRetryTimer = null;
    }
  }

  function scheduleLotteryPromptRetry() {
    if (online.lotteryPromptRetryTimer) return;
    online.lotteryPromptRetryTimer = setTimeout(() => {
      online.lotteryPromptRetryTimer = null;
      promptOnlineLotteryIfNeeded();
    }, 400);
  }

  function finalizeLotteryRoomSync(room, hadLotteryScores = false) {
    lotteryActive = true;
    online.lotteryTurnIndex =
      typeof room.lotteryTurnIndex === 'number' ? room.lotteryTurnIndex : 0;
    const hasScores = room.players.some((p) => typeof p.startScore === 'number');
    if (hadLotteryScores && !hasScores) {
      online.lotteryTieModalOpen = false;
      online.lotteryPromptOpen = false;
    }

    const tieInfo = getLotteryTieInfo(room.players);
    if (tieInfo && !online.isHost && !online.lotteryTieModalOpen) {
      online.lotteryTieModalOpen = true;
      const names = tieInfo.names.map((n) => `<strong>${n}</strong>`).join(' و ');
      showModal({
        title: 'تعادل! إعادة القرعة',
        bodyHtml: `<p>تعادل بين ${names} بنتيجة <strong>${tieInfo.best}</strong>.</p><p>انتظر سؤال القرعة الجديد…</p>`,
        actions: [{ label: 'حسناً', className: 'btn-primary' }],
      });
    }

    promptOnlineLotteryIfNeeded();
    tryResolveOnlineLottery(room);
  }

  function promptOnlineLotteryIfNeeded() {
    if (!online.lotteryPhase || state.started || online.lotteryPromptOpen) return;
    const me = state.players.find((p) => String(p.id) === String(online.myId));
    if (!me || typeof me.startScore === 'number') return;
    if (!isMyLotteryTurn()) return;
    if (!areCardsReady()) {
      scheduleLotteryPromptRetry();
      return;
    }
    clearLotteryPromptRetry();

    online.lotteryPromptOpen = true;
    const card = pickTiebreakCard();
    showQuestionCardModal(
      card,
      async (userWasCorrect, steps) => {
        const score = userWasCorrect ? steps : 0;
        me.startScore = score;
        try {
          await syncPlayerLotteryScore(online.roomCode, online.myId, score);
        } catch (err) {
          delete me.startScore;
          showModal({
            title: 'خطأ',
            bodyHtml: `<p>${err.message || 'تعذّر حفظ نتيجة القرعة'}</p>`,
          });
        } finally {
          online.lotteryPromptOpen = false;
          hideModal();
          updateUI();
        }
      },
      { deferClose: true, tiebreak: true, title: `قرعة — ${me.name}` },
    );
  }

  async function finishOnlineStart(winnerIdx, bestScore) {
    hideModal();
    beginMainGameSession();
    lotteryActive = false;
    state.currentIndex = winnerIdx;
    state.started = true;
    state.waitingForMove = true;
    state.processingMove = false;
    state.gameOver = false;
    state.highlightSquare = null;
    state.players.forEach((p) => {
      p.position = 1;
      delete p.startScore;
    });

    await startOnlineGame(online.roomCode, {
      currentTurn: winnerIdx,
      level: getTrainLevel(),
      players: state.players,
    });

    const winner = state.players[winnerIdx];
    if (online.isHost) {
      showModal({
        title: 'انطلقت الرحلة!',
        bodyHtml: `<p>يبدأ <strong>${winner?.name || 'لاعب'}</strong> 🔑 (نتيجة: ${bestScore}).</p><p>الهدف: الوصول للمربع 100 — القدس 🇵🇸</p>`,
        actions: [{ label: 'ابدأ اللعب', className: 'btn-gold' }],
      });
      flashPlayerChip(winnerIdx);
    }
    online.resolvingLottery = false;
    online.lotteryPhase = false;
    online.lotteryTieModalOpen = false;
    renderBoard();
    updateUI();
  }

  function getLotteryTieInfo(players) {
    if (!players?.length || !players.every((p) => typeof p.startScore === 'number')) return null;
    const best = Math.max(...players.map((p) => p.startScore || 0));
    const tied = players
      .map((p, i) => ((p.startScore || 0) === best ? i : -1))
      .filter((i) => i >= 0);
    if (tied.length <= 1) return null;
    return {
      best,
      tied,
      names: tied.map((i) => players[i].name),
    };
  }

  async function redoOnlineLottery(tieInfo) {
    const names = tieInfo.names.map((n) => `<strong>${n}</strong>`).join(' و ');
    showModal({
      title: 'تعادل! إعادة القرعة',
      bodyHtml: `<p>تعادل بين ${names} بنتيجة <strong>${tieInfo.best}</strong>.</p><p>يُعاد سؤال لجميع اللاعبين حتى يظهر فائز واحد.</p>`,
    });
    try {
      await beginOnlineLottery(online.roomCode);
    } catch (err) {
      showModal({
        title: 'خطأ',
        bodyHtml: `<p>${err.message || 'تعذّر إعادة القرعة'}</p>`,
      });
    } finally {
      online.lotteryTieModalOpen = false;
    }
  }

  async function tryResolveOnlineLottery(room) {
    if (!online.isHost || online.resolvingLottery || !room.lotteryPhase || room.started) return;
    const players = room.players;
    if (players.length < MIN_PLAYERS) return;
    if (!players.every((p) => typeof p.startScore === 'number')) return;

    const tieInfo = getLotteryTieInfo(players);
    if (tieInfo) {
      if (online.lotteryTieModalOpen) return;
      online.lotteryTieModalOpen = true;
      await redoOnlineLottery(tieInfo);
      return;
    }

    online.resolvingLottery = true;
    try {
      const best = Math.max(...players.map((p) => p.startScore || 0));
      const tied = players
        .map((p, i) => ((p.startScore || 0) === best ? i : -1))
        .filter((i) => i >= 0);
      await finishOnlineStart(tied[0], best);
    } catch (err) {
      online.resolvingLottery = false;
      showModal({
        title: 'خطأ',
        bodyHtml: `<p>${err.message || 'تعذّر بدء اللعبة'}</p>`,
      });
    }
  }

  function applyRemoteRoom(room) {
    if (!room || !online.mode) return;

    const remoteVersion = room.stateVersion ?? 0;
    const versionStale = remoteVersion > 0 && remoteVersion < (online.lastAppliedStateVersion || 0);
    const inLotteryRemote = room.lotteryPhase && !room.started;
    const lotteryProgress = inLotteryRemote && hasNewLotteryProgress(room);

    if (versionStale && !lotteryProgress) return;

    if (versionStale && lotteryProgress) {
      online.lotteryPhase = true;
      online.lotteryTurnIndex =
        typeof room.lotteryTurnIndex === 'number' ? room.lotteryTurnIndex : 0;
      mergeLotteryPlayerScores(room.players);
      lotteryActive = true;
      renderOnlineLobby({
        ...room,
        players: state.players,
      });
      updateUI();
      finalizeLotteryRoomSync({ ...room, players: state.players });
      return;
    }

    const wasStarted = state.started;
    const hadLotteryScores = state.players.some((p) => typeof p.startScore === 'number');
    online.applyingRemote = true;
    syncOnlineIdentity();
    online.isHost = isHostOf(room);
    online.hostId = room.hostId;
    online.lotteryPhase = !!room.lotteryPhase;
    online.lotteryTurnIndex =
      typeof room.lotteryTurnIndex === 'number' ? room.lotteryTurnIndex : 0;

    const bs = room.boardState || {};
    const myId = String(online.myId);
    const actingPlayer = state.players[state.currentIndex];
    const iAmCurrentActor = String(actingPlayer?.id) === myId;
    const iAmActing =
      iAmCurrentActor &&
      (state.processingMove ||
        state.cityQuestionPending ||
        (!state.waitingForMove && state.started && !state.gameOver && !room.lotteryPhase));
    const localCityPending = state.cityQuestionPending;
    const iAmCityActor =
      localCityPending &&
      String(getPlayerByIndex(localCityPending.playerIndex)?.id) === myId;
    const hostFinishingLottery = online.resolvingLottery && online.isHost;
    const inLottery = room.lotteryPhase && !room.started;

    if (inLottery) {
      state.players = room.players.map((p) => ({ ...p }));
      state.currentIndex = clampTurnIndex(room.currentTurn, state.players.length);
      state.waitingForMove = false;
      state.processingMove = false;
      state.highlightSquare = null;
      state.gameOver = false;
      if (!hostFinishingLottery) {
        state.started = false;
      }
      adoptRemoteStateVersion(remoteVersion);
    } else if (!iAmActing) {
      state.players = room.players.map((p) => ({ ...p }));
      if (iAmCityActor && localCityPending) {
        state.waitingForMove = false;
        state.processingMove = false;
        state.cityQuestionPending = localCityPending;
      } else {
        state.waitingForMove = !!bs.waitingForMove;
        state.processingMove = !!bs.processingMove;
        state.cityQuestionPending = bs.cityQuestionPending ?? null;
      }
      state.highlightSquare = bs.highlightSquare ?? null;
      state.currentIndex = clampTurnIndex(room.currentTurn, state.players.length);
      state.gameOver = !!bs.gameOver;
      if (!hostFinishingLottery) {
        state.started = !!room.started;
      }
      adoptRemoteStateVersion(remoteVersion);
    } else {
      state.currentIndex = clampTurnIndex(room.currentTurn, state.players.length);
    }

    if (room.started) {
      lotteryActive = false;
      online.lotteryPhase = false;
    }

    if (room.level && room.level !== getTrainLevel()) {
      setTrainLevel(room.level);
    }

    renderOnlineLobby(room);
    online.applyingRemote = false;
    updateUI();

    if (state.cityQuestionPending && shouldAnswerCityQuestion() && !isModalOpen()) {
      scheduleCityQuestionModal();
    }

    if (inLottery) {
      lotteryActive = true;
      finalizeLotteryRoomSync(room, hadLotteryScores);
    }

    if (!wasStarted && state.started && !online.isHost) {
      beginMainGameSession();
      lotteryActive = false;
      const starter = state.players[state.currentIndex];
      showModal({
        title: 'انطلقت الرحلة!',
        bodyHtml: `<p>بدأ المضيف اللعب!</p><p>يبدأ <strong>${starter?.name || 'لاعب'}</strong> 🔑</p>`,
        actions: [{ label: 'ابدأ اللعب', className: 'btn-gold' }],
      });
      flashPlayerChip(state.currentIndex);
    }
  }

  function renderOnlineLobby(room) {
    if (!onlineLobbyPlayers || !room) return;

    onlineRoomCodeDisplay.textContent = room.code || '------';
    const hostLabel = online.isHost
      ? 'أنت المضيف'
      : `المضيف: ${room.players.find((p) => String(p.id) === String(room.hostId))?.name || '—'}`;

    if (room.lotteryPhase && !room.started) {
      const answered = room.players.filter((p) => typeof p.startScore === 'number').length;
      const me = room.players.find((p) => String(p.id) === String(online.myId));
      const activeIdx =
        typeof room.lotteryTurnIndex === 'number'
          ? Math.max(0, Math.min(room.lotteryTurnIndex, room.players.length - 1))
          : getLotteryTurnIndex();
      const active = room.players[activeIdx] || room.players[0];
      if (online.isHost) {
        onlineRoomStatus.textContent = `${hostLabel} — جاري القرعة (${answered}/${room.players.length})`;
      } else if (typeof me?.startScore === 'number') {
        onlineRoomStatus.textContent = `${hostLabel} — انتظر انتهاء القرعة…`;
      } else if (active && String(active.id) !== String(online.myId)) {
        onlineRoomStatus.textContent = `${hostLabel} — انتظر دور ${active.name}…`;
      } else {
        onlineRoomStatus.textContent = `${hostLabel} — أجب على سؤال القرعة في النافذة`;
      }
      onlineLobbyPlayers.innerHTML = room.players
        .map(
          (p) => `
        <li class="${String(p.id) === String(online.myId) ? 'is-me' : ''}${String(p.id) === String(room.hostId) ? ' is-host' : ''}">
          <span class="player-key" style="--key-color:${p.color}">🔑</span>
          <span>${p.name}${typeof p.startScore === 'number' ? ` ✓ (${p.startScore})` : ''}</span>
        </li>`,
        )
        .join('');
      if (onlineStartBtn) onlineStartBtn.hidden = true;
      return;
    }

    if (!room.started) {
      onlineRoomStatus.textContent = online.isHost
        ? `${hostLabel} — ${room.players.length} لاعب/لاعبين في الانتظار`
        : `${hostLabel} — ${room.players.length} لاعب/لاعبين — انتظر بدء المضيف…`;
      onlineLobbyPlayers.innerHTML = room.players
        .map(
          (p) => `
        <li class="${String(p.id) === String(online.myId) ? 'is-me' : ''}${String(p.id) === String(room.hostId) ? ' is-host' : ''}">
          <span class="player-key" style="--key-color:${p.color}">🔑</span>
          <span>${p.name}${String(p.id) === String(online.myId) ? ' (أنت)' : ''}</span>
        </li>`,
        )
        .join('');

      if (onlineStartBtn) {
        if (online.isHost) {
          const canStart = room.players.length >= MIN_PLAYERS;
          onlineStartBtn.hidden = !canStart;
          onlineStartBtn.disabled = !canStart;
        } else {
          onlineStartBtn.hidden = true;
        }
      }
    } else {
      onlineRoomStatus.textContent = `${hostLabel} — اللعبة جارية`;
      onlineLobbyPlayers.innerHTML = room.players
        .map(
          (p, i) => `
        <li class="${String(p.id) === String(online.myId) ? 'is-me' : ''}${i === room.currentTurn ? ' active' : ''}">
          <span class="player-key" style="--key-color:${p.color}">🔑</span>
          <span>${p.name}</span>
          <span class="player-pos">م${p.position}</span>
        </li>`,
        )
        .join('');
      if (onlineStartBtn) onlineStartBtn.hidden = true;
    }

    const me = room.players.find((p) => String(p.id) === String(online.myId));
    if (me && onlineUsernameInput && !onlineUsernameInput.value.trim()) {
      onlineUsernameInput.value = me.name;
    }
  }

  async function teardownOnlineRoom() {
    teardownChat();
    if (online.unsubscribe) {
      online.unsubscribe();
      online.unsubscribe = null;
    }
    if (online.roomCode) {
      try {
        await leaveRoom(online.roomCode, online.myId);
      } catch (err) {
        console.warn('leaveRoom', err);
      }
    }
    online.roomCode = null;
    online.inRoom = false;
    online.isHost = false;
    online.hostId = null;
    online.lotteryPhase = false;
    online.lotteryPromptOpen = false;
    online.resolvingLottery = false;
    online.lotteryTieModalOpen = false;
    clearLotteryPromptRetry();
    online.lotteryTurnIndex = 0;
    online.localStateVersion = 0;
    online.lastAppliedStateVersion = 0;
    onlineAuth?.classList.remove('hidden');
    onlineLobby?.classList.add('hidden');
    updateChatVisibility();
  }

  function setPlayMode(isOnline) {
    if (isOnline === online.mode) return;

    if (online.inRoom) {
      teardownOnlineRoom();
    }

    online.mode = isOnline;
    modeLocalBtn?.classList.toggle('is-active', !isOnline);
    modeOnlineBtn?.classList.toggle('is-active', isOnline);
    onlinePanel?.classList.toggle('hidden', !isOnline);
    localPlayersPanel?.classList.toggle('hidden', isOnline);
    addPlayerBtn?.classList.toggle('hidden', isOnline);

    if (isOnline) {
      const configured = isFirebaseConfigured();
      firebaseSetupMsg?.classList.toggle('hidden', configured);
      onlineCreateBtn.disabled = !configured;
      onlineJoinBtn.disabled = !configured;
      if (onlineUsernameInput) {
        const saved = getOnlineUsername();
        if (saved) onlineUsernameInput.value = saved;
      }
      resetGame();
      state.players = [];
      initChatUI();
      updateUI();
    } else {
      resetGame();
      state.players = DEFAULT_LOCAL_PLAYERS();
      updateChatVisibility();
      updateUI();
    }
  }

  async function handleCreateRoom() {
    const name = getOnlineUsername();
    if (!name) {
      showModal({ title: 'اسم مطلوب', bodyHtml: '<p>أدخل اسمك قبل إنشاء غرفة.</p>' });
      return;
    }
    if (!isFirebaseConfigured()) {
      showModal({
        title: 'Firebase غير مُعدّ',
        bodyHtml: '<p>راجع ملف <code dir="ltr">ONLINE_SETUP.md</code> لإعداد Firebase ثم أضف المفاتيح في <code dir="ltr">js/firebase-config.js</code></p>',
      });
      return;
    }

    saveOnlineUsername(name);
    onlineCreateBtn.disabled = true;
    try {
      const level = getTrainLevel();
      const { code, hostId, player } = await createRoom(name, level);
      syncOnlineIdentity();
      online.roomCode = code;
      online.inRoom = true;
      online.isHost = true;
      online.hostId = hostId;
      onlineAuth?.classList.add('hidden');
      onlineLobby?.classList.remove('hidden');
      if (onlineRoomCodeInput) onlineRoomCodeInput.value = code;

      initChatUI();
      subscribeToChat(code);
      updateChatVisibility();

      applyRemoteRoom({
        code,
        hostId,
        players: [{ id: player.id, name: player.name, color: player.color, position: 1, order: 0 }],
        currentTurn: 0,
        started: false,
        lotteryPhase: false,
        level,
        boardState: {},
      });

      online.unsubscribe = listenToRoom(code, (room) => {
        if (!room) {
          showModal({
            title: 'انتهت الغرفة',
            bodyHtml: '<p>أغلق المضيف الغرفة أو انقطع الاتصال.</p>',
            actions: [{ label: 'حسناً', className: 'btn-primary', onClick: () => setPlayMode(false) }],
          });
          teardownOnlineRoom();
          setPlayMode(false);
          return;
        }
        applyRemoteRoom(room);
      });
    } catch (err) {
      if (err.message === 'FIREBASE_NOT_CONFIGURED') {
        showModal({
          title: 'Firebase غير مُعدّ',
          bodyHtml: '<p>أضف مفاتيح Firebase في <code dir="ltr">js/firebase-config.js</code></p>',
        });
      } else {
        showModal({ title: 'خطأ', bodyHtml: `<p>${err.message || 'تعذّر إنشاء الغرفة'}</p>` });
      }
    } finally {
      onlineCreateBtn.disabled = !isFirebaseConfigured();
    }
  }

  async function handleJoinRoom() {
    const name = getOnlineUsername();
    const code = (onlineRoomCodeInput?.value || '').trim().toUpperCase();
    if (!name) {
      showModal({ title: 'اسم مطلوب', bodyHtml: '<p>أدخل اسمك قبل الانضمام.</p>' });
      return;
    }
    if (code.length !== 6) {
      showModal({ title: 'رمز غير صالح', bodyHtml: '<p>أدخل رمز الغرفة المكوّن من 6 أحرف.</p>' });
      return;
    }

    saveOnlineUsername(name);
    onlineJoinBtn.disabled = true;
    try {
      const { code: joinedCode, room } = await joinRoom(code, name);
      syncOnlineIdentity();
      online.roomCode = joinedCode;
      online.inRoom = true;
      online.isHost = isHostOf(room);
      online.hostId = room.hostId;
      onlineAuth?.classList.add('hidden');
      onlineLobby?.classList.remove('hidden');

      initChatUI();
      subscribeToChat(joinedCode);
      updateChatVisibility();

      applyRemoteRoom(room);

      online.unsubscribe = listenToRoom(joinedCode, (room) => {
        if (!room) {
          showModal({
            title: 'انتهت الغرفة',
            bodyHtml: '<p>أغلقت الغرفة.</p>',
            actions: [{ label: 'حسناً', className: 'btn-primary', onClick: () => setPlayMode(false) }],
          });
          teardownOnlineRoom();
          setPlayMode(false);
          return;
        }
        applyRemoteRoom(room);
      });
    } catch (err) {
      if (err.message === 'FIREBASE_NOT_CONFIGURED') {
        showModal({
          title: 'Firebase غير مُعدّ',
          bodyHtml: '<p>أضف مفاتيح Firebase في <code dir="ltr">js/firebase-config.js</code></p>',
        });
      } else {
        showModal({ title: 'خطأ', bodyHtml: `<p>${err.message || 'تعذّر الانضمام'}</p>` });
      }
    } finally {
      onlineJoinBtn.disabled = !isFirebaseConfigured();
    }
  }

  async function handleOnlineStart() {
    if (!online.isHost || !online.roomCode || state.started || online.lotteryPhase) return;
    if (state.players.length < MIN_PLAYERS) {
      showModal({
        title: 'لاعبون غير كافين',
        bodyHtml: `<p>انتظر ${MIN_PLAYERS} لاعبين على الأقل.</p>`,
      });
      return;
    }
    if (!areCardsReady()) {
      showModal({
        title: 'انتظر',
        bodyHtml: '<p>بطاقات الأسئلة ما زالت تُحمَّل.</p>',
      });
      return;
    }

    if (onlineStartBtn) onlineStartBtn.disabled = true;
    try {
      resetQuestionSession();
      await beginOnlineLottery(online.roomCode);
      online.lotteryPhase = true;
      lotteryActive = true;
      online.lotteryTurnIndex = 0;
      hideModal();
      promptOnlineLotteryIfNeeded();
      if (!online.lotteryPromptOpen && isMyLotteryTurn()) {
        showModal({
          title: 'تحديد من يبدأ',
          bodyHtml: `<p>كل لاعب يجيب سؤالاً بالترتيب من مرحلة <strong>${getTrainLevelInfo().nameArabic}</strong>. من يحصل على أعلى نتيجة يبدأ.</p>`,
          actions: [
            {
              label: 'ابدأ سؤالي',
              className: 'btn-gold',
              onClick: () => promptOnlineLotteryIfNeeded(),
            },
          ],
        });
      } else if (!online.lotteryPromptOpen) {
        showModal({
          title: 'تحديد من يبدأ',
          bodyHtml: `<p>كل لاعب يجيب سؤالاً بالترتيب من مرحلة <strong>${getTrainLevelInfo().nameArabic}</strong>.</p><p>انتظر دورك — يبدأ <strong>${getLotteryActivePlayer()?.name || 'اللاعب الأول'}</strong>.</p>`,
          actions: [{ label: 'حسناً', className: 'btn-primary' }],
        });
      }
    } catch (err) {
      showModal({ title: 'خطأ', bodyHtml: `<p>${err.message || 'تعذّر بدء القرعة'}</p>` });
      if (onlineStartBtn) onlineStartBtn.disabled = state.players.length < MIN_PLAYERS;
    }
  }

  bindTap(modeLocalBtn, () => setPlayMode(false));
  bindTap(modeOnlineBtn, () => setPlayMode(true));
  bindTap(onlineCreateBtn, handleCreateRoom);
  bindTap(onlineJoinBtn, handleJoinRoom);
  bindTap(onlineStartBtn, handleOnlineStart);
  bindTap(onlineLeaveBtn, async () => {
    await teardownOnlineRoom();
    onlineAuth?.classList.remove('hidden');
    onlineLobby?.classList.add('hidden');
    state.players = [];
    resetGame();
    updateUI();
  });
  bindTap(onlineCopyCodeBtn, async () => {
    const code = online.roomCode || onlineRoomCodeDisplay?.textContent;
    if (!code || code === '------') return;
    try {
      await navigator.clipboard.writeText(code);
      onlineRoomStatus.textContent = '✓ تم نسخ الرمز — شاركه مع أصدقائك';
    } catch {
      onlineRoomStatus.textContent = `رمز الغرفة: ${code}`;
    }
  });

  bindTap(rulesBtn, () => {
    showModal({ title: 'طريقة اللعب — قطار فلسطين', bodyHtml: TRAIN_RULES });
  });

  bindTap(addPlayerBtn, () => {
    if (!canEditPlayers() || state.players.length >= MAX_PLAYERS) return;
    setPlayerCount(state.players.length + 1);
  });

  bindTap(playerCountPicker, (e) => {
    const btn = e.target.closest('.player-count-btn');
    if (!btn || btn.disabled) return;
    setPlayerCount(Number(btn.dataset.count));
  });

  playersList.addEventListener('input', (e) => {
    const input = e.target.closest('.player-name-input');
    if (!input || input.disabled) return;
    const index = Number(input.dataset.playerIndex);
    if (index < 0 || index >= state.players.length) return;
    state.players[index].name = input.value;
  });

  playersList.addEventListener('change', (e) => {
    const input = e.target.closest('.player-name-input');
    if (!input || input.disabled) return;
    const index = Number(input.dataset.playerIndex);
    if (index < 0 || index >= state.players.length) return;
    state.players[index].name = String(input.value || '').trim();
    input.value = state.players[index].name;
    renderPlayers();
    updateUI();
  });

  bindTap(playersList, (e) => {
    const btn = e.target.closest('.player-remove-btn');
    if (!btn) return;
    const chip = btn.closest('[data-player-index]');
    if (!chip) return;
    removePlayer(Number(chip.dataset.playerIndex));
  });

  bindTap(startBtn, startGame);
  bindTap(drawBtn, () => handleDrawAction());

  bindTap(rewardHintBtn, () => {
    if (!isMyTurn() || !state.started || state.gameOver || !state.waitingForMove || state.processingMove) return;
    showRewardedAd({
      title: '🎬 شاهد إعلاناً — تلميح: +2 خطوات',
      onReward: () => {
        showModal({
          title: '🎁 مكافأة!',
          bodyHtml: '<p>حصلت على <strong>+2 خطوات</strong> إضافية!</p>',
          actions: [{ label: 'تحرك', className: 'btn-gold', onClick: () => movePlayer(2) }],
        });
      },
    });
  });

  function renderLevelSelector() {
    if (!levelSelectorEl) return;
    const counts = getLevelCounts();
    const current = getTrainLevel();
    levelSelectorEl.innerHTML = counts
      .map(
        (lv) => `
      <button type="button"
        class="level-btn level-btn--${lv.color}${lv.id === current ? ' is-active' : ''}${lv.count > 0 && lv.count < LOW_POOL_THRESHOLD ? ' level-btn--low' : ''}"
        data-level="${lv.id}"
        ${lv.count === 0 ? 'disabled' : ''}
        style="--level-hex:${lv.hex}"
        title="${lv.count} سؤال${lv.count > 0 && lv.count < LOW_POOL_THRESHOLD ? ' — مجموعة صغيرة' : ''}">
        <span class="level-btn-dot"></span>
        <span class="level-btn-name">${lv.nameArabic}</span>
        <span class="level-btn-count">${lv.count}</span>
      </button>`,
      )
      .join('');

    levelSelectorEl.querySelectorAll('.level-btn').forEach((btn) => {
      bindTap(btn, () => {
        if (state.started && !state.gameOver) return;
        setTrainLevel(btn.dataset.level);
        if (online.mode && online.inRoom && online.isHost && !state.started && online.roomCode) {
          updateRoomLevel(online.roomCode, btn.dataset.level);
        }
        renderLevelSelector();
        updateUI();
      });
    });
  }

  document.addEventListener('train-level-changed', () => {
    resetCityQuestionSession();
    renderLevelSelector();
  });

  document.addEventListener('train-cards-load-settled', () => {
    renderLevelSelector();
    renderBoard();
    updateUI();
    if (document.getElementById('screen-train')?.classList.contains('active')) {
      onTrainScreenVisible();
    }
  });

  document.addEventListener('native-shell-ready', () => {
    applyMobileTrainLayout();
    loadMapImageOnce();
    renderBoard();
    updateUI();
  }, { once: true });

  initMobileTrainBar();
  renderLevelSelector();
  renderPlayerCountPicker();
  renderPlayers();
  updateUI();
  renderBoard();

  let mapDomReady = Boolean(boardEl?.querySelector('#board-map'));
  let mapImageLoaded = false;

  function ensureMapDom() {
    if (mapDomReady || !boardEl) return;
    const existingMap = boardEl.querySelector('#board-map');
    if (existingMap) {
      mapDomReady = true;
      return;
    }
    boardEl.innerHTML = `
      <div class="board-map" id="board-map">
        <img src="${MAP_IMAGE}" alt="خارطة لعبة قطار فلسطين" class="board-map-img" decoding="async" loading="eager" />
        <div class="board-tokens-layer" aria-hidden="false"></div>
      </div>`;
    mapDomReady = true;
  }

  function loadMapImageOnce() {
    if (!boardEl) return;
    ensureMapDom();
    const mapRoot = boardEl.querySelector('#board-map');
    if (!mapRoot) return;

    let img = mapRoot.querySelector('.board-map-img');
    if (!img) {
      img = document.createElement('img');
      img.alt = 'خارطة لعبة قطار فلسطين';
      img.className = 'board-map-img';
      img.decoding = 'async';
      img.loading = 'eager';
      mapRoot.insertBefore(img, mapRoot.firstChild);
    }

    const resolvedSrc = resolveAssetUrl(MAP_IMAGE);
    if (img.dataset.resolvedSrc !== resolvedSrc) {
      if (!img.dataset.loadBound) {
        img.dataset.loadBound = '1';
        img.addEventListener('load', () => {
          mapImageLoaded = true;
          renderBoard();
        }, { once: true });
        img.addEventListener('error', () => {
          console.error('train-game: failed to load map image', resolvedSrc);
          mapRoot.classList.add('board-map--load-failed');
        }, { once: true });
      }
      img.dataset.resolvedSrc = resolvedSrc;
      img.src = resolvedSrc;
    } else if (img.complete && img.naturalWidth > 0) {
      mapImageLoaded = true;
    }
  }

  function onTrainScreenVisible() {
    loadMapImageOnce();
    const drawTokens = () => renderBoard();
    drawTokens();
    requestAnimationFrame(() => {
      requestAnimationFrame(drawTokens);
    });
    [150, 400, 800].forEach((ms) => setTimeout(drawTokens, ms));
  }

  document.addEventListener('native-screen-change', (e) => {
    if (e.detail?.screen === 'train') onTrainScreenVisible();
  });

  if (document.getElementById('screen-train')?.classList.contains('active')) {
    onTrainScreenVisible();
  } else if (isNativeApp()) {
    loadMapImageOnce();
  }

  function getPlayerByIndex(index) {
    return state.players[index] ?? null;
  }

  function getCurrentPlayer() {
    return getPlayerByIndex(state.currentIndex);
  }

  function getNextPlayerIndex(fromIndex = state.currentIndex) {
    return (fromIndex + 1) % state.players.length;
  }

  function normalizePosition(pos) {
    return Math.max(1, Math.min(BOARD_SIZE, Math.round(Number(pos) || 1)));
  }

  function getPlayerKey(playerOrIndex, active = false, { mapOnly = false } = {}) {
    const idx =
      typeof playerOrIndex === 'number'
        ? playerOrIndex
        : state.players.findIndex((p) => p.id === playerOrIndex.id);
    const color = state.players[idx]?.color || '#888';
    const cls = active ? 'key-token key-token-active' : 'key-token';
    const title = state.players[idx]?.name || '';
    if (mapOnly) {
      return `<span class="${cls} key-token--map" style="--key-color:${color}" title="${title}"><span class="key-token-icon" aria-hidden="true">🔑</span></span>`;
    }
    const num = idx >= 0 ? idx + 1 : '';
    return `<span class="${cls}" style="--key-color:${color}" title="${title}"><span class="key-token-icon" aria-hidden="true">🔑</span><span class="key-token-num">${num}</span></span>`;
  }

  /** Map token % coords to the visible image box (object-fit: contain letterboxing). */
  function getMapLayerMetrics() {
    const mapRoot = boardEl?.querySelector('#board-map');
    const img = mapRoot?.querySelector('.board-map-img');
    if (!mapRoot) return null;
    const cr = mapRoot.getBoundingClientRect();
    if (!cr.width || !cr.height) return null;
    const ir = img?.getBoundingClientRect?.();
    if (!ir || !ir.width || !ir.height) {
      return { offsetX: 0, offsetY: 0, scaleX: 100, scaleY: 100 };
    }
    return {
      offsetX: ((ir.left - cr.left) / cr.width) * 100,
      offsetY: ((ir.top - cr.top) / cr.height) * 100,
      scaleX: (ir.width / cr.width) * 100,
      scaleY: (ir.height / cr.height) * 100,
    };
  }

  function mapCoordToLayerPercent(pos) {
    const m = getMapLayerMetrics();
    if (!m) return { x: pos.x, y: pos.y };
    return {
      x: m.offsetX + (pos.x / 100) * m.scaleX,
      y: m.offsetY + (pos.y / 100) * m.scaleY,
    };
  }

  function getTokenOffsetScale() {
    const mobile =
      document.body.classList.contains('train-mobile-layout')
      || document.documentElement.classList.contains('native-app');
    if (!mobile) return 1;
    const boardMap = boardEl?.querySelector('.board-map');
    if (!boardMap) return 0.55;
    const w = boardMap.getBoundingClientRect().width;
    return Math.min(1, Math.max(0.42, w / 900 * 0.58));
  }

  function offsetForTokenIndex(i, total) {
    const scale = getTokenOffsetScale();
    const spreads = {
      1: [[0, 0]],
      2: [[-5, 0], [5, 0]],
      3: [[-10, -6], [10, -6], [0, 8]],
      4: [[-10, -6], [10, -6], [-10, 8], [10, 8]],
      5: [[-12, -6], [0, -6], [12, -6], [-8, 8], [8, 8]],
      6: [[-12, -6], [0, -6], [12, -6], [-12, 8], [0, 8], [12, 8]],
    };
    const [ox, oy] = (spreads[total] || spreads[1])[i] || [0, 0];
    return [ox * scale, oy * scale];
  }

  function renderTokens() {
    const activeId = state.started && !state.gameOver ? getCurrentPlayer()?.id : null;

    const tokensBySquare = {};
    state.players.forEach((p) => {
      const sq = Math.max(1, Math.min(BOARD_SIZE, Number(p.position) || 1));
      if (!tokensBySquare[sq]) tokensBySquare[sq] = [];
      tokensBySquare[sq].push(p);
    });

    let tokensHtml = '';
    Object.entries(tokensBySquare).forEach(([sq, playersHere]) => {
      const pos = mapCoordToLayerPercent(getMapPosition(Number(sq)));
      const n = Math.min(playersHere.length, 6);
      playersHere.slice(0, 6).forEach((p, i) => {
        const [ox, oy] = offsetForTokenIndex(i, n);
        const isActive = p.id === activeId;
        tokensHtml += `<div class="map-token" data-square="${sq}" data-player-id="${p.id}"
          style="left:calc(${pos.x}% + ${ox}px);top:calc(${pos.y}% + ${oy}px)">
          ${getPlayerKey(p, isActive, { mapOnly: true })}
        </div>`;
      });
    });

    return tokensHtml;
  }

  function renderBoard() {
    if (!boardEl) return;
    ensureMapDom();
    loadMapImageOnce();

    state.players.forEach((p) => {
      p.position = normalizePosition(p.position);
    });

    const hl = state.highlightSquare
      ? mapCoordToLayerPercent(getMapPosition(state.highlightSquare))
      : null;
    const highlightHtml = hl
      ? `<div class="map-highlight" style="left:${hl.x}%;top:${hl.y}%"></div>`
      : '';
    const tokensHtml = renderTokens();

    const mapRoot = boardEl.querySelector('#board-map');
    if (!mapRoot) return;

    let tokensLayer = mapRoot.querySelector('.board-tokens-layer');
    if (!tokensLayer) {
      tokensLayer = document.createElement('div');
      tokensLayer.className = 'board-tokens-layer';
      tokensLayer.setAttribute('aria-hidden', 'false');
      mapRoot.appendChild(tokensLayer);
    }
    tokensLayer.innerHTML = `${highlightHtml}${tokensHtml || buildFallbackTokensHtml()}`;
  }

  function buildFallbackTokensHtml() {
    return state.players
      .slice(0, 6)
      .map((p, i) => {
        const pos = getMapPosition(1);
        const ox = i === 0 ? -6 : 6;
        return `<div class="map-token" data-player-id="${p.id}" style="left:calc(${pos.x}% + ${ox}px);top:${pos.y}%">${getPlayerKey(p, false, { mapOnly: true })}</div>`;
      })
      .join('');
  }

  function canRemovePlayer() {
    if (online.mode) return false;
    if (state.processingMove) return false;
    if (state.players.length <= MIN_PLAYERS) return false;
    return !state.started || state.gameOver || state.players.length > MIN_PLAYERS;
  }

  function removePlayer(index) {
    if (!canRemovePlayer() || index < 0 || index >= state.players.length) return;

    const removed = state.players[index];
    const wasCurrent = index === state.currentIndex;

    state.players.splice(index, 1);

    if (state.currentIndex > index) {
      state.currentIndex -= 1;
    } else if (wasCurrent) {
      state.currentIndex = Math.min(state.currentIndex, state.players.length - 1);
    }

    renderPlayerCountPicker();
    renderPlayers();
    renderBoard();

    if (wasCurrent && state.started && !state.gameOver) {
      updateUI(`تم حذف ${removed.name} — دور ${getCurrentPlayer()?.name || ''} 🔑`);
    } else {
      updateUI(`تم حذف ${removed.name}`);
    }
  }

  function escapePlayerName(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function displayPlayerName(player, index) {
    const trimmed = String(player?.name ?? '').trim();
    return trimmed || `اللاعب ${index + 1}`;
  }

  function normalizePlayerNames() {
    state.players.forEach((p, i) => {
      p.name = displayPlayerName(p, i);
    });
  }

  function canEditPlayers() {
    return !online.mode && (!state.started || state.gameOver);
  }

  function setPlayerCount(count) {
    if (!canEditPlayers()) return;
    const target = Math.max(MIN_PLAYERS, Math.min(MAX_PLAYERS, count));
    while (state.players.length < target) {
      const n = state.players.length + 1;
      state.players.push({
        id: n,
        name: '',
        position: 1,
        color: PLAYER_COLORS[(n - 1) % PLAYER_COLORS.length],
      });
    }
    while (state.players.length > target) {
      state.players.pop();
    }
    state.players.forEach((p, i) => {
      p.id = i + 1;
      p.color = PLAYER_COLORS[i % PLAYER_COLORS.length];
    });
    renderPlayerCountPicker();
    renderPlayers();
    renderBoard();
    updateUI();
  }

  function renderPlayerCountPicker() {
    if (!playerCountPicker) return;
    const locked = !canEditPlayers();
    const count = state.players.length;
    playerCountPicker.innerHTML = Array.from({ length: MAX_PLAYERS - MIN_PLAYERS + 1 }, (_, i) => {
      const n = MIN_PLAYERS + i;
      return `<button type="button" class="player-count-btn${n === count ? ' is-active' : ''}" data-count="${n}" ${locked ? 'disabled' : ''} aria-pressed="${n === count}">${n}</button>`;
    }).join('');
  }

  function clearCityQuestionPending() {
    state.cityQuestionPending = null;
    if (cityModalRetryTimer) {
      clearTimeout(cityModalRetryTimer);
      cityModalRetryTimer = null;
    }
  }

  function shouldAnswerCityQuestion() {
    const pending = state.cityQuestionPending;
    if (!pending || pending.playerIndex !== state.currentIndex) return false;
    if (!online.mode || !online.inRoom) return true;
    return isMyTurn();
  }

  function scheduleCityQuestionModal(retry = 0) {
    if (!state.cityQuestionPending || !shouldAnswerCityQuestion()) return;
    if (online.lotteryPromptOpen || online.lotteryTieModalOpen) {
      if (retry < 16) {
        if (cityModalRetryTimer) clearTimeout(cityModalRetryTimer);
        cityModalRetryTimer = setTimeout(() => scheduleCityQuestionModal(retry + 1), 400);
      } else {
        recoverFromStuckSquare('city-modal-retry');
      }
      return;
    }
    if (isModalOpen()) {
      if (retry < 24) {
        if (cityModalRetryTimer) clearTimeout(cityModalRetryTimer);
        cityModalRetryTimer = setTimeout(() => scheduleCityQuestionModal(retry + 1), 300);
      } else {
        recoverFromStuckSquare('city-modal-retry');
      }
      return;
    }
    const open = () => promptCityQuestion();
    if (retry === 0) {
      requestAnimationFrame(() => requestAnimationFrame(open));
    } else {
      open();
    }
  }

  async function promptCityQuestion() {
    if (!state.cityQuestionPending || !shouldAnswerCityQuestion()) return;
    if (!state.started || state.gameOver || lotteryActive) return;

    if (!areCityQuestionsReady()) {
      try {
        await loadCityQuestions();
      } catch (err) {
        console.warn('فشل تحميل أسئلة المدن', err);
      }
    }

    presentCityQuestionModal();
  }

  function showCityQuestion(city, sq, playerId, onDone) {
    const card = areCityQuestionsReady() ? pickCityQuestion(sq, city.name, playerId) : null;
    if (!card) {
      drawQuestionCard((correct) => onDone(Boolean(correct)));
      return;
    }
    showQuestionCardModal(
      card,
      (userWasCorrect) => onDone(Boolean(userWasCorrect)),
      {
        cityBonus: city.move,
        cityName: city.name,
        citySquare: sq,
        cityPlayerId: playerId,
        title: `أسئلة عامة — ${city.name}`,
      },
    );
  }

  function presentCityQuestionModal() {
    const pending = state.cityQuestionPending;
    if (!pending || !shouldAnswerCityQuestion()) return;

    const city = getCityAtSquare(pending.square) || {
      name: pending.cityName,
      move: pending.move,
    };
    const actor = getPlayerByIndex(pending.playerIndex);

    showCityQuestion(city, pending.square, actor?.id, (correct) => {
      try {
        clearCityQuestionPending();
        pushOnlineState();
        finishCityQuestion(pending.playerIndex, city, pending.square, correct);
      } catch (err) {
        console.error('finishCityQuestion failed', err);
        recoverFromStuckSquare('city-callback');
      }
    });
  }

  function finishCityQuestion(playerIndex, city, sq, correct) {
    const player = getPlayerByIndex(playerIndex);
    if (!player) {
      nextTurn();
      return;
    }
    if (correct) {
      const delta = city.move;
      const from = sq;
      const to = Math.max(1, Math.min(BOARD_SIZE, sq + delta));
      if (to !== from) {
        animateMovePlayer(playerIndex, from, to, () => {
          showModal({
            title: `مدينة ${city.name}`,
            bodyHtml: `<p>إجابة صحيحة! ${delta >= 0 ? 'تتقدم' : 'ترتد'} ${Math.abs(delta)} مربعات → المربع ${player.position}</p>`,
            actions: [{ label: 'متابعة', className: 'btn-primary', onClick: () => continueAfterSpecial(player) }],
          });
        });
      } else {
        showModal({
          title: `مدينة ${city.name}`,
          bodyHtml: '<p>إجابة صحيحة!</p>',
          actions: [{ label: 'متابعة', className: 'btn-primary', onClick: () => continueAfterSpecial(player) }],
        });
      }
    } else {
      showModal({
        title: `مدينة ${city.name}`,
        bodyHtml: '<p>إجابة خاطئة — تبقى في مكانك.</p>',
        actions: [{ label: 'متابعة', className: 'btn-primary', onClick: () => nextTurn() }],
      });
    }
  }

  function handleCitySquare(playerIndex, city, sq) {
    const player = getPlayerByIndex(playerIndex);
    if (!player) {
      nextTurn();
      return;
    }
    beginSquareProcessing();
    state.cityQuestionPending = {
      playerIndex,
      square: sq,
      cityName: city.name,
      move: city.move,
    };
    pushOnlineState();
    updateUI();
    scheduleCityQuestionModal(0);
    setTimeout(() => {
      if (state.cityQuestionPending && shouldAnswerCityQuestion() && !isModalOpen()) {
        promptCityQuestion();
      }
    }, 600);
  }

  function renderPlayers(flashIndex = null) {
    const activeIdx = state.currentIndex;
    const showRemove = canRemovePlayer();
    const namesLocked = !canEditPlayers();
    playersList.innerHTML = state.players
      .map(
        (p, i) => `
      <div class="player-chip ${i === activeIdx && state.started && !state.gameOver ? 'active' : ''} ${flashIndex === i ? 'turn-flash' : ''}" data-player-index="${i}">
        <span class="player-key" style="--key-color:${p.color}">🔑</span>
        <input type="text" class="player-name-input" data-player-index="${i}" value="${escapePlayerName(p.name)}" placeholder="اسم اللاعب ${i + 1}" maxlength="24" dir="rtl" lang="ar" ${namesLocked ? 'disabled' : ''} aria-label="اسم اللاعب ${i + 1}" />
        <span class="player-pos">م${p.position}</span>
        ${showRemove ? `<button type="button" class="player-remove-btn" aria-label="حذف ${escapePlayerName(displayPlayerName(p, i))}" title="حذف">×</button>` : ''}
      </div>`,
      )
      .join('');
  }

  function flashPlayerChip(index) {
    renderPlayers(index);
    setTimeout(() => renderPlayers(), 900);
  }

  function highlightSquare(square) {
    state.highlightSquare = square;
    renderBoard();
  }

  function clearHighlight() {
    state.highlightSquare = null;
    renderBoard();
  }

  function updatePoolWarning() {
    if (!poolWarningEl) return;
    const msg = getLowPoolMessage();
    if (msg && !state.started) {
      poolWarningEl.textContent = msg;
      poolWarningEl.hidden = false;
    } else if (state.started && !state.gameOver) {
      const stats = getSessionQuestionStats();
      if (stats.total) {
        poolWarningEl.textContent = stats.recycled > 0
          ? `↻ أُعيد خلط الأسئلة — ${stats.remaining} متبقٍ من ${stats.total}`
          : `${stats.remaining} سؤال متبقٍ من ${stats.total}`;
        poolWarningEl.hidden = false;
      } else {
        poolWarningEl.hidden = true;
      }
    } else {
      poolWarningEl.hidden = !msg;
      if (msg) poolWarningEl.textContent = msg;
    }
  }

  function updateUI(statusOverride = null) {
    const current = getCurrentPlayer();
    const cardsReady = areCardsReady();
    const loadState = getCardsLoadState();
    const myTurn = isMyTurn();
    const cityPending = state.cityQuestionPending;
    const cityQuestionActive = cityPending && shouldAnswerCityQuestion();
    const canActDraw =
      cardsReady &&
      state.started &&
      !state.gameOver &&
      !lotteryActive &&
      !state.processingMove &&
      state.waitingForMove &&
      !cityQuestionActive;
    const canAct = myTurn && canActDraw;
    const levelInfo = getTrainLevelInfo();

    if (state.started && !state.gameOver && current) {
      currentTurnDisplay.classList.add('is-live');
      currentPlayerDot.hidden = false;
      currentPlayerDot.innerHTML = getPlayerKey(current, true);
      currentPlayerName.textContent = current.name;
      currentPlayerName.style.color = current.color;
      currentPlayerName.classList.remove('is-waiting');
    } else if (state.gameOver) {
      currentTurnDisplay.classList.remove('is-live');
      currentPlayerDot.hidden = true;
      const winner = state.players.find((p) => p.position >= BOARD_SIZE);
      currentPlayerName.textContent = winner ? `🏆 ${winner.name}` : 'انتهت اللعبة';
      currentPlayerName.style.color = winner?.color || '';
      currentPlayerName.classList.remove('is-waiting');
    } else if (online.mode && online.inRoom && online.lotteryPhase && !state.started) {
      currentTurnDisplay.classList.remove('is-live');
      currentPlayerDot.hidden = true;
      currentPlayerName.textContent = getLotteryWaitingLabel();
      currentPlayerName.style.color = '';
      currentPlayerName.classList.add('is-waiting');
    } else if (online.mode && online.inRoom && !state.started) {
      currentTurnDisplay.classList.remove('is-live');
      currentPlayerDot.hidden = true;
      currentPlayerName.textContent = online.isHost ? 'انتظر لاعبين ثم اضغط «ابدأ»' : 'انتظر بدء المضيف…';
      currentPlayerName.style.color = '';
      currentPlayerName.classList.add('is-waiting');
    } else {
      currentTurnDisplay.classList.remove('is-live');
      currentPlayerDot.hidden = true;
      currentPlayerName.textContent = 'اضغط «ابدأ اللعب» لتحديد من يبدأ';
      currentPlayerName.style.color = '';
      currentPlayerName.classList.add('is-waiting');
    }

    drawBtn.disabled = !canAct;
    rewardHintBtn.disabled = !canAct;
    drawBtn.classList.toggle('btn-pulse-ready', canAct);
    drawBtn.textContent = 'اسحب سؤالاً';

    const hideLocalStart = online.mode && online.inRoom;
    startBtn.hidden = hideLocalStart;
    startBtn.disabled =
      hideLocalStart ||
      !cardsReady ||
      (state.started && !state.gameOver) ||
      state.players.length < MIN_PLAYERS;
    addPlayerBtn.disabled =
      online.mode ||
      (state.started && !state.gameOver) ||
      state.players.length >= MAX_PLAYERS;

    levelSelectorEl?.querySelectorAll('.level-btn').forEach((btn) => {
      const count = getLevelCounts().find((l) => l.id === btn.dataset.level)?.count ?? 0;
      const hostOnlyLock = online.mode && online.inRoom && state.started;
      const guestLock = online.mode && online.inRoom && !online.isHost && !state.started;
      btn.disabled = hostOnlyLock || guestLock || (state.started && !state.gameOver) || count === 0;
    });

    if (statusOverride) {
      gameStatus.textContent = statusOverride;
    } else if (state.gameOver) {
      gameStatus.textContent = `🏆 الفائز: ${state.players.find((p) => p.position >= 100)?.name || current?.name}!`;
    } else if (!cardsReady) {
      if (loadState.state === 'loading') {
        gameStatus.textContent = 'جاري تحميل بطاقات الأسئلة…';
      } else if (loadState.state === 'error') {
        gameStatus.textContent = 'فشل تحميل البطاقات — شغّل build_train_questions.py';
      } else {
        gameStatus.textContent = 'جاري تجهيز بطاقات الأسئلة…';
      }
    } else if (online.mode && online.inRoom && online.lotteryPhase && !state.started) {
      const answered = state.players.filter((p) => typeof p.startScore === 'number').length;
      const total = state.players.length;
      const active = getLotteryActivePlayer();
      if (isMyLotteryTurn()) {
        gameStatus.textContent = `مرحلة ${levelInfo.nameArabic} — دورك في القرعة (${answered}/${total} أجابوا)`;
      } else if (active) {
        gameStatus.textContent = `مرحلة ${levelInfo.nameArabic} — انتظر دور ${active.name} (${answered}/${total})`;
      } else {
        gameStatus.textContent = `مرحلة ${levelInfo.nameArabic} — القرعة (${answered}/${total} أجابوا)`;
      }
    } else if (online.mode && online.inRoom && !state.started) {
      gameStatus.textContent = online.isHost
        ? `مرحلة ${levelInfo.nameArabic} — شارك الرمز ثم اضغط «ابدأ»`
        : `مرحلة ${levelInfo.nameArabic} — في انتظار المضيف…`;
    } else if (!state.started) {
      gameStatus.textContent = `مرحلة ${levelInfo.nameArabic} — اضغط «ابدأ اللعب»`;
    } else if (state.processingMove) {
      gameStatus.textContent = `🔑 ${current?.name || ''} يتحرك على الخارطة…`;
    } else if (cityQuestionActive) {
      const city = getCityAtSquare(cityPending.square);
      const cityLabel = city?.name || cityPending.cityName || 'مدينة';
      gameStatus.textContent = `🏙️ وصلت إلى مدينة ${cityLabel} — أجب على سؤال عام`;
    } else if (state.waitingForMove && online.mode && !myTurn) {
      gameStatus.textContent = `🔑 دور ${current?.name || ''} — انتظر دورك`;
    } else if (state.waitingForMove) {
      const qStats = getSessionQuestionStats();
      const poolHint = qStats.total ? ` — ${qStats.remaining}/${qStats.total} سؤال` : '';
      gameStatus.textContent = `🔑 دور ${current?.name || ''} — اسحب سؤالاً (${levelInfo.nameArabic})${poolHint}`;
    } else {
      gameStatus.textContent = `🔑 دور ${current?.name || ''} — جاري معالجة المربع…`;
    }
    if (online.mode && online.inRoom && (state.started || online.lotteryPhase)) {
      renderOnlineLobby({
        code: online.roomCode,
        hostId: online.hostId,
        players: state.players,
        currentTurn: state.currentIndex,
        started: state.started,
        lotteryPhase: online.lotteryPhase,
        lotteryTurnIndex: online.lotteryTurnIndex,
        level: getTrainLevel(),
        boardState: {
          waitingForMove: state.waitingForMove,
          processingMove: state.processingMove,
          gameOver: state.gameOver,
          highlightSquare: state.highlightSquare,
          cityQuestionPending: state.cityQuestionPending,
        },
      });
    }
    renderPlayers();
    if (document.getElementById('screen-train')?.classList.contains('active')) {
      renderBoard();
    }
    renderLevelSelector();
    updatePoolWarning();
    updateChatVisibility();
    syncMobileBar();
    renderPlayerCountPicker();
  }

  function startGame() {
    if (online.mode && online.inRoom) return;
    if (state.players.length < MIN_PLAYERS) {
      showModal({
        title: 'لاعبون غير كافين',
        bodyHtml: `<p>يجب أن يكون هناك ${MIN_PLAYERS} لاعبين على الأقل لبدء اللعب.</p>`,
      });
      return;
    }
    if (!areCardsReady()) {
      showModal({
        title: 'انتظر',
        bodyHtml: '<p>بطاقات الأسئلة ما زالت تُحمَّل. انتظر لحظات ثم حاول مجدداً.</p>',
      });
      return;
    }

    const poolStats = getSessionQuestionStats();
    const lowPoolNote =
      poolStats.isLow && poolStats.total < state.players.length
        ? `<p class="pool-warn-inline">⚠️ عدد الأسئلة (${poolStats.total}) أقل من عدد اللاعبين (${state.players.length}) — ستتكرر الأسئلة في القرعة.</p>`
        : poolStats.isLow
          ? `<p class="pool-warn-inline">${getLowPoolMessage()}</p>`
          : '';

    if (state.gameOver) {
      resetGame();
      return;
    }
    if (state.started) return;

    normalizePlayerNames();
    renderPlayers();
    resetQuestionSession();
    resetCityQuestionSession();

    const askRound = () => {
      lotteryActive = true;
      state.started = false;
      state.waitingForMove = false;
      state.processingMove = false;
      state.gameOver = false;
      state.highlightSquare = null;
      state.players.forEach((p) => {
        p.position = 1;
        delete p.startScore;
      });

      const showLocalLotteryQuestion = (playerIndex) => {
        const player = state.players[playerIndex];
        if (!player) {
          resolveStartWinner();
          return;
        }
        updateUI(`🔑 قرعة — دور ${player.name}`);
        const card = pickTiebreakCard();
        showQuestionCardModal(
          card,
          (userWasCorrect, steps) => {
            player.startScore = userWasCorrect ? steps : 0;
            const nextIndex = playerIndex + 1;
            if (nextIndex >= state.players.length) {
              hideModal();
              resolveStartWinner();
              return;
            }
            const nextPlayer = state.players[nextIndex];
            hideModal();
            showModal({
              title: 'انتظر دور اللاعب التالي',
              bodyHtml: `<p>أجاب <strong>${player.name}</strong> ✓</p><p>الآن دور <strong>${nextPlayer.name}</strong>.</p><p class="lottery-handoff-hint">مرّر الجهاز إن لزم، ثم اضغط للمتابعة.</p>`,
              actions: [
                {
                  label: `سؤال ${nextPlayer.name}`,
                  className: 'btn-gold',
                  onClick: () => showLocalLotteryQuestion(nextIndex),
                },
              ],
            });
            updateUI(`⏳ انتظر — الآن دور ${nextPlayer.name}`);
          },
          { deferClose: true, tiebreak: true, title: `قرعة — ${player.name}` },
        );
      };

      showLocalLotteryQuestion(0);
    };

    const resolveStartWinner = () => {
      const best = Math.max(...state.players.map((p) => p.startScore || 0));
      const tied = state.players
        .map((p, i) => ((p.startScore || 0) === best ? i : -1))
        .filter((i) => i >= 0);

      if (tied.length > 1) {
        const names = tied.map((i) => `<strong>${state.players[i].name}</strong>`).join(' و ');
        hideModal();
        showModal({
          title: 'تعادل! إعادة القرعة',
          bodyHtml: `<p>تعادل بين ${names} بنتيجة <strong>${best}</strong>.</p><p>يُعاد سؤال لجميع اللاعبين حتى يظهر فائز واحد.</p>`,
        });
        setTimeout(() => {
          hideModal();
          askRound();
        }, 1400);
        return;
      }

      setTimeout(() => finishStart(tied[0]), 0);
    };

    showModal({
      title: 'تحديد من يبدأ',
      bodyHtml: `<p>كل لاعب يجيب سؤالاً بالترتيب من مرحلة <strong>${getTrainLevelInfo().nameArabic}</strong>. من يحصل على أعلى نتيجة يبدأ.</p><p>عند التعادل في أعلى نتيجة تُعاد القرعة.</p>${lowPoolNote}`,
      actions: [{ label: 'ابدأ الأسئلة', className: 'btn-gold', onClick: askRound, keepOpen: true }],
    });
  }

  function finishStart(winnerIdx) {
    hideModal();
    beginMainGameSession();
    lotteryActive = false;

    const winner = getPlayerByIndex(winnerIdx);
    if (!winner) return;

    const best = winner.startScore || 0;
    state.currentIndex = winnerIdx;
    state.started = true;
    state.waitingForMove = true;
    state.processingMove = false;
    state.gameOver = false;
    state.highlightSquare = null;
    state.players.forEach((p) => {
      p.position = 1;
      delete p.startScore;
    });

    showModal({
      title: 'انطلقت الرحلة!',
      bodyHtml: `<p>يبدأ <strong>${winner.name}</strong> 🔑 (نتيجة: ${best}).</p><p>الهدف: الوصول للمربع 100 — القدس 🇵🇸</p>`,
      actions: [{ label: 'ابدأ اللعب', className: 'btn-gold' }],
    });
    flashPlayerChip(winnerIdx);
    renderBoard();
    updateUI();
    pushOnlineState();
  }

  function resetGame() {
    onTrainReset();
    resetQuestionSession();
    resetCityQuestionSession();
    lotteryActive = false;
    state.players.forEach((p) => {
      p.position = 1;
      delete p.startScore;
    });
    state.currentIndex = 0;
    state.started = false;
    state.waitingForMove = false;
    state.processingMove = false;
    state.gameOver = false;
    state.highlightSquare = null;
    clearCityQuestionPending();
    clearSquareWatchdog();
    updateUI();
  }

  function handleDrawAction() {
    if (!state.started || state.gameOver || !isMyTurn()) return;
    drawProgressQuestion();
  }

  function drawProgressQuestion() {
    if (lotteryActive || !state.started || !isMyTurn() || !areCardsReady() || state.processingMove) {
      return;
    }
    if (!state.waitingForMove) {
      return;
    }
    const { card } = drawQuestion();
    showQuestionCardModal(card, (userWasCorrect, steps) => {
      moveAfterAnswer(userWasCorrect, steps);
    });
  }

  function moveAfterAnswer(userWasCorrect, steps) {
    if (!state.started || lotteryActive) return;

    const actingIndex = state.currentIndex;
    const player = getPlayerByIndex(actingIndex);
    if (!player) return;

    const delta = Math.max(0, Number(steps) || 0);
    const from = normalizePosition(player.position);
    player.position = from;
    const nextPlayer = getPlayerByIndex(getNextPlayerIndex(actingIndex));
    const stepWord = delta === 1 ? 'خطوة' : 'خطوات';

    if (delta === 0) {
      state.waitingForMove = false;
      if (online.mode && online.inRoom) pushOnlineState();
      updateUI(`${userWasCorrect ? 'إجابة صحيحة' : 'إجابة خاطئة'} — لا تحرك. دور ${nextPlayer?.name || ''} 🔑`);
      showTurnChangeModal(player, nextPlayer, 0, () => nextTurn());
      return;
    }

    const to = Math.min(BOARD_SIZE, from + delta);
    const statusMsg = userWasCorrect
      ? `إجابة صحيحة — تتحرك ${delta} ${stepWord}`
      : `إجابة خاطئة — تتحرك ${delta} ${stepWord}`;
    updateUI(statusMsg);
    animateMovePlayer(actingIndex, from, to, () => processSquare(actingIndex));
  }

  function showTurnChangeModal(finishedPlayer, nextPlayer, stepsMoved = 0, onContinue) {
    const moveHint =
      stepsMoved > 0
        ? `تحرك ${stepsMoved} خطوة/خطوات.`
        : 'لم يتحرك.';
    showModal({
      title: 'انتهى الدور',
      bodyHtml: `<p class="turn-change-next">انتهى دور <strong style="color:${finishedPlayer.color}">${finishedPlayer.name}</strong>. الآن دور <strong style="color:${nextPlayer.color}">${nextPlayer.name}</strong> 🔑</p><p class="turn-change-hint">${moveHint}</p>`,
      actions: [{ label: `دور ${nextPlayer.name} 🔑`, className: 'btn-gold', onClick: onContinue }],
    });
  }

  function drawQuestionCard(onDone) {
    try {
      const { card } = drawQuestion();
      showQuestionCardModal(card, (userWasCorrect, steps) => {
        try {
          onDone(userWasCorrect, steps);
        } catch (err) {
          console.error('drawQuestionCard callback failed', err);
          recoverFromStuckSquare('question-callback');
        }
      });
      armSquareWatchdog();
    } catch (err) {
      console.error('drawQuestionCard failed', err);
      showModal({
        title: 'تنبيه',
        bodyHtml: '<p>تعذّر سحب السؤال — يُستأنف الدور.</p>',
        actions: [
          {
            label: 'متابعة',
            className: 'btn-primary',
            onClick: () => recoverFromStuckSquare('draw-failed'),
          },
        ],
      });
    }
  }

  function animateMovePlayer(playerIndex, from, to, onDone) {
    const player = getPlayerByIndex(playerIndex);
    const start = normalizePosition(from);
    const end = normalizePosition(to);
    beginSquareProcessing();

    if (!player) {
      finishSquareProcessing({ resumeTurn: true });
      onDone?.();
      return;
    }

    if (start >= end) {
      player.position = end;
      clearHighlight();
      renderBoard();
      onDone?.();
      return;
    }

    let current = start;
    player.position = start;
    highlightSquare(start);

    const stepForward = () => {
      const active = getPlayerByIndex(playerIndex);
      if (!active) {
        finishSquareProcessing();
        onDone?.();
        return;
      }
      current += 1;
      active.position = current;
      highlightSquare(current);
      renderBoard();
      updateUI(`تحرك ${active.name} — مربع ${current}${current === end ? ' ✓' : '…'}`);

      if (current < end) {
        setTimeout(stepForward, 180);
      } else {
        setTimeout(() => {
          clearHighlight();
          updateUI();
          pushOnlineState();
          onDone?.();
        }, 280);
      }
    };

    setTimeout(stepForward, 120);
  }

  function movePlayer(steps) {
    const actingIndex = state.currentIndex;
    const player = getPlayerByIndex(actingIndex);
    if (!player) return;
    const from = normalizePosition(player.position);
    const to = Math.min(BOARD_SIZE, from + Math.max(0, Number(steps) || 0));
    animateMovePlayer(actingIndex, from, to, () => processSquare(actingIndex));
  }

  function processSquare(playerOrIndex) {
    beginSquareProcessing();
    try {
      const playerIndex =
        typeof playerOrIndex === 'number' ? playerOrIndex : state.players.indexOf(playerOrIndex);
      const player = getPlayerByIndex(playerIndex);
      if (!player || playerIndex < 0) {
        state.waitingForMove = true;
        finishSquareProcessing();
        return;
      }
      const sq = player.position;

      if (sq >= BOARD_SIZE) {
        clearSquareWatchdog();
        winGame(player);
        return;
      }

      const barrier = BARRIERS[sq];
      if (barrier) {
        player.position = Math.max(1, sq - 3);
        renderBoard();
        pushOnlineState();
        showModal({
          title: `⛔ حاجز الكيان الصهيوني — ${barrier.title}`,
          bodyHtml: `<p>${barrier.text}</p><p>تراجع <strong>3 خطوات</strong> إلى المربع ${player.position}.</p><p class="event-box">ليشعر اللاعب بالظلم الذي يحل بالشعب الفلسطيني.</p>`,
          actions: [{ label: 'متابعة', className: 'btn-primary', onClick: () => nextTurn() }],
        });
        renderBoard();
        armSquareWatchdog();
        return;
      }

      const city = getCityAtSquare(sq);
      if (city) {
        handleCitySquare(playerIndex, city, sq);
        return;
      }

      const blue = BLUE_ARROWS.find((a) => a.start === sq);
      if (blue) {
        drawQuestionCard((correct) => {
          if (!correct) {
            player.position = blue.end;
            renderBoard();
            pushOnlineState();
            showModal({
              title: 'سهم أزرق ↓',
              bodyHtml: `<p>انتقلت من ${sq} إلى ${blue.end}</p>`,
              actions: [{ label: 'متابعة', className: 'btn-primary', onClick: () => continueAfterSpecial(player) }],
            });
            renderBoard();
            armSquareWatchdog();
          } else {
            showModal({
              title: 'إجابة صحيحة!',
              bodyHtml: '<p>تبقى في مكانك.</p>',
              actions: [{ label: 'متابعة', className: 'btn-primary', onClick: () => nextTurn() }],
            });
            armSquareWatchdog();
          }
        });
        return;
      }

      const yellow = YELLOW_ARROWS.find((a) => a.start === sq);
      if (yellow) {
        drawQuestionCard((correct) => {
          if (correct) {
            player.position = Math.min(BOARD_SIZE, yellow.end);
            renderBoard();
            pushOnlineState();
            showModal({
              title: 'سهم أصفر ↑',
              bodyHtml: `<p>إجابة صحيحة! انتقلت من ${sq} إلى ${player.position}</p>`,
              actions: [{ label: 'متابعة', className: 'btn-primary', onClick: () => continueAfterSpecial(player) }],
            });
            renderBoard();
            armSquareWatchdog();
          } else {
            showModal({
              title: 'إجابة خاطئة',
              bodyHtml: '<p>تبقى في مكانك.</p>',
              actions: [{ label: 'متابعة', className: 'btn-primary', onClick: () => nextTurn() }],
            });
            armSquareWatchdog();
          }
        });
        return;
      }

      finishSquareProcessing({ nextTurn: true });
    } catch (err) {
      console.error('processSquare failed', err);
      recoverFromStuckSquare('process-square');
    }
  }

  function continueAfterSpecial(player) {
    if (player.position >= BOARD_SIZE) {
      winGame(player);
    } else {
      processSquare(player);
    }
  }

  function winGame(player) {
    clearSquareWatchdog();
    state.gameOver = true;
    state.waitingForMove = false;
    onTrainGameOver();
    showModal({
      title: '🏆 مبروك!',
      bodyHtml: `<p>وصل <strong>${player.name}</strong> إلى القدس — المربع 100!</p><p>فلسطين حرة 🇵🇸</p>`,
      actions: [{ label: 'لعب جديد', className: 'btn-gold', onClick: resetGame }],
    });
    updateUI();
    pushOnlineState();
  }

  function nextTurn(options = {}) {
    if (state.gameOver) return;
    clearSquareWatchdog();
    onTrainTurnComplete();
    const prevIndex = state.currentIndex;
    state.currentIndex = getNextPlayerIndex();
    state.waitingForMove = true;
    state.processingMove = false;
    const next = getCurrentPlayer();
    updateUI(`🔑 الآن دور ${next.name} — اسحب سؤالاً.`);
    if (options.flash !== false) {
      flashPlayerChip(state.currentIndex);
    }
    if (options.silent) {
      pushOnlineState();
      return;
    }
    pushOnlineState();
    if (prevIndex !== state.currentIndex || state.players.length > 1) {
      currentTurnDisplay.classList.add('turn-bump');
      setTimeout(() => currentTurnDisplay.classList.remove('turn-bump'), 600);
    }
  }

  function refreshUI(statusOverride = null) {
    updateUI(statusOverride);
    if (document.getElementById('screen-train')?.classList.contains('active')) {
      renderBoard();
    }
  }

  return { refreshUI };
}
