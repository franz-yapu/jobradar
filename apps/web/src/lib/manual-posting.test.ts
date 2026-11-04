import { CreatePostingSchema } from "@jobradar/shared";
import { describe, expect, it } from "vitest";
import { guessTitle, MISSING_COMPANY, toCreatePosting } from "./manual-posting";

describe("toCreatePosting", () => {
  it("works with only the pasted text and produces a body the API accepts", async () => {
    const body = await toCreatePosting({ text: "\n  Senior Node Developer\nRemote, LATAM\nWe use NestJS." });
    expect(body).toMatchObject({ title: "Senior Node Developer", company: MISSING_COMPANY, source: "manual", remoteScope: "unknown" });
    expect(body.url).toMatch(/^manual:[0-9a-f]{64}$/);
    expect(CreatePostingSchema.safeParse(body).success).toBe(true);
  });

  it("gives the same identity to the same text, whatever the whitespace and case", async () => {
    const a = await toCreatePosting({ text: "Dev at Acme\nNode and Postgres" });
    const b = await toCreatePosting({ text: "  dev at ACME   node and   postgres  " });
    const c = await toCreatePosting({ text: "A different posting" });
    expect(a.url).toBe(b.url);
    expect(a.url).not.toBe(c.url);
  });

  it("uses what the user filled in over the guesses", async () => {
    const body = await toCreatePosting({
      text: "text",
      title: " Staff Engineer ",
      company: "Acme",
      url: "https://acme.com/jobs/1",
      location: "Bolivia",
      remoteScope: "latam",
    });
    expect(body).toMatchObject({ title: "Staff Engineer", company: "Acme", url: "https://acme.com/jobs/1", location: "Bolivia", remoteScope: "latam" });
  });

  it("refuses an empty text", async () => {
    await expect(toCreatePosting({ text: "  \n " })).rejects.toThrow();
  });

  it("cuts a very long first line to the title limit", () => {
    expect(guessTitle("x".repeat(500))).toHaveLength(300);
  });
});
