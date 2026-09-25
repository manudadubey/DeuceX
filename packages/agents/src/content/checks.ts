import { paragraphs, sentences, wordCount } from './text';

// PRD-05 C-10, C-11 and section 7: the four "Before it goes out" checks.
// Deterministic on purpose: they run on every edit in the editor (the same
// function, imported into apps/web) and again on the server before a publish,
// so a warn can never differ between what the player saw and what was
// recorded. A warn never blocks publishing (C-11); publishing over one records
// an override.

export type CheckKind = 'voice' | 'private' | 'coach' | 'opponent';
export const CHECK_KINDS: readonly CheckKind[] = ['voice', 'private', 'coach', 'opponent'];

export type PersonRole = 'coach' | 'physio' | 'doctor' | 'team' | 'family' | 'other';

export interface NamedPerson {
  name: string;
  role: PersonRole;
}

export interface UpdateCheck {
  kind: CheckKind;
  state: 'pass' | 'warn';
  title: string;
  reason: string;
  /** Whether Fix can change the text to clear this warn. */
  fixable: boolean;
}

export interface CheckContext {
  /** Bodies of the voice-profile examples (the best-opened past updates). */
  examples: readonly string[];
  /** Bodies of every published update, for the coach precedent ("past updates do not name them"). */
  pastUpdates: readonly string[];
  /** players.content_private_names. */
  privateNames: readonly string[];
  /** People the drafting call found in the note, with their role. */
  people: readonly NamedPerson[];
  opponent: string | null;
  /** Kinds the player has already applied Fix to, so the pass reason can say what changed. */
  fixedKinds?: readonly CheckKind[];
}

// ---------------------------------------------------------------------------
// Voice: "Sounds like you"
// ---------------------------------------------------------------------------

function exclamations(text: string): number {
  return (text.match(/!/g) ?? []).length;
}

export function averageSentenceWords(text: string): number {
  const s = sentences(text);
  if (s.length === 0) return 0;
  return s.reduce((sum, sentence) => sum + wordCount(sentence), 0) / s.length;
}

/** "short sentences, no exclamation marks" from the examples, for the Voice profile control. */
export function toneSummary(examples: readonly string[]): string {
  if (examples.length === 0) return 'no past updates yet';
  const joined = examples.join('\n\n');
  const avg = averageSentenceWords(joined);
  const length = avg <= 12 ? 'short sentences' : avg <= 20 ? 'medium sentences' : 'long sentences';
  const bangs = exclamations(joined) === 0 ? 'no exclamation marks' : 'the odd exclamation mark';
  return `direct, ${length}, ${bangs}`;
}

const FIRST_PERSON = /\b(I|I'm|I've|I'd|I'll|me|my|mine)\b/;

function voiceCheck(body: string, ctx: CheckContext): UpdateCheck {
  const title = 'Sounds like you';
  const exampleBangs = ctx.examples.reduce((n, e) => n + exclamations(e), 0);
  if (exclamations(body) > 0 && exampleBangs === 0) {
    return {
      kind: 'voice',
      state: 'warn',
      title: 'Exclamation marks',
      reason:
        ctx.examples.length > 0
          ? 'Your past updates never use them.'
          : 'Updates read as calmer without them.',
      fixable: true,
    };
  }
  if (body.trim() && !FIRST_PERSON.test(body)) {
    return {
      kind: 'voice',
      state: 'warn',
      title: 'Not in your voice',
      reason: 'It never says "I". Updates are written as you.',
      fixable: false,
    };
  }
  if (ctx.examples.length > 0) {
    const usual = averageSentenceWords(ctx.examples.join('\n\n'));
    const here = averageSentenceWords(body);
    if (usual > 0 && here > 0 && (here > usual * 1.6 || here < usual * 0.55)) {
      return {
        kind: 'voice',
        state: 'warn',
        title: 'Longer sentences than usual',
        reason: `About ${Math.round(here)} words a sentence against your usual ${Math.round(usual)}.`,
        fixable: false,
      };
    }
    const n = ctx.examples.length;
    return {
      kind: 'voice',
      state: 'pass',
      title,
      reason: `Close to your ${n === 1 ? 'best-opened update' : `${n} best-opened updates`} · ${toneSummary(ctx.examples).replace(/^direct, /, '')}`,
      fixable: false,
    };
  }
  return {
    kind: 'voice',
    state: 'pass',
    title,
    reason: 'First person, no exclamation marks. It learns your tone from your published updates.',
    fixable: false,
  };
}

// ---------------------------------------------------------------------------
// Private topics: "Nothing about money or injuries"
// ---------------------------------------------------------------------------

