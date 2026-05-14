import { beforeEach, describe, expect, it, vi } from 'vitest';

import { linkPreview } from '../../../../src/domain/linkPreview/impl/linkPreviewImpl.js';
import { registerLinkPreviewTransformers } from '../../../../src/domain/linkPreview/lib/linkPreviewTransformer.js';

vi.mock('../../../../src/domain/linkPreview/lib/linkPreviewTransformer.js', () => ({
  registerLinkPreviewTransformers: vi.fn(),
}));

describe('linkPreview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('registers link preview transformers through the facade', () => {
    const n2m = { setCustomTransformer: vi.fn() };

    linkPreview.registerTransformers(n2m as never);

    expect(registerLinkPreviewTransformers).toHaveBeenCalledWith(n2m);
  });
});
