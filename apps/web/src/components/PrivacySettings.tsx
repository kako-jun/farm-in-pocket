import type { JSX } from "react";
import { resetPrivacyAcceptance } from "./PrivacyNotice";

export default function PrivacySettings(): JSX.Element {
  return (
    <button
      type="button"
      onClick={() => resetPrivacyAcceptance()}
      className="rounded-lg bg-emerald-600 px-4 py-2 text-white font-semibold transition-colors hover:bg-emerald-700"
    >
      プライバシー注意事項を再表示
    </button>
  );
}
