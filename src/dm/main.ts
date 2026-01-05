import { generateClientId } from '../lib/firebase.ts';
import { getRoom, subscribeToRoom, sendCommand, updateControllerInfo } from '../lib/firestore.ts';
import { decodeQRCode, extractRoomIdFromUrl } from '../lib/qr.ts';
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
let scannerStream: MediaStream | null = null;
let scannerAnimationId: number | null = null;
let selectedCreatureId: string | null = null;
let editingCreatureId: string | null = null;
let selectedStatusName: string | null = null;
let timerInterval: number | null = null;

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
    const suffix = cloneSuffixInput.value.trim() || undefined;
    await sendCommand(roomId, {
      type: 'CLONE_CREATURE',
      payload: { creatureId: selectedCreatureId, suffix },
      clientId,
    });
    hideModal(cloneModal);
  });

  // Modal backdrop clicks
  document.querySelectorAll('.modal-backdrop').forEach((backdrop) => {
    backdrop.addEventListener('click', () => {
      document.querySelectorAll('.modal').forEach((modal) => {
        hideModal(modal as HTMLDivElement);
      });
    });
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

// Render creature list
function renderCreatureList(creatures: Creature[], currentCreatureId: string | null) {
  creatureList.innerHTML = creatures
    .map((creature) => {
      const isCurrent = creature.id === currentCreatureId;
      const hpPercent = (creature.currentHp / creature.maxHp) * 100;
      const hpClass = hpPercent <= 25 ? 'critical' : hpPercent <= 50 ? 'damaged' : '';

      const statusIcons = creature.statusEffects
        .map((s) => `<span class="status-icon" title="${s.name}">${s.icon}</span>`)
        .join('');

      return `
        <div class="creature-item ${isCurrent ? 'current-turn' : ''} ${creature.isPlayer ? 'is-player' : ''} ${creature.condition}"
             data-creature-id="${creature.id}">
          <div class="initiative">${creature.initiative}</div>
          <div class="icon">${creature.icon}</div>
          <div class="details">
            <div class="name">${creature.displayName || creature.name}</div>
            <div class="stats">
              <span class="hp ${hpClass}">${creature.currentHp}/${creature.maxHp} HP</span>
              <span class="ac">${creature.ac} AC</span>
            </div>
            ${statusIcons ? `<div class="statuses">${statusIcons}</div>` : ''}
          </div>
          <div class="actions">
            <button class="action-btn" data-action="hp" title="Modify HP">❤️</button>
            <button class="action-btn" data-action="status" title="Add Status">✨</button>
            <button class="action-btn" data-action="clone" title="Clone">📋</button>
            <button class="action-btn" data-action="edit" title="Edit">✏️</button>
            <button class="action-btn" data-action="condition" title="Toggle Condition">💀</button>
          </div>
        </div>
      `;
    })
    .join('');

  // Add click handlers
  creatureList.querySelectorAll('.action-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const action = (btn as HTMLButtonElement).dataset.action;
      const creatureEl = btn.closest('.creature-item') as HTMLDivElement;
      const creatureId = creatureEl.dataset.creatureId!;
      handleCreatureAction(action!, creatureId);
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

    case 'condition':
      const conditions: Array<'active' | 'unconscious' | 'dead'> = ['active', 'unconscious', 'dead'];
      const currentIndex = conditions.indexOf(creature.condition);
      const nextCondition = conditions[(currentIndex + 1) % conditions.length];
      await sendCommand(roomId, {
        type: 'UPDATE_CREATURE',
        payload: { creatureId, updates: { condition: nextCondition } },
        clientId,
      });
      break;
  }
}

// Render status grid
function renderStatusGrid() {
  statusGrid.innerHTML = PREDEFINED_STATUSES.map(
    (status) => `
      <div class="status-option ${selectedStatusName === status.name ? 'selected' : ''}"
           data-status-name="${status.name}"
           data-status-icon="${status.icon}"
           data-status-color="${status.color}">
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
      const rounds = statusRoundsInput.value ? parseInt(statusRoundsInput.value) : null;

      const status: Omit<StatusEffect, 'id'> = {
        name: statusName,
        icon: statusIcon,
        color: statusColor,
        roundsRemaining: rounds,
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

// Start the app
init();
