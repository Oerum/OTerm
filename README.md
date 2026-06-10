# OTerm

Advanced terminal emulator built with Tauri and Vue.

## Windows Explorer integration

Folder context menus (**Open with OTerm here**, and **Open with Visual Studio** when Visual Studio is installed) are registered by the **NSIS** installer (`bundle/nsis/*-setup.exe`), not the MSI package.

On Windows 11, open the classic menu via **Show more options** on a folder right-click. OTerm and Visual Studio also appear under **Open with** in that menu.

## License

This project is licensed under the [GNU Affero General Public License v3.0 or later](LICENSE) (AGPL-3.0).

## Local dictation (Whisper)

The composer supports fully local speech-to-text via `whisper-rs`, `cpal`, and `hound`. The default model is `ggml-tiny.bin`, cached under `~/.oterm/whisper-models/`.

### Native build prerequisites

Building the Tauri backend with dictation enabled requires:

- **CMake** and a **C++ toolchain** (Visual Studio Build Tools on Windows)
- **libclang** for bindgen (`LIBCLANG_PATH` pointing at LLVM `bin` on Windows if not on PATH)
- **Windows:** [Vulkan SDK](https://vulkan.lunarg.com/) (default accelerated Whisper backend)
- **macOS:** Xcode Command Line Tools (Metal backend)
- **Linux:** build-essential and OpenBLAS development packages

The first build compiles `whisper.cpp` and can take several minutes.

On Windows, `npm run tauri dev` auto-detects `VULKAN_SDK` and `LIBCLANG_PATH` when they are not already set. You can also set them permanently in your user environment so plain `cargo build` works outside npm.

