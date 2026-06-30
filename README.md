# <p align="center"><img src="./public/app-icon.svg" alt="OTerm Logo" width="120" height="120"><br>OTerm</p>

<p align="center">
  <strong>The AI-Powered Developer Workspace for Terminal-Native Workflows.</strong>
</p>

<p align="center">
  <a href="https://github.com/Oerum/OTerm/releases/latest"><img src="https://img.shields.io/github/v/release/Oerum/OTerm?color=brightgreen&label=release" alt="Latest Release"></a>
  <img src="https://img.shields.io/badge/Platform-Windows%20%7C%20macOS%20%7C%20Linux-blue.svg" alt="Platforms">
  <img src="https://img.shields.io/badge/Framework-Tauri%202%20%2B%20Vue%203-orange.svg" alt="Framework">
  <a href="https://github.com/Oerum/OTerm/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-AGPL%20v3-red.svg" alt="License: AGPL v3"></a>
</p>

---

OTerm is a high-performance terminal emulator that bridges the gap between CLI efficiency and GUI convenience. Built on **Tauri 2** and **Vue 3**, it embeds rich, visual, Rust-powered developer tools directly into your terminal workspace. 

No more breaking your flow state by context-switching between separate applications. Stage files, monitor containers, browse remote servers, and query local AI models—**all from a single, unified terminal workspace.**

---

## 📸 Demo & Overview

![OTerm Dashboard](./public/oterm.png)

*To see OTerm in action, check out our [Visual Walkthrough](#key-features).*

---

## 🎯 Table of Contents
- [🚀 Key Features](#-key-features)
- [📦 Installation](#-installation)
- [🛠️ Tech Stack Overview](#️-tech-stack-overview)
- [🤝 Contributing & Development](#-contributing--development)
- [📄 License](#-license)

---

## 🚀 Key Features

OTerm consolidates your development utility belt directly into your terminal panes:

| **🎙️ Local Dictation (Whisper)** | **🤖 Integrated AI Assistant** |
| :--- | :--- |
| Compose prompts or commit messages with your voice using fully offline, local speech-to-text powered by `whisper-rs`. Native GPU acceleration supports Metal (macOS), Vulkan, and CUDA. | Zero-config LM Studio integration, Copilot OAuth token auto-loading, and compatibility with any OpenAI-compliant API endpoint for autocomplete and conversational agents. |
| **🐙 The Visual Git Suite** | **🐳 Direct Docker Dashboard** |
| Ditch separate Git clients. Visualize history with an interactive commit graph, view side-by-side diffs, stage specific lines/hunks, and manage branches directly from the workspace. | Monitor container status, stream logs in real-time, trigger container lifecycle events, and inspect volumes/images without leaving your current workspace. |
| **🔌 Secure SSH & SFTP Connection Hub** | **⚡ High Performance** |
| Connect to remote servers with multi-session SSH terminal panes alongside a dual-panel graphical SFTP file browser featuring drag-and-drop file transfers. | Built on Rust and Tauri 2 with a vertical-slice architecture to ensure rapid startup times and low resource consumption. |

---

## 📦 Installation

OTerm runs natively on **Windows**, **macOS**, and **Linux**.

### Desktop Installers
Download the latest installer or executable for your platform from the [Releases Page](https://github.com/Oerum/OTerm/releases/latest):

*   **macOS**: `.dmg` (Universal, Apple Silicon, and Intel)
*   **Windows**: `.msi` (Bundled GPU-accelerated dependencies)
*   **Linux**: `.AppImage` / `.deb`

---

## 🛠️ Tech Stack Overview

OTerm combines front-end design flexibility with native Rust performance:
-   **Frontend**: Vue 3 + TypeScript + Vite + Tailwind CSS v4. Terminal rendering is powered by `@xterm/xterm` with the `@xterm/addon-fit` addon.
-   **Desktop Wrapper**: Tauri 2 provides the secure native bridge, window management, and native system APIs.
-   **Backend (Rust)**: High-performance Rust modules handle multi-threaded SSH sessions, local audio capture for dictation, direct Docker socket communication, and Git IPC.

---

## 🤝 Contributing & Development

We welcome contributions from the developer community! 

If you are looking to build OTerm from source, run local tests, or contribute code, please refer to our [Contributing Guide](CONTRIBUTING.md).

*Note: For AI-assisted code contributions, please include the `Co-Authored-By` metadata in your commits as detailed in [CONTRIBUTING.md](CONTRIBUTING.md).*

---

## 📄 License

This project is licensed under the [GNU Affero General Public License v3.0 or later](LICENSE) (AGPL-3.0).
