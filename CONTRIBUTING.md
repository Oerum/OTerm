# Contributing to OTerm

Thank you for your interest in contributing to OTerm! This document outlines the development setup, testing workflows, and submission guidelines.

---

## 🛠️ Development Setup & Prerequisites

To compile the native Whisper and Tauri modules from source, your machine needs:

### 📋 Dependencies
- **Node.js** `>= 22`
- **Rust Toolchain** (stable) with `rustfmt` and `clippy` components.
- **CMake** & a **C++ Toolchain** (e.g., Build Tools for Visual Studio on Windows, Xcode on macOS).
- **GPU / Native Build SDKs**:
  - **macOS**: Xcode Command Line Tools (Metal).
  - **Windows (Vulkan)**: [Vulkan SDK](https://vulkan.lunarg.com/) + LLVM/libclang.
  - **Windows (CUDA)**: NVIDIA CUDA Toolkit + LLVM/libclang.
  - **Linux (Vulkan)**: `libvulkan-dev`, `glslang-tools`, and a C++ toolchain.
  - **Linux (CUDA)**: NVIDIA CUDA Toolkit.
  - **Linux (OpenBLAS)**: `libopenblas-dev`.

### 🎙️ Whisper Compile-Time Feature Selection
OTerm compiles `whisper.cpp` bindings at build time. Choose a backend feature match for your architecture:
- **macOS**: `whisper-metal` (default)
- **Windows**: `whisper-vulkan` (default) or `whisper-cuda` (NVIDIA)
- **Linux**: `whisper-vulkan` (default), `whisper-cuda` (NVIDIA), or `whisper-openblas` (CPU)

To override the default backend during local compilation, set the environment variable:
```bash
# Example for Windows CUDA build
export OTERM_WHISPER_BACKEND=cuda
# Or pass features directly to Cargo/Tauri
```

---

## 📦 Setting Up the Repository

1. **Clone the repository**:
   ```bash
   git clone https://github.com/Oerum/OTerm.git
   cd oterm
   ```

2. **Install Node dependencies**:
   ```bash
   npm ci
   ```

3. **Start the application in dev mode**:
   ```bash
   npm run tauri dev
   ```
   *Note: The initial build compiles the native `whisper.cpp` bindings, which can take several minutes. Subsequent compilations are cached and near-instant.*

---

## 🧪 Quality Gates & Testing

Before submitting any Pull Request, verify that all validation gates pass. The CI/CD pipeline enforces a strict zero-warning policy.

Run these steps in order from the repository root:

```bash
# 1. TypeScript & Vue Typecheck
npx vue-tsc --noEmit

# 2. Frontend Unit Tests (Vitest)
npm test

# 3. Production Frontend Bundle Build
npm run build

# 4. Rust Backend Linting (Clippy & Fmt)
# Note: Windows devs should use a short Cargo target directory to prevent path length issues (MAX_PATH)
# PowerShell: $env:CARGO_TARGET_DIR = "C:\oterm-t"
cd src-tauri
WHISPER_FEATURE=$(node ../scripts/whisper-backend.mjs)
cargo fmt --all -- --check
cargo clippy --all-targets --features "$WHISPER_FEATURE" -- -D warnings

# 5. Rust Unit & Integration Tests
cargo test --lib --features "$WHISPER_FEATURE"
cargo test --features "$WHISPER_FEATURE" # Spawns pty integration tests (requires pwsh on Windows)
cd ..

# 6. E2E Desktop Build Verification
npm run tauri build
```

---

## 🤝 Contribution Guidelines

### 🤖 AI-Generated Commits
If you are pair-programming with or utilizing an AI agent (such as Claude, Antigravity, or Copilot) to generate code contributions, please include the proper attribution at the bottom of your commit message. 

> [!IMPORTANT]
> To preserve the integrity of code reviews, do not print or output the `Co-Authored-By` line in pull request descriptions or chat transcripts. Place it strictly in the Git commit metadata.

```text
Co-Authored-By: <Agent Name> <noreply@<domain>>
```
(Replace `<Agent Name>` with the active agent's name, and `<domain>` with its creator's domain—for example, `google.com` for Antigravity, or `anthropic.com` for Claude.)

### 💬 Code Style & Architecture
- Keep UI components clean, reusable, and structured as vertical slices.
- Do not make platform-specific assumptions (handle Windows/macOS/Linux pathing and shell execution differences gracefully).
- Preserve existing comments and docstrings unless explicitly updating the behavior they document.
