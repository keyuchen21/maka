// The THIRD-PARTY COMPONENTS section of the root LICENSE is the authority for
// what third-party material Maka redistributes outside npm. It is where ASF
// release policy puts the notice, it ships with every artifact, and a human
// reviews it. This module deliberately does not restate any of it — not the
// repository, not the revision, not the license text. Restating it would create
// a second authority that can disagree with the first while every check passes.
//
// What LICENSE cannot express is the link back to the tree: which file carries
// each entry, and what text must still be in it. That is the only thing here.
//
// `marker` is pinned to something that should not change silently — the
// upstream revision where the carrier records one, otherwise the most specific
// attribution phrase in the file. Either way a routine edit preserves it and a
// dropped attribution does not.
//
// Material with no readable carrier (a bundled binary) declares an empty list
// and says why. Every LICENSE entry must appear here, so adding one without
// deciding how it is anchored fails generation instead of passing unnoticed.
export const NON_NPM_CARRIERS = {
  'trycua/cua cursor-overlay': [
    {
      path: 'apps/desktop/src/renderer/computer-use-overlay/engine/palette.ts',
      marker: 'cursor-overlay/src/palette.rs',
    },
    {
      path: 'apps/desktop/src/renderer/computer-use-overlay/engine/cursor-engine.ts',
      marker: 'trycua/cua cursor-overlay',
    },
  ],
  'anomalyco/opencode (adapted source)': [
    {
      path: 'packages/runtime/src/tool-output.ts',
      marker: 'fc80874f45a595ff6874a4d36b1090f6a64424d2',
    },
    {
      path: 'packages/runtime/src/edit-replace.ts',
      marker: 'fc80874f45a595ff6874a4d36b1090f6a64424d2',
    },
  ],
  'sst/models.dev (generated model catalog snapshot)': [
    {
      path: 'packages/core/src/model-metadata.generated.ts',
      marker: 'Copyright (c) 2025 models.dev',
    },
    {
      path: 'packages/runtime/src/telemetry/model-pricing.generated.ts',
      marker: 'Copyright (c) 2025 models.dev',
    },
  ],
  'Geist and Geist Mono (bundled webfonts)': {
    carriers: [],
    reason:
      'the redistributed material is the .woff2 binaries emitted into the renderer bundle, which carry no in-repo attribution text',
  },
};

const SECTION_HEADER = '\nTHIRD-PARTY COMPONENTS\n';

// An entry is a title line followed by a blank line and a `Source:` block. The
// parser fails on anything it does not recognise rather than returning less
// than it found: a silently short list would drop a notice obligation, which is
// the failure this whole path exists to prevent.
export function parseThirdPartyEntries(licenseText) {
  const marker = licenseText.indexOf(SECTION_HEADER);
  if (marker < 0) {
    throw new Error('LICENSE has no THIRD-PARTY COMPONENTS section header');
  }
  const blocks = licenseText.slice(marker + SECTION_HEADER.length).split('\n\n');
  const entries = [];
  let current = null;
  for (const [index, block] of blocks.entries()) {
    if (blocks[index + 1]?.startsWith('Source:')) {
      const title = block.trim();
      if (title === '' || title.includes('\n')) {
        throw new Error(
          `LICENSE THIRD-PARTY COMPONENTS entry title must be a single non-empty line, got ${JSON.stringify(block)}`,
        );
      }
      current = { title, blocks: [] };
      entries.push(current);
      continue;
    }
    if (current === null) {
      if (block.trim() === '') continue;
      throw new Error(
        `LICENSE THIRD-PARTY COMPONENTS has text before its first entry: ${JSON.stringify(block.slice(0, 60))}`,
      );
    }
    current.blocks.push(block);
  }
  if (entries.length === 0) {
    throw new Error('LICENSE THIRD-PARTY COMPONENTS section declares no entries');
  }
  return entries.map(({ title, blocks: body }) => ({
    title,
    body: body.join('\n\n').replace(/\n+$/, ''),
  }));
}

function normalizeCarrierDeclaration(title, declared) {
  if (Array.isArray(declared)) return { carriers: declared, reason: undefined };
  if (declared.carriers.length > 0) {
    throw new Error(`${title}: declare carriers as a plain array when the entry has any`);
  }
  if (!declared.reason) {
    throw new Error(`${title}: an entry with no carrier must say why`);
  }
  return declared;
}

// Both directions are checked. LICENSE entry without a carrier decision means a
// new obligation nobody anchored; a carrier decision without a LICENSE entry
// means an anchor for material the release does not actually claim.
export function resolveNonNpmSources({ licenseText, readCarrier, carriers = NON_NPM_CARRIERS }) {
  const entries = parseThirdPartyEntries(licenseText);
  const declaredTitles = new Set(Object.keys(carriers));
  for (const { title } of entries) {
    if (!declaredTitles.has(title)) {
      throw new Error(
        `LICENSE declares ${JSON.stringify(title)} but scripts/non-npm-sources.mjs does not say which file carries it`,
      );
    }
    declaredTitles.delete(title);
  }
  if (declaredTitles.size > 0) {
    throw new Error(
      `scripts/non-npm-sources.mjs declares carriers for entries LICENSE does not have: ${[...declaredTitles].join(', ')}`,
    );
  }
  return entries.map(({ title, body }) => {
    const { carriers: files, reason } = normalizeCarrierDeclaration(title, carriers[title]);
    for (const carrier of files) {
      const content = readCarrier(carrier.path);
      if (content === undefined) {
        throw new Error(
          `${title}: ${carrier.path} is declared as carrying this material but does not exist`,
        );
      }
      if (!content.includes(carrier.marker)) {
        throw new Error(
          `${title}: ${carrier.path} no longer contains its attribution marker ${JSON.stringify(carrier.marker)}`,
        );
      }
    }
    return { title, body, carriers: files.map(({ path }) => path), reason };
  });
}
