// applyBackgroundReplace のテスト (Issue: kako-jun/farm-in-pocket#43)
//
// modellhorizont は未成熟なため、ここでは placeholder の挙動（disabled / not_integrated_yet /
// impl 指定 / impl throw / 元 File が壊れない）を検証する。

import { describe, expect, it, vi } from "vitest";
import { applyBackgroundReplace } from "./modellhorizont";

function makeFile(name = "p.jpg", bytes = new Uint8Array([1, 2, 3])): File {
  return new File([bytes], name, { type: "image/jpeg" });
}

describe("applyBackgroundReplace", () => {
  it("enabled=false なら applied=false で元 File を返す (reason=disabled)", async () => {
    const original = makeFile();
    const result = await applyBackgroundReplace({ file: original, enabled: false });
    expect(result.applied).toBe(false);
    expect(result.reason).toBe("disabled");
    expect(result.file).toBe(original);
  });

  it("enabled=true + impl 未指定なら applied=false (reason=not_integrated_yet)", async () => {
    const original = makeFile();
    const result = await applyBackgroundReplace({ file: original, enabled: true });
    expect(result.applied).toBe(false);
    expect(result.reason).toBe("not_integrated_yet");
    expect(result.file).toBe(original);
  });

  it("enabled=true + impl 指定なら impl の戻り File を applied=true で返す", async () => {
    const original = makeFile("in.jpg");
    const replaced = makeFile("out.jpg", new Uint8Array([9, 9, 9]));
    const impl = vi.fn(async (_f: File) => replaced);
    const result = await applyBackgroundReplace({
      file: original,
      enabled: true,
      impl,
    });
    expect(impl).toHaveBeenCalledWith(original);
    expect(result.applied).toBe(true);
    expect(result.reason).toBeUndefined();
    expect(result.file).toBe(replaced);
  });

  it("impl が throw した場合は applied=false で元 File を返す (reason=エラーメッセージ)", async () => {
    const original = makeFile();
    const impl = vi.fn(async (_f: File) => {
      throw new Error("model_unavailable");
    });
    const result = await applyBackgroundReplace({
      file: original,
      enabled: true,
      impl,
    });
    expect(result.applied).toBe(false);
    expect(result.reason).toBe("model_unavailable");
    expect(result.file).toBe(original);
  });

  it("元 File は placeholder 経由で壊れない（name/size/type 保持）", async () => {
    const bytes = new Uint8Array([10, 20, 30, 40, 50]);
    const original = new File([bytes], "keep.png", { type: "image/png" });
    const result = await applyBackgroundReplace({ file: original, enabled: true });
    expect(result.file).toBe(original);
    expect(result.file.name).toBe("keep.png");
    expect(result.file.type).toBe("image/png");
    expect(result.file.size).toBe(bytes.byteLength);
  });
});
