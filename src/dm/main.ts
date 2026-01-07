import { generateClientId, initializeFirebase } from '../lib/firebase.ts';
import { getRoom, subscribeToRoom, sendCommand, updateControllerInfo } from '../lib/firestore.ts';
import { decodeQRCode, extractRoomIdFromUrl } from '../lib/qr.ts';
import { initGoogleAuth, signInWithGoogle, signOutUser, onAuthStateChange, type AuthUser } from '../lib/auth.ts';
import { imageToBase64, scanMonsterImage, type ScannedMonster } from '../lib/ai.ts';
import {
  Room,
  Creature,
  Attack,
  PREDEFINED_STATUSES,
  StatusEffect,
} from '../lib/types.ts';

// App state
let roomId: string | null = null;
let clientId: string = generateClientId();
let currentRoom: Room | null = null;
let currentUser: AuthUser | null = null;
let scannerStream: MediaStream | null = null;
let scannerAnimationId: number | null = null;
let selectedCreatureId: string | null = null;
let editingCreatureId: string | null = null;
let selectedStatusName: string | null = null;
let timerInterval: number | null = null;
let pendingScannedMonsters: ScannedMonster[] = [];

// DOM Elements
const loadingScreen = document.getElementById('loading') as HTMLDivElement;
const joinScreen = document.getElementById('join-screen') as HTMLDivElement;
const controlScreen = document.getElementById('control-screen') as HTMLDivElement;
const scannerVideo = document.getElementById('scanner-video') as HTMLVideoElement;
const roomCodeInput = document.getElementById('room-code-input') as HTMLInputElement;
const joinBtn = document.getElementById('join-btn') as HTMLButtonElement;
const dmRoomIdEl = document.getElementById('dm-room-id') as HTMLElement;
const combatToggleBtn = document.getElementById('combat-toggle') as HTMLButtonElement;
const turnControls = document.getElementById('turn-controls') as HTMLDivElement;
const prevTurnBtn = document.getElementById('prev-turn-btn') as HTMLButtonElement;
const nextTurnBtn = document.getElementById('next-turn-btn') as HTMLButtonElement;
const creatureList = document.getElementById('creature-list') as HTMLDivElement;
const addCreatureBtn = document.getElementById('add-creature-btn') as HTMLButtonElement;

// Timer elements
const dmTotalTimeEl = document.getElementById('dm-total-time') as HTMLElement;
const dmRoundTimeEl = document.getElementById('dm-round-time') as HTMLElement;
const dmTurnTimeEl = document.getElementById('dm-turn-time') as HTMLElement;
const dmRoundEl = document.getElementById('dm-round') as HTMLElement;

// Modals
const creatureModal = document.getElementById('creature-modal') as HTMLDivElement;
const creatureForm = document.getElementById('creature-form') as HTMLFormElement;
const creatureModalTitle = document.getElementById('creature-modal-title') as HTMLElement;
const attacksContainer = document.getElementById('attacks-container') as HTMLDivElement;
const addAttackBtn = document.getElementById('add-attack-btn') as HTMLButtonElement;
const cancelCreatureBtn = document.getElementById('cancel-creature-btn') as HTMLButtonElement;

const hpModal = document.getElementById('hp-modal') as HTMLDivElement;
const hpCreatureNameEl = document.getElementById('hp-creature-name') as HTMLElement;
const hpCurrentValueEl = document.getElementById('hp-current-value') as HTMLElement;
const hpSetValueInput = document.getElementById('hp-set-value') as HTMLInputElement;
const hpChangeValueInput = document.getElementById('hp-change-value') as HTMLInputElement;
const hpSetBtn = document.getElementById('hp-set-btn') as HTMLButtonElement;
const hpHealBtn = document.getElementById('hp-heal-btn') as HTMLButtonElement;
const hpDamageBtn = document.getElementById('hp-damage-btn') as HTMLButtonElement;
const closeHpModalBtn = document.getElementById('close-hp-modal-btn') as HTMLButtonElement;

const statusModal = document.getElementById('status-modal') as HTMLDivElement;
const statusCreatureNameEl = document.getElementById('status-creature-name') as HTMLElement;
const statusGrid = document.getElementById('status-grid') as HTMLDivElement;
const statusRoundsInput = document.getElementById('status-rounds') as HTMLInputElement;
const closeStatusModalBtn = document.getElementById('close-status-modal-btn') as HTMLButtonElement;

const cloneModal = document.getElementById('clone-modal') as HTMLDivElement;
const cloneCreatureNameEl = document.getElementById('clone-creature-name') as HTMLElement;
const cloneSuffixInput = document.getElementById('clone-suffix') as HTMLInputElement;
const cancelCloneBtn = document.getElementById('cancel-clone-btn') as HTMLButtonElement;
const confirmCloneBtn = document.getElementById('confirm-clone-btn') as HTMLButtonElement;

