import React from 'react';
import ReactPlayer from 'react-player';

interface VideoBackgroundProps {
    url: string;
    opacity?: number;
}

export const VideoBackground: React.FC<VideoBackgroundProps> = ({
    url,
    opacity = 0.5
}) => {
    return (
        <div className="absolute inset-0 overflow-hidden bg-black z-0 pointer-events-none">
            <ReactPlayer
                // @ts-ignore: ReactPlayer type definitions are currently incompatible with React 19 ref attributes
                url={url}
                playing
                loop
                muted
                width="100%"
                height="100%"
                style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    objectFit: 'cover',
                    minWidth: '100vw',
                    minHeight: '100vh',
                    opacity,
                }}
            />
            {/* Ethereal Dark Gradient Overlay for optimal text readability */}
            <div className="absolute inset-0 bg-gradient-to-br from-background/80 via-background/60 to-background/90" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(0,0,0,0.4)_100%)]" />
        </div>
    );
};
