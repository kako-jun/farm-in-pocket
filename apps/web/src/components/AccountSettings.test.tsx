import { bytesToHex, generateSecretKey } from "@farm-in-pocket/shared";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { SECRET_KEY_STORAGE_KEY } from "../lib/keys";
import AccountSettings from "./AccountSettings";

function seedSecretKey(): void {
  const sk = generateSecretKey();
  localStorage.setItem(SECRET_KEY_STORAGE_KEY, bytesToHex(sk));
}

describe("AccountSettings", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("鍵未保存なら『まだアカウントが作成されていません』表示", () => {
    render(<AccountSettings />);
    expect(screen.getByTestId("fip-account-settings-empty")).toBeInTheDocument();
  });

  it("鍵があれば npub が表示される", async () => {
    seedSecretKey();
    render(<AccountSettings />);
    const npubEl = await screen.findByTestId("fip-account-settings-npub");
    const npub = npubEl.textContent ?? "";
    expect(npub.startsWith("npub1")).toBe(true);
  });

  it("nsec はデフォルトでは隠れていて、トグルで表示される", async () => {
    seedSecretKey();
    const user = userEvent.setup();
    render(<AccountSettings />);

    expect(screen.queryByTestId("fip-account-settings-nsec")).not.toBeInTheDocument();
    await user.click(await screen.findByTestId("fip-account-settings-show-nsec"));
    const nsec = screen.getByTestId("fip-account-settings-nsec").textContent ?? "";
    expect(nsec.startsWith("nsec1")).toBe(true);
  });

  it("リセットボタンは2段階確認（初回押下では消えない）", async () => {
    seedSecretKey();
    const user = userEvent.setup();
    render(<AccountSettings />);

    await user.click(await screen.findByTestId("fip-account-settings-reset"));
    // まだ消えていない
    expect(localStorage.getItem(SECRET_KEY_STORAGE_KEY)).not.toBeNull();

    // 2回目で消える
    await user.click(screen.getByTestId("fip-account-settings-reset"));
    expect(localStorage.getItem(SECRET_KEY_STORAGE_KEY)).toBeNull();
    expect(screen.getByTestId("fip-account-settings-empty")).toBeInTheDocument();
  });

  it("リセットのキャンセルで削除されない", async () => {
    seedSecretKey();
    const user = userEvent.setup();
    render(<AccountSettings />);

    await user.click(await screen.findByTestId("fip-account-settings-reset"));
    await user.click(screen.getByRole("button", { name: "キャンセル" }));
    // もう一度押しても1段階目から
    await user.click(screen.getByTestId("fip-account-settings-reset"));
    expect(localStorage.getItem(SECRET_KEY_STORAGE_KEY)).not.toBeNull();
  });
});