// Section 7: warn on any figure in a currency, on runway, reserves and burn,
// and on injury or treatment terms; generic phrases such as "a week of
// costs" pass because they carry no figure.
const MONEY_PATTERNS: RegExp[] = [
  /(?:A\$|US\$|NZ\$|C\$|[$€£¥])\s?\d[\d,.]*\s?k?\b/gi,
  /\b\d[\d,.]*\s?(?:k\s)?(?:dollars|euros|pounds|francs|AUD|USD|EUR|GBP|CHF|CNY|NZD|CAD)\b/gi,
  /\b(?:AUD|USD|EUR|GBP|CHF|CNY|NZD|CAD)\s?\d[\d,.]*/gi,
  /\brunway\b/gi,
  /\breserves?\b/gi,
  /\bburn(?:\s+rate)?\b(?!\s*(?:out|ing))/gi,
];

const INJURY_PATTERNS: RegExp[] = [
  /\binjur(?:y|ies|ed)\b/gi,
  /\bphysio(?:therapist)?s?\b/gi,
  /\b(?:strain|sprain)(?:ed|s)?\b/gi,
  /\btorn\b/gi,
  /\bten(?:don|dinitis|donitis)\w*\b/gi,
  /\b(?:MRI|ultrasound|x-ray|scan results)\b/gi,
  /\b(?:doctor|surgeon|surgery|cortisone|painkillers?|anti-inflammator\w*|strapping|fracture)\b/gi,
  /\btreatment\b/gi,
];

function privateMatches(text: string, ctx: CheckContext): string[] {
  const found: string[] = [];
  for (const pattern of [...MONEY_PATTERNS, ...INJURY_PATTERNS]) {
    for (const m of text.matchAll(pattern)) found.push(m[0].trim());
  }
  // Named practitioners count as injury detail (C-11: "injuries, treatments or practitioners").
  for (const person of ctx.people) {
    if (
      (person.role === 'physio' || person.role === 'doctor') &&
      nameRegex(person.name).test(text)
    ) {
      found.push(person.name);
    }
  }
  return [...new Set(found)];
}

function quoteList(items: readonly string[]): string {
  const quoted = items.slice(0, 3).map((i) => `"${i}"`);
  if (quoted.length === 1) return quoted[0]!;
  return `${quoted.slice(0, -1).join(', ')} and ${quoted[quoted.length - 1]}`;
}

function privateCheck(body: string, ctx: CheckContext): UpdateCheck {
  const found = privateMatches(body, ctx);
  if (found.length > 0) {
    return {
      kind: 'private',
      state: 'warn',
      title: 'Mentions money or an injury',
      reason: `${quoteList(found)} ${found.length === 1 ? 'is' : 'are'} usually kept private. Fix takes out the ${found.length === 1 ? 'sentence' : 'sentences'}.`,
      fixable: true,
    };
  }
  return {
    kind: 'private',
    state: 'pass',
    title: 'Nothing about money or injuries',
    reason: ctx.fixedKinds?.includes('private')
      ? 'Taken out, as you asked. Figures, runway and treatment stay private.'
      : 'No figures, runway, reserves or treatment in the draft.',
    fixable: false,
  };
}

// ---------------------------------------------------------------------------
// Coach unnamed
// ---------------------------------------------------------------------------

const TEAM_ROLES: readonly PersonRole[] = ['coach', 'physio', 'doctor', 'team'];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function nameRegex(name: string, flags = ''): RegExp {
  return new RegExp(
    `(?<![\\p{L}\\p{N}])${escapeRegExp(name.trim())}(?![\\p{L}\\p{N}])`,
    `u${flags}`,
  );
}

interface TeamName {
  name: string;
  role: PersonRole;
}

/** Names from the player's coach or team records that no past update has used. */
function teamNamesToKeepOut(ctx: CheckContext): TeamName[] {
  const byName = new Map<string, TeamName>();
  for (const name of ctx.privateNames) {
    if (name.trim().length > 1) byName.set(name.trim(), { name: name.trim(), role: 'coach' });
  }
  for (const p of ctx.people) {
    if (TEAM_ROLES.includes(p.role) && p.name.trim().length > 1) {
      byName.set(p.name.trim(), { name: p.name.trim(), role: p.role });
    }
  }
  return [...byName.values()].filter(
    (t) => !ctx.pastUpdates.some((past) => nameRegex(t.name).test(past)),
  );
}

function roleLabel(role: PersonRole): string {
  if (role === 'physio') return 'physio';
  if (role === 'doctor') return 'doctor';
  if (role === 'team') return 'team';
  return 'coach';
}

