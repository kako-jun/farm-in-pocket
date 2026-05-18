// BackgroundReplaceSettings: 写真の遠景差し替え（modellhorizont 連携）の有効/無効トグル。
//
// Issue: kako-jun/farm-in-pocket#43
//
// 現状は placeholder。ON にしても modellhorizont 統合は未実装のため写真はそのまま。
// 設定値だけ先に localStorage に保持し、将来 modellhorizont が成熟した時点で
// PhotoPicker 経由の `applyBackgroundReplace({ impl })` 注入と同時に有効化する。

import type { JSX } from "react";
import { useEffect, useId, useState } from "react";
import {
  getBackgroundReplaceEnabled,
  setBackgroundReplaceEnabled,
} from "../lib/background-replace-prefs";

export default function BackgroundReplaceSettings(): JSX.Element {
  const checkboxId = useId();
  const [enabled, setEnabled] = useState<boolean>(false);

  useEffect(() => {
    setEnabled(getBackgroundReplaceEnabled());
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const next = e.target.checked;
    setEnabled(next);
    setBackgroundReplaceEnabled(next);
  };

  return (
    <div data-testid="fip-background-replace-settings" className="space-y-2">
      <label className="flex items-center gap-3" htmlFor={checkboxId}>
        <input
          id={checkboxId}
          data-testid="fip-background-replace-toggle"
          type="checkbox"
          checked={enabled}
          onChange={handleChange}
          className="h-5 w-5"
        />
        <span className="text-sm font-medium">写真の遠景を自動で差し替える</span>
      </label>
      <p
        data-testid="fip-background-replace-note"
        className="text-xs text-neutral-600 leading-relaxed"
      >
        modellhorizont による遠景の匿名化を今後 統合予定。現在は ON にしてもまだ動作しません。
      </p>
    </div>
  );
}
