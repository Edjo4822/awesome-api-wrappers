import { readFileSync } from "node:fs";
import { join } from "node:path";

const README_PATH = join(process.cwd(), "README.md");

const ALLOWED_LANGUAGES = new Set([
  "TypeScript",
  "JavaScript",
  "Python",
  "Go",
  "Rust",
  "Java",
  "C#",
  "Ruby",
  "PHP",
  "Swift",
  "Kotlin",
]);

const MARKETING_WORDS = [
  "best",
  "amazing",
  "powerful",
  "blazing",
  "incredible",
  "ultimate",
  "revolutionary",
  "cutting-edge",
  "seamless",
  "world-class",
];

interface Violation {
  section: string;
  lineNum: number;
  entry: string;
  issues: string[];
}

// Strip fenced code blocks while preserving line count (so line numbers stay accurate)
function stripCodeBlocks(markdown: string): string {
  return markdown.replace(/```[\s\S]*?```/g, (match) =>
    "\n".repeat((match.match(/\n/g) ?? []).length)
  );
}

// Entry lines can wrap. Continuation lines are indented with two spaces.
// - [name](url) – Description that is
//   long and wraps here. `Lang` · `Official`
function joinEntryLines(
  lines: string[],
  startIdx: number
): { joined: string; endIdx: number } {
  let joined = lines[startIdx];
  let i = startIdx + 1;
  while (i < lines.length && lines[i].startsWith("  ")) {
    joined += " " + lines[i].trim();
    i++;
  }
  return { joined, endIdx: i - 1 };
}

function validateEntry(joined: string): string[] {
  const issues: string[] = [];

  // URL must be a full GitHub URL
  const urlMatch = joined.match(/\]\((https?:\/\/[^)]+)\)/);
  if (urlMatch && !urlMatch[1].startsWith("https://github.com/")) {
    issues.push(`URL must be a full GitHub URL, got: ${urlMatch[1]}`);
  }

  // Must have em dash (–) between link and description, not a hyphen
  if (!joined.includes(") – ")) {
    if (joined.includes(") - ")) {
      issues.push('use an em dash (–) not a hyphen (-) after the link');
    } else {
      issues.push('missing em dash (–) between link and description');
    }
    // Can't meaningfully check the rest without knowing where the description starts
    return issues;
  }

  // Must end with `Language` · `Official` or `Language` · `Community`
  const trailingMatch = joined.match(/`([^`]+)` · `(Official|Community)`$/);
  if (!trailingMatch) {
    issues.push(
      "must end with `Language` · `Official` or `Language` · `Community`"
    );
  } else {
    const lang = trailingMatch[1];
    if (!ALLOWED_LANGUAGES.has(lang)) {
      issues.push(
        `unknown language tag \`${lang}\` — allowed: ${[...ALLOWED_LANGUAGES].join(", ")}`
      );
    }
  }

  // Description must end with a period (immediately before the language tag)
  const beforeTags = joined
    .replace(/\s*`[^`]+` · `(?:Official|Community)`$/, "")
    .trim();
  if (!beforeTags.endsWith(".")) {
    issues.push("description must end with a period");
  }

  // No marketing language
  const lower = joined.toLowerCase();
  for (const word of MARKETING_WORDS) {
    if (lower.includes(word)) {
      issues.push(`contains marketing word: "${word}"`);
    }
  }

  return issues;
}

function run(): void {
  let markdown = "";
  try {
    markdown = readFileSync(README_PATH, "utf-8");
  } catch {
    console.error(`Error: could not read ${README_PATH}`);
    process.exit(1);
  }

  const lines = stripCodeBlocks(markdown).split("\n");
  const violations: Violation[] = [];

  // Rather than hardcoding section names, track position in the document.
  // Wrapper entries appear in two places:
  //   ## Maintainer Picks  (a top-level section)
  //   ## By Category       (subsections under this heading)
  // Everything else (Related Lists, Contributors, etc.) is skipped.
  let inMaintainerPicks = false;
  let inByCategory = false;
  let inCategorySubsection = false;
  let currentSection = "";

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith("## ")) {
      const heading = line.slice(3).trim();
      inMaintainerPicks = heading === "Maintainer Picks";
      inByCategory = heading === "By Category";
      inCategorySubsection = false;
      currentSection = heading;
    } else if (line.startsWith("### ") && inByCategory) {
      inCategorySubsection = true;
      // Strip leading emoji for a readable section name in error output
      currentSection = line.slice(4).replace(/^\S+\s+/, "").trim();
    }

    const inValidatedSection =
      inMaintainerPicks || (inByCategory && inCategorySubsection);

    if (inValidatedSection && line.startsWith("- [")) {
      const { joined, endIdx } = joinEntryLines(lines, i);
      const issues = validateEntry(joined);
      if (issues.length > 0) {
        violations.push({
          section: currentSection,
          lineNum: i + 1,
          entry: joined,
          issues,
        });
      }
      i = endIdx + 1;
      continue;
    }

    i++;
  }

  if (violations.length === 0) {
    console.log("✅  All entries pass format validation.");
    return;
  }

  console.log(`❌  ${violations.length} entry format violation(s):\n`);
  for (const v of violations) {
    const preview =
      v.entry.length > 100 ? v.entry.slice(0, 100) + "…" : v.entry;
    console.log(`  Line ${v.lineNum} [${v.section}]:`);
    console.log(`    ${preview}`);
    for (const issue of v.issues) {
      console.log(`    → ${issue}`);
    }
    console.log();
  }

  process.exit(1);
}

run();
