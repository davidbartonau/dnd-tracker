// Creature status types
export type CreatureCondition = 'active' | 'unconscious' | 'dead';

// Status effect that can be applied to creatures
export interface StatusEffect {
  id: string;
  name: string;
  icon: string;
  color: string;
  roundsRemaining: number | null; // null = indefinite, must be manually removed
}

// Predefined status effects
export const PREDEFINED_STATUSES: Omit<StatusEffect, 'id' | 'roundsRemaining'>[] = [
  { name: 'Bleeding', icon: '🩸', color: '#dc2626' },
  { name: 'Poisoned', icon: '☠️', color: '#16a34a' },
  { name: 'Stunned', icon: '💫', color: '#eab308' },
  { name: 'Paralyzed', icon: '⚡', color: '#f97316' },
  { name: 'Frightened', icon: '😱', color: '#7c3aed' },
  { name: 'Blinded', icon: '🙈', color: '#1f2937' },
  { name: 'Deafened', icon: '🙉', color: '#6b7280' },
  { name: 'Prone', icon: '🔽', color: '#78716c' },
  { name: 'Restrained', icon: '⛓️', color: '#64748b' },
  { name: 'Grappled', icon: '🤝', color: '#ea580c' },
  { name: 'Charmed', icon: '💕', color: '#ec4899' },
  { name: 'Concentrating', icon: '🎯', color: '#3b82f6' },
  { name: 'Blessed', icon: '✨', color: '#fbbf24' },
  { name: 'Hexed', icon: '🔮', color: '#8b5cf6' },
  { name: 'Raging', icon: '😤', color: '#ef4444' },
  { name: 'Invisible', icon: '👻', color: '#a1a1aa' },
  { name: 'Hasted', icon: '⚡', color: '#22d3ee' },
  { name: 'Slowed', icon: '🐢', color: '#84cc16' },
  { name: 'On Fire', icon: '🔥', color: '#f97316' },
  { name: 'Frozen', icon: '🧊', color: '#06b6d4' },
];

// Attack information for creatures
export interface Attack {
  name: string;
  attackBonus: string;
  damage: string;
  details: string;
}

// Creature in the initiative order
export interface Creature {
  id: string;
  name: string;
  displayName: string; // e.g., "Kobold A" or custom suffix like "Dirty"
  initiative: number;
  icon: string;
  maxHp: number;
  currentHp: number;
  ac: number;
  condition: CreatureCondition;
  statusEffects: StatusEffect[];
  attacks: Attack[];
  sortOrder: number; // For manual ordering within same initiative
  isPlayer: boolean; // Players vs monsters (for display purposes)
  groupId: string | null; // Links cloned creatures together - null for standalone
}

// Room combat state
export type CombatStatus = 'setup' | 'running' | 'round_end' | 'paused';

export interface RoomState {
  status: CombatStatus;
  round: number;
  currentCreatureId: string | null;
  totalTimeMs: number; // Total combat time
  roundStartTimeMs: number | null; // When current round started
  turnStartTimeMs: number | null; // When current turn started
  creatures: Creature[];
}

export interface ControllerInfo {
  lastSeenAt: number | null;
  clientId: string | null;
}

export interface Room {
  createdAt: number;
  title: string;
  state: RoomState;
  controller: ControllerInfo;
}

// Command types for DM to Public communication
export type CommandType =
  | 'ADD_CREATURE'
  | 'UPDATE_CREATURE'
  | 'REMOVE_CREATURE'
  | 'CLONE_CREATURE'
  | 'REORDER_CREATURES'
  | 'START_COMBAT'
  | 'NEXT_TURN'
  | 'PREV_TURN'
  | 'PAUSE_COMBAT'
  | 'RESUME_COMBAT'
  | 'END_ROUND'
  | 'START_NEW_ROUND'
  | 'RESET_COMBAT'
  | 'UPDATE_HP'
  | 'ADD_STATUS'
  | 'REMOVE_STATUS';

export interface AddCreaturePayload {
  creature: Omit<Creature, 'id' | 'sortOrder'>;
}

export interface UpdateCreaturePayload {
  creatureId: string;
  updates: Partial<Creature>;
}

export interface RemoveCreaturePayload {
  creatureId: string;
}

export interface CloneCreaturePayload {
  creatureId: string;
  suffix?: string; // Optional custom suffix, otherwise auto-assigns A, B, C...
}

export interface ReorderCreaturesPayload {
  creatureId: string;
  newSortOrder: number;
}

export interface UpdateHpPayload {
  creatureId: string;
  newHp?: number; // Set to exact value
  hpChange?: number; // Positive = heal, negative = damage
}

export interface AddStatusPayload {
  creatureId: string;
  status: Omit<StatusEffect, 'id'>;
}

export interface RemoveStatusPayload {
  creatureId: string;
  statusId: string;
}

export type CommandPayload =
  | AddCreaturePayload
  | UpdateCreaturePayload
  | RemoveCreaturePayload
  | CloneCreaturePayload
  | ReorderCreaturesPayload
  | UpdateHpPayload
  | AddStatusPayload
  | RemoveStatusPayload
  | Record<string, never>;

export interface Command {
  type: CommandType;
  payload: CommandPayload;
  sentAtMs: number;
  clientId: string;
}

export interface CommandWithId extends Command {
  id: string;
}

// Default creature icons
export const DEFAULT_ICONS = [
  '🧙', '⚔️', '🛡️', '🗡️', '🏹', '🪄',
  '🐉', '🧟', '👹', '👻', '🦇', '🐺',
  '🧝', '🧛', '🤖', '💀', '🎭', '👤',
];

// Initial room state
export const INITIAL_ROOM_STATE: RoomState = {
  status: 'setup',
  round: 0,
  currentCreatureId: null,
  totalTimeMs: 0,
  roundStartTimeMs: null,
  turnStartTimeMs: null,
  creatures: [],
};

// Generate unique ID
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}
