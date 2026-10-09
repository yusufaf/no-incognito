import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const manifest = JSON.parse(
  readFileSync(new URL("../extension/manifest.json", import.meta.url), "utf8"),
);

describe("manifest", () => {
  it("is MV3 with an event page module", () => {
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.background).toEqual({ scripts: ["background.js"], type: "module" });
  });

  it("requests exactly the permissions the code uses", () => {
    // Mocks cannot catch a missing permission: storage.session needs "storage".
    expect([...manifest.permissions].sort()).toEqual(["storage", "tabs"]);
    expect(manifest.permissions).not.toContain("webNavigation");
  });

  it("satisfies AMO's MV3 requirements", () => {
    const gecko = manifest.browser_specific_settings.gecko;
    expect(gecko.id).toMatch(/@/);
    expect(Number.parseInt(gecko.strict_min_version, 10)).toBeGreaterThanOrEqual(140);
    expect(gecko.data_collection_permissions).toEqual({ required: ["none"] });
  });

  it("references files that exist", () => {
    const files = [
      ...manifest.background.scripts,
      ...Object.values(manifest.icons),
      "onboarding.html",
      "onboarding.js",
    ];
    for (const file of files) {
      expect(existsSync(new URL(`../extension/${file}`, import.meta.url)), file).toBe(true);
    }
  });
});