function coachCheck(body: string, ctx: CheckContext): UpdateCheck {
  const hits = teamNamesToKeepOut(ctx)
    .map((t) => ({ ...t, count: (body.match(nameRegex(t.name, 'g')) ?? []).length }))
    .filter((t) => t.count > 0);
  if (hits.length > 0) {
    const first = hits[0]!;
    const times = first.count === 1 ? 'once' : first.count === 2 ? 'twice' : `${first.count} times`;
    const precedent =
      ctx.pastUpdates.length > 0
        ? `You've kept your ${roleLabel(first.role)} unnamed in every past update.`
        : `Your team stays unnamed unless you choose otherwise.`;
    return {
      kind: 'coach',
      state: 'warn',
      title: first.role === 'coach' ? 'Names your coach' : `Names your ${roleLabel(first.role)}`,
      reason: `${precedent} "${first.name}" appears ${times}.`,
      fixable: true,
    };
  }
  return {
    kind: 'coach',
    state: 'pass',
    title: 'Coach unnamed',
    reason: ctx.fixedKinds?.includes('coach')
      ? `Changed to "my coach"${ctx.pastUpdates.length > 0 ? ', as in your past updates' : ''}.`
      : 'No one from your team is named.',
    fixable: false,
  };
}

// ---------------------------------------------------------------------------
// Opponent named respectfully
// ---------------------------------------------------------------------------

const COMMENTARY =
  /\b(?:his|her|their)\s+(?:serve|serving|forehand|backhand|game|attitude|behaviou?r|level|movement|tactics|temper)\b|\b(?:lucky|cheat\w*|arrogant|gamesmanship|rude|tank(?:ed|ing)?|chok(?:e|ed|ing)|overrated|terrible|awful|weak|poor)\b|didn'?t deserve/i;

function opponentTokens(opponent: string | null): string[] {
  if (!opponent?.trim()) return [];
  const parts = opponent.trim().split(/\s+/);
  return [...new Set([opponent.trim(), parts[parts.length - 1]!])].filter((t) => t.length > 1);
}

function opponentCommentary(body: string, opponent: string | null): string[] {
  const tokens = opponentTokens(opponent);
  if (tokens.length === 0) return [];
  return sentences(body).filter(
    (s) => tokens.some((t) => nameRegex(t).test(s)) && COMMENTARY.test(s),
  );
}

function opponentCheck(body: string, ctx: CheckContext): UpdateCheck {
  const title = 'Opponent named respectfully';
  if (!ctx.opponent) {
    return { kind: 'opponent', state: 'pass', title, reason: 'No opponent named.', fixable: false };
  }
  const flagged = opponentCommentary(body, ctx.opponent);
  if (flagged.length > 0) {
    return {
      kind: 'opponent',
      state: 'warn',
      title: 'Comments on your opponent',
      reason: `${flagged.length === 1 ? 'One sentence goes' : `${flagged.length} sentences go`} beyond the result. Fix takes ${flagged.length === 1 ? 'it' : 'them'} out.`,
      fixable: true,
    };
  }
  return {
    kind: 'opponent',
    state: 'pass',
    title,
    reason: 'Result stated, no commentary on their game.',
    fixable: false,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function runChecks(body: string, ctx: CheckContext): UpdateCheck[] {
  return [
    voiceCheck(body, ctx),
    privateCheck(body, ctx),
    coachCheck(body, ctx),
    opponentCheck(body, ctx),
  ];
}

export function warnKinds(checks: readonly UpdateCheck[]): CheckKind[] {
  return checks.filter((c) => c.state === 'warn').map((c) => c.kind);
}

/** Removes every sentence matching `drop`, keeping paragraph breaks. */
function removeSentences(body: string, drop: (sentence: string) => boolean): string {
  return paragraphs(body)
    .map((p) =>
      sentences(p)
        .filter((s) => !drop(s))
        .join(' '),
    )
    .filter(Boolean)
    .join('\n\n');
}

function capitaliseSentenceStarts(body: string): string {
  return body.replace(/(^|[.!?]\s+|\n\n)(my )/g, (_m, lead: string) => `${lead}My `);
}

/**
 * C-10's one-tap Fix: edits the text so the check passes. Returns the body
 * unchanged for a kind with nothing to fix.
 */
export function applyFix(kind: CheckKind, body: string, ctx: CheckContext): string {
  switch (kind) {
    case 'voice':
      return body.replace(/!+/g, '.').replace(/\.\./g, '.');
    case 'private': {
      const found = privateMatches(body, ctx);
      if (found.length === 0) return body;
      return removeSentences(body, (s) => found.some((f) => s.includes(f)));
    }
    case 'coach': {
      let next = body;
      for (const t of teamNamesToKeepOut(ctx)) {
        const phrase = `my ${roleLabel(t.role)}`;
        next = next
          .replace(nameRegex(`${t.name}'s`, 'g'), `${phrase}'s`)
          .replace(nameRegex(t.name, 'g'), phrase);
      }
      return capitaliseSentenceStarts(next);
    }
    case 'opponent': {
      const flagged = new Set(opponentCommentary(body, ctx.opponent));
      return flagged.size === 0 ? body : removeSentences(body, (s) => flagged.has(s));
    }
  }
}
