import React from 'react';
import { motion } from 'framer-motion';

interface SlideProps {
    children: React.ReactNode;
    isActive: boolean;
    direction: number; // 1 for next, -1 for prev
    compact?: boolean;
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

export const Slide: React.FC<SlideProps> = ({ children, isActive, direction, compact = false }) => {
    if (!isActive) return null;

    if (compact) {
        return (
            <motion.section
                initial={{ opacity: 0, y: 18 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.18 }}
                transition={{ duration: 0.35 }}
                className="relative w-full overflow-hidden rounded-2xl border border-white/70 bg-background/90 p-5 shadow-xl shadow-blue-900/5 backdrop-blur-2xl sm:p-7"
            >
                {children}
            </motion.section>
        );
    }

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
            <div className="w-full max-w-6xl h-full max-h-[85vh] glass-card rounded-3xl p-8 md:p-12 overflow-y-auto no-scrollbar relative flex flex-col justify-center border border-white/20 dark:border-white/10 shadow-2xl backdrop-blur-3xl bg-background/10">
                {children}
            </div>
        </motion.div>
    );
};
