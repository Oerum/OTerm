# OTerm

Advanced terminal emulator built with Tauri and Vue.

## Windows Explorer integration

Folder context menus (**Open with OTerm here**, and **Open with Visual Studio** when Visual Studio is installed) are registered by the **NSIS** installer (`bundle/nsis/*-setup.exe`), not the MSI package.

On Windows 11, open the classic menu via **Show more options** on a folder right-click. OTerm and Visual Studio also appear under **Open with** in that menu.

## License

This project is licensed under the [GNU Affero General Public License v3.0 or later](LICENSE) (AGPL-3.0).