// Initialize app
async function init() {
  try {
    // Initialize Firebase and Auth
    initializeFirebase();
    await initGoogleAuth();

    // Listen for auth state changes
    onAuthStateChange((user) => {
      currentUser = user;
      updateAuthUI();
    });

    // Check if room ID is in URL
    const urlParams = new URLSearchParams(window.location.search);
    const urlRoomId = urlParams.get('room');

    if (urlRoomId) {
      await joinRoom(urlRoomId);
    } else {
      showScreen('join');
      startScanner();
    }

    setupEventListeners();
  } catch (error) {
    console.error('Failed to initialize:', error);
  }
}

// Update auth UI
function updateAuthUI() {
  const authSection = document.getElementById('dm-auth-section');
  const userInfo = document.getElementById('dm-user-info');
  const aiScanBtn = document.getElementById('ai-scan-btn');

  if (!authSection || !userInfo || !aiScanBtn) return;

  if (currentUser) {
    authSection.classList.add('hidden');
    userInfo.classList.remove('hidden');
    const avatar = userInfo.querySelector('.user-avatar') as HTMLImageElement;
    const name = userInfo.querySelector('.user-name') as HTMLElement;
    if (avatar) avatar.src = currentUser.photoURL || '';
    if (name) name.textContent = currentUser.displayName || currentUser.email || '';
    aiScanBtn.classList.remove('hidden');
  } else {
    authSection.classList.remove('hidden');
    userInfo.classList.add('hidden');
    aiScanBtn.classList.add('hidden');
  }
}

// Show a specific screen
function showScreen(screen: 'loading' | 'join' | 'control') {
  loadingScreen.classList.remove('active');
  joinScreen.classList.remove('active');
  controlScreen.classList.remove('active');

  switch (screen) {
    case 'loading':
      loadingScreen.classList.add('active');
      break;
    case 'join':
      joinScreen.classList.add('active');
      break;
    case 'control':
      controlScreen.classList.add('active');
      break;
  }
}

