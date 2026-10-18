import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import type { PhotoIO } from './photo';

const PHOTO_DIR = 'photos';

function toUri(pathOrUri: string): string {
  return pathOrUri.startsWith('file://') ? pathOrUri : `file://${pathOrUri}`;
}

/** Implementasi PhotoIO dengan expo-image-manipulator + expo-file-system (folder dokumen privat). */
export const expoPhotoIO: PhotoIO = {
  async encode(sourceUri, maxEdge, quality) {
    const source = toUri(sourceUri);
    const original = await ImageManipulator.manipulate(source).renderAsync();
    const { width, height } = original;
    const ctx = ImageManipulator.manipulate(source);
    if (Math.max(width, height) > maxEdge) {
      ctx.resize(width >= height ? { width: maxEdge } : { height: maxEdge });
    }
    const image = await ctx.renderAsync();
    const saved = await image.saveAsync({ compress: quality, format: SaveFormat.JPEG });
    return { uri: saved.uri, sizeBytes: new File(saved.uri).size };
  },
  async persist(uri, id) {
    const dir = new Directory(Paths.document, PHOTO_DIR);
    if (!dir.exists) dir.create({ intermediates: true });
    const dest = new File(dir, `${id}.jpg`);
    new File(uri).moveSync(dest);
    return dest.uri;
  },
  async sha256(uri) {
    return (await new File(uri).digest('SHA-256')).toLowerCase();
  },
  remove(uri) {
    try {
      const f = new File(toUri(uri));
      if (f.exists) f.delete();
    } catch {
      // file sementara; abaikan bila sudah hilang
    }
  },
};
