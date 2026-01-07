import { generateRoomId } from '../lib/firebase.ts';
import { createRoom, subscribeToRoom, subscribeToCommands, deleteCommand, updateRoomState, updateCreatures } from '../lib/firestore.ts';
import { generateQRCode, buildDmUrl } from '../lib/qr.ts';
import {
  Room,
  RoomState,
  Creature,
  CommandWithId,
  AddCreaturePayload,
  UpdateCreaturePayload,
  RemoveCreaturePayload,
  CloneCreaturePayload,
  ReorderCreaturesPayload,
  UpdateHpPayload,
  AddStatusPayload,
  RemoveStatusPayload,
  generateId,
} from '../lib/types.ts';

// App state
let roomId: string | null = null;
let currentRoom: Room | null = null;
let timerInterval: number | null = null;

// DOM Elements
const loadingScreen = document.getElementById('loading') as HTMLDivElement;
const roomScreen = document.getElementById('room-screen') as HTMLDivElement;
const combatScreen = document.getElementById('combat-screen') as HTMLDivElement;
const qrCodeEl = document.getElementById('qr-code') as HTMLDivElement;
const roomIdEl = document.getElementById('room-id') as HTMLElement;
const headerRoomIdEl = document.getElementById('header-room-id') as HTMLElement;
const initiativeList = document.getElementById('initiative-list') as HTMLDivElement;
const roundEndOverlay = document.getElementById('round-end-overlay') as HTMLDivElement;
const endedRoundEl = document.getElementById('ended-round') as HTMLElement;

// Timer elements
const totalTimeEl = document.getElementById('total-time') as HTMLElement;
const roundTimeEl = document.getElementById('round-time') as HTMLElement;
const turnTimeEl = document.getElementById('turn-time') as HTMLElement;
const roundNumberEl = document.getElementById('round-number') as HTMLElement;

// Initialize app
async function init() {
  try {
    // Create a new room
    roomId = generateRoomId();
    await createRoom(roomId);

    // Display QR code
    const dmUrl = buildDmUrl(roomId);
    const qrDataUrl = await generateQRCode(dmUrl);
    qrCodeEl.innerHTML = `<img src="${qrDataUrl}" alt="QR Code">`;
    roomIdEl.textContent = roomId;
    headerRoomIdEl.textContent = roomId;

    // Subscribe to room updates
    subscribeToRoom(roomId, handleRoomUpdate, (error) => {
      console.error('Room subscription error:', error);
    });

    // Subscribe to commands
    subscribeToCommands(roomId, handleCommands, (error) => {
      console.error('Commands subscription error:', error);
    });

    // Show room screen
    showScreen('room');
  } catch (error) {
    console.error('Failed to initialize:', error);
    loadingScreen.innerHTML = '<p>Failed to initialize. Please refresh.</p>';
  }
}

// Show a specific screen
function showScreen(screen: 'loading' | 'room' | 'combat') {
  loadingScreen.classList.remove('active');
  roomScreen.classList.remove('active');
  combatScreen.classList.remove('active');

  switch (screen) {
    case 'loading':
      loadingScreen.classList.add('active');
      break;
    case 'room':
      roomScreen.classList.add('active');
      break;
    case 'combat':
      combatScreen.classList.add('active');
      break;
  }
}

// Handle room updates
function handleRoomUpdate(room: Room | null) {
  if (!room) {
    console.log('Room not found');
    return;
  }

  currentRoom = room;

  // Switch to combat screen if there are creatures
  if (room.state.creatures.length > 0) {
    showScreen('combat');
  }

  // Start or stop timer based on combat status
  if (room.state.status === 'running') {
    startTimerLoop();
  } else {
    stopTimerLoop();
  }

  // Update UI
  renderInitiativeList(room.state);
  updateTimers(room.state);
  updateRoundEndOverlay(room.state);
}

// Handle incoming commands
async function handleCommands(commands: CommandWithId[]) {
  if (!roomId || !currentRoom) return;

  for (const cmd of commands) {
    try {
      await processCommand(cmd);
      await deleteCommand(roomId, cmd.id);
    } catch (error) {
      console.error('Failed to process command:', cmd, error);
    }
  }
}

