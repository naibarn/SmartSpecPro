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
        <div className="absolute inset-0 overflow-hidden bg-gradient-to-br from-slate-50 via-white to-blue-50/40 z-0 pointer-events-none">
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
            {/* Enterprise Light Overlay for optimal text readability */}
            <div className="absolute inset-0 bg-gradient-to-br from-background/88 via-background/72 to-background/94" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(255,255,255,0.7)_100%)]" />
        </div>
    );
};
