import { execSync } from 'child_process';
import { join } from 'path';
import { readFileSync } from 'fs';

console.log("Verifying backend implementations programmatically...");

const tauriPath = join(process.cwd(), 'src-tauri');
const tests = [
    'git::rebase::tests',
    'git::merge::tests',
    'git::stash::tests',
    'git::sync::tests',
    'git::ai_preflight::tests'
];

let allPassed = true;

for (const test of tests) {
    console.log(`Running test module: ${test}`);
    try {
        execSync(`cargo test --manifest-path "${join(tauriPath, 'Cargo.toml')}" ${test}`, { stdio: 'inherit' });
        console.log(`PASS: ${test}`);
    } catch (e) {
        console.error(`FAIL: ${test}`);
        allPassed = false;
    }
}

if (!allPassed) {
    process.exit(1);
}

console.log("Programmatic verification script passed.");
