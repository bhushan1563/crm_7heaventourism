// Single source of truth for the permission model. The API middleware, the rights screen, the Right model and the
// tests all read from here, so adding a module means editing one list.

export const RIGHT_FLAGS = ['canCreate', 'canRead', 'canUpdate', 'canDelete', 'canDownload', 'canEditOthers'];

export const RIGHT_MODULES = [
  'guest_list',
  'supplier_list',
  'quotations',
  'hotels',
  'itineraries',
  'confirmations',
  'users',
  'rights',
  'scanner',
  'reports'
];

const flagsFrom = (enabled = []) => Object.fromEntries(RIGHT_FLAGS.map((flag) => [flag, enabled.includes(flag)]));

// Team data that Sales and Ops maintain together (the hotel list and the itinerary library) works out of the box for them;
// everything else stays "everyone can read, nothing else" until an Admin grants more on the Rights screen.
const TEAM_EDITOR = ['canCreate', 'canRead', 'canUpdate', 'canEditOthers'];
const ROLE_DEFAULTS = {
  hotels: { Sales: TEAM_EDITOR, Ops: TEAM_EDITOR },
  itineraries: { Sales: [...TEAM_EDITOR, 'canDownload'], Ops: [...TEAM_EDITOR, 'canDownload'] },
  // Booking confirmations are cancelled, never deleted, so nobody but an Admin ever needs canDelete.
  confirmations: { Sales: [...TEAM_EDITOR, 'canDownload'], Ops: [...TEAM_EDITOR, 'canDownload'] }
};

/** Rights a role gets for a module when nothing has been stored for it. Never grants delete to anyone but Admin. */
export const defaultRightsFor = (role, moduleName) => flagsFrom(ROLE_DEFAULTS[moduleName]?.[role] ?? ['canRead']);

export const allRights = () => flagsFrom(RIGHT_FLAGS);

const FLAG_WORDS = { canRead: 'read', canCreate: 'create', canUpdate: 'update', canDelete: 'delete', canDownload: 'download', canEditOthers: 'edit others' };
export const RIGHT_ROLES = ['Admin', 'Sales', 'Ops', 'Viewer'];

/** What each role may do in each module when nothing has been stored on the Rights screen, as a markdown table (see docs/RIGHTS.md). */
export const defaultRightsTable = () => {
  const cell = (role, moduleName) => {
    if (role === 'Admin') return 'everything';
    const words = RIGHT_FLAGS.filter((flag) => defaultRightsFor(role, moduleName)[flag]).map((flag) => FLAG_WORDS[flag]);
    return words.join(', ') || 'nothing';
  };
  return [
    `| Module | ${RIGHT_ROLES.join(' | ')} |`,
    `|---|${RIGHT_ROLES.map(() => '---').join('|')}|`,
    ...RIGHT_MODULES.map((m) => `| \`${m}\` | ${RIGHT_ROLES.map((role) => cell(role, m)).join(' | ')} |`)
  ].join('\n');
};