// Setup event listeners
function setupEventListeners() {
  // Auth buttons
  const googleSigninBtn = document.getElementById('dm-google-signin');
  const signoutBtn = document.getElementById('dm-signout-btn');

  googleSigninBtn?.addEventListener('click', async () => {
    try {
      await signInWithGoogle();
    } catch (error) {
      console.error('Sign in failed:', error);
    }
  });

  signoutBtn?.addEventListener('click', async () => {
    try {
      await signOutUser();
    } catch (error) {
      console.error('Sign out failed:', error);
    }
  });

  // AI Scan button
  const aiScanBtn = document.getElementById('ai-scan-btn');
  const aiScanModal = document.getElementById('ai-scan-modal');
  const aiScanFile = document.getElementById('ai-scan-file') as HTMLInputElement;
  const aiScanUploadBtn = document.getElementById('ai-scan-upload-btn');
  const aiScanCameraBtn = document.getElementById('ai-scan-camera-btn');
  const aiScanPreview = document.getElementById('ai-scan-preview');
  const aiScanPreviewImg = document.getElementById('ai-scan-preview-img') as HTMLImageElement;
  const aiScanClearBtn = document.getElementById('ai-scan-clear-btn');
  const startAiScanBtn = document.getElementById('start-ai-scan-btn') as HTMLButtonElement;
  const cancelAiScanBtn = document.getElementById('cancel-ai-scan-btn');

  let selectedAiScanFile: File | null = null;

  aiScanBtn?.addEventListener('click', () => {
    if (!currentUser) {
      alert('Please sign in to use AI scanning');
      return;
    }
    // Reset modal state
    selectedAiScanFile = null;
    aiScanPreview?.classList.add('hidden');
    startAiScanBtn.disabled = true;
    document.getElementById('ai-scan-status')?.classList.add('hidden');
    document.getElementById('ai-scan-results')?.classList.add('hidden');
    document.getElementById('ai-scan-error')?.classList.add('hidden');
    if (aiScanFile) aiScanFile.value = '';
    showModal(aiScanModal as HTMLDivElement);
  });

  aiScanUploadBtn?.addEventListener('click', () => {
    aiScanFile?.click();
  });

  aiScanFile?.addEventListener('change', (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file) {
      selectedAiScanFile = file;
      const url = URL.createObjectURL(file);
      if (aiScanPreviewImg) aiScanPreviewImg.src = url;
      aiScanPreview?.classList.remove('hidden');
      startAiScanBtn.disabled = false;
    }
  });

  aiScanCameraBtn?.addEventListener('click', () => {
    // Create file input that opens camera on mobile
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.capture = 'environment';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        selectedAiScanFile = file;
        const url = URL.createObjectURL(file);
        if (aiScanPreviewImg) aiScanPreviewImg.src = url;
        aiScanPreview?.classList.remove('hidden');
        startAiScanBtn.disabled = false;
      }
    };
    input.click();
  });

  aiScanClearBtn?.addEventListener('click', () => {
    selectedAiScanFile = null;
    aiScanPreview?.classList.add('hidden');
    startAiScanBtn.disabled = true;
    if (aiScanFile) aiScanFile.value = '';
  });

  startAiScanBtn?.addEventListener('click', async () => {
    if (selectedAiScanFile) {
      await processAiScan(selectedAiScanFile);
    }
  });

  cancelAiScanBtn?.addEventListener('click', () => {
    hideModal(aiScanModal as HTMLDivElement);
  });

  // Join button
  joinBtn.addEventListener('click', async () => {
    const code = roomCodeInput.value.trim().toUpperCase();
    if (code.length === 6) {
      await joinRoom(code);
    }
  });

  roomCodeInput.addEventListener('keypress', async (e) => {
    if (e.key === 'Enter') {
      const code = roomCodeInput.value.trim().toUpperCase();
      if (code.length === 6) {
        await joinRoom(code);
      }
    }
  });

  // Combat toggle
  combatToggleBtn.addEventListener('click', async () => {
    if (!roomId || !currentRoom) return;

    const status = currentRoom.state.status;
    if (status === 'setup') {
      await sendCommand(roomId, { type: 'START_COMBAT', payload: {}, clientId });
    } else if (status === 'running') {
      await sendCommand(roomId, { type: 'PAUSE_COMBAT', payload: {}, clientId });
    } else if (status === 'paused') {
      await sendCommand(roomId, { type: 'RESUME_COMBAT', payload: {}, clientId });
    } else if (status === 'round_end') {
      await sendCommand(roomId, { type: 'START_NEW_ROUND', payload: {}, clientId });
    }
  });

  // Turn controls
  prevTurnBtn.addEventListener('click', async () => {
    if (!roomId) return;
    await sendCommand(roomId, { type: 'PREV_TURN', payload: {}, clientId });
  });

  nextTurnBtn.addEventListener('click', async () => {
    if (!roomId) return;
    await sendCommand(roomId, { type: 'NEXT_TURN', payload: {}, clientId });
  });

  // Pause button
  const pauseBtn = document.getElementById('pause-btn');
  pauseBtn?.addEventListener('click', async () => {
    if (!roomId || !currentRoom) return;
    const status = currentRoom.state.status;
    if (status === 'running') {
      await sendCommand(roomId, { type: 'PAUSE_COMBAT', payload: {}, clientId });
    } else if (status === 'paused') {
      await sendCommand(roomId, { type: 'RESUME_COMBAT', payload: {}, clientId });
    }
  });

  // Add creature
  addCreatureBtn.addEventListener('click', () => {
    editingCreatureId = null;
    creatureModalTitle.textContent = 'Add Creature';
    creatureForm.reset();
    attacksContainer.innerHTML = '';
    showModal(creatureModal);
  });

  // Creature form
  creatureForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    await saveCreature();
  });

  cancelCreatureBtn.addEventListener('click', () => {
    hideModal(creatureModal);
  });

  addAttackBtn.addEventListener('click', () => {
    addAttackEntry();
  });

  // HP modal
  hpSetBtn.addEventListener('click', async () => {
    if (!roomId || !selectedCreatureId) return;
    const value = parseInt(hpSetValueInput.value);
    if (!isNaN(value)) {
      await sendCommand(roomId, {
        type: 'UPDATE_HP',
        payload: { creatureId: selectedCreatureId, newHp: value },
        clientId,
      });
      hideModal(hpModal);
    }
  });

  hpHealBtn.addEventListener('click', async () => {
    if (!roomId || !selectedCreatureId) return;
    const value = parseInt(hpChangeValueInput.value);
    if (!isNaN(value) && value > 0) {
      await sendCommand(roomId, {
        type: 'UPDATE_HP',
        payload: { creatureId: selectedCreatureId, hpChange: value },
        clientId,
      });
      hideModal(hpModal);
    }
  });

  hpDamageBtn.addEventListener('click', async () => {
    if (!roomId || !selectedCreatureId) return;
    const value = parseInt(hpChangeValueInput.value);
    if (!isNaN(value) && value > 0) {
      await sendCommand(roomId, {
        type: 'UPDATE_HP',
        payload: { creatureId: selectedCreatureId, hpChange: -value },
        clientId,
      });
      hideModal(hpModal);
    }
  });

  closeHpModalBtn.addEventListener('click', () => {
    hideModal(hpModal);
  });

  // Status modal
  closeStatusModalBtn.addEventListener('click', () => {
    hideModal(statusModal);
  });

  // Clone modal
  cancelCloneBtn.addEventListener('click', () => {
    hideModal(cloneModal);
  });

  confirmCloneBtn.addEventListener('click', async () => {
    if (!roomId || !selectedCreatureId) return;
    const suffix = cloneSuffixInput.value.trim();
    const payload: { creatureId: string; suffix?: string } = { creatureId: selectedCreatureId };
    if (suffix) {
      payload.suffix = suffix;
    }
    await sendCommand(roomId, {
      type: 'CLONE_CREATURE',
      payload,
      clientId,
    });
    hideModal(cloneModal);
  });

  // Clear status modal
  const cancelClearStatusBtn = document.getElementById('cancel-clear-status-btn');
  const confirmClearStatusBtn = document.getElementById('confirm-clear-status-btn');
  const clearStatusModal = document.getElementById('clear-status-modal') as HTMLDivElement;

  cancelClearStatusBtn?.addEventListener('click', () => {
    hideModal(clearStatusModal);
  });

  confirmClearStatusBtn?.addEventListener('click', async () => {
    if (!roomId || !clearStatusCreatureId || !clearStatusId) return;

    await sendCommand(roomId, {
      type: 'REMOVE_STATUS',
      payload: { creatureId: clearStatusCreatureId, statusId: clearStatusId },
      clientId,
    });

    hideModal(clearStatusModal);
    clearStatusCreatureId = null;
    clearStatusId = null;
  });

  // Modal backdrop clicks
  document.querySelectorAll('.modal-backdrop').forEach((backdrop) => {
    backdrop.addEventListener('click', () => {
      document.querySelectorAll('.modal').forEach((modal) => {
        hideModal(modal as HTMLDivElement);
      });
    });
  });

  // Esc key to close modals
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal:not(.hidden)').forEach((modal) => {
        hideModal(modal as HTMLDivElement);
      });
    }
  });
}

