/**
 * File-based export, backup and recovery.
 *
 * - Manual export: JSON (full backup) or CSV, shared via the system share sheet.
 * - Automatic local backups: once a day on launch, a JSON snapshot is written to
 *   the app's documents directory (last 7 kept), so data can be recovered after
 *   a bad import or a bug, even without an account.
 */
import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { exportBackup, exportCompletionsCsv, restoreBackup, type RestoreResult } from '@/db/backup';
import type { Db } from '@/db/db';
import { todayLocal } from '@/lib/clock';
import { UserFacingError } from '@/lib/errors';

const AUTO_BACKUP_KEEP = 7;

function backupDir(): Directory {
  const dir = new Directory(Paths.document, 'backups');
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

async function share(file: File, mimeType: string): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) {
    throw new UserFacingError('Sharing is not available on this device.');
  }
  await Sharing.shareAsync(file.uri, { mimeType, dialogTitle: 'Export HabitFlow data' });
}

async function writeFile(dir: Directory, name: string, contents: string): Promise<File> {
  const file = new File(dir, name);
  file.create({ overwrite: true });
  await file.write(contents);
  return file;
}

export async function shareJsonBackup(db: Db): Promise<void> {
  const data = await exportBackup(db);
  const file = await writeFile(new Directory(Paths.cache), `habitflow-backup-${todayLocal()}.json`, JSON.stringify(data));
  await share(file, 'application/json');
}

export async function shareCsvExport(db: Db): Promise<void> {
  const csv = await exportCompletionsCsv(db);
  const file = await writeFile(new Directory(Paths.cache), `habitflow-history-${todayLocal()}.csv`, csv);
  await share(file, 'text/csv');
}

export interface AutoBackup {
  name: string;
  uri: string;
  date: string;
  size: number;
}

export function listAutoBackups(): AutoBackup[] {
  try {
    return backupDir()
      .list()
      .filter((e): e is File => e instanceof File && e.name.startsWith('auto-') && e.name.endsWith('.json'))
      .map((f) => ({ name: f.name, uri: f.uri, date: f.name.slice(5, 15), size: f.size ?? 0 }))
      .sort((a, b) => b.date.localeCompare(a.date));
  } catch (error) {
    console.warn('[backup] cannot list backups', error);
    return [];
  }
}

/** Writes today's automatic backup if it does not exist yet, and prunes old ones. */
export async function runAutoBackup(db: Db): Promise<void> {
  const today = todayLocal();
  const existing = listAutoBackups();
  if (existing.some((b) => b.date === today)) return;
  const data = await exportBackup(db);
  await writeFile(backupDir(), `auto-${today}.json`, JSON.stringify(data));
  for (const old of listAutoBackups().slice(AUTO_BACKUP_KEEP)) {
    new File(old.uri).delete();
  }
}

async function readJson(uri: string): Promise<unknown> {
  try {
    return JSON.parse(await new File(uri).text());
  } catch {
    throw new UserFacingError('This file could not be read as a HabitFlow backup.');
  }
}

export async function restoreFromAutoBackup(db: Db, uri: string): Promise<RestoreResult> {
  return restoreBackup(db, await readJson(uri));
}

/** Lets the user pick a backup file. Returns `null` if they cancelled. */
export async function pickBackupFile(): Promise<unknown | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['application/json', 'text/plain', '*/*'],
    copyToCacheDirectory: true,
  });
  if (result.canceled || !result.assets?.[0]) return null;
  return readJson(result.assets[0].uri);
}
