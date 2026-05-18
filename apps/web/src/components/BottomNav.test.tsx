// Issue: kako-jun/farm-in-pocket#20
// BottomNav (Astro) のレンダリング結果を Astro Container API でテストする。
// React 用 vitest 環境 (happy-dom) 上でも astro/container は動く。renderToString で
// 得た HTML 文字列をパーサに通して querySelector / dataset を見る。

import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { describe, expect, it } from "vitest";
import BottomNav from "./BottomNav.astro";

async function renderAt(pathname: string): Promise<Document> {
  const container = await AstroContainer.create();
  const html = await container.renderToString(BottomNav, {
    request: new Request(`http://localhost${pathname}`),
  });
  // happy-dom の DOMParser で HTML フラグメントを解析
  return new DOMParser().parseFromString(html, "text/html");
}

describe("BottomNav", () => {
  it("renders the navigation landmark with aria-label", async () => {
    const doc = await renderAt("/");
    const nav = doc.querySelector('[data-testid="fip-bottom-nav"]');
    expect(nav).not.toBeNull();
    expect(nav?.getAttribute("aria-label")).toBe("メインナビゲーション");
  });

  it("renders 5 tabs (home / grid / record / community / settings)", async () => {
    const doc = await renderAt("/");
    const tabs = doc.querySelectorAll('[data-testid^="fip-bottom-nav-"]');
    // wrapper の data-testid="fip-bottom-nav" も同 prefix で引っ掛かるので除外
    const links = Array.from(tabs).filter((el) => el.tagName.toLowerCase() === "a");
    expect(links).toHaveLength(5);
    const hrefs = links.map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(["/", "/grid", "/record", "/community", "/settings"]);
  });

  it("marks the home tab active on '/'", async () => {
    const doc = await renderAt("/");
    const home = doc.querySelector('[data-testid="fip-bottom-nav-home"]');
    const grid = doc.querySelector('[data-testid="fip-bottom-nav-grid"]');
    const record = doc.querySelector('[data-testid="fip-bottom-nav-record"]');
    expect(home?.getAttribute("data-active")).toBe("true");
    expect(grid?.getAttribute("data-active")).toBe("false");
    expect(record?.getAttribute("data-active")).toBe("false");
    expect(home?.getAttribute("aria-current")).toBe("page");
  });

  it("marks the record tab active on '/record'", async () => {
    const doc = await renderAt("/record");
    const home = doc.querySelector('[data-testid="fip-bottom-nav-home"]');
    const record = doc.querySelector('[data-testid="fip-bottom-nav-record"]');
    expect(home?.getAttribute("data-active")).toBe("false");
    expect(record?.getAttribute("data-active")).toBe("true");
    expect(record?.getAttribute("aria-current")).toBe("page");
  });

  it("treats '/community/npub1abc' as a community subpath (community tab active)", async () => {
    // 動的ルート `/community/[npub]` でも community タブがアクティブになることを確認。
    const doc = await renderAt("/community/npub1abc");
    const community = doc.querySelector('[data-testid="fip-bottom-nav-community"]');
    const home = doc.querySelector('[data-testid="fip-bottom-nav-home"]');
    expect(community?.getAttribute("data-active")).toBe("true");
    // ルート完全一致のみアクティブの home は OFF のまま
    expect(home?.getAttribute("data-active")).toBe("false");
  });
});
