import { beforeEach, describe, expect, it, vi } from 'vitest';

import { linkPreview } from '../../../../src/domain/linkPreview/impl/linkPreviewImpl.js';
import { linkPreviewTransformer } from '../../../../src/domain/linkPreview/impl/linkPreviewTransformerImpl.js';

vi.mock('../../../../src/domain/linkPreview/impl/linkPreviewTransformerImpl.js', () => ({
  linkPreviewTransformer: {
    registerTransformers: vi.fn(),
  },
}));

describe('linkPreview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('registers link preview transformers through the facade', () => {
    const n2m = { setCustomTransformer: vi.fn() };

    linkPreview.registerTransformers(n2m as never);

    expect(linkPreviewTransformer.registerTransformers).toHaveBeenCalledWith(n2m);
  });
});
