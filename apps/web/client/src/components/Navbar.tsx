/**
 * Navbar Component
 * Design: Ethereal Gradient Flow - Glassmorphism navigation
 * Features: Sticky header, glass effect, smooth transitions
 */

import { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Menu, X, Sparkles, ChevronDown, Zap, Bot } from "lucide-react";
import { useTenant } from "@/contexts/TenantContext";
import { LocaleToggle } from "@/components/LocaleToggle";
import { useScopedTranslation } from "@/i18n/useScopedTranslation";
import { cn } from "@/lib/utils";

interface NavLink {
  href: string;
  label: string;
}

interface NavDropdown {
  label: string;
  items: Array<{
    href: string;
    label: string;
    icon: typeof Zap;
    description: string;
  }>;
}

type NavItem = NavLink | NavDropdown;

function isDropdown(item: NavItem): item is NavDropdown {
  return "items" in item;
}

export function Navbar() {
  const [location] = useLocation();
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { tenant } = useTenant();
  const { t } = useScopedTranslation("nav");
  const tenantLogoUrl = tenant?.websiteLogoUrl || tenant?.logoUrl || "";
  const [logoLoadFailed, setLogoLoadFailed] = useState(false);

  useEffect(() => {
    setLogoLoadFailed(false);
  }, [tenantLogoUrl]);

  const navItems: NavItem[] = [
    { href: "/", label: t("navbar.home") },
    { href: "/features", label: t("navbar.features") },
    { href: "/workflows/gallery", label: t("navbar.workflows") },
    { href: "/pricing", label: t("navbar.pricing") },
    { href: "/gallery", label: t("navbar.gallery") },
    {
      label: t("navbar.marketplace"),
      items: [
        {
          href: "/marketplace",
          label: t("navbar.marketplaceSkills"),
          icon: Zap,
          description: "Browse reusable skills and prompts",
        },
        {
          href: "/agencies/marketplace",
          label: t("navbar.marketplaceAgencies"),
          icon: Bot,
          description: "Swarm-ready team templates",
        },
      ],
    },
    { href: "/docs", label: t("navbar.docs") },
    { href: "/blog", label: t("navbar.blog") },
    { href: "/contact", label: t("navbar.contact") },
  ];

  // Flatten for mobile menu
  const mobileLinks: NavLink[] = navItems.flatMap(item =>
    isDropdown(item)
      ? item.items.map(sub => ({
          href: sub.href,
          label: `${item.label} — ${sub.label}`,
        }))
      : [item]
  );

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    if (!isMobileMenuOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsMobileMenuOpen(false);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isMobileMenuOpen]);

  useEffect(() => {
    setIsMobileMenuOpen(false);
    setOpenDropdown(null);
  }, [location]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setOpenDropdown(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Hide navbar on auth pages
  const isAuthPage = location === "/login" || location === "/signup";
  if (isAuthPage) return null;

  return (
    <motion.header
      initial={{ y: -100 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        isScrolled
          ? "bg-background/70 backdrop-blur-xl border-b border-border/50 shadow-lg"
          : "bg-transparent"
      }`}
    >
      <nav className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 lg:h-20">
          {/* Logo */}
          <Link href="/">
            <motion.div
              className="flex items-center gap-2 cursor-pointer"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              {tenantLogoUrl && !logoLoadFailed ? (
                <img
                  src={tenantLogoUrl}
                  alt={tenant?.name || "Logo"}
                  className="h-8 w-auto max-w-[128px] object-contain sm:h-10 sm:max-w-[160px] lg:h-12 lg:max-w-[200px]"
                  onError={() => setLogoLoadFailed(true)}
                />
              ) : (
                <>
                  <div className="w-8 h-8 sm:w-10 sm:h-10 lg:w-12 lg:h-12 rounded-xl bg-gradient-to-br from-blue-500 via-cyan-400 to-teal-400 flex items-center justify-center shadow-lg shrink-0">
                    <Sparkles className="w-4 h-4 sm:w-5 sm:h-5 lg:w-6 lg:h-6 text-white" />
                  </div>
                  <span className="text-base sm:text-xl lg:text-2xl font-bold gradient-text">
                    SmartAIHub
                  </span>
                  <span className="hidden sm:inline-block px-2 py-0.5 text-xs font-semibold bg-primary/10 text-primary rounded-full">
                    Pro
                  </span>
                </>
              )}
            </motion.div>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden lg:flex items-center gap-1" ref={dropdownRef}>
            {navItems.map(item => {
              if (isDropdown(item)) {
                const isActive = item.items.some(sub => location === sub.href);
                const isOpen = openDropdown === item.label;

                return (
                  <div key={item.label} className="relative">
                    <motion.button
                      className={`inline-flex items-center gap-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                        isActive
                          ? "text-primary bg-primary/10"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                      }`}
                      onClick={() =>
                        setOpenDropdown(isOpen ? null : item.label)
                      }
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      {item.label}
                      <ChevronDown
                        className={`h-3.5 w-3.5 transition-transform ${isOpen ? "rotate-180" : ""}`}
                      />
                    </motion.button>

                    <AnimatePresence>
                      {isOpen && (
                        <motion.div
                          initial={{ opacity: 0, y: 8, scale: 0.95 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: 8, scale: 0.95 }}
                          transition={{ duration: 0.15 }}
                          className="absolute top-full left-0 mt-1 w-64 rounded-xl border bg-background/95 backdrop-blur-xl shadow-xl overflow-hidden"
                        >
                          {item.items.map(sub => {
                            const Icon = sub.icon;
                            return (
                              <Link key={sub.href} href={sub.href}>
                                <div
                                  className={`flex items-start gap-3 px-4 py-3 transition-colors cursor-pointer ${
                                    location === sub.href
                                      ? "bg-primary/10 text-primary"
                                      : "hover:bg-muted/50"
                                  }`}
                                  onClick={() => setOpenDropdown(null)}
                                >
                                  <div className="mt-0.5 w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                                    <Icon className="h-4 w-4 text-primary" />
                                  </div>
                                  <div>
                                    <p className="text-sm font-medium">
                                      {sub.label}
                                    </p>
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                      {sub.description}
                                    </p>
                                  </div>
                                </div>
                              </Link>
                            );
                          })}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              }

              return (
                <Link key={item.href} href={item.href}>
                  <motion.span
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                      location === item.href
                        ? "text-primary bg-primary/10"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                    }`}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    {item.label}
                  </motion.span>
                </Link>
              );
            })}
          </div>

          {/* CTA Buttons */}
          <div className="hidden lg:flex items-center gap-3">
            <LocaleToggle />
            <Link href="/login">
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
              >
                {t("navbar.signIn")}
              </Button>
            </Link>
            <Link href="/signup">
              <Button
                size="sm"
                className="bg-gradient-to-r from-blue-500 to-teal-400 hover:from-blue-600 hover:to-teal-500 text-white shadow-lg shadow-blue-500/25"
              >
                {t("navbar.getStarted")}
              </Button>
            </Link>
          </div>

          {/* Mobile Menu Button */}
          <button
            className="lg:hidden flex h-11 w-11 items-center justify-center rounded-lg hover:bg-muted/50 transition-colors"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            aria-label={isMobileMenuOpen ? "Close menu" : "Open menu"}
            aria-expanded={isMobileMenuOpen}
          >
            {isMobileMenuOpen ? (
              <X className="w-6 h-6" />
            ) : (
              <Menu className="w-6 h-6" />
            )}
          </button>
        </div>
      </nav>

      {/* Mobile Menu */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="lg:hidden bg-background/96 backdrop-blur-xl border-b border-border/50 shadow-xl"
          >
            <div className="container mx-auto max-h-[calc(100dvh-4rem)] space-y-2 overflow-y-auto px-4 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
              {mobileLinks.map(link => (
                <Link key={link.href} href={link.href}>
                  <motion.div
                    className={cn(
                      "block rounded-xl px-4 py-3 text-base font-medium leading-snug transition-colors",
                      location === link.href
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                    )}
                    onClick={() => setIsMobileMenuOpen(false)}
                    whileTap={{ scale: 0.98 }}
                  >
                    {link.label}
                  </motion.div>
                </Link>
              ))}
              <div className="space-y-3 pt-4">
                <div className="flex justify-center pb-2">
                  <LocaleToggle />
                </div>
                <Link href="/login">
                  <Button
                    variant="outline"
                    className="h-11 w-full"
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    {t("navbar.signIn")}
                  </Button>
                </Link>
                <Link href="/signup">
                  <Button
                    className="h-11 w-full bg-gradient-to-r from-blue-500 to-teal-400 text-white"
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    {t("navbar.getStarted")}
                  </Button>
                </Link>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.header>
  );
}
