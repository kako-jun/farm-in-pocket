import { FARM_IN_POCKET_VERSION } from "@farm-in-pocket/shared";
import { Hono } from "hono";

const app = new Hono();

app.get("/health", (c) =>
  c.json({ status: "ok", service: "farm-in-pocket-api", version: FARM_IN_POCKET_VERSION }),
);

export default app;
