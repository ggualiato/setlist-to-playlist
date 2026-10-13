import type { MatchTracksRequest, TrackCandidate, TrackMatch } from '@setlist/shared';
import { mapWithConcurrency } from '../../lib/concurrency';
import { evaluateCandidates, type MatchEvaluation, type MatchTarget } from './matcher';

export interface TrackSearchPort {
  searchTracks(accessToken: string, query: string, limit?: number): Promise<TrackCandidate[]>;
}

export interface TrackMatchingOptions {
  /** Kept low: Development Mode apps have tight rate limits. */
  concurrency?: number;
}

const stripQuotes = (value: string): string => value.replace(/"/g, ' ').replace(/\s+/g, ' ').trim();

/** Most specific query first; later ones only run while no confident match has been found. */
export function buildQueries(target: MatchTarget): string[] {
  const title = stripQuotes(target.title);
  const artist = stripQuotes(target.artistName);
  const queries = [`track:"${title}" artist:"${artist}"`, `${title} ${artist}`];
  if (target.coverOf) queries.push(`track:"${title}" artist:"${stripQuotes(target.coverOf)}"`);
  return queries;
}

export class TrackMatchingService {
  private readonly concurrency: number;

  constructor(
    private readonly search: TrackSearchPort,
    options: TrackMatchingOptions = {},
  ) {
    this.concurrency = options.concurrency ?? 3;
  }

  matchSongs(accessToken: string, request: MatchTracksRequest): Promise<TrackMatch[]> {
    return mapWithConcurrency(request.songs, this.concurrency, async (song) => {
      const target: MatchTarget = {
        title: song.title,
        artistName: request.artistName,
        coverOf: song.coverOf,
        withArtist: song.withArtist,
      };
      return { position: song.position, ...(await this.matchOne(accessToken, target)) };
    });
  }

  searchTracks(accessToken: string, query: string): Promise<TrackCandidate[]> {
    return this.search.searchTracks(accessToken, query);
  }

  private async matchOne(accessToken: string, target: MatchTarget): Promise<MatchEvaluation> {
    const pool = new Map<string, TrackCandidate>();
    let evaluation = evaluateCandidates(target, []);

    for (const query of buildQueries(target)) {
      for (const candidate of await this.search.searchTracks(accessToken, query)) pool.set(candidate.uri, candidate);
      evaluation = evaluateCandidates(target, [...pool.values()]);
      if (evaluation.status === 'matched') break;
    }
    return evaluation;
  }
}
