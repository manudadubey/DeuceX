// Shrinks a phone photo before it is uploaded for reading (menus, receipts).
// The vision model already scales every image to 768 pixels on its short
// side before counting tokens, so 1600 on the long side reads the same and
// costs the same, but a 3 to 5 MB photo becomes a few hundred KB: the
// difference on a tournament hotel's wifi. Any browser that can't decode the
// file here (HEIC on some desktops, an old WebView) just sends the original.
const MAX_EDGE = 1600;
const JPEG_QUALITY = 0.85;

export async function downscaleImage(file: Blob): Promise<Blob> {
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.type === 'image/jpeg') {
      bitmap.close();
      return file;
    }
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext('2d');
    if (!context) {
      bitmap.close();
      return file;
    }
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY),
    );
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file;
  }
}
