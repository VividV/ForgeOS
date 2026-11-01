import { describe, expect, it } from "vitest";
import { parseCsv } from "@/lib/csv";
import { formatDate, formatMoney, formatQty } from "@/lib/format";
import { toCsvForTest } from "./helpers";

describe("csv parser", () => {
  it("handles quotes, escaped quotes, CRLF and BOM", () => {
    expect(parseCsv('﻿code,name\r\nA1,"Cotton, white"\r\nB2,"He said ""hi"""\n')).toEqual([
      ["code", "name"],
      ["A1", "Cotton, white"],
      ["B2", 'He said "hi"'],
    ]);
  });
  it("skips blank lines", () => {
    expect(parseCsv("a\n\n\nb\n")).toEqual([["a"], ["b"]]);
  });
});

describe("formatting", () => {
  it("formats naira", () => expect(formatMoney(3702, "NGN")).toBe("₦3,702.00"));
  it("never shifts calendar dates across time zones", () => expect(formatDate("2026-11-01", "dd/MM/yyyy", "America/New_York")).toBe("01/11/2026"));
  it("formats quantities", () => expect(formatQty(1234.5678, 2)).toBe("1,234.57"));
  it("shows a dash for missing values", () => expect(formatMoney(null)).toBe("—"));
});

describe("csv export", () => {
  it("neutralises spreadsheet formula injection", () => {
    expect(toCsvForTest([{ key: "a", label: "a" }], [{ a: "=HYPERLINK(1)" }])).toContain("'=HYPERLINK");
  });
});
