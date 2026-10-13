import { parseSetlistUrl, type Setlist } from '@setlist/shared';
import { invalidRequest } from '../../errors';
import type { SetlistFmSetlist } from '../../integrations/setlistfm/schemas';
import { normalizeSetlist } from './normalize';

export interface RawSetlistProvider {
  getSetlist(setlistId: string): Promise<SetlistFmSetlist>;
}

export class SetlistService {
  constructor(private readonly provider: RawSetlistProvider) {}

  async importFromUrl(url: string): Promise<Setlist> {
    const parsed = parseSetlistUrl(url);
    if (!parsed.ok) throw invalidRequest(parsed.reason);
    return normalizeSetlist(await this.provider.getSetlist(parsed.setlistId));
  }
}
