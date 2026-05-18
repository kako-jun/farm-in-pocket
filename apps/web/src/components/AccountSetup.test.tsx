import { encodeNsec, generateSecretKey } from "@farm-in-pocket/shared";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { SECRET_KEY_STORAGE_KEY } from "../lib/keys";
import AccountSetup from "./AccountSetup";
import { STORAGE_KEY as PRIVACY_STORAGE_KEY } from "./PrivacyNotice";

function acceptPrivacy(): void {
  localStorage.setItem(PRIVACY_STORAGE_KEY, "true");
}

describe("AccountSetup", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("プライバシー未承認なら表示されない", () => {
    render(<AccountSetup />);
    expect(screen.queryByTestId("fip-account-overlay")).not.toBeInTheDocument();
  });

  it("プライバシー承認済み + 鍵未保存なら表示される", () => {
    acceptPrivacy();
    render(<AccountSetup />);
    expect(screen.getByTestId("fip-account-overlay")).toBeInTheDocument();
    expect(screen.getByTestId("fip-account-generate")).toBeInTheDocument();
    expect(screen.getByTestId("fip-account-show-import")).toBeInTheDocument();
  });

  it("プライバシー承認 + 既に鍵あり なら表示されない", () => {
    acceptPrivacy();
    // 適当な有効鍵を入れておく
    const sk = generateSecretKey();
    const hex = Array.from(sk)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    localStorage.setItem(SECRET_KEY_STORAGE_KEY, hex);

    render(<AccountSetup />);
    expect(screen.queryByTestId("fip-account-overlay")).not.toBeInTheDocument();
  });

  it("『新しい鍵を作る』で localStorage に鍵が保存される", async () => {
    acceptPrivacy();
    const user = userEvent.setup();
    render(<AccountSetup />);

    await user.click(screen.getByTestId("fip-account-generate"));

    const stored = localStorage.getItem(SECRET_KEY_STORAGE_KEY);
    expect(stored).not.toBeNull();
    expect(stored).toMatch(/^[0-9a-f]{64}$/);
    // 完了画面に npub が出る
    const npub = screen.getByTestId("fip-account-npub").textContent ?? "";
    expect(npub.startsWith("npub1")).toBe(true);
  });

  it("『既存の nsec をインポート』→ 正しい nsec で保存できる", async () => {
    acceptPrivacy();
    const user = userEvent.setup();
    render(<AccountSetup />);

    await user.click(screen.getByTestId("fip-account-show-import"));
    const sk = generateSecretKey();
    const nsec = encodeNsec(sk);

    const input = screen.getByTestId("fip-account-nsec-input");
    await user.type(input, nsec);
    await user.click(screen.getByTestId("fip-account-import"));

    const stored = localStorage.getItem(SECRET_KEY_STORAGE_KEY);
    expect(stored).not.toBeNull();
    expect(stored).toMatch(/^[0-9a-f]{64}$/);
    expect(screen.getByTestId("fip-account-npub").textContent).toMatch(/^npub1/);
  });

  it("不正な nsec を入れるとエラーが表示され、鍵は保存されない", async () => {
    acceptPrivacy();
    const user = userEvent.setup();
    render(<AccountSetup />);

    await user.click(screen.getByTestId("fip-account-show-import"));
    const input = screen.getByTestId("fip-account-nsec-input");
    await user.type(input, "not-a-valid-nsec");
    await user.click(screen.getByTestId("fip-account-import"));

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(localStorage.getItem(SECRET_KEY_STORAGE_KEY)).toBeNull();
  });

  it("空欄でインポート押下するとエラー", async () => {
    acceptPrivacy();
    const user = userEvent.setup();
    render(<AccountSetup />);

    await user.click(screen.getByTestId("fip-account-show-import"));
    await user.click(screen.getByTestId("fip-account-import"));

    expect(screen.getByRole("alert")).toBeInTheDocument();
  });
});
