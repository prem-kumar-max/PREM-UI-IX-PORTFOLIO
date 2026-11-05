import { caseStudies } from "./caseStudies.js";
import { siteContent } from "./siteContent.js";
import { settings } from "./settings.js";

const DATABASE_NAME = "prem-portfolio-working-copy";
const DATABASE_VERSION = 1;
const STATE_STORE = "state";
const ASSET_STORE = "assets";
const STATE_KEY = "working-copy";

function openDatabase() {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) {
      reject(new Error("This browser does not support IndexedDB, which is required to save CMS changes."));
      return;
    }
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STATE_STORE)) database.createObjectStore(STATE_STORE);
      if (!database.objectStoreNames.contains(ASSET_STORE)) database.createObjectStore(ASSET_STORE, { keyPath: "path" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Could not open the CMS working copy."));
  });
}

function transact(storeName, mode, action) {
  return openDatabase().then((database) => new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, mode);
    const result = action(transaction.objectStore(storeName));
    transaction.oncomplete = () => {
      database.close();
      resolve(result?.result);
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error || new Error("Could not update the CMS working copy."));
    };
    transaction.onabort = () => {
      database.close();
      reject(transaction.error || new Error("The CMS working-copy update was cancelled."));
    };
  }));
}

export const publishedData = {
  content: siteContent,
  projects: caseStudies,
  featuredLimit: settings.featuredLimit,
  activeResumePath: settings.activeResumePath,
  resumes: settings.resumes,
};

export async function loadWorkingCopy() {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STATE_STORE, "readonly");
    const request = transaction.objectStore(STATE_STORE).get(STATE_KEY);
    request.onsuccess = () => {
      database.close();
      resolve(request.result || structuredClone(publishedData));
    };
    request.onerror = () => {
      database.close();
      reject(request.error || new Error("Could not load the CMS working copy."));
    };
  });
}

export function saveWorkingCopy(state) {
  return transact(STATE_STORE, "readwrite", (store) => store.put(state, STATE_KEY));
}

export async function resetWorkingCopy() {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STATE_STORE, ASSET_STORE], "readwrite");
    transaction.objectStore(STATE_STORE).delete(STATE_KEY);
    transaction.objectStore(ASSET_STORE).clear();
    transaction.oncomplete = () => {
      database.close();
      resolve(structuredClone(publishedData));
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error || new Error("Could not reset the CMS working copy."));
    };
    transaction.onabort = () => {
      database.close();
      reject(transaction.error || new Error("Resetting the working copy was cancelled."));
    };
  });
}

export function saveAsset(path, blob) {
  return transact(ASSET_STORE, "readwrite", (store) => store.put({ path, blob }));
}

export async function loadAssets() {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(ASSET_STORE, "readonly");
    const request = transaction.objectStore(ASSET_STORE).getAll();
    request.onsuccess = () => {
      database.close();
      resolve(request.result || []);
    };
    request.onerror = () => {
      database.close();
      reject(request.error || new Error("Could not read uploaded files from the working copy."));
    };
  });
}

export function deleteAsset(path) {
  return transact(ASSET_STORE, "readwrite", (store) => store.delete(path));
}
