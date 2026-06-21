import ffmpeg from '@ffmpeg-installer/ffmpeg';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

function extensionForMime(mimeType: string) {
  if (mimeType.includes('quicktime')) return '.mov';
  if (mimeType.includes('webm')) return '.webm';
  if (mimeType.includes('x-matroska')) return '.mkv';
  return '.mp4';
}

export async function createVideoThumbnailBytes(videoBytes: Uint8Array, mimeType: string) {
  const dir = await mkdtemp(path.join(tmpdir(), 'r2-drive-thumb-'));
  const inputPath = path.join(dir, `input${extensionForMime(mimeType)}`);
  const outputPath = path.join(dir, 'thumbnail.jpg');

  try {
    await writeFile(inputPath, videoBytes);
    await execFileAsync(ffmpeg.path, [
      '-y',
      '-ss',
      '00:00:01',
      '-i',
      inputPath,
      '-frames:v',
      '1',
      '-vf',
      'scale=320:-1',
      '-q:v',
      '3',
      outputPath
    ]);

    return new Uint8Array(await readFile(outputPath));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
