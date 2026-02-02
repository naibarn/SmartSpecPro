import React from "react";

interface VideoPlayerProps {
  src?: string;
  poster?: string;
  controls?: boolean;
  autoPlay?: boolean;
  className?: string;
}

export function VideoPlayer({
  src,
  poster,
  controls = true,
  autoPlay = false,
  className = ""
}: VideoPlayerProps) {
  if (!src) return null;

  return (
    <video
      src={src}
      poster={poster}
      controls={controls}
      autoPlay={autoPlay}
      className={`w-full rounded-lg ${className}`}
    >
      Your browser does not support the video tag.
    </video>
  );
}
