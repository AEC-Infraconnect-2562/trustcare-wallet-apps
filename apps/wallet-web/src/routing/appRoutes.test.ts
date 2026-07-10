import { describe, expect, it } from "vitest";
import {
  pathForView,
  resolveWalletRoute,
  routerBasename,
  walletRouteDefinitions,
} from "./appRoutes";

describe("wallet Web routes", () => {
  it("maps every existing view to a stable patient route", () => {
    expect(pathForView("home")).toBe("/home");
    expect(pathForView("documents")).toBe("/records");
    expect(pathForView("receive")).toBe("/receive");
    expect(pathForView("prepare")).toBe("/prepare");
    expect(pathForView("share")).toBe("/share");
    expect(pathForView("history")).toBe("/activity");
    expect(pathForView("settings")).toBe("/settings");
    expect(pathForView("store")).toBe("/records/store");
  });

  it("registers the Constitution routes including Phase 1 placeholders", () => {
    expect(walletRouteDefinitions.map((route) => route.path)).toEqual(
      expect.arrayContaining([
        "/home",
        "/records",
        "/receive",
        "/prepare",
        "/share",
        "/shares/active",
        "/activity",
        "/connections",
        "/family",
        "/settings",
        "/verify",
      ]),
    );
  });

  it("resolves canonical and trailing-slash locations", () => {
    expect(resolveWalletRoute("/records").route.view).toBe("documents");
    expect(resolveWalletRoute("/activity/").route.view).toBe("history");
    expect(resolveWalletRoute("settings").route.view).toBe("settings");
  });

  it("keeps supported deep-link parameters outside application state", () => {
    expect(resolveWalletRoute("/records/lab-42").params.recordId).toBe(
      "lab-42",
    );
    expect(
      resolveWalletRoute("/prepare/opd-v2").params.serviceProfileId,
    ).toBe("opd-v2");
    expect(
      resolveWalletRoute("/share/requests/request-7").params.requestId,
    ).toBe("request-7");
    expect(resolveWalletRoute("/verify/vp-9").params.artifactId).toBe("vp-9");
  });

  it("redirects root and unknown paths without preserving internal UI state", () => {
    expect(resolveWalletRoute("/").redirectTo).toBe("/home");
    expect(resolveWalletRoute("/not-a-wallet-route").redirectTo).toBe(
      "/home",
    );
  });

  it("normalizes Vite base paths for BrowserRouter", () => {
    expect(routerBasename("/")).toBe("/");
    expect(routerBasename("/wallet/")).toBe("/wallet");
    expect(routerBasename("trustcare")).toBe("/trustcare");
  });
});
