import { MypaceClient } from "@farm-in-pocket/shared";

// Cloudflare Workers の env から baseUrl を引いて MypaceClient を組み立てる。
// dev override は .dev.vars / wrangler dev で行う。
export const createMypaceClient = (env: { MYPACE_API_URL?: string }) =>
  new MypaceClient({ baseUrl: env.MYPACE_API_URL ?? "https://mypace.llll-ll.com" });
