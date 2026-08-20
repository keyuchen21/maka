import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import {
  NON_NPM_CARRIERS,
  parseThirdPartyEntries,
  resolveNonNpmSources,
} from './non-npm-sources.mjs';

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const licenseText = readFileSync(join(repoRoot, 'LICENSE'), 'utf8');
const readCarrier = (path) => readFileSync(join(repoRoot, path), 'utf8');

// A two-entry LICENSE in the real shape. Failure cases perturb one thing at a
// time against it, so a case fails for the reason it names rather than because
// the whole fixture is malformed.
const stubLicense = [
  'Apache text\n',
  'THIRD-PARTY COMPONENTS',
  'example/one',
  'Source: https://example.invalid/one\nCopyright (c) 2025 one\nLicense: MIT',
  'Prose about one.',
  'example/two',
  'Source: https://example.invalid/two\nCopyright (c) 2025 two\nLicense: MIT',
  'Prose about two.',
].join('\n\n');
const stubCarriers = {
  'example/one': [{ path: 'one.ts', marker: 'anchor-one' }],
  'example/two': { carriers: [], reason: 'binary' },
};
const stubInputs = {
  licenseText: stubLicense,
  readCarrier: () => 'anchor-one',
  carriers: stubCarriers,
};

describe('LICENSE THIRD-PARTY COMPONENTS parser', () => {
  it('recovers every entry with its body verbatim', () => {
    const entries = parseThirdPartyEntries(stubLicense);
    assert.deepEqual(
      entries.map(({ title }) => title),
      ['example/one', 'example/two'],
    );
    assert.match(entries[0].body, /^Source: https:\/\/example\.invalid\/one$/m);
    assert.match(entries[0].body, /Prose about one\./);
    assert.doesNotMatch(entries[0].body, /example\/two/);
  });

  it('refuses a LICENSE with no section header rather than returning nothing', () => {
    assert.throws(() => parseThirdPartyEntries('Apache text only\n'), /no THIRD-PARTY COMPONENTS/);
  });

  it('refuses a section that declares no entries', () => {
    assert.throws(
      () => parseThirdPartyEntries('A\n\nTHIRD-PARTY COMPONENTS\n\n'),
      /declares no entries/,
    );
  });

  it('refuses text sitting before the first entry title', () => {
    const stray = stubLicense.replace(
      'THIRD-PARTY COMPONENTS\n\nexample/one',
      'THIRD-PARTY COMPONENTS\n\nstray note\n\nexample/one',
    );
    assert.throws(() => parseThirdPartyEntries(stray), /text before its first entry/);
  });
});

describe('non-npm carrier resolution', () => {
  it('resolves the real LICENSE against the real tree', () => {
    const resolved = resolveNonNpmSources({ licenseText, readCarrier });
    assert.deepEqual(
      resolved.map(({ title }) => title).sort(),
      Object.keys(NON_NPM_CARRIERS).sort(),
    );
  });

  it('accepts the stub the failure cases perturb', () => {
    assert.equal(resolveNonNpmSources(stubInputs).length, 2);
  });

  it('rejects a LICENSE entry nobody decided how to anchor', () => {
    assert.throws(
      () => resolveNonNpmSources({ ...stubInputs, carriers: { 'example/one': [] } }),
      /LICENSE declares "example\/two" but/,
    );
  });

  it('rejects an anchor for material LICENSE does not claim', () => {
    assert.throws(
      () =>
        resolveNonNpmSources({
          ...stubInputs,
          carriers: { ...stubCarriers, 'example/three': [] },
        }),
      /LICENSE does not have: example\/three/,
    );
  });

  it('rejects a carrying file that no longer exists', () => {
    assert.throws(
      () => resolveNonNpmSources({ ...stubInputs, readCarrier: () => undefined }),
      /does not exist/,
    );
  });

  it('rejects a carrying file that lost its attribution marker', () => {
    assert.throws(
      () => resolveNonNpmSources({ ...stubInputs, readCarrier: () => '// nothing' }),
      /no longer contains its attribution marker/,
    );
  });

  it('rejects an entry with no carrier and no reason', () => {
    assert.throws(
      () =>
        resolveNonNpmSources({
          ...stubInputs,
          carriers: { ...stubCarriers, 'example/two': { carriers: [] } },
        }),
      /must say why/,
    );
  });
});