// Process a single command
async function processCommand(cmd: CommandWithId) {
  if (!roomId || !currentRoom) return;

  const state = { ...currentRoom.state };
  let creatures = [...state.creatures];

  switch (cmd.type) {
    case 'ADD_CREATURE': {
      const payload = cmd.payload as AddCreaturePayload;
      const newCreature: Creature = {
        ...payload.creature,
        id: generateId(),
        sortOrder: creatures.length,
      };
      creatures.push(newCreature);
      creatures = sortCreatures(creatures);
      await updateCreatures(roomId, creatures);
      break;
    }

    case 'UPDATE_CREATURE': {
      const payload = cmd.payload as UpdateCreaturePayload;
      creatures = creatures.map((c) =>
        c.id === payload.creatureId ? { ...c, ...payload.updates } : c
      );
      creatures = sortCreatures(creatures);
      await updateCreatures(roomId, creatures);
      break;
    }

    case 'REMOVE_CREATURE': {
      const payload = cmd.payload as RemoveCreaturePayload;
      creatures = creatures.filter((c) => c.id !== payload.creatureId);
      await updateCreatures(roomId, creatures);
      break;
    }

    case 'CLONE_CREATURE': {
      const payload = cmd.payload as CloneCreaturePayload;
      const original = creatures.find((c) => c.id === payload.creatureId);
      if (original) {
        // Create or use existing groupId to link cloned creatures
        const groupId = original.groupId || generateId();

        // Update original with groupId if it didn't have one
        if (!original.groupId) {
          original.groupId = groupId;
          // Update display name for original if it doesn't have a suffix yet
          const existingClones = creatures.filter(
            (c) => c.name === original.name && c.id !== original.id
          );
          if (existingClones.length === 0 && !original.displayName?.includes(' ')) {
            original.displayName = `${original.name} A`;
          }
        }

        // Count existing clones to determine suffix
        const cloneCount = creatures.filter(
          (c) => c.groupId === groupId || c.name === original.name
        ).length;
        const suffix = payload.suffix || String.fromCharCode(64 + cloneCount); // A, B, C...

        const clone: Creature = {
          ...original,
          id: generateId(),
          groupId: groupId,
          displayName: `${original.name} ${suffix}`,
          currentHp: original.maxHp,
          condition: 'active',
          statusEffects: [],
          sortOrder: creatures.length,
        };
        creatures.push(clone);
        creatures = sortCreatures(creatures);
        await updateCreatures(roomId, creatures);
      }
      break;
    }

    case 'REORDER_CREATURES': {
      const payload = cmd.payload as ReorderCreaturesPayload;
      const creature = creatures.find((c) => c.id === payload.creatureId);
      if (creature) {
        creature.sortOrder = payload.newSortOrder;
        creatures = sortCreatures(creatures);
        await updateCreatures(roomId, creatures);
      }
      break;
    }

    case 'START_COMBAT': {
      if (creatures.length > 0) {
        const firstCreature = getNextActiveCreature(creatures, -1);
        await updateRoomState(roomId, {
          status: 'running',
          round: 1,
          currentCreatureId: firstCreature?.id || null,
          totalTimeMs: 0,
          roundStartTimeMs: Date.now(),
          turnStartTimeMs: Date.now(),
        });
        startTimerLoop();
      }
      break;
    }

    case 'NEXT_TURN': {
      const currentIndex = creatures.findIndex((c) => c.id === state.currentCreatureId);
      const nextCreature = getNextActiveCreature(creatures, currentIndex);

      if (nextCreature) {
        // Check if we've wrapped around to the start
        const nextIndex = creatures.findIndex((c) => c.id === nextCreature.id);
        const isNewRound = nextIndex <= currentIndex;

        if (isNewRound) {
          // End of round - decrement status effect rounds
          creatures = decrementStatusRounds(creatures);
          await updateCreatures(roomId, creatures);
          await updateRoomState(roomId, {
            status: 'round_end',
          });
        } else {
          await updateRoomState(roomId, {
            currentCreatureId: nextCreature.id,
            turnStartTimeMs: Date.now(),
          });
        }
      }
      break;
    }

    case 'PREV_TURN': {
      const currentIndex = creatures.findIndex((c) => c.id === state.currentCreatureId);
      const prevCreature = getPrevActiveCreature(creatures, currentIndex);

      if (prevCreature) {
        await updateRoomState(roomId, {
          currentCreatureId: prevCreature.id,
          turnStartTimeMs: Date.now(),
        });
      }
      break;
    }

    case 'PAUSE_COMBAT': {
      stopTimerLoop();
      await updateRoomState(roomId, {
        status: 'paused',
        totalTimeMs: calculateTotalTime(state),
      });
      break;
    }

    case 'RESUME_COMBAT': {
      await updateRoomState(roomId, {
        status: 'running',
        roundStartTimeMs: Date.now() - (state.roundStartTimeMs ? Date.now() - state.roundStartTimeMs : 0),
        turnStartTimeMs: Date.now() - (state.turnStartTimeMs ? Date.now() - state.turnStartTimeMs : 0),
      });
      startTimerLoop();
      break;
    }

    case 'END_ROUND': {
      // Status effects already decremented in NEXT_TURN
      await updateRoomState(roomId, {
        status: 'round_end',
      });
      break;
    }

    case 'START_NEW_ROUND': {
      const firstCreature = getNextActiveCreature(creatures, -1);
      await updateRoomState(roomId, {
        status: 'running',
        round: state.round + 1,
        currentCreatureId: firstCreature?.id || null,
        roundStartTimeMs: Date.now(),
        turnStartTimeMs: Date.now(),
      });
      break;
    }

    case 'RESET_COMBAT': {
      stopTimerLoop();
      await updateRoomState(roomId, {
        status: 'setup',
        round: 0,
        currentCreatureId: null,
        totalTimeMs: 0,
        roundStartTimeMs: null,
        turnStartTimeMs: null,
      });
      break;
    }

    case 'UPDATE_HP': {
      const payload = cmd.payload as UpdateHpPayload;
      creatures = creatures.map((c) => {
        if (c.id !== payload.creatureId) return c;

        let newHp = c.currentHp;
        if (payload.newHp !== undefined) {
          newHp = payload.newHp;
        } else if (payload.hpChange !== undefined) {
          newHp = c.currentHp + payload.hpChange;
        }

        newHp = Math.max(0, Math.min(newHp, c.maxHp));

        // Auto-set unconscious at 0 HP
        let condition = c.condition;
        if (newHp === 0 && c.condition === 'active') {
          condition = 'unconscious';
        } else if (newHp > 0 && c.condition === 'unconscious') {
          condition = 'active';
        }

        return { ...c, currentHp: newHp, condition };
      });
      await updateCreatures(roomId, creatures);
      break;
    }

    case 'ADD_STATUS': {
      const payload = cmd.payload as AddStatusPayload;
      creatures = creatures.map((c) => {
        if (c.id !== payload.creatureId) return c;
        return {
          ...c,
          statusEffects: [
            ...c.statusEffects,
            { ...payload.status, id: generateId() },
          ],
        };
      });
      await updateCreatures(roomId, creatures);
      break;
    }

    case 'REMOVE_STATUS': {
      const payload = cmd.payload as RemoveStatusPayload;
      creatures = creatures.map((c) => {
        if (c.id !== payload.creatureId) return c;
        return {
          ...c,
          statusEffects: c.statusEffects.filter((s) => s.id !== payload.statusId),
        };
      });
      await updateCreatures(roomId, creatures);
      break;
    }
  }
}

