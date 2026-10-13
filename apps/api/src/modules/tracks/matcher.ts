import type { MatchStatus, TrackCandidate } from '@setlist/shared';

/**
 * Pure track-matching logic. Spotify no longer returns `popularity` in Development Mode, so ranking
 * relies only on text similarity of title/artist plus penalties for obviously-wrong versions.
 */

export interface MatchTarget {
  title: string;
  artistName: string;
  coverOf: string | null;
  withArtist: string | null;
}

export interface ScoredCandidate {
  candidate: TrackCandidate;
  score: number;
  titleScore: number;
  artistScore: number;
  /** Penalty applied for karaoke/tribute-style results. */
  strongPenalty: boolean;
}

export interface MatchEvaluation {
  status: MatchStatus;
  score: number;
  selected: TrackCandidate | null;
  candidates: TrackCandidate[];
}

const MAX_CANDIDATES = 5;
const MATCHED = { title: 0.9, artist: 0.8, total: 0.85 } as const;
const UNCERTAIN = { title: 0.6, total: 0.5 } as const;
const CANDIDATE_MIN_TITLE_SCORE = 0.4;

const NOISE_WORDS =
  /\b(live|remaster(?:ed)?|mono|stereo|version|edit|mix|deluxe|bonus|demo|feat|ft|featuring|with|explicit|from|\d{4})\b/;
const STRONG_PENALTY_WORDS = /\b(karaoke|tribute|instrumental|made famous|originally performed|lullaby|8 bit)\b/;
const MILD_PENALTY_WORDS = /\b(live|remix|acoustic|demo|sped up|slowed|reverb)\b/g;

const stripDiacritics = (value: string): string => value.normalize('NFKD').replace(/\p{M}/gu, '');

/** Lower-cases and strips version noise like "(Live)", "- 2011 Remaster", "feat. X" and punctuation. */
export function normalizeTitle(raw: string): string {
  let s = stripDiacritics(raw).toLowerCase();
  s = s.replace(/[([][^)\]]*[)\]]/g, (group) => (NOISE_WORDS.test(group) ? ' ' : group));
  s = s.replace(/\s-\s(.*)$/, (whole: string, rest: string) => (NOISE_WORDS.test(rest) ? '' : whole));
  s = s.replace(/\b(?:feat|ft|featuring)\b\.?.*$/, '');
  s = s.replace(/&/g, ' and ').replace(/['’`]/g, '');
  return s.replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

export function normalizeArtist(raw: string): string {
  const s = stripDiacritics(raw).toLowerCase().replace(/&/g, ' and ').replace(/['’`]/g, '');
  return s
    .replace(/^the\s+/, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min((current[j - 1] ?? 0) + 1, (previous[j] ?? 0) + 1, (previous[j - 1] ?? 0) + cost);
    }
    previous = current;
  }
  return previous[b.length] ?? 0;
}

/** 1 for identical strings, down to 0 for completely different ones. */
export function similarity(a: string, b: string): number {
  const longest = Math.max(a.length, b.length);
  if (longest === 0) return 0;
  return 1 - levenshtein(a, b) / longest;
}

function artistScore(target: MatchTarget, candidate: TrackCandidate): number {
  // Performing artist counts fully; cover original / guest slightly less.
  const wanted: Array<[string, number]> = [[normalizeArtist(target.artistName), 1]];
  if (target.coverOf) wanted.push([normalizeArtist(target.coverOf), 0.9]);
  if (target.withArtist) wanted.push([normalizeArtist(target.withArtist), 0.9]);

  let best = 0;
  for (const name of candidate.artists) {
    const normalized = normalizeArtist(name);
    for (const [wantedName, weight] of wanted) best = Math.max(best, similarity(normalized, wantedName) * weight);
  }
  return best;
}

function versionPenalty(target: MatchTarget, candidate: TrackCandidate): { penalty: number; strong: boolean } {
  const haystack = stripDiacritics(`${candidate.name} ${candidate.album}`).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ');
  const wanted = stripDiacritics(target.title).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ');

  if (STRONG_PENALTY_WORDS.test(haystack) && !STRONG_PENALTY_WORDS.test(wanted)) return { penalty: 0.4, strong: true };

  const found = new Set(haystack.match(MILD_PENALTY_WORDS) ?? []);
  const unwanted = [...found].filter((word) => !wanted.includes(word));
  return { penalty: unwanted.length > 0 ? 0.08 : 0, strong: false };
}

export function scoreCandidate(target: MatchTarget, candidate: TrackCandidate): ScoredCandidate {
  const titleScore = similarity(normalizeTitle(target.title), normalizeTitle(candidate.name));
  const artist = artistScore(target, candidate);
  const { penalty, strong } = versionPenalty(target, candidate);
  const albumAdjustment = candidate.albumType === 'album' ? 0.02 : candidate.albumType === 'compilation' ? -0.02 : 0;
  const raw = 0.7 * titleScore + 0.3 * artist + albumAdjustment - penalty;
  return {
    candidate,
    score: Math.round(Math.min(1, Math.max(0, raw)) * 100) / 100,
    titleScore,
    artistScore: artist,
    strongPenalty: strong,
  };
}

/** Ranks candidates best-first; ties keep Spotify's own ordering. */
export function rankCandidates(target: MatchTarget, candidates: readonly TrackCandidate[]): ScoredCandidate[] {
  return candidates
    .map((candidate, index) => ({ scored: scoreCandidate(target, candidate), index }))
    .sort((a, b) => b.scored.score - a.scored.score || a.index - b.index)
    .map(({ scored }) => scored);
}

export function evaluateCandidates(target: MatchTarget, candidates: readonly TrackCandidate[]): MatchEvaluation {
  const ranked = rankCandidates(target, candidates);
  const best = ranked[0];
  const alternatives = ranked
    .filter((r) => r.titleScore >= CANDIDATE_MIN_TITLE_SCORE)
    .slice(0, MAX_CANDIDATES)
    .map((r) => r.candidate);

  if (!best) return { status: 'not_found', score: 0, selected: null, candidates: [] };

  if (
    best.titleScore >= MATCHED.title &&
    best.artistScore >= MATCHED.artist &&
    best.score >= MATCHED.total &&
    !best.strongPenalty
  ) {
    return { status: 'matched', score: best.score, selected: best.candidate, candidates: alternatives };
  }
  if (best.titleScore >= UNCERTAIN.title && best.score >= UNCERTAIN.total) {
    return { status: 'uncertain', score: best.score, selected: best.candidate, candidates: alternatives };
  }
  return { status: 'not_found', score: best.score, selected: null, candidates: alternatives };
}
