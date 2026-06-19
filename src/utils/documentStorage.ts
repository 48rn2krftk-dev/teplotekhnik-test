import type {
  DriverRoute,
  FuelChain,
  ThuOperation,
} from "../domain/documents";

const DATABASE_NAME = "hotIdle.documents";
const DATABASE_VERSION = 1;

type StoreRecordMap = {
  thuOperations: ThuOperation;
  driverRoutes: DriverRoute;
  fuelChains: FuelChain;
};

export type DocumentStoreName = keyof StoreRecordMap;

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;

      if (!database.objectStoreNames.contains("thuOperations")) {
        database.createObjectStore("thuOperations", { keyPath: "id" });
      }
      if (!database.objectStoreNames.contains("driverRoutes")) {
        database.createObjectStore("driverRoutes", { keyPath: "id" });
      }
      if (!database.objectStoreNames.contains("fuelChains")) {
        database.createObjectStore("fuelChains", { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function completeTransaction(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

export async function getDocuments<TStore extends DocumentStoreName>(
  storeName: TStore
): Promise<StoreRecordMap[TStore][]> {
  const database = await openDatabase();

  try {
    const transaction = database.transaction(storeName, "readonly");
    const completion = completeTransaction(transaction);
    const request = transaction.objectStore(storeName).getAll();
    const result = await new Promise<StoreRecordMap[TStore][]>(
      (resolve, reject) => {
        request.onsuccess = () =>
          resolve(request.result as StoreRecordMap[TStore][]);
        request.onerror = () => reject(request.error);
      }
    );
    await completion;
    return result;
  } finally {
    database.close();
  }
}

export async function saveDocument<TStore extends DocumentStoreName>(
  storeName: TStore,
  document: StoreRecordMap[TStore]
): Promise<void> {
  const database = await openDatabase();

  try {
    const transaction = database.transaction(storeName, "readwrite");
    const completion = completeTransaction(transaction);
    transaction.objectStore(storeName).put(document);
    await completion;
  } finally {
    database.close();
  }
}

export async function deleteDocument(
  storeName: DocumentStoreName,
  id: string
): Promise<void> {
  const database = await openDatabase();

  try {
    const transaction = database.transaction(storeName, "readwrite");
    const completion = completeTransaction(transaction);
    transaction.objectStore(storeName).delete(id);
    await completion;
  } finally {
    database.close();
  }
}

export async function clearDocuments(
  storeName: DocumentStoreName
): Promise<void> {
  const database = await openDatabase();

  try {
    const transaction = database.transaction(storeName, "readwrite");
    const completion = completeTransaction(transaction);
    transaction.objectStore(storeName).clear();
    await completion;
  } finally {
    database.close();
  }
}
