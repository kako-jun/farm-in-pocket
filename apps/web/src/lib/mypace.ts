import { MypaceClient } from "@farm-in-pocket/shared";

// Vite/Astro の build 時に PUBLIC_MYPACE_API_URL が無ければ prod を既定値にする。
const baseUrl = import.meta.env.PUBLIC_MYPACE_API_URL ?? "https://mypace.llll-ll.com";

export const mypace = new MypaceClient({ baseUrl });
