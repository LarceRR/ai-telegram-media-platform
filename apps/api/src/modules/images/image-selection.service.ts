import { Injectable } from '@nestjs/common';
import { imageSelectionResultSchema, type ImageCandidate } from '@atmp/contracts';

@Injectable()
export class ImageSelectionService {
  select(candidates: ImageCandidate[]) {
    const valid = candidates
      .filter((candidate) => candidate.url.startsWith('https://') || candidate.url.startsWith('http://'))
      .filter((candidate) => !candidate.mimeType || candidate.mimeType.startsWith('image/'))
      .filter((candidate) => !candidate.width || candidate.width >= 160)
      .filter((candidate) => !candidate.height || candidate.height >= 160)
      .sort((a, b) => b.score - a.score);
    return imageSelectionResultSchema.parse({
      selectedSourceImageId: valid[0]?.sourceImageId ?? null,
      reason: valid.length ? 'BEST_VALID_CANDIDATE' : 'NO_VALID_CANDIDATE',
      candidateCount: valid.length,
    });
  }
}
