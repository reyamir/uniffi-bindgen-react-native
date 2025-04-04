/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/
 */

import myModule, {
  alwaysReady,
  AsyncError,
  asyncNewMegaphone,
  fallibleMe,
  FallibleMegaphone,
  fallibleStruct,
  greet,
  Megaphone,
  MyError,
  newMegaphone,
  newMyRecord,
  sayAfter,
  SharedResourceOptions,
  sleep,
  useSharedResource,
  void_,
} from "../../generated/futures";
import { asyncTest, xasyncTest, setDebug, Asserts, test } from "@/asserts";
import {
  uniffiRustFutureHandleCount,
  uniffiForeignFutureHandleCount,
} from "uniffi-bindgen-react-native";
import "@/polyfills";

// Initialize the callbacks for the module.
// This will be hidden in the installation process.
myModule.initialize();

function delayPromise(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

function cancellableDelayPromise(
  delayMs: number,
  abortSignal: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, delayMs);
    abortSignal.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(abortSignal.reason);
    });
  });
}

function checkRemainingFutures(t: Asserts) {
  t.assertEqual(
    0,
    uniffiRustFutureHandleCount(),
    "Number of remaining futures should be zero",
  );
  t.assertEqual(
    0,
    uniffiForeignFutureHandleCount(),
    "Number of remaining foreign futures should be zero",
  );
}

