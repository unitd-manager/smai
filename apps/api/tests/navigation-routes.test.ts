import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { appNavItems, workspaceNavigation } from "../../web/src/config/navigation.ts";

const webApp = path.resolve(process.cwd(), "../web/src/app");

test("every workspace navigation item has a unique dedicated or dynamic page route", () => {
  const routes = appNavItems.map((item) => item.href);
  assert.equal(new Set(routes).size, routes.length, "navigation destinations must be unique");

  for (const route of routes) {
    if (route === "/") continue;
    const page = path.join(webApp, route.replace(/^\//, ""), "page.tsx");
    const dynamicPage = path.join(webApp, "dashboard", "[section]", "page.tsx");
    assert.ok(
      existsSync(page) || (route.startsWith("/dashboard/") && existsSync(dynamicPage)),
      `${route} has no page route`,
    );
  }
});

test("analytics, video studio, plans, campaigns, team, content sets, import files, and Marketing Brain have dedicated routes", () => {
  for (const route of ["/dashboard/analytics", "/dashboard/videos", "/dashboard/content-plans", "/dashboard/campaigns", "/dashboard/team", "/dashboard/content-sets", "/dashboard/system-status", "/dashboard/import-files", "/dashboard/marketing-brain"]) {
    assert.ok(existsSync(path.join(webApp, route.replace(/^\//, ""), "page.tsx")), `${route} must be a dedicated page`);
  }
});

test("Team is included in the workspace sidebar settings navigation", () => {
  const settings = workspaceNavigation.find((group) => group.label === "SETTINGS");
  assert.ok(settings?.items.some((item) => item.label === "Team" && item.href === "/dashboard/team"));
});
