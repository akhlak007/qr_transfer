import type { TestRun } from "../research/test-run";

export type MobileDirection =
  | "android-to-android"
  | "android-to-iphone"
  | "iphone-to-android"
  | "iphone-to-iphone";

export function mobileDirectionOf(run: TestRun): MobileDirection | null {
  const sender = run.sender.platform;
  const receiver = run.receiver.platform;
  if (sender === "android" && receiver === "android") return "android-to-android";
  if (sender === "android" && receiver === "iphone") return "android-to-iphone";
  if (sender === "iphone" && receiver === "android") return "iphone-to-android";
  if (sender === "iphone" && receiver === "iphone") return "iphone-to-iphone";
  return null;
}
