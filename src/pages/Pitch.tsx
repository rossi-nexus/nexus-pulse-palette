import { useEffect, useRef, useState } from "react";
import { motion, useInView } from "framer-motion";
import {
  ShieldCheck,
  Layers,
  Repeat,
  Lock,
  Building2,
  Factory,
  Users,
  ChevronDown,
  ArrowRight,
  Mail,
  Globe,
  AlertTriangle,
  Eye,
  Database,
  Network,
} from "lucide-react";
import logoAexs from "@/assets/logo_aexs.png";

const sections = [
  { id: "opening", label: "Intro" },
  { id: "problem", label: "Problem" },
  { id: "pillars", label: "Moat" },
  { id: "defensible", label: "Defensible" },
  { id: "trust", label: "Trust" },
  { id: "audience", label: "Who" },
  { id: "wedge", label: "Wedge" },
  { id: "status", label: "Status" },
  { id: "contact", label: "Contact" },
] as const;

function Section({
  children,
  className = "",
  id,
}: {
  children: React.ReactNode;
  className?: string;
  id: string;
}) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: false, amount: 0.25 });
  return (
    <motion.section
      ref={ref}
      id={id}
      initial={{ opacity: 0, y: 32 }}
      animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 32 }}
      transition={{ duration: 0.7, ease: "easeOut" }}
      className={`min-h-[100dvh] snap-start flex flex-col items-center justify-center px-6 md:px-16 py-16 relative ${className}`}
    >
      {children}
    </motion.section>
  );
}

const Eyebrow = ({ children }: { children: React.ReactNode }) => (
  <p className="text-[10px] md:text-[11px] tracking-[0.32em] uppercase text-foreground-muted mb-6">
    <span className="text-gradient-accent font-semibold">{children}</span>
  </p>
);

