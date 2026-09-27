import { afterEach, describe, expect, it, vi } from 'vitest';
import { downscaleImage } from './downscale-image';

describe('downscaleImage', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('sends the original when the browser cannot decode images here', async () => {
    vi.stubGlobal('createImageBitmap', undefined);
    const file = new Blob(['photo'], { type: 'image/heic' });
    expect(await downscaleImage(file)).toBe(file);
  });

  it('sends the original when decoding fails', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn().mockRejectedValue(new Error('unsupported')));
    const file = new Blob(['photo'], { type: 'image/heic' });
    expect(await downscaleImage(file)).toBe(file);
  });

  it('leaves a JPEG that is already small enough alone', async () => {
    const close = vi.fn();
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn().mockResolvedValue({ width: 1200, height: 1600, close }),
    );
    const file = new Blob(['photo'], { type: 'image/jpeg' });
    expect(await downscaleImage(file)).toBe(file);
    expect(close).toHaveBeenCalled();
  });
});
