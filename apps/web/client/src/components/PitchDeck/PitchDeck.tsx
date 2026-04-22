import React, { useState, useEffect, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Maximize, Minimize, ChevronLeft, ChevronRight } from 'lucide-react';

interface PitchDeckProps {
    children: React.ReactNode[];
}

export const PitchDeck: React.FC<PitchDeckProps> = ({ children }) => {
    const [[page, direction], setPage] = useState([0, 0]);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [isCompactLayout, setIsCompactLayout] = useState(() =>
        typeof window !== 'undefined' && typeof window.matchMedia === 'function'
            ? window.matchMedia('(max-width: 1023px)').matches
            : false
    );

    // Cast children to array to ensure we can map and read length
    const slides = React.Children.toArray(children);
    const totalSlides = slides.length;

    useEffect(() => {
        if (typeof window.matchMedia !== 'function') return;

        const mediaQuery = window.matchMedia('(max-width: 1023px)');
        const handleChange = () => setIsCompactLayout(mediaQuery.matches);

        handleChange();
        mediaQuery.addEventListener('change', handleChange);
        return () => mediaQuery.removeEventListener('change', handleChange);
    }, []);

    const activeIndex = totalSlides > 0 ? Math.abs(page % totalSlides) : 0;

    const paginate = useCallback((newDirection: number) => {
        setPage(([currentPage]) => {
            const nextPage = currentPage + newDirection;
            // Prevent wrapping around if we are at the boundaries
            if (totalSlides === 0 || nextPage < 0 || nextPage >= totalSlides) {
                return [currentPage, 0];
            }
            return [nextPage, newDirection];
        });
    }, [totalSlides]);

    const handleKeyDown = useCallback(
        (e: KeyboardEvent) => {
            if (e.key === 'ArrowRight' || e.key === 'Space') {
                paginate(1);
            } else if (e.key === 'ArrowLeft') {
                paginate(-1);
            } else if (e.key === 'Escape') {
                if (isFullscreen) {
                    document.exitFullscreen();
                }
            }
        },
        [paginate, isFullscreen]
    );

    useEffect(() => {
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleKeyDown]);

    const toggleFullscreen = () => {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(err => {
                console.error(`Error attempting to enable fullscreen: ${err.message}`);
            });
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen();
            }
        }
    };

    useEffect(() => {
        const handleFullscreenChange = () => {
            setIsFullscreen(!!document.fullscreenElement);
        };
        document.addEventListener('fullscreenchange', handleFullscreenChange);
        return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
    }, []);

    // Progress calculation
    const progress = totalSlides > 1 ? ((activeIndex) / (totalSlides - 1)) * 100 : 100;

    if (totalSlides === 0) {
        return null;
    }

    if (isCompactLayout) {
        return (
            <div className="relative min-h-screen w-full overflow-x-hidden bg-background pt-20 pb-8 text-foreground select-none">
                <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-gradient-to-br from-slate-50 via-background to-blue-50/40">
                    <svg
                        className="absolute left-1/2 top-0 h-[120vh] w-[180vw] -translate-x-1/2 opacity-20 mix-blend-screen"
                        viewBox="0 0 100 100"
                        preserveAspectRatio="none"
                    >
                        {[...Array(6)].map((_, i) => (
                            <motion.path
                                key={i}
                                d={`M-20,${42 + i * 7} Q30,${28 + i * 12} 55,${50 + i * 4} T120,${48 - i * 4}`}
                                fill="none"
                                stroke={i % 2 === 0 ? "url(#compactGradient1)" : "url(#compactGradient2)"}
                                strokeWidth="0.24"
                                initial={{ pathLength: 0, opacity: 0.1 }}
                                animate={{
                                    pathLength: [0, 1, 1, 0],
                                    opacity: [0.1, 0.35, 0.1],
                                }}
                                transition={{
                                    duration: 18 + i * 2,
                                    repeat: Infinity,
                                    ease: "easeInOut",
                                    delay: i * 0.4
                                }}
                            />
                        ))}
                        <defs>
                            <linearGradient id="compactGradient1" x1="0%" y1="0%" x2="100%" y2="0%">
                                <stop offset="0%" stopColor="#3b82f6" />
                                <stop offset="55%" stopColor="#06b6d4" />
                                <stop offset="100%" stopColor="#14b8a6" />
                            </linearGradient>
                            <linearGradient id="compactGradient2" x1="0%" y1="0%" x2="100%" y2="0%">
                                <stop offset="0%" stopColor="#14b8a6" />
                                <stop offset="55%" stopColor="#06b6d4" />
                                <stop offset="100%" stopColor="#3b82f6" />
                            </linearGradient>
                        </defs>
                    </svg>
                    <div className="absolute inset-0 bg-gradient-to-b from-background/92 via-background/82 to-background/96" />
                </div>

                <div className="relative z-10 mx-auto flex w-full max-w-4xl flex-col gap-5 px-4 sm:gap-6 sm:px-6">
                    {slides.map((slide, index) => {
                        if (React.isValidElement(slide)) {
                            return React.cloneElement(slide as React.ReactElement<any>, {
                                key: index,
                                isActive: true,
                                direction: 0,
                                compact: true
                            });
                        }
                        return null;
                    })}
                </div>
            </div>
        );
    }

    return (
        <div className="relative w-screen h-screen overflow-hidden bg-background text-foreground select-none">

            {/* Elegant Line-Art Background (SVG + Framer Motion) replacing buggy video player */}
            <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden bg-gradient-to-br from-slate-50 via-background to-blue-50/40 flex items-center justify-center">
                <svg
                    className="absolute w-[200vw] h-[200vh] opacity-20 mix-blend-screen"
                    viewBox="0 0 100 100"
                    preserveAspectRatio="none"
                >
                    {[...Array(8)].map((_, i) => (
                        <motion.path
                            key={i}
                            d={`M-20,${50 + i * 5} Q30,${30 + i * 15} 50,${50 + i * 5} T120,${50 - i * 5}`}
                            fill="none"
                            stroke={i % 2 === 0 ? "url(#gradient1)" : "url(#gradient2)"}
                            strokeWidth="0.2"
                            initial={{ pathLength: 0, opacity: 0.1 }}
                            animate={{
                                pathLength: [0, 1, 1, 0],
                                opacity: [0.1, 0.4, 0.1],
                                d: [
                                    `M-20,${50 + i * 5} Q30,${30 + i * 15} 50,${50 + i * 5} T120,${50 - i * 5}`,
                                    `M-20,${45 + i * 8} Q40,${20 + i * 10} 60,${60 + i * 5} T120,${40 - i * 8}`,
                                    `M-20,${55 + i * 3} Q20,${40 + i * 20} 40,${40 + i * 5} T120,${60 - i * 3}`,
                                    `M-20,${50 + i * 5} Q30,${30 + i * 15} 50,${50 + i * 5} T120,${50 - i * 5}`
                                ],
                            }}
                            transition={{
                                duration: 20 + i * 2,
                                repeat: Infinity,
                                ease: "easeInOut",
                                delay: i * 0.5
                            }}
                        />
                    ))}
                    <defs>
                        <linearGradient id="gradient1" x1="0%" y1="0%" x2="100%" y2="0%">
                            <stop offset="0%" stopColor="#3b82f6" />
                            <stop offset="50%" stopColor="#06b6d4" />
                            <stop offset="100%" stopColor="#14b8a6" />
                        </linearGradient>
                        <linearGradient id="gradient2" x1="0%" y1="0%" x2="100%" y2="0%">
                            <stop offset="0%" stopColor="#06b6d4" />
                            <stop offset="50%" stopColor="#14b8a6" />
                            <stop offset="100%" stopColor="#3b82f6" />
                        </linearGradient>
                    </defs>
                </svg>

                {/* Ethereal overlay to prevent visual clutter */}
                <div className="absolute inset-0 bg-gradient-to-b from-background/92 via-background/80 to-background/94 pointer-events-none" />
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(255,255,255,0.65)_100%)] pointer-events-none" />
            </div>

            {/* Slides Container */}
            <div className="relative w-full h-full z-10 flex items-center justify-center">
                <AnimatePresence initial={false} custom={direction} mode="sync">
                    {slides.map((slide, index) => {
                        if (index !== activeIndex) return null;
                        // Inject isActive and direction to the Slide component child
                        if (React.isValidElement(slide)) {
                            return React.cloneElement(slide as React.ReactElement<any>, {
                                key: index,
                                isActive: index === activeIndex,
                                direction
                            });
                        }
                        return null;
                    })}
                </AnimatePresence>
            </div>

            {/* Navigation & Controls */}
            <div className="absolute bottom-0 left-0 right-0 p-6 flex flex-col items-center justify-between z-50 pointer-events-none">

                {/* Progress Bar */}
                <div className="w-full max-w-lg mb-6 pointer-events-auto h-1.5 bg-muted/50 rounded-full overflow-hidden backdrop-blur-sm border border-border/60 shadow-[0_0_15px_rgba(59,130,246,0.12)]">
                    <div
                        className="h-full bg-gradient-to-r from-blue-500 via-cyan-400 to-teal-400 rounded-full transition-all duration-500 ease-out shadow-[0_0_10px_rgba(59,130,246,0.35)]"
                        style={{ width: `${progress}%` }}
                    />
                </div>

                {/* Bottom Bar: Navigation / Fullscreen */}
                <div className="w-full flex justify-between items-end">
                    <div className="pointer-events-auto flex gap-2">
                        <button
                            onClick={() => paginate(-1)}
                            disabled={activeIndex === 0}
                            className="p-3 rounded-full glass-card hover:bg-white/80 transition-all disabled:opacity-30 disabled:cursor-not-allowed group border border-border/60 shadow-lg text-foreground hover:scale-105 bg-white/70"
                            aria-label="Previous Slide"
                        >
                            <ChevronLeft className="w-6 h-6 group-hover:-translate-x-1 transition-transform" />
                        </button>
                        <button
                            onClick={() => paginate(1)}
                            disabled={activeIndex === totalSlides - 1}
                            className="p-3 rounded-full glass-card hover:bg-white/80 transition-all disabled:opacity-30 disabled:cursor-not-allowed group border border-border/60 shadow-lg text-foreground hover:scale-105 bg-white/70"
                            aria-label="Next Slide"
                        >
                            <ChevronRight className="w-6 h-6 group-hover:translate-x-1 transition-transform" />
                        </button>
                    </div>

                    <div className="pointer-events-auto">
                        <button
                            onClick={toggleFullscreen}
                            className="p-3 rounded-full glass-card hover:bg-white/80 transition-all text-foreground border border-border/60 shadow-lg hover:scale-105 bg-white/70"
                            aria-label="Toggle Fullscreen"
                        >
                            {isFullscreen ? <Minimize className="w-6 h-6" /> : <Maximize className="w-6 h-6" />}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