// Join a room
async function joinRoom(code: string) {
  showScreen('loading');
  stopScanner();

  try {
    const room = await getRoom(code);
    if (!room) {
      alert('Room not found');
      showScreen('join');
      startScanner();
      return;
    }

    roomId = code;
    currentRoom = room;

    // Update URL
    const url = new URL(window.location.href);
    url.searchParams.set('room', code);
    window.history.replaceState({}, '', url.toString());

    // Update controller info
    await updateControllerInfo(code, clientId);

    // Subscribe to room updates
    subscribeToRoom(code, handleRoomUpdate, (error) => {
      console.error('Room subscription error:', error);
    });

    dmRoomIdEl.textContent = code;
    showScreen('control');
    startTimerLoop();
  } catch (error) {
    console.error('Failed to join room:', error);
    alert('Failed to join room');
    showScreen('join');
    startScanner();
  }
}

// Handle room updates
function handleRoomUpdate(room: Room | null) {
  if (!room) {
    console.log('Room not found');
    return;
  }

  currentRoom = room;

  // Start or stop timer based on combat status
  if (room.state.status === 'running') {
    startTimerLoop();
  }

  updateUI(room);
}

// Update UI based on room state
function updateUI(room: Room) {
  const state = room.state;

  // Update combat toggle button
  switch (state.status) {
    case 'setup':
      combatToggleBtn.textContent = 'Start Combat';
      combatToggleBtn.classList.remove('running');
      turnControls.classList.add('hidden');
      break;
    case 'running':
      combatToggleBtn.textContent = 'Pause';
      combatToggleBtn.classList.add('running');
      turnControls.classList.remove('hidden');
      break;
    case 'paused':
      combatToggleBtn.textContent = 'Resume';
      combatToggleBtn.classList.remove('running');
      turnControls.classList.remove('hidden');
      break;
    case 'round_end':
      combatToggleBtn.textContent = 'Start Round ' + (state.round + 1);
      combatToggleBtn.classList.remove('running');
      turnControls.classList.add('hidden');
      break;
  }

  // Update round number
  dmRoundEl.textContent = String(state.round);

  // Render creature list
  renderCreatureList(state.creatures, state.currentCreatureId);
}