// Sort creatures by initiative (descending) and then by sort order
function sortCreatures(creatures: Creature[]): Creature[] {
  return [...creatures].sort((a, b) => {
    if (b.initiative !== a.initiative) {
      return b.initiative - a.initiative;
    }
    return a.sortOrder - b.sortOrder;
  });
}

// Get next active creature (skipping unconscious/dead)
function getNextActiveCreature(creatures: Creature[], currentIndex: number): Creature | null {
  const activeCreatures = creatures.filter((c) => c.condition === 'active');
  if (activeCreatures.length === 0) return null;

  for (let i = 1; i <= creatures.length; i++) {
    const index = (currentIndex + i) % creatures.length;
    const creature = creatures[index];
    if (creature.condition === 'active') {
      return creature;
    }
  }
  return null;
}

// Get previous active creature
function getPrevActiveCreature(creatures: Creature[], currentIndex: number): Creature | null {
  for (let i = 1; i <= creatures.length; i++) {
    const index = (currentIndex - i + creatures.length) % creatures.length;
    const creature = creatures[index];
    if (creature.condition === 'active') {
      return creature;
    }
  }
  return null;
}

// Decrement status effect rounds at end of round
function decrementStatusRounds(creatures: Creature[]): Creature[] {
  return creatures.map((c) => ({
    ...c,
    statusEffects: c.statusEffects
      .map((s) => ({
        ...s,
        roundsRemaining: s.roundsRemaining !== null ? s.roundsRemaining - 1 : null,
      }))
      .filter((s) => s.roundsRemaining === null || s.roundsRemaining > 0),
  }));
}

// Calculate total combat time
function calculateTotalTime(state: RoomState): number {
  if (state.status !== 'running' || !state.roundStartTimeMs) {
    return state.totalTimeMs;
  }
  return state.totalTimeMs + (Date.now() - state.roundStartTimeMs);
}

