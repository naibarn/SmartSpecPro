// Video Editor Module
// Provides FFmpeg integration, workspace management, and rendering capabilities

pub mod ffmpeg;
pub mod workspace;
pub mod render;

pub use ffmpeg::*;
pub use workspace::*;
pub use render::*;
