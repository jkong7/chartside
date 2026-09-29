import { expect, test } from "@playwright/test";

const size = (png: Buffer) => ({ w: png.readUInt32BE(16), h: png.readUInt32BE(20) });

for (const path of ["/line", "/go/phone"]) {
  test(`${path} has a 1200x630 share image and a large Twitter card`, async ({ page, request }) => {
    await page.goto(path);
    const og = await page.locator('meta[property="og:image"]').first().getAttribute("content");
    expect(og).toMatch(new RegExp(`^http://localhost:3200${path}/opengraph-image`));
    await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute("content", "summary_large_image");
    expect(await page.locator('meta[property="og:title"]').getAttribute("content")).toBeTruthy();
    const res = await request.get(new URL(og!).pathname + new URL(og!).search);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("image/png");
    const png = await res.body();
    expect(png.subarray(1, 4).toString()).toBe("PNG");
    expect(size(png)).toEqual({ w: 1200, h: 630 });
    expect(png.length).toBeGreaterThan(10000);
  });
}