// Timer loop
function startTimerLoop() {
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = window.setInterval(() => {
    if (currentRoom) {
      updateTimers(currentRoom.state);
    }
  }, 100);
}

function stopTimerLoop() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

// Update timer displays
function updateTimers(state: RoomState) {
  const now = Date.now();

  // Total time
  let totalMs = state.totalTimeMs;
  if (state.status === 'running' && state.roundStartTimeMs) {
    totalMs += now - state.roundStartTimeMs;
  }
  totalTimeEl.textContent = formatTime(totalMs, true);

  // Round time
  let roundMs = 0;
  if (state.roundStartTimeMs && state.status === 'running') {
    roundMs = now - state.roundStartTimeMs;
  }
  roundTimeEl.textContent = formatTime(roundMs);
  roundNumberEl.textContent = String(state.round);

  // Turn time
  let turnMs = 0;
  if (state.turnStartTimeMs && state.status === 'running') {
    turnMs = now - state.turnStartTimeMs;
  }
  turnTimeEl.textContent = formatTime(turnMs);
}

// Format milliseconds to time string
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

// Generate consistent color from groupId
function getGroupColor(groupId: string): string {
  let hash = 0;
  for (let i = 0; i < groupId.length; i++) {
    hash = groupId.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 60%, 50%)`;
}

// Render initiative list
function renderInitiativeList(state: RoomState) {
  const creatures = state.creatures;

  // Group creatures by groupId for visual linking
  const groupedCreatures = creatures.reduce((acc, creature) => {
    if (creature.groupId) {
      acc[creature.groupId] = (acc[creature.groupId] || 0) + 1;
    }
    return acc;
  }, {} as Record<string, number>);

  initiativeList.innerHTML = creatures
    .map((creature) => {
      const isCurrent = creature.id === state.currentCreatureId;
      const hpPercent = (creature.currentHp / creature.maxHp) * 100;
      const hpClass = hpPercent <= 25 ? 'critical' : hpPercent <= 50 ? 'damaged' : '';
      const hasGroup = creature.groupId && groupedCreatures[creature.groupId] > 1;
      const groupColor = hasGroup ? getGroupColor(creature.groupId!) : '';

      const statusBadges = creature.statusEffects
        .map(
          (s) => `
          <span class="status-badge" style="border-color: ${s.color}">
            <span class="status-icon">${s.icon}</span>
            <span class="status-name">${s.name}</span>
            ${s.roundsRemaining !== null ? `<span class="status-rounds">${s.roundsRemaining}</span>` : ''}
          </span>
        `
        )
        .join('');

      const attackBadges = creature.attacks
        .map(
          (a) => `
          <span class="attack-badge">
            ${a.name}
            <span class="attack-tooltip">
              <div><strong>${a.name}</strong></div>
              <div>+${a.attackBonus} to hit</div>
              <div>${a.damage} damage</div>
              ${a.details ? `<div>${a.details}</div>` : ''}
            </span>
          </span>
        `
        )
        .join('');

      return `
        <div class="creature-card ${isCurrent ? 'current-turn' : ''} ${creature.isPlayer ? 'is-player' : ''} ${creature.condition} ${hasGroup ? 'has-group' : ''}"
             ${hasGroup ? `style="--group-color: ${groupColor}"` : ''}>
          <div class="creature-initiative">${creature.initiative}</div>
          <div class="creature-icon">${creature.icon}</div>
          <div class="creature-info">
            <div class="creature-name">${creature.displayName || creature.name}</div>
            ${creature.displayName && creature.displayName !== creature.name ? `<div class="creature-display-name">${creature.name}</div>` : ''}
            <div class="creature-stats">
              <div class="stat hp-stat ${hpClass}">
                <span class="stat-label">HP</span>
                <span class="stat-value">${creature.currentHp}/${creature.maxHp}</span>
              </div>
              <div class="stat ac-stat">
                <span class="stat-label">AC</span>
                <span class="stat-value">${creature.ac}</span>
              </div>
            </div>
            ${statusBadges ? `<div class="creature-statuses">${statusBadges}</div>` : ''}
            ${attackBadges ? `<div class="creature-attacks">${attackBadges}</div>` : ''}
          </div>
        </div>
      `;
    })
    .join('');
}

// Update round end overlay
function updateRoundEndOverlay(state: RoomState) {
  if (state.status === 'round_end') {
    endedRoundEl.textContent = String(state.round);
    roundEndOverlay.classList.remove('hidden');
  } else {
    roundEndOverlay.classList.add('hidden');
  }
}

// Start the app
init();
