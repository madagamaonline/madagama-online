import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { formatLKR } from "@/lib/utils";
import { AnimatedMoney } from "./signature-motion";

describe("AnimatedMoney accessibility", () => {
  it("keeps intermediate visual text hidden and exposes one final semantic value", () => {
    const amount = formatLKR(1234.5);
    const markup = renderToStaticMarkup(createElement(AnimatedMoney, { value: 1234.5 }));

    expect(markup).toContain(`aria-hidden="true">${amount}</span>`);
    expect(markup).toContain(`class="sr-only">${amount}</span>`);
    expect(markup).not.toContain("aria-label=");
    expect(markup.match(/class="sr-only"/g)).toHaveLength(1);
  });
});