export default function Pitch() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeIdx, setActiveIdx] = useState(0);

  useEffect(() => {
    const c = scrollRef.current;
    if (!c) return;
    const onScroll = () => {
      const idx = Math.round(c.scrollTop / c.clientHeight);
      setActiveIdx(Math.min(idx, sections.length - 1));
    };
    c.addEventListener("scroll", onScroll, { passive: true });
    return () => c.removeEventListener("scroll", onScroll);
  }, []);

  const scrollTo = (i: number) =>
    scrollRef.current?.children[i]?.scrollIntoView({ behavior: "smooth" });

  return (
    <div className="fixed inset-0 z-50 bg-background text-foreground">
      {/* Side dot nav */}
      <nav className="fixed right-5 top-1/2 -translate-y-1/2 z-50 hidden md:flex flex-col gap-3 items-end">
        {sections.map((s, i) => (
          <button
            key={s.id}
            onClick={() => scrollTo(i)}
            className="group flex items-center gap-3"
            aria-label={s.label}
          >
            <span
              className={`text-[10px] tracking-[0.2em] uppercase transition-opacity ${
                activeIdx === i
                  ? "opacity-100 text-foreground"
                  : "opacity-0 group-hover:opacity-60 text-foreground-muted"
              }`}
            >
              {s.label}
            </span>
            <span
              className={`block rounded-full transition-all duration-300 ${
                activeIdx === i
                  ? "w-2.5 h-2.5 bg-gradient-accent shadow-glow"
                  : "w-1.5 h-1.5 bg-foreground-muted/40 group-hover:bg-foreground-muted"
              }`}
            />
          </button>
        ))}
      </nav>

      <div
        ref={scrollRef}
        className="h-full overflow-y-auto snap-y snap-mandatory scroll-smooth"
      >
        {/* 1. OPENING */}
        <Section id="opening" className="text-center">
          <img src={logoAexs} alt="ÆXS" className="h-16 md:h-20 object-contain opacity-90" />
          <span className="block mt-4 text-2xl md:text-3xl font-extralight tracking-[0.4em] text-foreground/80">
            NEXUS
          </span>
          <p className="mt-2 text-[11px] tracking-[0.3em] uppercase text-foreground-muted">
            Verified supplier intelligence for defence &amp; security
          </p>

          <div className="max-w-3xl mt-12">
            <h1 className="text-3xl md:text-5xl lg:text-6xl font-semibold tracking-tight leading-[1.1] text-foreground">
              Pure-AI tools cannot serve defence procurement.{" "}
              <span className="text-gradient-accent">We built the SaaS infrastructure that does.</span>
            </h1>
            <p className="mt-8 text-base md:text-lg text-foreground-secondary leading-relaxed max-w-2xl mx-auto">
              Verified actor data. Multi-year programme context. Closed-loop outcomes.
              The three things a competitor with API access cannot replicate by spending more on engineering.
            </p>
          </div>

          <motion.div
            animate={{ y: [0, 8, 0] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="mt-16"
          >
            <ChevronDown className="h-5 w-5 text-foreground-muted" />
          </motion.div>
        </Section>

        {/* 2. PROBLEM */}
        <Section id="problem">
          <div className="max-w-4xl w-full">
            <Eyebrow>The problem</Eyebrow>
            <h2 className="text-3xl md:text-5xl font-semibold tracking-tight leading-tight mb-10">
              Public web data tells you what suppliers <span className="text-foreground-muted">market</span>
              {" — "}
              <span className="text-gradient-accent">not what they can deliver</span>.
            </h2>
            <p className="text-lg text-foreground-secondary leading-relaxed max-w-3xl mb-12">
              Procurement officers and capability planners do not need another search tool.
              They need to know whether a supplier actually has 4 operational airframes,
              12 trained pilots, current security clearance, and capacity next quarter.
              No amount of LLM polish on top of public data answers that question.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                {
                  icon: AlertTriangle,
                  title: "Marketing claims",
                  desc: "Websites and registry data describe what suppliers want to be seen as — not what they can deliver under contract.",
                },
                {
                  icon: AlertTriangle,
                  title: "No memory",
                  desc: "Sourcing tools treat every search as the first. Multi-year capability programmes leave no institutional record.",
                },
                {
                  icon: AlertTriangle,
                  title: "No feedback",
                  desc: "Match recommendations are never validated against real procurement outcomes. Quality cannot improve.",
                },
              ].map(({ icon: Icon, title, desc }) => (
                <div
                  key={title}
                  className="bg-surface border border-border rounded-card p-6"
                >
                  <Icon className="h-5 w-5 text-warning mb-4" />
                  <h3 className="text-base font-semibold mb-2">{title}</h3>
                  <p className="text-sm text-foreground-secondary leading-relaxed">{desc}</p>
                </div>
              ))}
            </div>
          </div>
        </Section>

        {/* 3. THREE PILLARS */}
        <Section id="pillars">
          <div className="max-w-6xl w-full">
            <Eyebrow>The three pillars</Eyebrow>
            <h2 className="text-3xl md:text-5xl font-semibold tracking-tight mb-4">
              The moat is structural — not technical.
            </h2>
            <p className="text-foreground-secondary text-lg max-w-2xl mb-12">
              Each pillar is a system of record. Each compounds with use.
              None can be shortcut by a better-funded competitor.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {[
                {
                  num: "01",
                  icon: ShieldCheck,
                  title: "Verified actor data",
                  lede: "Identity, capacity, classification, references — confirmed by named contact.",
                  body: "Not what a supplier markets, but what they can deliver next quarter. Each capacity attribute carries its own evidence and confidence. Verified status decays after 12–18 months and must be renewed.",
                  tags: ["Named-contact verification", "Per-fact provenance", "Decay & renewal"],
                },
                {
                  num: "02",
                  icon: Layers,
                  title: "Programme-level context",
                  lede: "Multi-year capability sourcing, not one-off searches.",
                  body: "Long-lived constraints, confidentiality scope, access lists, engagement history, consultant intake notes. The institutional memory of a sourcing function — captured in product structure.",
                  tags: ["Long-lived constraints", "Engagement history", "Confidential intake"],
                },
                {
                  num: "03",
                  icon: Repeat,
                  title: "Closed-loop outcomes",
                  lede: "What actually happened after the match.",
                  body: "Procurements closed, partnerships formed, suppliers that delivered or disappointed — captured as first-class events. Match quality compounds in ways pure-LLM tools cannot match because they have no equivalent training signal.",
                  tags: ["Procurement events", "Outcome-weighted match", "Compounds annually"],
                },
              ].map(({ num, icon: Icon, title, lede, body, tags }) => (
                <article
                  key={num}
                  className="relative bg-surface border border-border rounded-card p-7 flex flex-col"
                >
                  <div className="flex items-start justify-between mb-6">
                    <div className="w-10 h-10 rounded-md bg-elevated border border-border-accent/40 flex items-center justify-center">
                      <Icon className="h-5 w-5 text-gradient-accent" style={{ color: "hsl(var(--accent-teal))" }} />
                    </div>
                    <span className="font-mono text-xs text-foreground-muted tracking-wider">{num}</span>
                  </div>
                  <h3 className="text-xl font-semibold mb-2">{title}</h3>
                  <p className="text-sm text-foreground leading-relaxed mb-3">{lede}</p>
                  <p className="text-sm text-foreground-secondary leading-relaxed mb-6 flex-1">{body}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {tags.map((t) => (
                      <span
                        key={t}
                        className="text-[10px] font-mono uppercase tracking-wider px-2 py-1 rounded-sm bg-elevated border border-border text-foreground-secondary"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </div>
        </Section>

        {/* 4. DEFENSIBLE */}
        <Section id="defensible">
          <div className="max-w-5xl w-full">
            <Eyebrow>Why this is defensible</Eyebrow>
            <h2 className="text-3xl md:text-5xl font-semibold tracking-tight mb-12 leading-tight">
              The AI is the surface.{" "}
              <span className="text-gradient-accent">The moat is underneath.</span>
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-10 mb-12">
              <div>
                <h3 className="text-sm uppercase tracking-[0.2em] text-foreground-muted mb-4">
                  What anyone can build in three weeks
                </h3>
                <ul className="space-y-3 text-foreground-secondary">
                  {[
                    "AI role decomposition from a need brief",
                    "Web-search-assisted actor discovery",
                    "Document and registry extraction",
                    "Pipeline UI, filters, saved sessions",
                  ].map((t) => (
                    <li key={t} className="flex gap-3 text-sm">
                      <span className="text-foreground-muted mt-1">—</span>
                      <span>{t}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="text-sm uppercase tracking-[0.2em] mb-4">
                  <span className="text-gradient-accent">What compounds in our favour over time</span>
                </h3>
                <ul className="space-y-3">
                  {[
                    "A verified database that grows with every named-contact attestation",
                    "Programme memory that makes switching cost rise with every month of use",
                    "Closed-loop outcome data that improves match quality as procurements close",
                    "A network where verified status itself becomes a sales credential",
                  ].map((t) => (
                    <li key={t} className="flex gap-3 text-sm text-foreground">
                      <span className="text-gradient-accent mt-1">—</span>
                      <span>{t}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="bg-surface border-l-2 border-border-accent rounded-r-card p-6 md:p-8">
              <p className="text-base md:text-lg text-foreground italic leading-relaxed">
                A competitor entering with the same software cannot replicate the verified
                records without going through the same interaction work. Our network has a
                head start. The longer we run, the larger the gap.
              </p>
            </div>
          </div>
        </Section>

        {/* 5. TRUST */}
        <Section id="trust">
          <div className="max-w-5xl w-full">
            <Eyebrow>Trust architecture</Eyebrow>
            <h2 className="text-3xl md:text-5xl font-semibold tracking-tight mb-4 leading-tight">
              Built so a defence procurement officer&apos;s lawyer, IT security, and the officer themselves can all sign off.
            </h2>
            <p className="text-foreground-secondary text-lg max-w-2xl mb-12">
              Programme-level context only flows in if the customer trusts the framework.
              Trust is engineered into three layers — none optional.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {[
                {
                  icon: Lock,
                  label: "Technical",
                  items: [
                    "EU / Norway data residency",
                    "Row-level attribute-based access control",
                    "Audit log on every read of sensitive records",
                    "AI-access boundaries — opt-in, never default",
                    "Customer-controlled keys for sensitive programmes",
                  ],
                },
                {
                  icon: Globe,
                  label: "Legal",
                  items: [
                    "GDPR fully documented",
                    "Data Processing Agreements with every customer",
                    "ISO 27001 readiness · SOC 2 Type II roadmap",
                    "NSM advisory dialogue established",
                    "Sub-processor transparency, customer right to object",
                  ],
                },
                {
                  icon: Eye,
                  label: "Operational",
                  items: [
                    "Consultant access scoped, time-bounded, logged",
                    "Confidential intake — never type sensitive context",
                    "No pooling without explicit consent",
                    "Customer-facing access log of every view",
                    "Published incident response plan",
                  ],
                },
              ].map(({ icon: Icon, label, items }) => (
                <div
                  key={label}
                  className="bg-surface border border-border rounded-card p-6"
                >
                  <div className="flex items-center gap-3 mb-5">
                    <Icon className="h-5 w-5" style={{ color: "hsl(var(--accent-blue))" }} />
                    <span className="text-xs uppercase tracking-[0.2em] text-foreground-muted">
                      {label}
                    </span>
                  </div>
                  <ul className="space-y-2.5">
                    {items.map((it) => (
                      <li
                        key={it}
                        className="text-sm text-foreground-secondary leading-relaxed flex gap-2"
                      >
                        <span className="text-border-accent mt-1.5 text-[8px]">●</span>
                        <span>{it}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </Section>

        {/* 6. AUDIENCE */}
        <Section id="audience">
          <div className="max-w-5xl w-full">
            <Eyebrow>Who it&apos;s for</Eyebrow>
            <h2 className="text-3xl md:text-5xl font-semibold tracking-tight mb-12">
              Two-sided economics. Each side pays for what only the network can produce.
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {[
                {
                  icon: Building2,
                  who: "End users",
                  sub: "Procurement, programme managers, capability planners",
                  pays: "Verified data and programme memory",
                  body: "Surface actors not findable by public search. Cross-procurement pattern intelligence. Capability gaps surfaced before they become emergencies.",
                },
                {
                  icon: Factory,
                  who: "Primes",
                  sub: "Defence primes, large industrial buyers",
                  pays: "Supplier landscape and cross-portfolio intelligence",
                  body: "SMB and specialist visibility they cannot maintain in-house. Capability gap analysis across the existing supplier base. Premium pricing — alternative is internal supplier-intelligence headcount.",
                },
                {
                  icon: Users,
                  who: "Suppliers",
                  sub: "SMBs and specialist providers",
                  pays: "Discoverability and the verified credential",
                  body: "Inbound deal flow from buyers they would otherwise never reach. Verified status becomes a credential cited in tender responses. Visibility a marketing budget cannot buy.",
                },
              ].map(({ icon: Icon, who, sub, pays, body }) => (
                <div
                  key={who}
                  className="bg-surface border border-border rounded-card p-6 flex flex-col"
                >
                  <Icon className="h-5 w-5 mb-5" style={{ color: "hsl(var(--accent-green))" }} />
                  <h3 className="text-lg font-semibold mb-1">{who}</h3>
                  <p className="text-xs uppercase tracking-wider text-foreground-muted mb-5">
                    {sub}
                  </p>
                  <div className="text-[10px] font-mono uppercase tracking-wider text-foreground-muted mb-1">
                    Pays for
                  </div>
                  <p className="text-sm text-gradient-accent font-medium mb-4">{pays}</p>
                  <p className="text-sm text-foreground-secondary leading-relaxed flex-1">
                    {body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </Section>

        {/* 7. WEDGE */}
        <Section id="wedge">
          <div className="max-w-4xl w-full text-center">
            <Eyebrow>The wedge</Eyebrow>
            <h2 className="text-3xl md:text-5xl font-semibold tracking-tight mb-8 leading-tight">
              Northern European defence, security, preparedness, and{" "}
              <span className="text-gradient-accent">critical infrastructure</span>.
            </h2>
            <p className="text-foreground-secondary text-lg leading-relaxed mb-12 max-w-2xl mx-auto">
              A real market with real budgets, underserved by current tools — large enough
              to build a meaningful business, small enough to dominate before international
              competitors notice.
            </p>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 max-w-3xl mx-auto">
              {[
                { icon: ShieldCheck, label: "Defence" },
                { icon: AlertTriangle, label: "Preparedness" },
                { icon: Network, label: "Critical infrastructure" },
                { icon: Database, label: "Sovereign data" },
              ].map(({ icon: Icon, label }) => (
                <div
                  key={label}
                  className="bg-surface border border-border rounded-card p-5 flex flex-col items-center gap-3"
                >
                  <Icon className="h-5 w-5 text-foreground-secondary" />
                  <span className="text-xs uppercase tracking-[0.15em] text-foreground-secondary">
                    {label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </Section>

        {/* 8. STATUS */}
        <Section id="status">
          <div className="max-w-4xl w-full">
            <Eyebrow>Where we are</Eyebrow>
            <h2 className="text-3xl md:text-5xl font-semibold tracking-tight mb-12 leading-tight">
              Architecture built for the moat from day one — not retrofitted.
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                {
                  status: "Live",
                  label: "Three-layer actor model",
                  desc: "Session · personal · verified main DB. The separation that distinguishes self-claimed from verified.",
                },
                {
                  status: "Live",
                  label: "Provenance-aware enrichment",
                  desc: "Every data point knows its source, evidence, confidence, and timestamp.",
                },
                {
                  status: "In build",
                  label: "Programmes &amp; ABAC",
                  desc: "Multi-year engagement unit and per-record visibility rules — the foundation for confidential sharing.",
                },
                {
                  status: "In build",
                  label: "Verification lifecycle &amp; consultant workspace",
                  desc: "Decay, renewal, and the verification operations the network is built on.",
                },
                {
                  status: "Planned",
                  label: "Closed-loop outcome capture",
                  desc: "Procurement events as first-class data — the signal that completes the moat.",
                },
                {
                  status: "Active",
                  label: "NSM advisory dialogue",
                  desc: "Engaged with the Norwegian National Security Authority from the start, not as a retrofit.",
                },
              ].map(({ status, label, desc }) => (
                <div
                  key={label}
                  className="bg-surface border border-border rounded-card p-5"
                >
                  <div className="flex items-center justify-between mb-3">
                    <span
                      className={`text-[10px] font-mono uppercase tracking-wider px-2 py-1 rounded-sm border ${
                        status === "Live"
                          ? "bg-success/10 text-success border-success/30"
                          : status === "Active"
                          ? "bg-info/10 border-info/30"
                          : status === "In build"
                          ? "bg-warning/10 text-warning border-warning/30"
                          : "bg-elevated text-foreground-muted border-border"
                      }`}
                      style={status === "Active" ? { color: "hsl(var(--accent-blue))" } : undefined}
                    >
                      {status}
                    </span>
                  </div>
                  <h3
                    className="text-base font-semibold mb-1.5"
                    dangerouslySetInnerHTML={{ __html: label }}
                  />
                  <p className="text-sm text-foreground-secondary leading-relaxed">
                    {desc}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </Section>

        {/* 9. CONTACT */}
        <Section id="contact" className="text-center">
          <div className="max-w-4xl w-full">
            <img
              src={logoAexs}
              alt="ÆXS"
              className="h-14 md:h-16 object-contain mx-auto opacity-90"
            />
            <span className="block mt-3 text-xl tracking-[0.4em] font-extralight text-foreground/80 mb-10">
              NEXUS
            </span>

            <h2 className="text-3xl md:text-5xl font-semibold tracking-tight leading-tight mb-6">
              Let&apos;s talk about{" "}
              <span className="text-gradient-accent">verified capability</span>.
            </h2>
            <p className="text-foreground-secondary text-lg leading-relaxed max-w-2xl mx-auto mb-14">
              For procurement offices, primes, suppliers, and partners interested in pilots,
              advisory engagement, or the verification network.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 max-w-3xl mx-auto text-left">
              {[
                {
                  name: "Tore Rosland",
                  role: "Founder &amp; CEO",
                  email: "tore.rosland@aexs.no",
                },
                {
                  name: "Odd Hafid Khalifi",
                  role: "Co-founder &amp; Board member",
                  email: "odd.khalifi@aexs.no",
                },
              ].map((p) => (
                <a
                  key={p.email}
                  href={`mailto:${p.email}`}
                  className="group bg-surface border border-border hover:border-border-accent rounded-card p-6 flex items-center gap-5 transition-all"
                >
                  <div className="w-16 h-16 rounded-full bg-elevated border border-border flex items-center justify-center flex-shrink-0 overflow-hidden">
                    {/* Drop headshot here: <img src={...} className="w-full h-full object-cover" /> */}
                    <span className="text-[10px] uppercase tracking-wider text-foreground-muted">
                      Photo
                    </span>
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-base font-semibold">{p.name}</h3>
                    <p
                      className="text-xs uppercase tracking-wider text-foreground-muted mb-2"
                      dangerouslySetInnerHTML={{ __html: p.role }}
                    />
                    <div className="flex items-center gap-2 text-sm text-foreground-secondary group-hover:text-foreground transition-colors">
                      <Mail className="h-3.5 w-3.5" />
                      <span className="font-mono text-xs">{p.email}</span>
                      <ArrowRight className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </div>
                </a>
              ))}
            </div>

            <div className="mt-16 pt-8 border-t border-border-subtle text-[10px] tracking-[0.3em] uppercase text-foreground-muted">
              ÆXS · Oslo, Norway · aexs.no
            </div>
          </div>
        </Section>
      </div>
    </div>
  );
}
