import { useState } from "react"
import { Sun, Moon } from "lucide-react"
import { motion } from "framer-motion"

import { cn } from "@/lib/utils"

/*
 * Cinematic theme switcher.
 *
 * Adapted from a Next.js / next-themes component to this Vite app: the theme
 * is owned by App.tsx (persisted to localStorage "admitica.theme" and applied
 * via <html data-theme>), so this stays a controlled, prop-driven toggle
 * instead of pulling in next-themes (which would create a second, competing
 * theme system). The native size is 104x64px; pass `scale` to fit it into
 * tight containers like the sidebar header or mobile top bar.
 */

interface Particle {
  id: number
  delay: number
  duration: number
}

const W = 104
const H = 64

export interface CinematicThemeSwitcherProps {
  /** Current theme – the single source of truth lives in App.tsx. */
  theme: "dark" | "light"
  /** Flip the theme. */
  onToggle: () => void
  /** Applied to the (layout-reserving) outer wrapper, e.g. "ml-auto". */
  className?: string
  /** Uniform scale of the 104x64 control. Defaults to 1 (native size). */
  scale?: number
}

export function CinematicThemeSwitcher({ theme, onToggle, className, scale = 1 }: CinematicThemeSwitcherProps) {
  const isDark = theme === "dark"

  const [particles, setParticles] = useState<Particle[]>([])
  const [isAnimating, setIsAnimating] = useState(false)

  // Generate staggered particle layers for the toggle burst.
  const generateParticles = () => {
    const newParticles: Particle[] = []
    const particleCount = 3

    for (let i = 0; i < particleCount; i++) {
      newParticles.push({
        id: i,
        delay: i * 0.1,
        duration: 0.6 + i * 0.1,
      })
    }

    setParticles(newParticles)
    setIsAnimating(true)

    setTimeout(() => {
      setIsAnimating(false)
      setParticles([])
    }, 1000)
  }

  const handleToggle = () => {
    generateParticles()
    onToggle()
  }

  return (
    // Outer wrapper reserves the *scaled* footprint so the control lays out
    // correctly inside flex rows; the inner box keeps its native size and is
    // visually scaled from the top-left corner.
    <div
      className={cn("relative inline-block shrink-0", className)}
      style={{ width: W * scale, height: H * scale }}
    >
      <div style={{ width: W, height: H, transform: `scale(${scale})`, transformOrigin: "top left" }}>
        {/* Pill-shaped track container */}
        <motion.button
          onClick={handleToggle}
          className="relative flex h-[64px] w-[104px] items-center rounded-full p-[6px] transition-all duration-300 focus:outline-none"
          style={{
            background: isDark
              ? "radial-gradient(ellipse at top left, #1e293b 0%, #0f172a 40%, #020617 100%)"
              : "radial-gradient(ellipse at top left, #ffffff 0%, #f1f5f9 40%, #cbd5e1 100%)",
            boxShadow: isDark
              ? `
                inset 5px 5px 12px rgba(0, 0, 0, 0.9),
                inset -5px -5px 12px rgba(71, 85, 105, 0.4),
                inset 8px 8px 16px rgba(0, 0, 0, 0.7),
                inset -8px -8px 16px rgba(100, 116, 139, 0.2),
                inset 0 2px 4px rgba(0, 0, 0, 1),
                inset 0 -2px 4px rgba(71, 85, 105, 0.4),
                inset 0 0 20px rgba(0, 0, 0, 0.6),
                0 1px 1px rgba(255, 255, 255, 0.05),
                0 2px 4px rgba(0, 0, 0, 0.4),
                0 8px 16px rgba(0, 0, 0, 0.4),
                0 16px 32px rgba(0, 0, 0, 0.3),
                0 24px 48px rgba(0, 0, 0, 0.2)
              `
              : `
                inset 5px 5px 12px rgba(148, 163, 184, 0.5),
                inset -5px -5px 12px rgba(255, 255, 255, 1),
                inset 8px 8px 16px rgba(100, 116, 139, 0.3),
                inset -8px -8px 16px rgba(255, 255, 255, 0.9),
                inset 0 2px 4px rgba(148, 163, 184, 0.4),
                inset 0 -2px 4px rgba(255, 255, 255, 1),
                inset 0 0 20px rgba(203, 213, 225, 0.3),
                0 1px 2px rgba(255, 255, 255, 1),
                0 2px 4px rgba(0, 0, 0, 0.1),
                0 8px 16px rgba(0, 0, 0, 0.08),
                0 16px 32px rgba(0, 0, 0, 0.06),
                0 24px 48px rgba(0, 0, 0, 0.04)
              `,
            border: isDark ? "2px solid rgba(51, 65, 85, 0.6)" : "2px solid rgba(203, 213, 225, 0.6)",
            position: "relative",
          }}
          aria-label={`Switch to ${isDark ? "light" : "dark"} mode`}
          role="switch"
          aria-checked={isDark}
          whileTap={{ scale: 0.98 }}
        >
          {/* Deep inner groove/rim effect */}
          <div
            className="pointer-events-none absolute inset-[3px] rounded-full"
            style={{
              boxShadow: isDark
                ? "inset 0 2px 6px rgba(0, 0, 0, 0.9), inset 0 -1px 3px rgba(71, 85, 105, 0.3)"
                : "inset 0 2px 6px rgba(100, 116, 139, 0.4), inset 0 -1px 3px rgba(255, 255, 255, 0.8)",
            }}
          />

          {/* Multi-layer glossy overlay */}
          <div
            className="pointer-events-none absolute inset-0 rounded-full"
            style={{
              background: isDark
                ? `
                  radial-gradient(ellipse at top, rgba(71, 85, 105, 0.15) 0%, transparent 50%),
                  linear-gradient(to bottom, rgba(71, 85, 105, 0.2) 0%, transparent 30%, transparent 70%, rgba(0, 0, 0, 0.3) 100%)
                `
                : `
                  radial-gradient(ellipse at top, rgba(255, 255, 255, 0.8) 0%, transparent 50%),
                  linear-gradient(to bottom, rgba(255, 255, 255, 0.7) 0%, transparent 30%, transparent 70%, rgba(148, 163, 184, 0.15) 100%)
                `,
              mixBlendMode: "overlay",
            }}
          />

          {/* Ambient occlusion effect */}
          <div
            className="pointer-events-none absolute inset-0 rounded-full"
            style={{
              boxShadow: isDark
                ? "inset 0 0 15px rgba(0, 0, 0, 0.5)"
                : "inset 0 0 15px rgba(148, 163, 184, 0.2)",
            }}
          />

          {/* Background Icons */}
          <div className="absolute inset-0 flex items-center justify-between px-4">
            <Sun size={20} className={isDark ? "text-yellow-100" : "text-amber-600"} />
            <Moon size={20} className={isDark ? "text-yellow-100" : "text-slate-700"} />
          </div>

          {/* Circular Thumb with Bouncy Spring Physics */}
          <motion.div
            className="relative z-10 flex h-[44px] w-[44px] items-center justify-center overflow-hidden rounded-full"
            style={{
              background: isDark
                ? "linear-gradient(145deg, #64748b 0%, #475569 50%, #334155 100%)"
                : "linear-gradient(145deg, #ffffff 0%, #fefefe 50%, #f8fafc 100%)",
              boxShadow: isDark
                ? `
                  inset 2px 2px 4px rgba(100, 116, 139, 0.4),
                  inset -2px -2px 4px rgba(0, 0, 0, 0.8),
                  inset 0 1px 1px rgba(255, 255, 255, 0.15),
                  0 1px 2px rgba(255, 255, 255, 0.1),
                  0 8px 32px rgba(0, 0, 0, 0.6),
                  0 4px 12px rgba(0, 0, 0, 0.5),
                  0 2px 4px rgba(0, 0, 0, 0.4)
                `
                : `
                  inset 2px 2px 4px rgba(203, 213, 225, 0.3),
                  inset -2px -2px 4px rgba(255, 255, 255, 1),
                  inset 0 1px 2px rgba(255, 255, 255, 1),
                  0 1px 2px rgba(255, 255, 255, 1),
                  0 8px 32px rgba(0, 0, 0, 0.18),
                  0 4px 12px rgba(0, 0, 0, 0.12),
                  0 2px 4px rgba(0, 0, 0, 0.08)
                `,
              border: isDark ? "2px solid rgba(148, 163, 184, 0.3)" : "2px solid rgba(255, 255, 255, 0.9)",
            }}
            animate={{
              x: isDark ? 46 : 0,
            }}
            transition={{
              type: "spring",
              stiffness: 300,
              damping: 20,
            }}
          >
            {/* Glossy shine overlay on thumb */}
            <div
              className="pointer-events-none absolute inset-0 rounded-full"
              style={{
                background:
                  "linear-gradient(to bottom, rgba(255, 255, 255, 0.4) 0%, transparent 40%, rgba(0, 0, 0, 0.1) 100%)",
                mixBlendMode: "overlay",
              }}
            />

            {/* Particle Layer - expanding circles from center with grainy texture */}
            {isAnimating &&
              particles.map((particle) => (
                <motion.div
                  key={particle.id}
                  className="pointer-events-none absolute inset-0 flex items-center justify-center"
                >
                  <motion.div
                    className="absolute rounded-full"
                    style={{
                      width: "10px",
                      height: "10px",
                      background: isDark
                        ? "radial-gradient(circle, rgba(147, 197, 253, 0.5) 0%, rgba(147, 197, 253, 0) 70%)"
                        : "radial-gradient(circle, rgba(251, 191, 36, 0.7) 0%, rgba(251, 191, 36, 0) 70%)",
                      mixBlendMode: "normal",
                    }}
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: isDark ? 6 : 8, opacity: [0, 1, 0] }}
                    transition={{
                      duration: isDark ? 0.5 : particle.duration,
                      delay: particle.delay,
                      ease: "easeOut",
                    }}
                  >
                    {/* Grainy texture overlay */}
                    <div
                      className="absolute inset-0 rounded-full opacity-40"
                      style={{
                        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
                        mixBlendMode: "overlay",
                      }}
                    />
                  </motion.div>
                </motion.div>
              ))}

            {/* Icon */}
            <div className="relative z-10">
              {isDark ? (
                <Moon size={20} className="text-yellow-200" />
              ) : (
                <Sun size={20} className="text-amber-500" />
              )}
            </div>
          </motion.div>
        </motion.button>
      </div>
    </div>
  )
}

export default CinematicThemeSwitcher
