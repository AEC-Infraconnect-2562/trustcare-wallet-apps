import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  AppPrimaryNavigation,
  AppSideNavigation,
} from "./AppNavigation";

describe("Wallet application navigation", () => {
  it("uses one primary navigation model for desktop and mobile", () => {
    const html = renderToStaticMarkup(
      <nav>
        <AppPrimaryNavigation
          routeId="records"
          routeView="documents"
          onNavigate={vi.fn()}
          onOpenDocuments={vi.fn()}
        />
      </nav>,
    );

    expect(html).toContain('aria-current="page"');
    expect(html).toContain("หน้าแรก");
    expect(html).toContain("เอกสาร");
    expect(html).toContain("เตรียมบริการ");
  });

  it("keeps secondary routes only in the collapsible side navigation", () => {
    const html = renderToStaticMarkup(
      <nav>
        <AppSideNavigation
          routeId="history"
          routeView="history"
          onNavigate={vi.fn()}
        />
      </nav>,
    );

    expect(html).toContain("รับเอกสาร");
    expect(html).toContain("คลังข้อมูล");
    expect(html).toContain("ประวัติ");
  });
});
