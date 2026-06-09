#[cfg(windows)]
pub mod windows;

#[cfg(not(windows))]
pub mod desktop;

pub mod icon;
