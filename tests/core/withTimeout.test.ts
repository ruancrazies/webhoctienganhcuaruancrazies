import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { withTimeout } from "../../src/core/withTimeout";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("withTimeout", () => {
  it("trả kết quả nếu kịp", async () => {
    const r = withTimeout(Promise.resolve("ok"), 1000, "fb");
    await expect(r).resolves.toBe("ok");
  });

  it("quá hạn thì trả fallback, không chờ promise chậm", async () => {
    const slow = new Promise<string>((res) => setTimeout(() => res("late"), 5000));
    const r = withTimeout(slow, 1000, "fb");
    await vi.advanceTimersByTimeAsync(1000);
    await expect(r).resolves.toBe("fb");
    await vi.advanceTimersByTimeAsync(5000); // promise chậm xong sau đó: không ném, không đổi kết quả
  });

  it("promise lỗi (kể cả lỗi đến sau hạn) → fallback, không ném và không để lỗi chưa xử lý", async () => {
    await expect(withTimeout(Promise.reject(new Error("db")), 1000, "fb")).resolves.toBe("fb");
    const late = new Promise<string>((_, rej) => setTimeout(() => rej(new Error("late")), 3000));
    const r = withTimeout(late, 1000, "fb");
    await vi.advanceTimersByTimeAsync(1000);
    await expect(r).resolves.toBe("fb");
    await vi.advanceTimersByTimeAsync(3000);
  });
});
