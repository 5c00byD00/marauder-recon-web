import { describe, expect, it } from "vitest";
import { decodeIBeacon } from "../src/lib/recon/ibeacon";
import { ibeaconInRecord } from "../src/lib/recon/parse";
import { OBS_RECORD_SIZE } from "../src/lib/recon/types";

describe("iBeacon payload", () => {
  it("decodes UUID, major, minor, and measured power from the firmware layout", () => {
    const payload = hex("4C000215123456789ABCDEF0123456789ABCDEF00007002AC5");
    expect(payload).toHaveLength(25);
    expect(decodeIBeacon(payload)).toEqual({
      uuid: "12345678-9ABC-DEF0-1234-56789ABCDEF0",
      major: 7,
      minor: 42,
      txPower: -59,
    });
    const wrapped = new Uint8Array(4 + payload.length);
    wrapped.set([0x02, 0x01, 0x06, 0xff]);
    wrapped.set(payload, 4);
    expect(decodeIBeacon(wrapped)?.minor).toBe(42);
  });

  it("rejects a short or non-iBeacon buffer, including a normal RCN1 record", () => {
    expect(decodeIBeacon(hex("4C000215"))).toBeNull();
    expect(decodeIBeacon(hex("4C001219" + "11".repeat(25)))).toBeNull();
    expect(ibeaconInRecord(new Uint8Array(OBS_RECORD_SIZE))).toBeNull();
  });
});

function hex(value: string): Uint8Array {
  const bytes = new Uint8Array(value.length / 2);
  for (let index = 0; index < bytes.length; index++) bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  return bytes;
}
