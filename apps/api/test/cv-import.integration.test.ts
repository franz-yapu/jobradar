import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { CvDraftSchema } from "@jobradar/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module.js";
import { AiNotConfiguredError, AiProviderError, AiRefusalError } from "../src/ai/domain/ai-provider.js";
import { AI_INNER_PROVIDER } from "../src/ai/infrastructure/ai.module.js";
import { FakeAiProvider } from "../src/ai/infrastructure/fake-ai.provider.js";
import { PrismaService } from "../src/shared/infrastructure/prisma/prisma.service.js";
import { makePdf } from "./helpers/make-pdf.js";
import { loginAgent, removeTestUsers, type Agent } from "./helpers/auth.js";

process.env["AI_DAILY_BUDGET_USD"] = "0.05";

const EXTRACTION = {
  stack: ["TypeScript", "NestJS"],
  yearsOfExperience: 6,
  countryOfResidence: "BO",
  englishLevel: "B1",
  summary: "Full stack developer",
  education: [{ institution: "UMSA", degree: "BSc", field: "Informatics", startYear: 2008, startMonth: null, endYear: 2013, endMonth: null }],
  experience: [{ company: "Acme", role: "Backend", startYear: 2020, startMonth: 3, endYear: null, endMonth: null, current: true, highlights: ["Built an API"] }],
  languages: [{ language: "English", level: "B1" }],
  certifications: ["AWS Cloud Practitioner"],
};
const CV = makePdf([["Backend developer", "TypeScript, NestJS", "BSc Informatics, UMSA"]]);

let app: INestApplication;
let prisma: PrismaService;
let fake: FakeAiProvider;
let agent: Agent;
const http = () => agent;
const upload = (file: Buffer, filename = "cv.pdf", contentType = "application/pdf") =>
  http().post("/profile/import-cv").attach("file", file, { filename, contentType });

beforeAll(async () => {
  fake = new FakeAiProvider();
  app = (await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(AI_INNER_PROVIDER).useValue(fake).compile())
    .createNestApplication();
  await app.init();
  agent = await loginAgent(app);
  prisma = app.get(PrismaService);
});
afterAll(async () => {
  await removeTestUsers(app);
  await app.close();
});
beforeEach(async () => {
  await prisma.postingScore.deleteMany();
  await prisma.aiCall.deleteMany();
  await prisma.candidateProfile.deleteMany();
  fake.requests.length = 0;
});

describe("POST /profile/import-cv", () => {
  it("returns a draft that matches the shared contract and stores nothing", async () => {
    fake.willReturn(EXTRACTION);
    const res = await upload(CV);

    expect(res.status).toBe(200);
    expect(CvDraftSchema.safeParse(res.body).success).toBe(true);
    expect(res.body).toMatchObject({
      stack: ["TypeScript", "NestJS"],
      seniority: "senior",
      allowedLocations: ["BO", "latam"],
      maxEnglishLevel: "B1",
      warnings: ["locations_suggested", "seniority_estimated"],
    });
    expect(res.body.experience[0]).toMatchObject({ company: "Acme", current: true, startYear: 2020, startMonth: 3 });
    expect(await prisma.candidateProfile.count()).toBe(0);
    // the text of the PDF reached the model, as content and not as instructions
    expect(fake.requests[0]?.content).toContain("TypeScript, NestJS");
    expect(fake.requests[0]?.purpose).toBe("cv_extraction");
  });

  it("logs the call in ai_calls with its purpose", async () => {
    fake.willReturn(EXTRACTION, { costUsd: 0.002 });
    await upload(CV).expect(200);
    const calls = await prisma.aiCall.findMany();
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ purpose: "cv_extraction", status: "ok" });
  });

  it("answers 400 when no file is sent", async () => {
    await http().post("/profile/import-cv").expect(400);
    expect(fake.requests).toHaveLength(0);
  });

  it("answers 413 for a file over 5 MB, without calling the AI", async () => {
    const res = await upload(Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.alloc(5 * 1024 * 1024 + 1024)]));
    expect(res.status).toBe(413);
    expect(fake.requests).toHaveLength(0);
  });

  it("answers 415 for a file that is not a PDF even if it is named .pdf", async () => {
    const res = await upload(Buffer.from("plain text"), "cv.pdf", "application/pdf");
    expect(res.status).toBe(415);
    expect(res.body.error).toBe("cv_not_pdf");
    expect(fake.requests).toHaveLength(0);
  });

  it("answers 422 cv_no_text for a scanned PDF and cv_too_long for too many pages", async () => {
    const scan = await upload(makePdf([[]]));
    expect(scan.status).toBe(422);
    expect(scan.body.error).toBe("cv_no_text");

    const long = await upload(makePdf(Array.from({ length: 16 }, (_, i) => [`Page ${i + 1}`])));
    expect(long.status).toBe(422);
    expect(long.body.error).toBe("cv_too_long");
    expect(fake.requests).toHaveLength(0);
  });

  it("maps AI failures like the scoring endpoints do", async () => {
    fake.willFail(new AiRefusalError(null));
    expect((await upload(CV)).body).toMatchObject({ statusCode: 422, error: "ai_refused" });

    fake.willFail(new AiProviderError("boom"));
    expect((await upload(CV)).body).toMatchObject({ statusCode: 502, error: "ai_provider_error" });

    fake.willFail(new AiNotConfiguredError("no key"));
    expect((await upload(CV)).body).toMatchObject({ statusCode: 503, error: "ai_not_configured" });
  });
});

describe("profile background fields", () => {
  const profile = {
    stack: ["TypeScript"],
    seniority: "senior",
    allowedLocations: ["BO"],
    maxEnglishLevel: "B1",
    education: [{ institution: "UMSA", degree: "BSc", endYear: 2013 }],
    experience: [{ company: "Acme", role: "Backend", startYear: 2020, current: true, highlights: ["Built an API"] }],
    languages: [{ language: "English", level: "B1" }],
    certifications: ["AWS Cloud Practitioner", "aws cloud practitioner"],
  };

  it("are saved and returned, and certifications are de-duplicated", async () => {
    const saved = await http().put("/profile").send(profile).expect(200);
    expect(saved.body.certifications).toEqual(["AWS Cloud Practitioner"]);
    const read = await http().get("/profile").expect(200);
    expect(read.body).toMatchObject({
      education: [{ institution: "UMSA", degree: "BSc", endYear: 2013 }],
      experience: [{ company: "Acme", role: "Backend", startYear: 2020, current: true, highlights: ["Built an API"] }],
      languages: [{ language: "English", level: "B1" }],
    });
  });

  it("default to empty lists for clients that do not send them", async () => {
    const { education: _e, experience: _x, languages: _l, certifications: _c, ...legacy } = profile;
    const res = await http().put("/profile").send(legacy).expect(200);
    expect(res.body).toMatchObject({ education: [], experience: [], languages: [], certifications: [] });
  });

  it("are validated: too many jobs is a 400", async () => {
    const tooMany = Array.from({ length: 16 }, () => ({ company: "A", role: "B" }));
    await http().put("/profile").send({ ...profile, experience: tooMany }).expect(400);
  });
});
