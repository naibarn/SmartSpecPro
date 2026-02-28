import React from 'react';
import { motion } from 'framer-motion';

interface SlideProps {
    children: React.ReactNode;
    isActive: boolean;
    direction: number; // 1 for next, -1 for prev
}

const variants = {
    enter: (direction: number) => {
        return {
            x: direction > 0 ? 1000 : -1000,
            opacity: 0,
            scale: 0.9,
            filter: 'blur(10px)',
        };
    },
    center: {
        zIndex: 1,
        x: 0,
        opacity: 1,
        scale: 1,
        filter: 'blur(0px)',
    },
    exit: (direction: number) => {
        return {
            zIndex: 0,
            x: direction < 0 ? 1000 : -1000,
            opacity: 0,
            scale: 0.9,
            filter: 'blur(10px)',
        };
    }
};

export const Slide: React.FC<SlideProps> = ({ children, isActive, direction }) => {
    if (!isActive) return null;

    return (
        <motion.div
            custom={direction}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{
                x: { type: "spring", stiffness: 300, damping: 30 },
                opacity: { duration: 0.4 },
                scale: { duration: 0.4 },
                filter: { duration: 0.4 }
            }}
            className="absolute inset-0 flex items-center justify-center p-8 md:p-16"
        >
            <div className="w-full max-w-6xl w-full h-full max-h-[85vh] glass-card rounded-3xl p-8 md:p-12 overflow-y-auto no-scrollbar relative flex flex-col justify-center border border-white/20 dark:border-white/10 shadow-2xl backdrop-blur-3xl bg-background/10">
                {children}
            </div>
        </motion.div>
    );
};
