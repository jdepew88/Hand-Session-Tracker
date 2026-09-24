/**
 * A very small promise wrapper over IndexedDB.
 *
 * No dependency: the parts of IDB this app needs are object stores, two
 * indexes and transactions. Everything above this file talks to repositories,
 * never to IDB directly, so swapping in a Cloudflare D1-backed implementation
 * later is a matter of writing new repositories -- not touching components.
 */

export const DB_NAME = 'handforge'
export const DB_VERSION = 1

export const STORES = {
  sessions: 'sessions',
  hands: 'hands',
  players: 'players',
  rakePresets: 'rakePresets',
  settings: 'settings',
} as const

export type StoreName = (typeof STORES)[keyof typeof STORES]

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'))
  })
}

let connection: Promise<IDBDatabase> | null = null

export function openDatabase(): Promise<IDBDatabase> {
  if (connection) return connection

  connection = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('This browser does not support IndexedDB.'))
      return
    }
    const open = indexedDB.open(DB_NAME, DB_VERSION)

    open.onupgradeneeded = () => {
      const db = open.result
      if (!db.objectStoreNames.contains(STORES.sessions)) {
        const sessions = db.createObjectStore(STORES.sessions, { keyPath: 'id' })
        sessions.createIndex('startedAt', 'startedAt')
      }
      if (!db.objectStoreNames.contains(STORES.hands)) {
        const hands = db.createObjectStore(STORES.hands, { keyPath: 'id' })
        hands.createIndex('sessionId', 'sessionId')
        hands.createIndex('createdAt', 'createdAt')
      }
      if (!db.objectStoreNames.contains(STORES.players)) {
        const players = db.createObjectStore(STORES.players, { keyPath: 'id' })
        players.createIndex('sessionId', 'sessionId')
      }
      if (!db.objectStoreNames.contains(STORES.rakePresets)) {
        db.createObjectStore(STORES.rakePresets, { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains(STORES.settings)) {
        db.createObjectStore(STORES.settings, { keyPath: 'id' })
      }
    }

    open.onsuccess = () => {
      const db = open.result
      // A second tab running a newer version needs this one to let go.
      db.onversionchange = () => db.close()
      resolve(db)
    }
    open.onerror = () => reject(open.error ?? new Error('Could not open the local database.'))
  })

  connection.catch(() => {
    connection = null
  })

  return connection
}

/** Closes and forgets the connection. Used by tests. */
export function resetDatabaseConnection() {
  void connection?.then((db) => db.close()).catch(() => undefined)
  connection = null
}

async function withStore<T>(
  store: StoreName,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => Promise<T> | T,
): Promise<T> {
  const db = await openDatabase()
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(store, mode)
    let result: T
    let settled = false
    tx.oncomplete = () => resolve(result)
    tx.onerror = () => reject(tx.error ?? new Error('Transaction failed'))
    tx.onabort = () => reject(tx.error ?? new Error('Transaction aborted'))
    Promise.resolve(run(tx.objectStore(store)))
      .then((value) => {
        result = value
        settled = true
      })
      .catch((error: unknown) => {
        if (!settled) tx.abort()
        reject(error)
      })
  })
}

export const idb = {
  async getAll<T>(store: StoreName): Promise<T[]> {
    return withStore(store, 'readonly', (objectStore) => request(objectStore.getAll() as IDBRequest<T[]>))
  },

  async getAllByIndex<T>(store: StoreName, index: string, value: IDBValidKey): Promise<T[]> {
    return withStore(store, 'readonly', (objectStore) =>
      request(objectStore.index(index).getAll(value) as IDBRequest<T[]>),
    )
  },

  async get<T>(store: StoreName, key: IDBValidKey): Promise<T | undefined> {
    return withStore(store, 'readonly', (objectStore) =>
      request(objectStore.get(key) as IDBRequest<T | undefined>),
    )
  },

  async put<T>(store: StoreName, value: T): Promise<void> {
    await withStore(store, 'readwrite', (objectStore) => request(objectStore.put(value)))
  },

  async putMany<T>(store: StoreName, values: readonly T[]): Promise<void> {
    await withStore(store, 'readwrite', async (objectStore) => {
      for (const value of values) await request(objectStore.put(value))
    })
  },

  async remove(store: StoreName, key: IDBValidKey): Promise<void> {
    await withStore(store, 'readwrite', (objectStore) => request(objectStore.delete(key)))
  },

  async clear(store: StoreName): Promise<void> {
    await withStore(store, 'readwrite', (objectStore) => request(objectStore.clear()))
  },
}
