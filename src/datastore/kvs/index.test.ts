import {expect} from "chai";

// Needed because the 'util' import below tries to poke at browser.runtime
import "../../mock/browser/runtime.js";

import type {KeyValueStore} from "./index.js";
import {KVSCache} from "./index.js";
import MemoryKVS from "./memory.js";

import * as events from "../../mock/events.js";

/** Behavioral tests which are common to both client and service.
 *
 * These are "abstract" tests in that they are run against a concrete
 * implementation of the KVS.  So the tests here are imported and reused in both
 * client and service tests. */
export function tests(
  kvs_factory: () => Promise<KeyValueStore<string, string>>,
) {
  let kvs: KeyValueStore<string, string>;

  beforeEach(async () => {
    kvs = undefined as any;
    kvs = await kvs_factory();
  });

  async function setDefaults() {
    await kvs.set([
      {key: "c", value: "christine"},
      {key: "a", value: "alice"},
      {key: "b", value: "bob"},
      {key: "d", value: "derek"},
    ]);
    await events.next(kvs.onSet);
  }

  describe("stores and updates entries", () => {
    it("no entries", async () => {
      await kvs.set([]);
      expect(await kvs.get([])).to.deep.equal([]);
    });

    it("creates single entries", async () => {
      const values = [{key: "a", value: "alice"}];

      await kvs.set(JSON.parse(JSON.stringify(values)));
      expect(await events.next(kvs.onSet)).to.deep.equal([values]);
      expect(await kvs.get(["a"])).to.deep.equal(values);
    });

    it("updates single entries", async () => {
      const values = [{key: "a", value: "alice"}];

      await kvs.set(JSON.parse(JSON.stringify(values)));
      expect(await events.next(kvs.onSet)).to.deep.equal([values]);
      expect(await kvs.get(["a"])).to.deep.equal(values);

      await kvs.set([{key: "a", value: "alison"}]);
      expect(await events.next(kvs.onSet)).to.deep.equal([
        [{key: "a", value: "alison"}],
      ]);
      expect(await kvs.get(["a"])).to.deep.equal([{key: "a", value: "alison"}]);
    });

    it("does not return non-existent entries", async () => {
      expect(await kvs.get(["oops"])).to.deep.equal([]);
    });

    it("stores and updates multiple entries at once", async () => {
      await setDefaults();
      await kvs.set([
        {key: "a", value: "alison"},
        {key: "e", value: "ethel"},
      ]);
      expect(await events.next(kvs.onSet)).to.deep.equal([
        [
          {key: "a", value: "alison"},
          {key: "e", value: "ethel"},
        ],
      ]);
      expect(await collect(kvs.list())).to.deep.equal([
        {key: "a", value: "alison"},
        {key: "b", value: "bob"},
        {key: "c", value: "christine"},
        {key: "d", value: "derek"},
        {key: "e", value: "ethel"},
      ]);
    });
  });

  describe("retrieves blocks of entries in ascending key order", () => {
    beforeEach(setDefaults);
    it("starting at the beginning", async () =>
      expect(await kvs.getStartingFrom(undefined, 2)).to.deep.equal([
        {key: "a", value: "alice"},
        {key: "b", value: "bob"},
      ]));
    it("before the beginning", async () =>
      expect(await kvs.getStartingFrom("1", 2)).to.deep.equal([
        {key: "a", value: "alice"},
        {key: "b", value: "bob"},
      ]));
    it("in the middle", async () =>
      expect(await kvs.getStartingFrom("a", 2)).to.deep.equal([
        {key: "b", value: "bob"},
        {key: "c", value: "christine"},
      ]));
    it("in the middle but the bound is absent", async () =>
      expect(await kvs.getStartingFrom("ab", 2)).to.deep.equal([
        {key: "b", value: "bob"},
        {key: "c", value: "christine"},
      ]));
    it("near the end", async () =>
      expect(await kvs.getStartingFrom("c", 2)).to.deep.equal([
        {key: "d", value: "derek"},
      ]));
    it("past the end", async () =>
      expect(await kvs.getStartingFrom("d", 2)).to.deep.equal([]));
    it("way past the end", async () =>
      expect(await kvs.getStartingFrom("e", 2)).to.deep.equal([]));
    it("all entries via iterator", async () =>
      expect(await collect(kvs.list())).to.deep.equal([
        {key: "a", value: "alice"},
        {key: "b", value: "bob"},
        {key: "c", value: "christine"},
        {key: "d", value: "derek"},
      ]));
  });

  describe("retrieves blocks of entries in descending key order", () => {
    beforeEach(setDefaults);
    it("starting at the end", async () =>
      expect(await kvs.getEndingAt(undefined, 2)).to.deep.equal([
        {key: "d", value: "derek"},
        {key: "c", value: "christine"},
      ]));
    it("after the end", async () =>
      expect(await kvs.getEndingAt("e", 2)).to.deep.equal([
        {key: "d", value: "derek"},
        {key: "c", value: "christine"},
      ]));
    it("in the middle", async () =>
      expect(await kvs.getEndingAt("d", 2)).to.deep.equal([
        {key: "c", value: "christine"},
        {key: "b", value: "bob"},
      ]));
    it("in the middle but the bound is absent", async () =>
      expect(await kvs.getEndingAt("cd", 2)).to.deep.equal([
        {key: "c", value: "christine"},
        {key: "b", value: "bob"},
      ]));
    it("near the beginning", async () =>
      expect(await kvs.getEndingAt("b", 2)).to.deep.equal([
        {key: "a", value: "alice"},
      ]));
    it("before the beginning", async () =>
      expect(await kvs.getEndingAt("a", 2)).to.deep.equal([]));
    it("way before the beginning", async () =>
      expect(await kvs.getEndingAt("1", 2)).to.deep.equal([]));
    it("all entries via iterator", async () =>
      expect(await collect(kvs.listReverse())).to.deep.equal([
        {key: "d", value: "derek"},
        {key: "c", value: "christine"},
        {key: "b", value: "bob"},
        {key: "a", value: "alice"},
      ]));
  });

  describe("deletes...", () => {
    beforeEach(setDefaults);

    it("...no entries", async () => {
      await kvs.set([]);
      expect(await collect(kvs.list())).to.deep.equal([
        {key: "a", value: "alice"},
        {key: "b", value: "bob"},
        {key: "c", value: "christine"},
        {key: "d", value: "derek"},
      ]);
    });

    it("...single entries", async () => {
      await kvs.set([{key: "a"}]);
      expect(await events.next(kvs.onSet)).to.deep.equal([[{key: "a"}]]);
      expect(await kvs.get(["a"])).to.deep.equal([]);
      expect(await collect(kvs.list())).to.deep.equal([
        {key: "b", value: "bob"},
        {key: "c", value: "christine"},
        {key: "d", value: "derek"},
      ]);
    });

    it("...entries which do not exist", async () => {
      await kvs.set([{key: "0"}]);
      expect(await events.next(kvs.onSet)).to.deep.equal([[{key: "0"}]]);
      expect(await collect(kvs.list())).to.deep.equal([
        {key: "a", value: "alice"},
        {key: "b", value: "bob"},
        {key: "c", value: "christine"},
        {key: "d", value: "derek"},
      ]);
      await kvs.set([{key: "e"}]);
      expect(await events.next(kvs.onSet)).to.deep.equal([[{key: "e"}]]);
      expect(await collect(kvs.list())).to.deep.equal([
        {key: "a", value: "alice"},
        {key: "b", value: "bob"},
        {key: "c", value: "christine"},
        {key: "d", value: "derek"},
      ]);
    });

    it("...multiple entries", async () => {
      await kvs.set([{key: "a"}, {key: "b"}]);
      expect(await events.next(kvs.onSet)).to.deep.equal([
        [{key: "a"}, {key: "b"}],
      ]);
      expect(await kvs.get(["a", "b"])).to.deep.equal([]);
      expect(await collect(kvs.list())).to.deep.equal([
        {key: "c", value: "christine"},
        {key: "d", value: "derek"},
      ]);
    });

    it("...all entries", async () => {
      await kvs.deleteAll();
      const deleted = (await events.next(kvs.onSet))[0].map(({key}) => key);
      expect(new Set(deleted)).to.deep.equal(new Set(["a", "b", "c", "d"]));
      expect(await kvs.get(["a"])).to.deep.equal([]);
      expect(await collect(kvs.list())).to.deep.equal([]);
    });

    it("...all entries in a very large database", async () => {
      const items = new Set<string>(["a", "b", "c", "d"]);
      for (let k = 0; k < 1000; ++k) {
        await kvs.set([{key: `${k}`, value: `${k}`}]);
        await events.next(kvs.onSet);
        items.add(`${k}`);
      }
      await kvs.deleteAll();
      while (items.size > 0) {
        const deleted = await events.next(kvs.onSet);
        for (const {key} of deleted[0]) {
          expect(items.has(key)).to.be.true;
          items.delete(key);
        }
      }
    });
  });
}

