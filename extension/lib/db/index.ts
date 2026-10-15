import { openDB, type IDBPDatabase, type IDBPTransaction, type StoreKey, type StoreValue } from 'idb';
import { STORE_NAMES, type AutopsyDB, type StoreName } from './schema';

export * from './schema';

export const DB_NAME = 'doomscroll-autopsy';
/** Bump when the schema changes, and add a step to `migrations`. */
export const DB_VERSION = 1;

type UpgradeTx = IDBPTransaction<AutopsyDB, StoreName[], 'versionchange'>;

/** migrations[n] upgrades a database from version n to n + 1. */
const migrations: Array<(db: IDBPDatabase<AutopsyDB>, tx: UpgradeTx) => void> = [
  (db) => {
    const samples = db.createObjectStore('samples', { keyPath: 'id', autoIncrement: true });
    samples.createIndex('ts', 'ts');
    samples.createIndex('territoryId', 'territoryId');
    samples.createIndex('origin', 'origin');
    db.createObjectStore('bins', { keyPath: 'binStart' });
    db.createObjectStore('territories', { keyPath: 'id' });
    const nudges = db.createObjectStore('nudges', { keyPath: 'id', autoIncrement: true });
    nudges.createIndex('ts', 'ts');
    db.createObjectStore('models', { keyPath: 'name' });
    db.createObjectStore('reports', { keyPath: 'date' });
    db.createObjectStore('forgetLog', { keyPath: 'id', autoIncrement: true });
    const recorder = db.createObjectStore('recorderEvents', { keyPath: 'id', autoIncrement: true });
    recorder.createIndex('ts', 'ts');
  },
];

let dbPromise: Promise<IDBPDatabase<AutopsyDB>> | null = null;

/** Opens (and upgrades) the database once per context. */
export function openDb(): Promise<IDBPDatabase<AutopsyDB>> {
  dbPromise ??= open().catch((err) => {
    dbPromise = null;
    throw err;
  });
  return dbPromise;
}

function open(): Promise<IDBPDatabase<AutopsyDB>> {
  return openDB<AutopsyDB>(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion, _newVersion, tx) {
      for (let v = oldVersion; v < DB_VERSION; v++) {
        const migrate = migrations[v];
        if (!migrate) throw new Error(`No migration from DB version ${v}`);
        migrate(db, tx);
      }
    },
    blocking() {
      // A newer version is opening elsewhere (e.g. after an update): let it proceed.
      dbPromise?.then((db) => db.close());
      dbPromise = null;
    },
  });
}

/** Close the shared connection (tests, wipe). */
export async function closeDb(): Promise<void> {
  const p = dbPromise;
  dbPromise = null;
  if (p) (await p).close();
}

export async function put<S extends StoreName>(store: S, value: StoreValue<AutopsyDB, S>): Promise<StoreKey<AutopsyDB, S>> {
  return (await openDb()).put(store, value);
}

export async function get<S extends StoreName>(store: S, key: StoreKey<AutopsyDB, S>): Promise<StoreValue<AutopsyDB, S> | undefined> {
  return (await openDb()).get(store, key);
}

export async function getAll<S extends StoreName>(store: S): Promise<StoreValue<AutopsyDB, S>[]> {
  return (await openDb()).getAll(store);
}

/** Records with keys in [from, to] (both inclusive), e.g. bins by `binStart`. */
export async function getRange<S extends StoreName>(
  store: S,
  from: StoreKey<AutopsyDB, S>,
  to: StoreKey<AutopsyDB, S>,
): Promise<StoreValue<AutopsyDB, S>[]> {
  return (await openDb()).getAll(store, IDBKeyRange.bound(from, to));
}

/** Records whose `ts` index is in [from, to] (stores with a `ts` index). */
export async function getByTs(
  store: 'samples' | 'nudges' | 'recorderEvents',
  from: number,
  to: number,
): Promise<StoreValue<AutopsyDB, typeof store>[]> {
  return (await openDb()).getAllFromIndex(store, 'ts', IDBKeyRange.bound(from, to));
}

/** Empties every store (used by "wipe everything", PDD 11.4). */
export async function clearAll(): Promise<void> {
  const db = await openDb();
  const tx = db.transaction([...STORE_NAMES], 'readwrite');
  await Promise.all([...STORE_NAMES.map((s) => tx.objectStore(s).clear()), tx.done]);
}
