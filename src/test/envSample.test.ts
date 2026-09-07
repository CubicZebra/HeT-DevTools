import * as assert from 'node:assert';
import { envSummaryOf } from '../features/env/envSample';

describe('V5-2B envSample (single environment sample)', () => {
  it('summarises a ready WSL2 lane compactly', () => {
    const s = envSummaryOf({
      providerId: 'win-wsl2',
      providerLabel: 'Windows · WSL2 托管 distro（gcc + lcov 全语义）',
      wsl: { distro: 'Ubuntu-24.04', ready: true, tools: { gcc: 'gcc-13 (Ubuntu 13.3.0) 13.3.0', conan: 'Conan version 2.32.0' } },
      managed: null,
      osx: null,
    });
    assert.strictEqual(s, 'WSL2 · Ubuntu-24.04 · gcc-13 · conan 2.32.0');
  });

  it('summarises a ready managed env', () => {
    const s = envSummaryOf({
      providerId: 'win-mingw',
      providerLabel: 'Windows · MinGW-w64 自供（可接受降级）',
      managed: { state: 'ready', tools: { conan: '2.32.0', cmake: '4.4.3' } },
      wsl: null,
      osx: null,
    });
    assert.strictEqual(s, '托管环境 · conan 2.32.0 · cmake 4.4.3');
  });

  it('falls back to the provider label and finally to a neutral message', () => {
    assert.strictEqual(
      envSummaryOf({ providerId: 'linux-native', providerLabel: 'Linux · 原生（gcc + lcov 全语义）', wsl: null, managed: null, osx: null }),
      'Linux · 原生（gcc + lcov 全语义）',
    );
    assert.strictEqual(envSummaryOf({ providerId: null, providerLabel: '', wsl: null, managed: null, osx: null }), '环境未检测');
  });
});