describe("datastore/kvs", () => {
  describe("KVSCache", () => {
    let kvs: MemoryKVS<string, string>;
    let cache: KVSCache<string, string>;

    beforeEach(() => {
      kvs = new MemoryKVS("test");
      cache = new KVSCache(kvs);
    });

    it("caches content locally and flushes it asynchronously", async () => {
      cache.set("key", "value");
      cache.set("a", "b");
      expect(kvs.data.get("key")).to.be.undefined;
      expect(kvs.data.get("a")).to.be.undefined;
      await cache.sync();
      await events.next(kvs.onSet);
      expect(kvs.data.get("key")).to.deep.equal("value");
      expect(kvs.data.get("a")).to.deep.equal("b");
    });

    it("fetches already-existing objects in the cache", async () => {
      kvs.data.set("a", "b");
      kvs.data.set("b", "c");
      const a = cache.get("a");
      const b = cache.get("b");
      expect(a.value).to.be.undefined;
      expect(b.value).to.be.undefined;

      await cache.sync();
      expect(a.value).to.deep.equal("b");
      expect(b.value).to.deep.equal("c");
    });

    it("returns the same object when get() is called twice", async () => {
      kvs.data.set("a", "b");
      const a = cache.get("a");
      expect(a.value).to.be.undefined;

      await cache.sync();
      expect(a.value).to.deep.equal("b");
      expect(a).to.equal(cache.get("a"));
    });

    it("updates objects returned via get() previously", async () => {
      const a = cache.get("a");
      expect(a.value).to.be.undefined;

      cache.set("a", "b");
      expect(a.value).to.equal("b");
      await events.next(kvs.onSet);
    });

    it("loads content it doesn't know about from the KVS", async () => {
      // Blatantly breaking the rule in memory.ts because we don't want
      // events to fire
      kvs.data.set("a", "b");
      const a = cache.get("a");
      expect(a.value).to.be.undefined;
      await cache.sync();
      expect(a.value).to.deep.equal("b");
    });

    it("does not keep state for non-existent entries fetched from getIfExists()", async () => {
      expect(cache.getIfExists("a")).to.be.undefined;
      expect((<Map<string, string>>(<any>cache)._entries).size).to.equal(0);

      const ent = cache.get("a");
      expect(ent).to.deep.equal({key: "a", value: undefined});
      expect(cache.get("a")).to.equal(ent);
      expect(cache.getIfExists("a")).to.equal(ent);
      expect((<Map<string, string>>(<any>cache)._entries).size).to.equal(1);
    });

    it("applies updates from the KVS to objects in the cache", async () => {
      const a = cache.get("a");
      expect(a.value).to.be.undefined;

      await kvs.set([{key: "a", value: "b"}]);
      await events.next(kvs.onSet);
      expect(a.value).to.equal("b");
    });

    it("deletes and resurrects objects in the cache", async () => {
      const a = cache.get("a");
      cache.set("a", "b");
      expect(a.value).to.deep.equal("b");

      await cache.sync();
      await events.next(kvs.onSet);
      expect(kvs.data.get("a")).to.equal("b");

      await kvs.set([{key: "a"}]);
      await events.next(kvs.onSet);
      expect(a.value).to.be.undefined;

      await kvs.set([{key: "a", value: "c"}]);
      await events.next(kvs.onSet);
      expect(a.value).to.equal("c");
    });

    describe("merges entries that...", () => {
      it("...do not exist yet", async () => {
        const ent = cache.merge("a", old => {
          expect(old).to.equal(undefined);
          return "b";
        });
        expect(ent.value).to.equal(undefined);

        await events.nextN(kvs.onSet, 1);
        expect(ent.value).to.equal("b");
      });

      it("...were recently set locally", async () => {
        cache.set("a", "b");
        const ent = cache.merge("a", old => {
          expect(old).to.equal("b");
          return "c";
        });
        expect(ent.value).to.equal("c");

        // Just one event, since the set() and merge() I/Os are squashed
        await events.nextN(kvs.onSet, 1);
        expect(ent.value).to.equal("c");
      });

      it("...were set locally a while ago", async () => {
        cache.set("a", "b");
        await events.next(kvs.onSet);
        expect(cache.get("a")).to.deep.equal({key: "a", value: "b"});
        expect(kvs.data.get("a")).to.deep.equal("b");

        const ent = cache.merge("a", old => {
          expect(old).to.equal("b");
          return "c";
        });
        expect(ent.value).to.equal("c");
        expect(kvs.data.get("a")).to.deep.equal("b");

        await events.nextN(kvs.onSet, 1);
        expect(ent.value).to.equal("c");
        expect(kvs.data.get("a")).to.deep.equal("c");
      });

      it("...were set remotely", async () => {
        kvs.data.set("a", "b");
        const ent = cache.merge("a", old => {
          expect(old).to.equal("b");
          return "c";
        });

        // Merge hasn't happened yet...
        expect(ent.value).to.equal(undefined);
        expect(kvs.data.get("a")).to.deep.equal("b");

        // Merge happens after the entry is fetched from the cache
        await events.nextN(kvs.onSet, 1);
        expect(ent.value).to.equal("c");
        expect(kvs.data.get("a")).to.deep.equal("c");
      });
    });

    it("maybe inserts entries that do not exist yet", async () => {
      cache.maybeInsert("a", "b");
      await cache.sync();
      await events.next(kvs.onSet);
      expect(await kvs.get(["a"])).to.deep.equal([{key: "a", value: "b"}]);
    });

    it("maybe inserts entries that already exist in the KVS", async () => {
      await kvs.set([{key: "a", value: "b"}]);
      cache.maybeInsert("a", "c");
      await cache.sync();
      await events.next(kvs.onSet);
      expect(await kvs.get(["a"])).to.deep.equal([{key: "a", value: "b"}]);
    });

    it("maybe inserts entries that already exist in the cache", async () => {
      cache.set("a", "b");
      cache.maybeInsert("a", "c");
      await cache.sync();
      await events.next(kvs.onSet);
      expect(await kvs.get(["a"])).to.deep.equal([{key: "a", value: "b"}]);
    });

    it("returns from flush() immediately if no entries are dirty", async () => {
      await cache.sync();
    });

    it("re-fetches entries if it goes out of sync", async () => {
      cache.set("a", "b");
      cache.set("b", "c");
      await cache.sync();
      await events.next(kvs.onSet);

      kvs.data.set("a", "aaaa");
      expect(cache.get("a")).to.deep.equal({key: "a", value: "b"});
      expect(cache.get("b")).to.deep.equal({key: "b", value: "c"});
      events.send(cache.kvs.onSyncLost);

      await events.next(cache.kvs.onSyncLost);
      await cache.sync();
      expect(cache.get("a")).to.deep.equal({key: "a", value: "aaaa"});
      expect(cache.get("b")).to.deep.equal({key: "b", value: "c"});
    });

    it("stops I/O if too many crashes occur", async () => {
      // Ugh, this feels dirty...
      (<any>cache)._fetch = () => {
        throw new Error("oops");
      };

      for (let i = 0; i < 3; i++) {
        try {
          cache.set("a", "b");
          await cache.sync();
          // istanbul ignore next
          // Must throw because we haven't exceeded the limit
          expect(true).to.be.false;
        } catch (e) {
          expect(e).to.be.instanceOf(Error);
        }
        expect(cache.get("a")).to.deep.equal({key: "a", value: "b"});
      }

      // Should not throw because we don't try to do I/O after the limit
      // is crossed.
      cache.set("a", "c");
      await cache.sync();
      expect(cache.get("a")).to.deep.equal({key: "a", value: "c"});
    });
  });
});

// TODO move this somewhere if it's used more often...
async function collect<I>(iter: AsyncIterable<I>): Promise<I[]> {
  const res = [];
  for await (const i of iter) res.push(i);
  return res;
}