(async () => {
  await asyncTest("Test delay promise", async (t) => {
    console.info("Starting delay");
    await delayPromise(0);
    const start = Date.now();
    await delayPromise(1000);
    const actual = Date.now() - start;
    console.info(`Ending delay, measured: ${actual} ms`);
    t.assertInRange(actual, 900, 1100);

    t.end();
  });

  await asyncTest("alwaysReady", async (t) => {
    const result = await alwaysReady();
    t.assertTrue(result);
    checkRemainingFutures(t);
    t.end();
  });

  await asyncTest("newMyRecord", async (t) => {
    const record = await newMyRecord("my string", 42);
    t.assertEqual(record.a, "my string");
    t.assertEqual(record.b, 42);
    checkRemainingFutures(t);
    t.end();
  });

  await asyncTest("void", async (t) => {
    await t.asyncMeasure(void_, 0, 500);
    checkRemainingFutures(t);
    t.end();
  });

  await asyncTest("sleep", async (t) => {
    await t.asyncMeasure(async () => sleep(500), 500, 50);
    checkRemainingFutures(t);
    t.end();
  });

  test("sync greet", (t) => {
    t.measure(() => greet("Hello"), 0, 10);
  });

  await asyncTest("Sequential futures", async (t) => {
    await t.asyncMeasure(
      async () => {
        t.assertEqual("Hello, Alice!", await sayAfter(500, "Alice"));
        t.assertEqual("Hello, Bob!", await sayAfter(500, "Bob"));
      },
      1000,
      50,
    );
    checkRemainingFutures(t);
    t.end();
  });

  await asyncTest("Concurrent futures", async (t) => {
    await t.asyncMeasure(
      async () => {
        const alice = sayAfter(400, "Alice");
        const bob = sayAfter(600, "Bob");
        const [helloAlice, helloBob] = await Promise.all([alice, bob]);
        t.assertEqual("Hello, Alice!", helloAlice);
        t.assertEqual("Hello, Bob!", helloBob);
      },
      600,
      50,
    );
    checkRemainingFutures(t);
    t.end();
  });

  await asyncTest("Async methods", async (t) => {
    const megaphone = newMegaphone();
    let helloAlice = await t.asyncMeasure(
      async () => megaphone.sayAfter(500, "Alice"),
      500,
      50,
    );
    t.assertEqual("HELLO, ALICE!", helloAlice);
    checkRemainingFutures(t);
    t.end();
  });

  await asyncTest("Object with a fallible async ctor.", async (t) => {
    try {
      await FallibleMegaphone.create();
      t.fail("Expected an error");
    } catch (e: any) {
      // OK
    }
    checkRemainingFutures(t);
    t.end();
  });

  await asyncTest("async function returning an object", async (t) => {
    const megaphone = await asyncNewMegaphone();
    const result = await megaphone.fallibleMe(false);
    t.assertEqual(result, 42);
    checkRemainingFutures(t);
    t.end();
  });

  await asyncTest(
    "async function returning an object with primary async connstructor",
    async (t) => {
      const megaphone = await Megaphone.create();
      const result = await megaphone.fallibleMe(false);
      t.assertEqual(result, 42);
      checkRemainingFutures(t);
      t.end();
    },
  );

  await asyncTest(
    "async function returning an object with secondary async connstructor",
    async (t) => {
      const megaphone = await Megaphone.secondary();

      const result = await megaphone.fallibleMe(false);
      t.assertEqual(result, 42);
      checkRemainingFutures(t);
      t.end();
    },
  );

  await asyncTest("fallible function… which doesn't throw", async (t) => {
    const result = await t.asyncMeasure(async () => fallibleMe(false), 0, 100);
    t.assertEqual(42, result);
    checkRemainingFutures(t);
    t.end();
  });

  await asyncTest("fallible method… which doesn't throw", async (t) => {
    const m = await fallibleStruct(false);
    const result = await m.fallibleMe(false);
    t.assertEqual(42, result);
    checkRemainingFutures(t);
    t.end();
  });

  await asyncTest(
    "fallible method… which doesn't throw, part II",
    async (t) => {
      const megaphone = newMegaphone();
      const result = await t.asyncMeasure(
        async () => megaphone.fallibleMe(false),
        0,
        100,
      );
      t.assertEqual(42, result);
      checkRemainingFutures(t);
      t.end();
    },
  );

  await asyncTest("fallible function… which does throw", async (t) => {
    await t.asyncMeasure(
      async () =>
        await t.assertThrowsAsync(MyError.Foo.instanceOf, async () =>
          fallibleMe(true),
        ),
      0,
      100,
    );
    checkRemainingFutures(t);
    t.end();
  });

  await asyncTest("fallible method… which does throw", async (t) => {
    await t.assertThrowsAsync(
      MyError.Foo.instanceOf,
      async () => await fallibleStruct(true),
    );
    checkRemainingFutures(t);
    t.end();
  });

  await asyncTest("fallible method… which does throw, part II", async (t) => {
    const megaphone = newMegaphone();
    await t.asyncMeasure(
      async () =>
        await t.assertThrowsAsync(MyError.Foo.instanceOf, async () =>
          megaphone.fallibleMe(true),
        ),
      0,
      100,
    );
    checkRemainingFutures(t);
    t.end();
  });

  await asyncTest(
    "future method… which is cancelled before it starts",
    async (t) => {
      // The polyfill doesn't support AbortSignal.abort(), so we have
      // to make do with making one ourselves.
      const abortController = new AbortController();
      abortController.abort();

      await t.assertThrowsAsync(
        (err: any) => err instanceof Error && err.name == "AbortError",
        async () => fallibleMe(true, { signal: abortController.signal }),
      ),
        t.end();
    },
  );

  await asyncTest(
    "future method… which is cancelled after it is resolved",
    async (t) => {
      const abortController = new AbortController();
      const expected = await fallibleMe(false, {
        signal: abortController.signal,
      });
      t.assertEqual(expected, 42);
      // Now we cancel, but after the task has been resolved.
      // This should do so cleanly.
      abortController.abort();
      // Are we still here? Then we pass.
      t.end();
    },
  );

  await asyncTest(
    "future method… which is cancelled after it is rejected",
    async (t) => {
      const abortController = new AbortController();
      try {
        await fallibleMe(true, {
          signal: abortController.signal,
        });
        t.fail("We should have failed here. This is not the test.");
      } catch (e: any) {
        // OK
      }
      // Now we cancel, but after the task has been rejected.
      // This should do so cleanly.
      abortController.abort();
      // Are we still here? Then we pass.
      t.end();
    },
  );

  await asyncTest(
    "a future that uses a lock and that is not cancelled",
    async (t) => {
      const task1 = useSharedResource(
        SharedResourceOptions.create({
          releaseAfterMs: 100,
          timeoutMs: 1000,
        }),
      );
      const task2 = useSharedResource(
        SharedResourceOptions.create({ releaseAfterMs: 0, timeoutMs: 1000 }),
      );
      await Promise.all([task1, task2]);

      checkRemainingFutures(t);
      t.end();
    },
  );

  class Counter {
    expectedCount = 0;
    unexpectedCount = 0;
    ok() {
      return () => this.expectedCount++;
    }
    wat() {
      return () => this.unexpectedCount++;
    }
  }

  await asyncTest(
    "a future that uses a lock and that is cancelled from JS",
    async (t) => {
      const errors = new Counter();
      const success = new Counter();

      // Task 1 should hold the resource for 100 seconds.
      // We make an abort controller and get the signal from it, and pass it to
      // Rust.
      // Cancellation is done by dropping the future, so the Rust should be prepared
      // for that.
      const abortController = new AbortController();
      const task1 = useSharedResource(
        SharedResourceOptions.create({
          releaseAfterMs: 100000,
          timeoutMs: 100,
        }),
        { signal: abortController.signal },
      ).then(success.wat(), errors.ok());

      // Task 2 should try to grab the resource, but timeout after 1 second.
      // Unless we abort task 1, then task 1 will hold on, but task 2 will timeout and
      // fail.
      const task2 = useSharedResource(
        SharedResourceOptions.create({ releaseAfterMs: 0, timeoutMs: 1000 }),
      ).then(success.ok(), errors.wat());

      // We wait for 500 ms, then call the abortController.abort().
      const delay = delayPromise(500).then(() => abortController.abort());

      await Promise.allSettled([task1, task2, delay]);
      t.assertEqual(errors.expectedCount, 1, "only task1 should have failed");
      t.assertEqual(
        success.expectedCount,
        1,
        "only task2 should have succeeded",
      );

      t.assertEqual(errors.unexpectedCount, 0, "task2 should not have failed");
      t.assertEqual(
        success.unexpectedCount,
        0,
        "task1 should not have succeeded",
      );
      checkRemainingFutures(t);
      t.end();
    },
  );

  await asyncTest(
    "a future that uses a lock and that is erroring with a timeout",
    async (t) => {
      const task1 = useSharedResource(
        SharedResourceOptions.create({
          releaseAfterMs: 200,
          timeoutMs: 100,
        }),
      );

      console.info("Expect a timeout here");
      await t.assertThrowsAsync(AsyncError.Timeout.instanceOf, async () => {
        await useSharedResource(
          SharedResourceOptions.create({
            releaseAfterMs: 1000,
            timeoutMs: 100,
          }),
        );
      });
      await task1;
      checkRemainingFutures(t);
      t.end();
    },
  );

  await asyncTest(
    "a future that is immediately canceled should release lock",
    async (t) => {
      const abortController = new AbortController();
      const options = SharedResourceOptions.create({
        releaseAfterMs: 1000,
        timeoutMs: 100,
      });

      // Start and immediately cancel
      const task1 = useSharedResource(options, {
        signal: abortController.signal,
      });
      abortController.abort();

      // Second task should be able to acquire immediately
      const task2 = useSharedResource(options);

      try {
        await task1;
        t.fail("Task 1 should have been cancelled");
      } catch (e) {
        // Expected
      }

      await task2; // Should succeed
      checkRemainingFutures(t);
      t.end();
    },
  );

  await asyncTest("Test error stack traces", async (t) => {
    t.assertEqual(42, await fallibleMe(false));
    await t.assertThrowsAsync(
      (err) => {
        if (!MyError.Foo.instanceOf(err)) {
          return false;
        }
        if (!(err instanceof Error)) {
          return false;
        }
        t.assertNotNull(err.stack);
        t.assertTrue(
          err.stack!.indexOf("fallibleMe") >= 0,
          `STACK does not contain fallibleMe: ${err.stack!}`,
        );
        return true;
      },
      async () => await fallibleMe(true),
    );
    t.end();
  });
})();
