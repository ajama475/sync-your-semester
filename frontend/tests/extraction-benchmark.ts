import { File as NodeFile } from "node:buffer";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { extractDeadlines } from "../lib/extract/extractor";
import type { DeadlineCandidate, DeadlineType } from "../lib/extract/models";
import { parsePDF } from "../lib/parser/pdfParser";

interface CandidateExpectation {
  dateISO?: string;
  type?: DeadlineType;
  titleIncludes?: string;
  minConfidence?: number;
}

interface BenchmarkFixture {
  name: string;
  source: string;
  defaultYear?: number;
  parser?: {
    hasExtractableText?: boolean;
  };
  required: CandidateExpectation[];
  forbidden: CandidateExpectation[];
  thresholds?: {
    maxCandidates?: number;
    maxLowConfidence?: number;
  };
}

function matchesExpectation(candidate: DeadlineCandidate, expectation: CandidateExpectation) {
  if (expectation.dateISO && candidate.dateISO !== expectation.dateISO) return false;
  if (expectation.type && candidate.type !== expectation.type) return false;
  if (expectation.titleIncludes && !candidate.title.toLowerCase().includes(expectation.titleIncludes.toLowerCase())) {
    return false;
  }
  if (typeof expectation.minConfidence === "number" && candidate.confidence < expectation.minConfidence) {
    return false;
  }
  return true;
}

function formatCandidate(candidate: DeadlineCandidate) {
  return `${candidate.dateISO} ${candidate.type} "${candidate.title}" (${candidate.confidence})`;
}

async function loadFixtures(fixturesDir: string) {
  const entries = await readdir(fixturesDir);
  const jsonFiles = entries.filter((entry) => entry.endsWith(".json")).sort();

  return Promise.all(
    jsonFiles.map(async (fileName) => {
      const content = await readFile(path.join(fixturesDir, fileName), "utf8");
      return JSON.parse(content) as BenchmarkFixture;
    })
  );
}

async function runFixture(frontendRoot: string, fixture: BenchmarkFixture) {
  const pdfPath = path.join(frontendRoot, fixture.source);
  const pdfBytes = await readFile(pdfPath);
  const file = new NodeFile([pdfBytes], path.basename(pdfPath), { type: "application/pdf" }) as unknown as globalThis.File;
  const parsed = await parsePDF(file);
  const result = extractDeadlines(parsed.text, fixture.defaultYear);
  const failures: string[] = [];

  if (typeof fixture.parser?.hasExtractableText === "boolean" && parsed.hasExtractableText !== fixture.parser.hasExtractableText) {
    failures.push(
      `parser.hasExtractableText expected ${String(fixture.parser.hasExtractableText)} but got ${String(parsed.hasExtractableText)}`
    );
  }

  for (const expectation of fixture.required) {
    const matchedCandidate = result.candidates.find((candidate) => matchesExpectation(candidate, expectation));
    if (!matchedCandidate) {
      failures.push(
        `missing required candidate ${JSON.stringify(expectation)}`
      );
    }
  }

  for (const expectation of fixture.forbidden) {
    const matchedCandidate = result.candidates.find((candidate) => matchesExpectation(candidate, expectation));
    if (matchedCandidate) {
      failures.push(
        `forbidden candidate present ${JSON.stringify(expectation)} -> ${formatCandidate(matchedCandidate)}`
      );
    }
  }

  const lowConfidenceCount = result.candidates.filter((candidate) => candidate.confidence < 55).length;

  if (typeof fixture.thresholds?.maxCandidates === "number" && result.candidates.length > fixture.thresholds.maxCandidates) {
    failures.push(`expected at most ${fixture.thresholds.maxCandidates} candidates but found ${result.candidates.length}`);
  }

  if (typeof fixture.thresholds?.maxLowConfidence === "number" && lowConfidenceCount > fixture.thresholds.maxLowConfidence) {
    failures.push(`expected at most ${fixture.thresholds.maxLowConfidence} low-confidence candidates but found ${lowConfidenceCount}`);
  }

  return {
    fixture,
    parsed,
    result,
    failures,
  };
}

async function main() {
  const frontendRoot = process.cwd();
  const fixturesDir = path.join(frontendRoot, "tests", "fixtures");
  const fixtures = await loadFixtures(fixturesDir);
  const outcomes = [];

  for (const fixture of fixtures) {
    outcomes.push(await runFixture(frontendRoot, fixture));
  }

  let totalFailures = 0;

  for (const outcome of outcomes) {
    const lowConfidenceCount = outcome.result.candidates.filter((candidate) => candidate.confidence < 55).length;
    const prefix = outcome.failures.length === 0 ? "PASS" : "FAIL";

    console.log(`${prefix} ${outcome.fixture.name}`);
    console.log(
      `  candidates=${outcome.result.candidates.length} lowConfidence=${lowConfidenceCount} warnings=${outcome.parsed.warnings.length}`
    );

    if (outcome.failures.length > 0) {
      totalFailures += outcome.failures.length;
      for (const failure of outcome.failures) {
        console.log(`  - ${failure}`);
      }
    }
  }

  if (totalFailures > 0) {
    console.error(`\nExtraction benchmark failed with ${totalFailures} issue${totalFailures === 1 ? "" : "s"}.`);
    process.exit(1);
  }

  console.log(`\nExtraction benchmark passed for ${outcomes.length} fixture${outcomes.length === 1 ? "" : "s"}.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
