/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  safeStorageGet,
  safeStorageRemove,
  safeStorageSet,
} from "../safeLocalStorage";

// NOTE: jsdom's Storage methods must be patched on the PROTOTYPE — assigning
// `window.localStorage.setItem = fn` on the instance is silently ignored, so a
// test written that way passes without ever exercising the failure path.
const realSetItem = Storage.prototype.setItem;
const realGetItem = Storage.prototype.getItem;
const realRemoveItem = Storage.prototype.removeItem;

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  Storage.prototype.setItem = realSetItem;
  Storage.prototype.getItem = realGetItem;
  Storage.prototype.removeItem = realRemoveItem;
  vi.restoreAllMocks();
});

describe("safeLocalStorage", () => {
  it("round-trips a value", () => {
    expect(safeStorageSet("a", "1")).toBe(true);
    expect(safeStorageGet("a")).toBe("1");
  });

  it("returns null for a missing key instead of throwing", () => {
    expect(safeStorageGet("nope")).toBeNull();
  });

  it("never throws when storage is blocked outright", () => {
    Storage.prototype.setItem = () => {
      throw new DOMException("blocked", "SecurityError");
    };
    Storage.prototype.getItem = () => {
      throw new DOMException("blocked", "SecurityError");
    };
    expect(() => safeStorageSet("a", "1")).not.toThrow();
    expect(safeStorageSet("a", "1")).toBe(false);
    expect(safeStorageGet("a")).toBeNull();
  });

  it("evicts the least-recently-written tracked key and retries on quota", () => {
    // Three tracked preference writes, oldest first.
    safeStorageSet("pref:old", "1");
    safeStorageSet("pref:mid", "2");
    safeStorageSet("pref:new", "3");
    // Something NOT written through this module must never be evicted.
    window.localStorage.setItem("auth:token", "secret");

    let full = true;
    Storage.prototype.setItem = function (key: string, value: string) {
      // Simulate a full origin that frees up once anything is removed.
      if (full && key === "pref:incoming") {
        throw new DOMException(
          "The quota has been exceeded.",
          "QuotaExceededError"
        );
      }
      return realSetItem.call(this, key, value);
    };
    Storage.prototype.removeItem = function (key: string) {
      full = false;
      return realRemoveItem.call(this, key);
    };

    expect(safeStorageSet("pref:incoming", "4")).toBe(true);

    Storage.prototype.setItem = realSetItem;
    Storage.prototype.removeItem = realRemoveItem;

    expect(safeStorageGet("pref:incoming")).toBe("4");
    // Oldest tracked key was sacrificed; the untracked key survived.
    expect(window.localStorage.getItem("pref:old")).toBeNull();
    expect(window.localStorage.getItem("pref:mid")).toBe("2");
    expect(window.localStorage.getItem("auth:token")).toBe("secret");
  });

  it("gives up (without throwing) when eviction cannot free enough room", () => {
    safeStorageSet("pref:a", "1");
    Storage.prototype.setItem = function (key: string, value: string) {
      if (key === "pref:b") {
        throw new DOMException(
          "The quota has been exceeded.",
          "QuotaExceededError"
        );
      }
      return realSetItem.call(this, key, value);
    };
    expect(() => safeStorageSet("pref:b", "2")).not.toThrow();
    expect(safeStorageSet("pref:b", "2")).toBe(false);
  });

  it("drops a removed key from the eviction index", () => {
    safeStorageSet("pref:a", "1");
    safeStorageRemove("pref:a");
    expect(safeStorageGet("pref:a")).toBeNull();
  });
});