// Generate consistent color from groupId
function getGroupColor(groupId: string): string {
  let hash = 0;
  for (let i = 0; i < groupId.length; i++) {
    hash = groupId.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 60%, 50%)`;
}

// Render creature list
function renderCreatureList(creatures: Creature[], currentCreatureId: string | null) {
  // Group creatures by groupId for visual linking
  const groupedCreatures = creatures.reduce((acc, creature) => {
    if (creature.groupId) {
      acc[creature.groupId] = (acc[creature.groupId] || 0) + 1;
    }
    return acc;
  }, {} as Record<string, number>);

  creatureList.innerHTML = creatures
    .map((creature) => {
      const isCurrent = creature.id === currentCreatureId;
      const hpPercent = (creature.currentHp / creature.maxHp) * 100;
      const hpClass = hpPercent <= 25 ? 'critical' : hpPercent <= 50 ? 'damaged' : '';
      const hasGroup = creature.groupId && groupedCreatures[creature.groupId] > 1;
      const groupColor = hasGroup ? getGroupColor(creature.groupId!) : '';

      const statusBadges = creature.statusEffects
        .map((s) => {
          const showRounds = s.roundsRemaining !== null && !s.hideRounds;
          return `
            <span class="status-badge" data-status-id="${s.id}" data-status-name="${s.name}" title="${s.name}${s.roundsRemaining !== null ? ` (${s.roundsRemaining} rounds)` : ''}">
              ${s.icon}
              ${showRounds ? `<span class="rounds-badge">${s.roundsRemaining}</span>` : ''}
            </span>
          `;
        })
        .join('');

      return `
        <div class="creature-item ${isCurrent ? 'current-turn' : ''} ${creature.isPlayer ? 'is-player' : ''} ${creature.condition} ${hasGroup ? 'has-group' : ''}"
             data-creature-id="${creature.id}"
             data-group-id="${creature.groupId || ''}"
             ${hasGroup ? `style="--group-color: ${groupColor}"` : ''}>
          <div class="initiative">${creature.initiative}</div>
          <div class="icon">${creature.icon}</div>
          <div class="details">
            <div class="name-row">
              <span class="name" data-action="edit">${creature.displayName || creature.name}</span>
              ${creature.isPlayer ? '<span class="pc-badge">PC</span>' : ''}
              <span class="edit-btn" data-action="edit">✏️</span>
            </div>
            <div class="stats">
              <span class="stat-item hp ${hpClass}" data-action="hp">
                <span class="stat-icon">❤️</span>
                ${creature.currentHp}/${creature.maxHp}
              </span>
              <span class="stat-item ac">
                <span class="stat-icon">🛡️</span>
                ${creature.ac}
              </span>
            </div>
          </div>
          <div class="creature-right">
            <div class="statuses">
              ${statusBadges}
              <button class="add-status-btn" data-action="status" title="Add Status">+</button>
            </div>
            <div class="actions">
              <button class="action-btn" data-action="clone" title="Clone">📋</button>
            </div>
          </div>
        </div>
      `;
    })
    .join('');

  // Add click handlers for action buttons
  creatureList.querySelectorAll('.action-btn, .add-status-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const action = (btn as HTMLButtonElement).dataset.action;
      const creatureEl = btn.closest('.creature-item') as HTMLDivElement;
      const creatureId = creatureEl.dataset.creatureId!;
      handleCreatureAction(action!, creatureId);
    });
  });

  // Add click handlers for name/edit button
  creatureList.querySelectorAll('.name, .edit-btn').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const creatureEl = (el as HTMLElement).closest('.creature-item') as HTMLDivElement;
      const creatureId = creatureEl.dataset.creatureId!;
      handleCreatureAction('edit', creatureId);
    });
  });

  // Add click handlers for HP
  creatureList.querySelectorAll('.hp').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const creatureEl = (el as HTMLElement).closest('.creature-item') as HTMLDivElement;
      const creatureId = creatureEl.dataset.creatureId!;
      handleCreatureAction('hp', creatureId);
    });
  });

  // Add click handlers for status badges (to remove)
  creatureList.querySelectorAll('.status-badge').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const creatureEl = (el as HTMLElement).closest('.creature-item') as HTMLDivElement;
      const creatureId = creatureEl.dataset.creatureId!;
      const statusId = (el as HTMLElement).dataset.statusId!;
      const statusName = (el as HTMLElement).dataset.statusName!;
      showClearStatusModal(creatureId, statusId, statusName);
    });
  });
}

// Handle creature action buttons
async function handleCreatureAction(action: string, creatureId: string) {
  const creature = currentRoom?.state.creatures.find((c) => c.id === creatureId);
  if (!creature || !roomId) return;

  selectedCreatureId = creatureId;

  switch (action) {
    case 'hp':
      hpCreatureNameEl.textContent = creature.displayName || creature.name;
      hpCurrentValueEl.textContent = `${creature.currentHp}/${creature.maxHp}`;
      hpSetValueInput.value = String(creature.currentHp);
      hpChangeValueInput.value = '';
      showModal(hpModal);
      break;

    case 'status':
      statusCreatureNameEl.textContent = creature.displayName || creature.name;
      selectedStatusName = null;
      statusRoundsInput.value = '';
      renderStatusGrid();
      showModal(statusModal);
      break;

    case 'clone':
      cloneCreatureNameEl.textContent = creature.displayName || creature.name;
      cloneSuffixInput.value = '';
      showModal(cloneModal);
      break;

    case 'edit':
      editCreature(creature);
      break;
  }
}

// Show clear status confirmation modal
let clearStatusCreatureId: string | null = null;
let clearStatusId: string | null = null;

function showClearStatusModal(creatureId: string, statusId: string, statusName: string) {
  const creature = currentRoom?.state.creatures.find((c) => c.id === creatureId);
  if (!creature) return;

  clearStatusCreatureId = creatureId;
  clearStatusId = statusId;

  const clearStatusNameEl = document.getElementById('clear-status-name');
  const clearStatusCreatureEl = document.getElementById('clear-status-creature');

  if (clearStatusNameEl) clearStatusNameEl.textContent = statusName;
  if (clearStatusCreatureEl) clearStatusCreatureEl.textContent = creature.displayName || creature.name;

  const clearStatusModal = document.getElementById('clear-status-modal') as HTMLDivElement;
  showModal(clearStatusModal);
}

// Render status grid with condition options
function renderStatusGrid() {
  // Add condition statuses at the top
  const conditionStatuses = [
    { name: 'Unconscious', icon: '😵', color: '#6b7280', isCondition: true },
    { name: 'Dead', icon: '💀', color: '#374151', isCondition: true },
  ];

  const allStatuses = [...conditionStatuses, ...PREDEFINED_STATUSES.map(s => ({ ...s, isCondition: false }))];

  statusGrid.innerHTML = allStatuses.map(
    (status) => `
      <div class="status-option ${selectedStatusName === status.name ? 'selected' : ''} ${status.isCondition ? 'condition-status' : ''}"
           data-status-name="${status.name}"
           data-status-icon="${status.icon}"
           data-status-color="${status.color}"
           data-is-condition="${status.isCondition}">
        <span class="icon">${status.icon}</span>
        <span class="name">${status.name}</span>
      </div>
    `
  ).join('');

  statusGrid.querySelectorAll('.status-option').forEach((option) => {
    option.addEventListener('click', async () => {
      if (!roomId || !selectedCreatureId) return;

      const statusName = (option as HTMLDivElement).dataset.statusName!;
      const statusIcon = (option as HTMLDivElement).dataset.statusIcon!;
      const statusColor = (option as HTMLDivElement).dataset.statusColor!;
      const isCondition = (option as HTMLDivElement).dataset.isCondition === 'true';
      const hideRoundsCheckbox = document.getElementById('status-hide-rounds') as HTMLInputElement;
      const rounds = statusRoundsInput.value ? parseInt(statusRoundsInput.value) : null;
      const hideRounds = hideRoundsCheckbox?.checked || false;

      // Handle condition changes
      if (isCondition) {
        const newCondition = statusName === 'Unconscious' ? 'unconscious' : statusName === 'Dead' ? 'dead' : 'active';
        await sendCommand(roomId, {
          type: 'UPDATE_CREATURE',
          payload: { creatureId: selectedCreatureId, updates: { condition: newCondition as 'active' | 'unconscious' | 'dead' } },
          clientId,
        });
        hideModal(statusModal);
        return;
      }

      const status: Omit<StatusEffect, 'id'> = {
        name: statusName,
        icon: statusIcon,
        color: statusColor,
        roundsRemaining: rounds,
        hideRounds: hideRounds,
      };

      await sendCommand(roomId, {
        type: 'ADD_STATUS',
        payload: { creatureId: selectedCreatureId, status },
        clientId,
      });

      hideModal(statusModal);
    });
  });
}

// Edit creature
function editCreature(creature: Creature) {
  editingCreatureId = creature.id;
  creatureModalTitle.textContent = 'Edit Creature';

  // Fill form
  (document.getElementById('creature-name') as HTMLInputElement).value = creature.name;
  (document.getElementById('creature-icon') as HTMLSelectElement).value = creature.icon;
  (document.getElementById('creature-initiative') as HTMLInputElement).value = String(creature.initiative);
  (document.getElementById('creature-hp') as HTMLInputElement).value = String(creature.maxHp);
  (document.getElementById('creature-ac') as HTMLInputElement).value = String(creature.ac);
  (document.getElementById('creature-is-player') as HTMLInputElement).checked = creature.isPlayer;

  // Fill attacks
  attacksContainer.innerHTML = '';
  creature.attacks.forEach((attack) => {
    addAttackEntry(attack);
  });

  showModal(creatureModal);
}

// Add attack entry to form
function addAttackEntry(attack?: Attack) {
  const entry = document.createElement('div');
  entry.className = 'attack-entry';
  entry.innerHTML = `
    <div class="form-row">
      <div class="form-group">
        <label>Name</label>
        <input type="text" class="attack-name" value="${attack?.name || ''}" placeholder="Longsword">
      </div>
      <button type="button" class="attack-remove-btn">Remove</button>
    </div>
    <div class="form-row">
      <div class="form-group form-group-small">
        <label>To Hit</label>
        <input type="text" class="attack-bonus" value="${attack?.attackBonus || ''}" placeholder="+5">
      </div>
      <div class="form-group">
        <label>Damage</label>
        <input type="text" class="attack-damage" value="${attack?.damage || ''}" placeholder="1d8+3 slashing">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>Details</label>
        <input type="text" class="attack-details" value="${attack?.details || ''}" placeholder="Reach 5 ft.">
      </div>
    </div>
  `;

  entry.querySelector('.attack-remove-btn')?.addEventListener('click', () => {
    entry.remove();
  });

  attacksContainer.appendChild(entry);
}

// Save creature (add or update)
async function saveCreature() {
  if (!roomId) return;

  const name = (document.getElementById('creature-name') as HTMLInputElement).value.trim();
  const icon = (document.getElementById('creature-icon') as HTMLSelectElement).value;
  const initiative = parseInt((document.getElementById('creature-initiative') as HTMLInputElement).value);
  const hp = parseInt((document.getElementById('creature-hp') as HTMLInputElement).value);
  const ac = parseInt((document.getElementById('creature-ac') as HTMLInputElement).value);
  const isPlayer = (document.getElementById('creature-is-player') as HTMLInputElement).checked;

  // Gather attacks
  const attacks: Attack[] = [];
  attacksContainer.querySelectorAll('.attack-entry').forEach((entry) => {
    const attackName = (entry.querySelector('.attack-name') as HTMLInputElement).value.trim();
    if (attackName) {
      attacks.push({
        name: attackName,
        attackBonus: (entry.querySelector('.attack-bonus') as HTMLInputElement).value.trim(),
        damage: (entry.querySelector('.attack-damage') as HTMLInputElement).value.trim(),
        details: (entry.querySelector('.attack-details') as HTMLInputElement).value.trim(),
      });
    }
  });

  if (editingCreatureId) {
    // Update existing creature
    await sendCommand(roomId, {
      type: 'UPDATE_CREATURE',
      payload: {
        creatureId: editingCreatureId,
        updates: { name, displayName: name, icon, initiative, maxHp: hp, ac, isPlayer, attacks },
      },
      clientId,
    });
  } else {
    // Add new creature
    await sendCommand(roomId, {
      type: 'ADD_CREATURE',
      payload: {
        creature: {
          name,
          displayName: name,
          initiative,
          icon,
          maxHp: hp,
          currentHp: hp,
          ac,
          condition: 'active',
          statusEffects: [],
          attacks,
          isPlayer,
          groupId: null,
        },
      },
      clientId,
    });
  }

  hideModal(creatureModal);
}

// Modal helpers
function showModal(modal: HTMLDivElement) {
  modal.classList.remove('hidden');
}

function hideModal(modal: HTMLDivElement) {
  modal.classList.add('hidden');
}

// QR Scanner
async function startScanner() {
  try {
    scannerStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' },
    });
    scannerVideo.srcObject = scannerStream;
    await scannerVideo.play();
    scanFrame();
  } catch (error) {
    console.error('Failed to start scanner:', error);
  }
}

function stopScanner() {
  if (scannerAnimationId) {
    cancelAnimationFrame(scannerAnimationId);
    scannerAnimationId = null;
  }
  if (scannerStream) {
    scannerStream.getTracks().forEach((track) => track.stop());
    scannerStream = null;
  }
}

function scanFrame() {
  if (!scannerStream || !scannerVideo.videoWidth) {
    scannerAnimationId = requestAnimationFrame(scanFrame);
    return;
  }

  const canvas = document.createElement('canvas');
  canvas.width = scannerVideo.videoWidth;
  canvas.height = scannerVideo.videoHeight;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(scannerVideo, 0, 0);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

  const qrData = decodeQRCode(imageData);
  if (qrData) {
    const extractedRoomId = extractRoomIdFromUrl(qrData);
    if (extractedRoomId) {
      joinRoom(extractedRoomId);
      return;
    }
  }

  scannerAnimationId = requestAnimationFrame(scanFrame);
}

// Timer loop
function startTimerLoop() {
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = window.setInterval(() => {
    if (currentRoom) {
      updateTimers(currentRoom);
    }
  }, 100);
}

function updateTimers(room: Room) {
  const state = room.state;
  const now = Date.now();

  // Total time
  let totalMs = state.totalTimeMs;
  if (state.status === 'running' && state.roundStartTimeMs) {
    totalMs += now - state.roundStartTimeMs;
  }
  dmTotalTimeEl.textContent = formatTime(totalMs, true);

  // Round time
  let roundMs = 0;
  if (state.roundStartTimeMs && state.status === 'running') {
    roundMs = now - state.roundStartTimeMs;
  }
  dmRoundTimeEl.textContent = formatTime(roundMs);

  // Turn time
  let turnMs = 0;
  if (state.turnStartTimeMs && state.status === 'running') {
    turnMs = now - state.turnStartTimeMs;
  }
  dmTurnTimeEl.textContent = formatTime(turnMs);
}

function formatTime(ms: number, includeHours: boolean = false): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (includeHours) {
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

// Process AI scan
async function processAiScan(file: File) {
  const aiScanModal = document.getElementById('ai-scan-modal') as HTMLDivElement;
  const aiScanStatus = document.getElementById('ai-scan-status') as HTMLDivElement;
  const aiScanResults = document.getElementById('ai-scan-results') as HTMLDivElement;
  const aiScanMonstersContainer = document.getElementById('ai-scan-monsters') as HTMLDivElement;
  const aiScanError = document.getElementById('ai-scan-error') as HTMLDivElement;

  try {
    // Show status, hide results and error
    aiScanStatus.classList.remove('hidden');
    aiScanResults.classList.add('hidden');
    aiScanError.classList.add('hidden');

    const { base64, mimeType } = await imageToBase64(file);
    const result = await scanMonsterImage(base64, mimeType);

    // Hide status after scan
    aiScanStatus.classList.add('hidden');

    if (result.error) {
      aiScanError.textContent = result.error;
      aiScanError.classList.remove('hidden');
      return;
    }

    if (result.monsters.length === 0) {
      aiScanError.textContent = 'No monsters found in image. Try a clearer photo of a stat block.';
      aiScanError.classList.remove('hidden');
      return;
    }

    pendingScannedMonsters = result.monsters;

    // Render scanned monsters
    aiScanMonstersContainer.innerHTML = result.monsters
      .map((monster, index) => `
        <div class="scanned-monster" data-index="${index}">
          <span class="monster-icon">${monster.icon}</span>
          <div class="monster-info">
            <div class="monster-name">${monster.name}</div>
            <div class="monster-stats">
              <span class="hp">HP: ${monster.maxHp}</span>
              <span class="ac">AC: ${monster.ac}</span>
              ${monster.attacks.length > 0 ? `<span>${monster.attacks.length} attack(s)</span>` : ''}
            </div>
          </div>
          <button class="btn btn-primary btn-small add-scanned-btn" data-index="${index}">Add</button>
        </div>
      `)
      .join('');

    // Add button to add all
    if (result.monsters.length > 1) {
      aiScanMonstersContainer.innerHTML += `
        <button class="btn btn-primary add-all-scanned-btn" style="width: 100%; margin-top: 0.5rem;">Add All (${result.monsters.length})</button>
      `;
    }

    aiScanResults.classList.remove('hidden');

    // Add click handlers
    aiScanMonstersContainer.querySelectorAll('.add-scanned-btn').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const index = parseInt((btn as HTMLButtonElement).dataset.index!);
        await addScannedMonster(pendingScannedMonsters[index]);
        (btn as HTMLButtonElement).disabled = true;
        (btn as HTMLButtonElement).textContent = 'Added';
      });
    });

    aiScanMonstersContainer.querySelector('.add-all-scanned-btn')?.addEventListener('click', async () => {
      for (const monster of pendingScannedMonsters) {
        await addScannedMonster(monster);
      }
      hideModal(aiScanModal);
    });
  } catch (error) {
    console.error('AI scan error:', error);
    aiScanStatus.classList.add('hidden');
    aiScanError.textContent = error instanceof Error ? error.message : 'Unknown error occurred';
    aiScanError.classList.remove('hidden');
  }
}

// Add scanned monster to initiative
async function addScannedMonster(monster: ScannedMonster) {
  if (!roomId) return;

  await sendCommand(roomId, {
    type: 'ADD_CREATURE',
    payload: {
      creature: {
        name: monster.name,
        displayName: monster.name,
        initiative: monster.initiative || 0,
        icon: monster.icon,
        maxHp: monster.maxHp,
        currentHp: monster.maxHp,
        ac: monster.ac,
        condition: 'active',
        statusEffects: [],
        attacks: monster.attacks,
        isPlayer: false,
        groupId: null,
      },
    },
    clientId,
  });
}

// Start the app
init();
