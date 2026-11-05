import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  deleteCaseStudy,
  deleteMedia,
  getSession,
  isValidSlug,
  loadAdminData,
  loadPublicData,
  migrateLegacyData,
  onAuthStateChange,
  saveCaseStudy,
  saveFeaturedLimit,
  saveSiteContent,
  signIn,
  signOut,
  updateCaseStudyStatus,
  uploadMedia,
} from "./api.js";
import { caseStudies } from "./data/caseStudies.js";
import { settings } from "./data/settings.js";
import { siteContent } from "./data/siteContent.js";
import { supabaseConfigError } from "./supabase.js";

const LEGACY_STORAGE_KEY = "prem-portfolio-v1";
const profileImage = "/prem-portrait.png";
const aboutImage = "/prem-about-event.png";

function readLegacyState() {
  try {
    const saved = window.localStorage.getItem(LEGACY_STORAGE_KEY);
    return saved ? JSON.parse(saved) : null;
  } catch (error) {
    throw new Error(`Could not read the legacy browser backup: ${error.message}`);
  }
}

const assetPreview = (value) => value || "";

function useLocation() {
  const [path, setPath] = useState(window.location.pathname);
  const currentPath = useRef(path);
  useEffect(() => {
    const update = () => {
      const navigation = new Event("portfolio:navigate", { cancelable: true });
      if (!window.dispatchEvent(navigation)) {
        window.history.pushState({}, "", currentPath.current);
        return;
      }
      currentPath.current = window.location.pathname;
      setPath(currentPath.current);
    };
    window.addEventListener("popstate", update);
    return () => window.removeEventListener("popstate", update);
  }, []);
  const navigate = (to) => {
    window.history.pushState({}, "", to);
    currentPath.current = to;
    setPath(to);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  return [path, navigate];
}

function Arrow({ diagonal = false }) {
  return <span aria-hidden="true">{diagonal ? "↗" : "→"}</span>;
}

function slugify(value) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function extractFigmaEmbedUrl(value) {
  const trimmed = value.trim();
  let source = trimmed;
  if (trimmed.startsWith("<")) {
    const iframe = new DOMParser().parseFromString(trimmed, "text/html").querySelector("iframe");
    source = iframe?.getAttribute("src") || "";
  }
  const markdownLink = source.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
  if (markdownLink) source = markdownLink[2];
  if (!source) return "";
  try {
    const url = new URL(source.replace(/&amp;/g, "&"));
    if (url.origin !== "https://embed.figma.com" || !/^\/proto\/[^/]+/.test(url.pathname)) return "";
    return url.href;
  } catch {
    return "";
  }
}

function Brand({ onClick }) {
  return (
    <button className="brand" onClick={onClick} aria-label="Go to homepage">
      <span className="brand-mark">P.</span>
      <span>PREM KUMAR<br />THANNERU</span>
    </button>
  );
}

function ResumeLinks({ resumeUrl, filename, className = "" }) {
  const href = "/Prem-Kumar-Resume.pdf";
  return (
    <span className={`resume-nav-links ${className}`}>
      <a href={href} target="_blank" rel="noreferrer">View resume</a>
      <a href={href} download="Prem-Kumar-Resume.pdf">Download</a>
    </span>
  );
}

function Header({ navigate, active = "", resumeUrl, resumeFilename }) {
  return (
    <header className="site-header">
      <Brand onClick={() => navigate("/")} />
      <nav className="main-nav" aria-label="Main navigation">
        <button className={active === "work" ? "nav-active" : ""} onClick={() => navigate("/work")}>Work</button>
        <button className={active === "about" ? "nav-active" : ""} onClick={() => navigate("/about")}>About</button>
        <ResumeLinks resumeUrl={resumeUrl} filename={resumeFilename} />
        <button className="nav-contact" onClick={() => navigate("/contact")}>Let’s talk <Arrow diagonal /></button>
      </nav>
    </header>
  );
}

const designTools = [
  ["Sketch", "S", "sketch"],
  ["Adobe XD", "Xd", "xd"],
  ["Figma", "F", "figma"],
  ["InVision", "In", "invision"],
  ["Axure RP", "Ax", "axure"],
  ["Adobe Photoshop", "Ps", "photoshop"],
  ["Adobe Illustrator", "Ai", "illustrator"],
  ["Balsamiq Mockups", "B", "balsamiq"],
  ["Zeplin", "Z", "zeplin"],
  ["Miro", "M", "miro"],
];

function Footer({ content, navigate, variant = "home-footer" }) {
  return (
    <footer className={`site-footer ${variant}`}>
      <div className="footer-top" data-reveal>
        <p className="eyebrow">HAVE A GOOD ONE IN MIND?</p>
        <button className="footer-cta" onClick={() => navigate("/contact")}>Let’s make it <em>matter.</em> <Arrow diagonal /></button>
      </div>
      <div className="footer-bottom" data-reveal>
        <span>© {new Date().getFullYear()} {content.name}</span>
        <div className="footer-links">
          <a href={content.linkedin} target="_blank" rel="noreferrer">LinkedIn <Arrow diagonal /></a>
          <a href={content.github} target="_blank" rel="noreferrer">GitHub <Arrow diagonal /></a>
          <a href={content.behance} target="_blank" rel="noreferrer">Behance <Arrow diagonal /></a>
          <a href={`mailto:${content.email}`}>Email <Arrow diagonal /></a>
        </div>
        <span>Designed with intention.</span>
      </div>
    </footer>
  );
}

function FloatingTools({ variant }) {
  return (
    <aside className={`tool-showcase tool-showcase-${variant}${variant === "home" ? "" : " tool-showcase-compact"}`} aria-label="Design tools">
      <div className="tool-showcase-glow" aria-hidden="true" />
      <div className="tool-showcase-card" aria-hidden="true"><span>DESIGN TOOLKIT</span><strong>P<span>+</span></strong></div>
      {designTools.map(([name, mark, slug], index) => (
        <span className={`floating-tool floating-tool-${slug}`} key={slug} style={{ "--tool-delay": `${index * -0.55}s` }}>
          <span className="floating-tool-mark" aria-hidden="true">{mark}</span>
          <span>{name}</span>
        </span>
      ))}
      {variant === "home" && <button className="tool-showcase-down" type="button" aria-label="Scroll to selected work" onClick={() => document.getElementById("selected-work")?.scrollIntoView({ behavior: "smooth" })}>↓</button>}
    </aside>
  );
}

function ProjectCard({ project, index, onClick, reveal = false }) {
  const metadata = [project.category, project.year].filter(Boolean).join(" · ") || "CASE STUDY";
  const thumbnail = project.thumbnailUrl || project.image;
  return (
    <button className={`project-card project-card-${index % 3}`} onClick={onClick} data-reveal={reveal ? "" : undefined}>
      <div className="project-image">
        {thumbnail ? (
          <img src={thumbnail} alt={project.thumbnailAlt || `${project.title} project preview`} />
        ) : (
          <div className={`project-art art-${index % 3}`}>
            <span className="art-index">0{index + 1}</span>
            <span className="art-title">{project.title}</span>
            <span className="art-orbit" aria-hidden="true" />
            <span className="art-label">A digital experience</span>
          </div>
        )}
        <span className="project-open"><Arrow diagonal /></span>
      </div>
      <div className="project-meta">
        <div>
          <h3>{project.title}</h3>
          <p>{project.description}</p>
        </div>
        <span className="project-category">{metadata}</span>
      </div>
    </button>
  );
}

function HomePage({ content, projects, navigate, resumeUrl, resumeFilename, featuredLimit = 3 }) {
  const featured = projects.filter((project) => project.status === "Published" && project.featured);
  const [firstName = "PREM", secondName = "KUMAR"] = content.name.trim().split(/\s+/);
  const headlineWords = content.headline.trim().split(/\s+/);
  const headlineAccent = headlineWords.pop();
  return (
    <>
      <main className="home-page">
        <section className="home-stage">
          <div className="home-frame">
            <header className="home-header">
              <span className="availability-pill"><span />Available for new projects</span>
              <nav className="home-nav" aria-label="Main navigation">
                <button onClick={() => navigate("/work")}>Work <small>[{featured.length}]</small></button>
                <button onClick={() => document.getElementById("capabilities")?.scrollIntoView({ behavior: "smooth" })}>Service <small>[4]</small></button>
                <button onClick={() => navigate("/about")}>Experience <small>[9+]</small></button>
                <button onClick={() => navigate("/contact")}>Contact</button>
                <ResumeLinks resumeUrl={resumeUrl} filename={resumeFilename} className="home-resume-links" />
              </nav>
              <button className="home-talk" onClick={() => navigate("/contact")}>Let’s talk <Arrow diagonal /></button>
            </header>
            <section className="hero home-hero">
              <div className="hero-toolmarks" aria-hidden="true">
                <svg className="toolmark toolmark-figma" viewBox="0 0 38 58">
                  <path fill="#f24e1e" d="M9 1h10v14H9a7 7 0 0 1 0-14Z" />
                  <path fill="#ff7262" d="M19 1h10a7 7 0 0 1 0 14H19z" />
                  <path fill="#a259ff" d="M9 15h10v14H9a7 7 0 0 1 0-14Z" />
                  <circle cx="26" cy="22" r="7" fill="#1abcfe" />
                  <path fill="#0acf83" d="M9 29h10v14H9a7 7 0 0 1 0-14Z" />
                </svg>
                <svg className="toolmark toolmark-miro" viewBox="0 0 60 48">
                  <path fill="#ffd02f" d="M4 3h52a4 4 0 0 1 4 4v34a4 4 0 0 1-4 4H4a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4Z" />
                  <path fill="#050038" d="m9 10 8 14-8 14h8l8-14-8-14Zm14 0 8 14-8 14h8l8-14-8-14Zm14 0 8 14-8 14h8l8-14-8-14Z" />
                </svg>
                <span className="toolmark toolmark-ps">Ps</span>
                <span className="toolmark toolmark-ai">Ai</span>
              </div>
              <h1 className="home-title" aria-label={content.name}>
                <span>{firstName}</span> <strong>{secondName}</strong>
              </h1>
              <img className="hero-portrait" src={profileImage} alt={`Portrait of ${content.name}`} />
              <div className="hero-copy">
                <p className="home-role">{content.title}</p>
                <p className="hero-description">{content.intro}</p>
                <button className="home-collaborate" onClick={() => navigate("/contact")}>Let’s collaborate <Arrow diagonal /></button>
              </div>
              <nav className="home-socials" aria-label="Social links">
                <a href={content.linkedin} target="_blank" rel="noreferrer"><span aria-hidden="true">in</span> LinkedIn</a>
                <a href={content.github} target="_blank" rel="noreferrer"><span aria-hidden="true">⌘</span> GitHub</a>
                <a href={content.behance} target="_blank" rel="noreferrer"><span aria-hidden="true">Bē</span> Behance</a>
                <a href={`mailto:${content.email}`}><span aria-hidden="true">@</span> Email</a>
              </nav>
            </section>
          </div>
        </section>

        <section className="intro-section section-shell">
          <p className="eyebrow" data-reveal>A THOUGHTFUL APPROACH TO DIGITAL</p>
          <div className="intro-grid">
            <div className="intro-copy" data-reveal>
              <h2>{headlineWords.join(" ")} <em>{headlineAccent}</em></h2>
              <p>{content.about}</p>
              <button className="text-link" onClick={() => navigate("/about")}>A little more about me <Arrow /></button>
            </div>
            <FloatingTools variant="home" />
          </div>
        </section>

        <section className="work-section section-shell" id="selected-work">
          <div className="section-heading" data-reveal>
            <div><p className="eyebrow">A FEW THINGS I’VE MADE</p><h2>Selected work<span className="rose-dot">.</span></h2></div>
            <button className="text-link" onClick={() => navigate("/work")}>View all projects <Arrow /></button>
          </div>
          {featured.length ? (
            <div className="project-grid">
              {featured.slice(0, featuredLimit).map((project, index) => (
                <ProjectCard key={project.id} project={project} index={index} reveal onClick={() => navigate(`/work/${project.slug}`)} />
              ))}
            </div>
          ) : <p className="empty-note">Featured projects will appear here when you publish them in the CMS.</p>}
        </section>

        <section className="capabilities-section" id="capabilities">
          <div className="section-shell capabilities-inner">
            <p className="eyebrow" data-reveal>HOW I CAN HELP</p>
            <div className="capabilities-grid">
              <h2 data-reveal>Good design<br />makes room for<br /><em>the meaningful.</em></h2>
              <div className="capability-list" data-reveal>
                {["Product & interface design", "Responsive web experiences", "Visual storytelling", "Front-end development"].map((item, index) => (
                  <div className="capability-row" key={item} data-reveal><span>0{index + 1}</span><strong>{item}</strong><Arrow diagonal /></div>
                ))}
                <p className="capability-note">Bringing a technical background and a thoughtful eye to every experience I make.</p>
              </div>
            </div>
          </div>
        </section>
      </main>
      <Footer content={content} navigate={navigate} variant="home-footer" />
    </>
  );
}

function WorkPage({ content, projects, navigate, resumeUrl, resumeFilename }) {
  const [filter, setFilter] = useState("All");
  const published = projects.filter((project) => project.status === "Published");
  const categories = ["All", ...new Set(published.map((project) => project.category).filter(Boolean))];
  const visible = filter === "All" ? published : published.filter((project) => project.category === filter);
  return (
    <>
      <Header navigate={navigate} active="work" resumeUrl={resumeUrl} resumeFilename={resumeFilename} />
      <main className="page-main section-shell">
        <div className="page-kicker"><span>SELECTED WORK</span><span>2024 — 2025</span></div>
        <div className="page-title-row"><h1 className="page-title">Things made<br /><em>with meaning.</em></h1><p className="page-lede">A collection of digital experiences, ideas and the details that bring them to life.</p></div>
        <FloatingTools variant="work" />
        <div className="filter-row" aria-label="Filter projects">
          {categories.map((category) => <button className={category === filter ? "filter-active" : ""} key={category} onClick={() => setFilter(category)}>{category}</button>)}
          <span>{visible.length} PROJECT{visible.length === 1 ? "" : "S"}</span>
        </div>
        {visible.length ? <div className="project-grid work-grid">{visible.map((project, index) => <ProjectCard key={project.id} project={project} index={index} onClick={() => navigate(`/work/${project.slug}`)} />)}</div> : <p className="empty-note">No published projects in this category yet.</p>}
      </main>
      <Footer content={content} navigate={navigate} />
    </>
  );
}

function FigmaEmbed({ src, title }) {
  const [status, setStatus] = useState("loading");
  const [fullscreen, setFullscreen] = useState(false);
  const [closing, setClosing] = useState(false);
  const closeTimer = useRef(null);
  const safeSrc = extractFigmaEmbedUrl(src);
  const closeFullscreen = () => {
    setClosing(true);
    window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => {
      setFullscreen(false);
      setClosing(false);
    }, 240);
  };
  useEffect(() => {
    setStatus("loading");
    const timeout = window.setTimeout(() => setStatus((current) => current === "loading" ? "error" : current), 15000);
    return () => window.clearTimeout(timeout);
  }, [safeSrc]);
  useEffect(() => {
    if (!fullscreen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event) => {
      if (event.key === "Escape") closeFullscreen();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
      window.clearTimeout(closeTimer.current);
    };
  }, [fullscreen]);
  if (!safeSrc) return <div className="figma-embed-status figma-embed-error" role="status">This Figma prototype URL is not allowed.</div>;
  return (
    <div
      className={`figma-player${fullscreen ? " is-fullscreen" : ""}${closing ? " is-closing" : ""}`}
      role={fullscreen ? "dialog" : undefined}
      aria-modal={fullscreen ? "true" : undefined}
      aria-label={fullscreen ? `${title} Figma prototype in full screen` : undefined}
      onMouseDown={(event) => { if (fullscreen && event.target === event.currentTarget) closeFullscreen(); }}
    >
      <button
        className="figma-fullscreen-toggle"
        type="button"
        onClick={() => {
          if (fullscreen) {
            closeFullscreen();
          } else {
            setClosing(false);
            setFullscreen(true);
          }
        }}
      >{fullscreen ? "Exit full screen ×" : "↗ Watch full screen"}</button>
      <div className="figma-embed">
      {status === "loading" && <div className="figma-embed-status" role="status">Loading interactive prototype…</div>}
      {status === "error" && <div className="figma-embed-status figma-embed-error" role="status">The prototype could not be loaded. Check the Figma sharing settings and try again.</div>}
      <iframe
        title={`${title} Figma prototype`}
        src={safeSrc}
        loading="lazy"
        allow="fullscreen; clipboard-read; clipboard-write"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-presentation"
        referrerPolicy="strict-origin-when-cross-origin"
        onLoad={() => setStatus("loaded")}
        onError={() => setStatus("error")}
      />
      </div>
    </div>
  );
}

function ProjectPage({ project, projects, content, navigate }) {
  if (!project || project.status !== "Published") {
    return <div className="case-page"><Header navigate={navigate} /><main className="not-found"><p className="eyebrow">NOT FOUND</p><h1>This project isn’t here.</h1><button className="text-link" onClick={() => navigate("/work")}>Back to work <Arrow /></button><FloatingTools variant="notfound" /></main><Footer content={content} navigate={navigate} /></div>;
  }
  const related = projects.filter((item) => item.status === "Published" && item.id !== project.id).slice(0, 2);
  const figmaEmbedUrl = extractFigmaEmbedUrl(project.figmaEmbedUrl || "");
  return (
    <div className="case-page">
      <Header navigate={navigate} active="work" />
      <main className="case-study section-shell">
        <button className="back-link" data-reveal onClick={() => navigate("/work")}>← All work</button>
        <div className="case-heading" data-reveal>
          <div><p className="eyebrow">{[project.category, project.year].filter(Boolean).join(" · ") || "CASE STUDY"}</p><h1>{project.title}</h1><p className="case-description">{project.description}</p></div>
          {(project.role || project.tools || project.duration) && <dl><div><dt>ROLE</dt><dd>{project.role || "—"}</dd></div><div><dt>TOOLS</dt><dd>{project.tools || "—"}</dd></div><div><dt>DURATION</dt><dd>{project.duration || "—"}</dd></div></dl>}
        </div>
        <div data-reveal><FloatingTools variant="case" /></div>
        {!figmaEmbedUrl && <div className="case-cover" data-reveal>
          {(project.thumbnailUrl || project.image) ? <img src={project.thumbnailUrl || project.image} alt={project.thumbnailAlt || `${project.title} cover`} /> : <div className="project-art art-0"><span className="art-title">{project.title}</span><span className="art-orbit" /></div>}
        </div>}
        {figmaEmbedUrl && <>
          <div><FigmaEmbed src={figmaEmbedUrl} title={project.title} /></div>
          <a className="figma-open-link" data-reveal href={figmaEmbedUrl} target="_blank" rel="noreferrer">Open in Figma <Arrow diagonal /></a>
        </>}
        {project.sections?.length > 0 && <div className="case-content">
          {project.sections.map((section, index) => (
            <section className="case-block" data-reveal key={`${section.title}-${index}`}>
              <span className="case-number">0{index + 1}</span>
              <div><h2>{section.title}</h2><p>{section.body}</p>{section.image && <img className="section-image" src={section.image} alt={section.imageAlt || section.title} />}</div>
            </section>
          ))}
        </div>}
        {related.length > 0 && <div className="related-work" data-reveal><p className="eyebrow">KEEP EXPLORING</p><h2>More selected work</h2><div className="project-grid">{related.map((item, index) => <ProjectCard key={item.id} project={item} index={index} onClick={() => navigate(`/work/${item.slug}`)} />)}</div></div>}
      </main>
      <Footer content={content} navigate={navigate} />
    </div>
  );
}

function AboutPage({ content, navigate, resumeUrl }) {
  return (
    <>
      <Header navigate={navigate} active="about" />
      <main className="about-page section-shell">
        <div className="page-kicker"><span>A LITTLE ABOUT ME</span><span>THE PERSON BEHIND THE PIXELS</span></div>
        <section className="about-hero">
          <div className="about-hero-copy">
            <p className="eyebrow">DESIGNER · BUILDER · CURIOUS MIND</p>
            <h1 className="page-title">Curiosity<br /><em>first.</em></h1>
            <p className="about-hero-note">Thoughtful digital experiences, shaped by a love for design and technology.</p>
            <span className="about-location"><span /> Based in {content.location}</span>
          </div>
          <figure className="about-portrait">
            <img src={aboutImage} alt={`${content.name} at a design event`} />
            <figcaption><span>01 / ABOUT PREM</span><span>DESIGN · TECHNOLOGY · PEOPLE</span></figcaption>
          </figure>
        </section>
        <div className="about-copy-grid"><p className="eyebrow">A NOTE FROM PREM</p><div><p className="about-lede">{content.about}</p><p className="muted-copy">My path through software development has taught me to see how thoughtful interface decisions and the details behind them work together. I'm now bringing that perspective to product design — making digital tools feel more considered, accessible and easy to use.</p><a className="text-link anchor-link" href={resumeUrl || "/Prem-Kumar-Resume.pdf"} target="_blank" rel="noreferrer">View my resume <Arrow diagonal /></a></div></div>
        <FloatingTools variant="about" />
        <div className="about-facts">
          <div><p className="eyebrow">EDUCATION</p><h3>B.Tech, Artificial Intelligence & Data Science</h3><p>Usha Rama College of Engineering and Technology · 2025</p><p>CGPA 7.60 / 10</p></div>
          <div><p className="eyebrow">EXPERIENCE</p><h3>Java Full Stack Developer Intern</h3><p>Makeskilled · Jul — Oct 2024</p><h3>Android Developer Intern</h3><p>AICTE EduSkills · Jan — Mar 2024</p></div>
          <div><p className="eyebrow">TOOLS & TECHNOLOGY</p><p className="skill-cloud">React.js · Angular · Flutter · HTML5 · CSS3 · JavaScript · Python · Java · SQL · Spring Boot · Django · Flask · REST APIs · Git · Responsive design</p></div>
        </div>
      </main>
      <Footer content={content} navigate={navigate} />
    </>
  );
}

function ContactPage({ content, navigate }) {
  return (
    <>
      <Header navigate={navigate} />
      <main className="contact-page section-shell">
        <p className="eyebrow">LET’S MAKE SOMETHING GOOD</p>
        <h1 className="page-title">Have a good<br /><em>one in mind?</em></h1>
        <p className="contact-intro">I’m always happy to talk about meaningful ideas, thoughtful teams and the little details that make a product feel right.</p>
        <a className="contact-email" href={`mailto:${content.email}`}>{content.email} <Arrow diagonal /></a>
        <div className="contact-details"><span>{content.phone}</span><span>{content.location}</span><a href={content.linkedin} target="_blank" rel="noreferrer">LinkedIn <Arrow diagonal /></a><a href={content.github} target="_blank" rel="noreferrer">GitHub <Arrow diagonal /></a><a href={content.behance} target="_blank" rel="noreferrer">Behance <Arrow diagonal /></a></div>
        <FloatingTools variant="contact" />
      </main>
      <Footer content={content} navigate={navigate} />
    </>
  );
}

function AdminLogin({ error: serverError, onLogin }) {
  const [email, setEmail] = useState("prem64748494@gmail.com");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (event) => {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      await onLogin(email, password);
    } catch (loginError) {
      setError(loginError.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="admin-login">
      <div className="login-card">
        <Brand onClick={() => { window.location.href = "/"; }} />
        <p className="eyebrow">ADMINISTRATOR ACCESS</p>
        <h1>Welcome back.</h1>
        <p>Sign in with your administrator email and password to manage your portfolio.</p>
        <form onSubmit={submit}>
          <label htmlFor="admin-email">Email</label>
          <input id="admin-email" type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required />
          <label htmlFor="admin-password">Password</label>
          <input id="admin-password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
          <button className="button-dark" type="submit" disabled={busy}>{busy ? "Checking…" : "Open CMS"} <Arrow /></button>
        </form>
        {(error || serverError) && <p className="form-error" role="alert">{error || serverError}</p>}
        <button className="text-link" onClick={() => { window.location.href = "/"; }}>← Back to portfolio</button>
      </div>
    </main>
  );
}

function AdminShell({ children, section, setSection, onLogout, navigate, dirty }) {
  const navItems = [["overview", "Overview"], ["projects", "Case studies"], ["content", "Site content"], ["settings", "Settings"]];
  return (
    <div className="admin-layout">
      <aside className="admin-sidebar">
        <Brand onClick={() => navigate("/")} />
        <p className="admin-label">WORKSPACE</p>
        <nav>{navItems.map(([id, label]) => <button key={id} className={section === id ? "admin-nav-active" : ""} onClick={() => setSection(id)}><span className={`admin-nav-icon icon-${id}`}>{id === "overview" ? "◫" : id === "projects" ? "▤" : "◈"}</span>{label}</button>)}</nav>
        <div className="admin-side-bottom"><span className="status-dot" />Supabase CMS<button onClick={() => navigate("/")}>↗ View portfolio</button><button onClick={onLogout}>↪ Sign out</button></div>
      </aside>
      <div className="admin-main">
        <header className="admin-topbar"><div><span className="admin-breadcrumb">Workspace</span><span className="breadcrumb-separator">/</span><strong>{navItems.find(([id]) => id === section)?.[1]}</strong></div><span className="local-badge"><span />{dirty ? " UNSAVED CHANGES" : " WORKING COPY"}</span></header>
        {children}
      </div>
    </div>
  );
}

function Dashboard({ projects, setSection }) {
  const published = projects.filter((project) => project.status === "Published").length;
  const drafts = projects.length - published;
  return (
    <div className="admin-page">
      <div className="admin-page-heading"><div><p className="eyebrow">THURSDAY, YOUR WORKSPACE</p><h1>Good to see you, Prem.</h1><p>Here’s what’s happening with your portfolio.</p></div><button className="button-dark" onClick={() => setSection("projects")}>+ Add New Case Study</button></div>
      <div className="stats-grid"><div className="stat-card"><span>ALL PROJECTS</span><strong>{projects.length.toString().padStart(2, "0")}</strong><small>Across your portfolio</small></div><div className="stat-card"><span>PUBLISHED</span><strong>{published.toString().padStart(2, "0")}</strong><small>Visible on your site</small></div><div className="stat-card"><span>DRAFTS</span><strong>{drafts.toString().padStart(2, "0")}</strong><small>Still in progress</small></div><div className="stat-card"><span>FEATURED</span><strong>{projects.filter((project) => project.featured && project.status === "Published").length.toString().padStart(2, "0")}</strong><small>On your home page</small></div></div>
      <div className="admin-dashboard-grid"><section className="admin-panel recent-panel"><div className="panel-heading"><div><p className="eyebrow">YOUR CONTENT</p><h2>Recent case studies</h2></div><button className="text-link" onClick={() => setSection("projects")}>Manage all <Arrow /></button></div>{projects.slice(0, 4).map((project) => <div className="recent-row" key={project.id}><span className="recent-thumb">{(project.thumbnailUrl || project.thumbnail || project.image) && <img src={project.thumbnailUrl || project.thumbnail || project.image} alt={project.thumbnailAlt || ""} />}</span><div><strong>{project.title}</strong><span>{project.description || [project.category, project.year].filter(Boolean).join(" · ")}</span></div><span className={`status-pill status-${project.status.toLowerCase()}`}>{project.status}</span></div>)}{projects.length === 0 && <p className="empty-note">Your first case study starts here.</p>}</section><section className="admin-panel quick-panel"><p className="eyebrow">QUICK START</p><h2>Make your next idea<br />feel at home here.</h2><p>Published case studies are visible to visitors immediately.</p><button className="button-outline" onClick={() => setSection("projects")}>Create a case study <Arrow /></button><div className="quick-decoration">P.</div></section></div>
    </div>
  );
}

function FigmaCaseStudyEditor({ project, existing, onSave, onCancel, onDelete, onUploadAsset, onDiscardAsset, onDirtyChange }) {
  const [form, setForm] = useState(() => project ? {
    ...project,
    thumbnailUrl: project.thumbnailUrl || project.image || "",
    thumbnailPath: project.thumbnailPath || "",
    thumbnailAlt: project.thumbnailAlt || "",
    figmaEmbedCode: project.figmaEmbedUrl || "",
  } : {
    id: crypto.randomUUID(),
    title: "",
    slug: "",
    description: "",
    thumbnailUrl: "",
    thumbnailPath: "",
    thumbnailAlt: "",
    figmaEmbedCode: "",
    sections: [],
    status: "Draft",
    featured: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    publishedAt: null,
  });
  const [notice, setNotice] = useState("");
  const [previewVisible, setPreviewVisible] = useState(Boolean(project?.showPreviewOnOpen));
  const [isDragging, setIsDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(null);
  const [sectionUploadProgress, setSectionUploadProgress] = useState({});
  const [saving, setSaving] = useState(false);
  const isSectionUploading = Object.keys(sectionUploadProgress).length > 0;
  const uploadedAssets = useRef([]);
  const initialForm = useRef(JSON.stringify(form));
  const hasUnsavedChanges = JSON.stringify(form) !== initialForm.current;
  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const validatedEmbedUrl = extractFigmaEmbedUrl(form.figmaEmbedCode);
  const slugIsValid = isValidSlug(form.slug);

  useEffect(() => {
    onDirtyChange(hasUnsavedChanges);
  }, [hasUnsavedChanges, onDirtyChange]);
  useEffect(() => {
    if (!hasUnsavedChanges) return undefined;
    const warnBeforeUnload = (event) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [hasUnsavedChanges]);

  const save = async (status) => {
    if (uploadProgress !== null || isSectionUploading || saving) return;
    if (!form.title.trim()) {
      setNotice("Project title is required.");
      return;
    }
    if (!slugIsValid) {
      setNotice("Enter a valid lowercase slug using letters, numbers, and hyphens.");
      return;
    }
    if (form.figmaEmbedCode.trim() && !validatedEmbedUrl) {
      setNotice("Use an HTTPS Figma prototype embed URL from embed.figma.com.");
      return;
    }
    if (status === "Published" && !validatedEmbedUrl) {
      setNotice("Add a valid Figma prototype embed before publishing.");
      return;
    }
    const now = new Date().toISOString();
    const { figmaEmbedCode, showPreviewOnOpen, image, thumbnailPreviewUrl, ...savedForm } = form;
    const saved = {
      ...savedForm,
      title: form.title.trim(),
      slug: form.slug,
      description: form.description.trim(),
      thumbnailUrl: form.thumbnailUrl,
      sections: form.sections.map(({ imagePreviewUrl, ...item }) => item),
      figmaEmbedUrl: validatedEmbedUrl,
      status,
      featured: Boolean(form.featured),
      updatedAt: now,
      createdAt: form.createdAt || now,
      publishedAt: status === "Published" ? (form.publishedAt || now) : form.publishedAt || null,
    };
    setSaving(true);
    setNotice("");
    try {
      await onSave(saved, uploadedAssets.current);
      uploadedAssets.current = [];
      onDirtyChange(false);
    } catch (error) {
      setNotice(error.message || "Could not save this case study.");
    } finally {
      setSaving(false);
    }
  };

  const readImage = async (file) => {
    if (!file) return;
    setNotice("");
    setUploadProgress(0);
    try {
      const media = await onUploadAsset(file, "thumbnails");
      uploadedAssets.current.push(media);
      setForm((current) => ({
        ...current,
        thumbnailUrl: media.url,
        thumbnailPath: media.path,
      }));
      setUploadProgress(100);
    } catch (error) {
      setNotice(error.message || "Could not upload this image.");
    } finally {
      setUploadProgress(null);
    }
  };

  const readSectionImage = async (index, file) => {
    if (!file) return;
    setNotice("");
    setSectionUploadProgress((current) => ({ ...current, [index]: 0 }));
    try {
      const media = await onUploadAsset(file, "sections");
      uploadedAssets.current.push(media);
      setForm((current) => ({
        ...current,
        sections: current.sections.map((section, sectionIndex) => sectionIndex === index
          ? { ...section, image: media.url, imagePath: media.path }
          : section),
      }));
      setSectionUploadProgress((current) => ({ ...current, [index]: 100 }));
    } catch (error) {
      setNotice(error.message || "Could not upload this case study image.");
    } finally {
      setSectionUploadProgress((current) => {
        const next = { ...current };
        delete next[index];
        return next;
      });
    }
  };

  const setTitle = (title) => setForm((current) => ({
    ...current,
    title,
    slug: current.slugEdited ? current.slug : slugify(title),
  }));
  const setSlug = (slug) => setForm((current) => ({ ...current, slug, slugEdited: true }));
  const preview = () => {
    if (!validatedEmbedUrl) {
      setNotice("Paste a valid Figma prototype embed code to preview it.");
      setPreviewVisible(false);
      return;
    }
    setNotice("");
    setPreviewVisible((visible) => !visible);
  };
  const cancelEditor = async () => {
    if (hasUnsavedChanges && !window.confirm("Discard your unsaved case study edits?")) return;
    try {
      for (const media of uploadedAssets.current) {
        await onDiscardAsset(media.path);
      }
    } catch (error) {
      setNotice(`Could not remove an unsaved upload: ${error.message}`);
      return;
    }
    uploadedAssets.current = [];
    onDirtyChange(false);
    onCancel();
  };

  return (
    <form className="project-editor figma-case-editor" onSubmit={(event) => { event.preventDefault(); save("Draft"); }}>
      <div className="editor-top">
        <button type="button" className="back-link" disabled={saving || uploadProgress !== null || isSectionUploading} onClick={cancelEditor}>← All case studies</button>
        <div className="editor-actions">
          {existing && <button type="button" className="button-outline small-button" disabled={saving || uploadProgress !== null || isSectionUploading || uploadedAssets.current.length > 0} onClick={() => onDelete(project.id)}>Delete</button>}
          <button type="button" className="button-outline small-button" disabled={saving || uploadProgress !== null || isSectionUploading} onClick={() => save("Draft")}>Save as Draft</button>
          <button type="button" className="button-dark" disabled={saving || uploadProgress !== null || isSectionUploading} onClick={() => save("Published")}>{form.status === "Published" ? "Save & Publish" : "Publish"} <Arrow /></button>
        </div>
      </div>
      <div className="editor-title-row">
        <div><p className="eyebrow">{existing ? "EDIT CASE STUDY" : "NEW CASE STUDY"}</p><h1>{form.title || "Untitled project"}</h1></div>
        <label className="status-select">STATUS<select value={form.status} onChange={(event) => update("status", event.target.value)}><option>Draft</option><option>Published</option></select></label>
      </div>
      {notice && <p className="inline-notice" role="status">{notice}</p>}
      <div className="editor-grid">
        <div className="editor-primary">
          <section className="editor-card">
            <div className="editor-section-head"><span>01</span><div><h2>Project details</h2><p>The story visitors will see on your portfolio.</p></div></div>
            <div className="field-grid">
              <label className="field-span">Project title<input value={form.title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. SkillConnect" required aria-invalid={!form.title.trim()} /></label>
              {!form.title.trim() && <p className="form-error field-span" role="alert">Project title is required.</p>}
              <label className="field-span">Project URL slug<input value={form.slug} onChange={(event) => setSlug(event.target.value)} placeholder="skillconnect" required aria-invalid={!slugIsValid} /></label>
              {!slugIsValid && <p className="form-error field-span" role="alert">Use lowercase letters, numbers, and hyphens, with no leading or trailing hyphen.</p>}
              <label className="field-span">Project description<textarea rows="3" value={form.description} onChange={(event) => update("description", event.target.value)} placeholder="A short introduction to the project" /></label>
              <label>Category<input value={form.category || ""} onChange={(event) => update("category", event.target.value)} /></label>
              <label>Year<input value={form.year || ""} onChange={(event) => update("year", event.target.value)} /></label>
              <label>Role<input value={form.role || ""} onChange={(event) => update("role", event.target.value)} /></label>
              <label>Duration<input value={form.duration || ""} onChange={(event) => update("duration", event.target.value)} /></label>
              <label className="field-span">Tools<input value={form.tools || ""} onChange={(event) => update("tools", event.target.value)} /></label>
            </div>
          </section>
          <section className="editor-card">
            <div className="editor-section-head"><span>02</span><div><h2>Figma prototype</h2><p>Paste a Figma iframe or its embed URL. Only the validated URL is stored.</p></div></div>
            <label className="figma-code-field">Figma Prototype Embed Code<textarea rows="7" value={form.figmaEmbedCode} onChange={(event) => { update("figmaEmbedCode", event.target.value); setPreviewVisible(false); setNotice(""); }} placeholder="Paste your Figma iframe embed code here..." spellCheck="false" /></label>
            {(form.figmaEmbedCode.trim() || form.status === "Published") && !validatedEmbedUrl && <p className="form-error" role="alert">Use an HTTPS Figma prototype embed URL from embed.figma.com.</p>}
            <div className="figma-field-actions"><button type="button" className="button-outline" onClick={preview}>{previewVisible ? "Hide preview" : "Preview"}</button>{validatedEmbedUrl && <a className="text-link" href={validatedEmbedUrl} target="_blank" rel="noreferrer">Open in Figma <Arrow diagonal /></a>}</div>
            {previewVisible && validatedEmbedUrl && <div className="figma-preview-panel"><p className="eyebrow">INTERACTIVE PROTOTYPE PREVIEW</p><FigmaEmbed key={validatedEmbedUrl} src={validatedEmbedUrl} title={form.title || "Case study"} /></div>}
          </section>
          <section className="editor-card">
            <div className="editor-section-head"><span>03</span><div><h2>Case study story</h2><p>Add narrative sections and optimized images.</p></div></div>
            <div className="field-grid">
              {form.sections.map((section, index) => (
                <div className="field-span editor-card" key={`section-${index}`}>
                  <div className="field-grid">
                    <label className="field-span">Section title<input value={section.title || ""} onChange={(event) => update("sections", form.sections.map((item, itemIndex) => itemIndex === index ? { ...item, title: event.target.value } : item))} /></label>
                    <label className="field-span">Section content<textarea rows="4" value={section.body || ""} onChange={(event) => update("sections", form.sections.map((item, itemIndex) => itemIndex === index ? { ...item, body: event.target.value } : item))} /></label>
                    {section.image && <img className="field-span section-image" src={section.imagePreviewUrl || assetPreview(section.image)} alt={section.imageAlt || `${section.title || "Case study"} preview`} />}
                    <label className="field-span">Section image alt text<input value={section.imageAlt || ""} onChange={(event) => update("sections", form.sections.map((item, itemIndex) => itemIndex === index ? { ...item, imageAlt: event.target.value } : item))} /></label>
                    <label className="thumbnail-file-button">{sectionUploadProgress[index] !== undefined ? `Uploading ${sectionUploadProgress[index]}%` : section.image ? "Replace section image" : "Add section image"}<input type="file" accept="image/png,image/jpeg,image/webp" disabled={sectionUploadProgress[index] !== undefined || saving} onChange={(event) => { readSectionImage(index, event.target.files?.[0]); event.target.value = ""; }} /></label>
                    {sectionUploadProgress[index] !== undefined && <progress className="upload-progress" max="100" value={sectionUploadProgress[index]} aria-label="Case study image upload progress" />}
                    {section.image && <button type="button" className="remove-image" onClick={() => update("sections", form.sections.map((item, itemIndex) => itemIndex === index ? { ...item, image: "", imagePath: "", imageAlt: "" } : item))}>Remove image</button>}
                    <button type="button" className="edit-link delete-case-study" disabled={isSectionUploading} onClick={() => update("sections", form.sections.filter((_item, itemIndex) => itemIndex !== index))}>Remove section</button>
                  </div>
                </div>
              ))}
              <button type="button" className="button-outline" disabled={saving} onClick={() => update("sections", [...form.sections, { title: "", body: "", image: "", imagePath: "", imageAlt: "" }])}>+ Add story section</button>
            </div>
          </section>
        </div>
        <aside className="editor-aside">
          <section className="editor-card">
            <div className="editor-section-head"><span>04</span><div><h2>Project thumbnail</h2><p>JPG, PNG or WebP · up to 8 MB, resized for the web</p></div></div>
            <div
              className={`case-thumbnail-upload${isDragging ? " is-dragging" : ""}`}
              onDragOver={(event) => { event.preventDefault(); setIsDragging(true); }}
              onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setIsDragging(false); }}
              onDrop={(event) => { event.preventDefault(); setIsDragging(false); readImage(event.dataTransfer.files?.[0]); }}
            >
              {form.thumbnailUrl ? <img src={form.thumbnailPreviewUrl || assetPreview(form.thumbnailUrl)} alt={form.thumbnailAlt || "Project thumbnail preview"} /> : <div className="upload-placeholder"><span>↥</span><strong>Drop an image here</strong><small>or choose a file from your device</small></div>}
              <label className="thumbnail-file-button">{uploadProgress !== null ? `Uploading ${uploadProgress}%` : form.thumbnailUrl ? "Replace image" : "Choose image"}<input type="file" accept="image/png,image/jpeg,image/webp" disabled={uploadProgress !== null || saving} onChange={(event) => { readImage(event.target.files?.[0]); event.target.value = ""; }} /></label>
              {uploadProgress !== null && <progress className="upload-progress" max="100" value={uploadProgress} aria-label="Image upload progress" />}
              {form.thumbnailUrl && <button type="button" className="remove-image" onClick={() => setForm((current) => ({ ...current, thumbnailUrl: "", thumbnailPath: "", thumbnailAlt: "", thumbnailPreviewUrl: "" }))}>Remove image</button>}
            </div>
            <label className="field-span">Thumbnail alt text<input value={form.thumbnailAlt} onChange={(event) => update("thumbnailAlt", event.target.value)} /></label>
          </section>
          <section className="editor-card publish-card">
            <p className="eyebrow">PUBLISHING</p>
            <label className="toggle-row"><span><strong>Feature on Homepage</strong><small>Include in selected work</small></span><input type="checkbox" checked={Boolean(form.featured)} onChange={(event) => update("featured", event.target.checked)} /></label>
            <div className="publish-note"><span className="status-dot" />{form.status === "Published" ? "This case study is public." : "Drafts are not visible to visitors."}</div>
          </section>
          {existing && <p className="storage-note">Created {form.createdAt ? new Date(form.createdAt).toLocaleDateString() : "—"} · Updated {form.updatedAt ? new Date(form.updatedAt).toLocaleDateString() : "—"}</p>}
        </aside>
      </div>
    </form>
  );
}

function CaseStudiesManager({ projects, setProjects, onSaveProject, onDeleteProject, onChangeStatus, onUploadAsset, onDiscardAsset, onDirtyChange }) {
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All");
  const [notice, setNotice] = useState("");

  const saveProject = async (project, pendingMedia) => {
    const saved = await onSaveProject(project, pendingMedia);
    setProjects((current) => current.some((item) => item.id === saved.id)
      ? current.map((item) => item.id === saved.id ? saved : item)
      : [saved, ...current]);
    setEditing(null);
    setNotice(`${saved.title} saved${saved.status === "Published" ? " and published" : " as a draft"}.`);
  };

  const deleteProject = async (id) => {
    const target = projects.find((project) => project.id === id);
    if (!target || !window.confirm(`Delete “${target.title}”? This cannot be undone.`)) return;
    try {
      await onDeleteProject(target);
      setProjects((current) => current.filter((project) => project.id !== id));
      setEditing(null);
      onDirtyChange(false);
      setNotice("Case study deleted.");
    } catch (error) {
      setNotice(error.message || "Could not delete the case study.");
    }
  };

  const changeStatus = async (project, status) => {
    if (status === "Published" && !extractFigmaEmbedUrl(project.figmaEmbedUrl || "")) {
      setNotice(`Edit “${project.title}” and add a valid Figma prototype before publishing.`);
      return;
    }
    try {
      const updated = await onChangeStatus(project.id, status === "Published");
      setProjects((current) => current.map((item) => item.id === project.id ? updated : item));
      setNotice(`${project.title} ${status === "Published" ? "published" : "unpublished"}.`);
    } catch (error) {
      setNotice(error.message || "Could not update the case study status.");
    }
  };

  const createProject = () => setEditing({
    id: crypto.randomUUID(),
    title: "",
    slug: "",
    description: "",
    thumbnailUrl: "",
    thumbnailPath: "",
    thumbnailAlt: "",
    figmaEmbedCode: "",
    sections: [],
    status: "Draft",
    featured: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    publishedAt: null,
  });
  const filtered = projects.filter((project) => (filter === "All" || project.status === filter) && project.title.toLowerCase().includes(search.toLowerCase()));
  if (editing) return <FigmaCaseStudyEditor project={editing} existing={projects.some((project) => project.id === editing.id)} onSave={saveProject} onCancel={() => setEditing(null)} onDelete={deleteProject} onUploadAsset={onUploadAsset} onDiscardAsset={onDiscardAsset} onDirtyChange={onDirtyChange} />;
  return (
    <div className="admin-page">
      <div className="admin-page-heading"><div><p className="eyebrow">YOUR PORTFOLIO, YOUR STORY</p><h1>Case studies</h1><p>Create, refine and publish the work you’re proud of.</p></div><button className="button-dark" onClick={createProject}>+ Add New Case Study</button></div>
      {notice && <p className="inline-notice" role="status">{notice}<button onClick={() => setNotice("")}>×</button></p>}
      <div className="table-toolbar"><div className="search-box">⌕ <input aria-label="Search case studies" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search case studies…" /></div><div className="table-filters">{["All", "Published", "Draft"].map((item) => <button key={item} className={filter === item ? "filter-active" : ""} onClick={() => setFilter(item)}>{item}</button>)}</div></div>
      <div className="project-table">
        <div className="table-head"><span>PROJECT</span><span>STATUS</span><span>HOMEPAGE</span><span>UPDATED</span><span>ACTIONS</span></div>
        {filtered.map((project) => <div className="table-row" key={project.id}>
          <button className="table-project" onClick={() => setEditing(project)}><span className="table-thumb">{(project.thumbnailUrl || project.image) && <img src={assetPreview(project.thumbnailUrl || project.image)} alt={project.thumbnailAlt || ""} />}</span><span><strong>{project.title}</strong><small>{project.description || project.category || "Figma case study"}</small></span></button>
          <span><span className={`status-pill status-${project.status.toLowerCase()}`}>{project.status}</span></span>
          <span>{project.featured ? "Featured" : "—"}</span>
          <span>{project.updatedAt ? new Date(project.updatedAt).toLocaleDateString() : "—"}</span>
          <span className="case-study-actions"><button className="edit-link" onClick={() => setEditing({ ...project, showPreviewOnOpen: true })}>Preview</button><button className="edit-link" onClick={() => setEditing(project)}>Edit</button><button className="edit-link" onClick={() => changeStatus(project, project.status === "Published" ? "Draft" : "Published")}>{project.status === "Published" ? "Unpublish" : "Publish"}</button><button className="edit-link delete-case-study" onClick={() => deleteProject(project.id)}>Delete</button></span>
        </div>)}
        {filtered.length === 0 && <p className="empty-note">No case studies match your search.</p>}
      </div>
      <p className="storage-note">Saved changes are published directly to Supabase.</p>
    </div>
  );
}

function SiteContentEditor({ content, onSave, onDirtyChange }) {
  const [form, setForm] = useState(content);
  const [saved, setSaved] = useState(false);
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const savedContent = useRef(JSON.stringify(content));
  const hasUnsavedChanges = JSON.stringify(form) !== savedContent.current;
  useEffect(() => setForm(content), [content]);
  useEffect(() => {
    savedContent.current = JSON.stringify(content);
  }, [content]);
  useEffect(() => {
    onDirtyChange(hasUnsavedChanges);
  }, [hasUnsavedChanges, onDirtyChange]);
  useEffect(() => {
    if (!hasUnsavedChanges) return undefined;
    const warnBeforeUnload = (event) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [hasUnsavedChanges]);
  const update = (key, value) => { setForm((current) => ({ ...current, [key]: value })); setSaved(false); };
  const save = async () => {
    setSaving(true);
    setNotice("");
    setSaved(false);
    try {
      await onSave(form);
      savedContent.current = JSON.stringify(form);
      onDirtyChange(false);
      setSaved(true);
    } catch (error) {
      setNotice(error.message || "Could not save your site content.");
    } finally {
      setSaving(false);
    }
  };
  return <div className="admin-page content-editor-page"><div className="admin-page-heading"><div><p className="eyebrow">YOUR VOICE, YOUR DETAILS</p><h1>Site content</h1><p>Update your introduction and how people can reach you.</p></div><button className="button-dark" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save changes"} <Arrow /></button></div>{saved && <p className="inline-notice">Your site content has been saved.</p>}{notice && <p className="form-error" role="alert">{notice}</p>}<section className="editor-card content-form-card"><div className="editor-section-head"><span>01</span><div><h2>Introduction</h2><p>These details appear across your portfolio.</p></div></div><div className="field-grid"><label>Your name<input value={form.name} onChange={(event) => update("name", event.target.value)} /></label><label>Professional title<input value={form.title} onChange={(event) => update("title", event.target.value)} /></label><label className="field-span">Hero headline<textarea rows="2" value={form.headline} onChange={(event) => update("headline", event.target.value)} /></label><label className="field-span">Short introduction<textarea rows="3" value={form.intro} onChange={(event) => update("intro", event.target.value)} /></label><label className="field-span">About paragraph<textarea rows="4" value={form.about} onChange={(event) => update("about", event.target.value)} /></label></div></section><section className="editor-card content-form-card"><div className="editor-section-head"><span>02</span><div><h2>Contact & links</h2><p>Keep your public contact details current.</p></div></div><div className="field-grid"><label>Email<input type="email" value={form.email} onChange={(event) => update("email", event.target.value)} /></label><label>Phone<input value={form.phone} onChange={(event) => update("phone", event.target.value)} /></label><label>LinkedIn URL<input value={form.linkedin} onChange={(event) => update("linkedin", event.target.value)} /></label><label>GitHub URL<input value={form.github} onChange={(event) => update("github", event.target.value)} /></label><label>Behance URL<input value={form.behance} onChange={(event) => update("behance", event.target.value)} /></label><label>Location<input value={form.location} onChange={(event) => update("location", event.target.value)} /></label></div></section></div>;
}

function SettingsManager({ settings: savedSettings, onSave, working, migrationReady, onMigrate, onClearLegacy, onDirtyChange }) {
  const [featuredLimit, setFeaturedLimit] = useState(savedSettings.featuredLimit);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const dirty = Number(featuredLimit) !== savedSettings.featuredLimit;
  useEffect(() => setFeaturedLimit(savedSettings.featuredLimit), [savedSettings.featuredLimit]);
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);
  const save = async () => {
    const value = Number(featuredLimit);
    if (!Number.isInteger(value) || value < 1 || value > 12) return;
    setSaving(true);
    try {
      await onSave(value);
      setNotice("");
    } catch (error) {
      setNotice(error.message || "Could not save portfolio settings.");
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="admin-page">
      <div className="admin-page-heading"><div><p className="eyebrow">PORTFOLIO SETTINGS</p><h1>Settings</h1><p>Manage featured projects and migrate your saved browser content.</p></div></div>
      {notice && <p className="form-error" role="alert">{notice}</p>}
      <section className="editor-card"><div className="editor-section-head"><span>01</span><div><h2>Featured projects</h2><p>Choose how many published, featured projects appear on the homepage.</p></div></div><label className="field-span">Featured limit<input type="number" min="1" max="12" value={featuredLimit} onChange={(event) => setFeaturedLimit(event.target.value)} /></label><div className="editor-actions"><button className="button-dark" onClick={save} disabled={!dirty || saving}>{saving ? "Saving?" : "Save settings"} <Arrow /></button></div></section>
      <section className="editor-card"><div className="editor-section-head"><span>02</span><div><h2>Migrate browser data</h2><p>Import the legacy prem-portfolio-v1 backup, including embedded thumbnail and story images.</p></div></div><p>The old browser data is never cleared automatically. After the import is saved and verified, a separate clear button will be available.</p><div className="editor-actions"><button className="button-outline" onClick={onMigrate} disabled={working}>{working ? "Migrating?" : "Migrate browser data"}</button>{migrationReady && <button className="button-outline delete-case-study" onClick={onClearLegacy} disabled={working}>Clear old browser data</button>}</div></section>
    </div>
  );
}

function AdminPage({ navigate }) {
  const [section, setSection] = useState("overview");
  const [session, setSession] = useState(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [data, setData] = useState(null);
  const [dataLoading, setDataLoading] = useState(false);
  const [authError, setAuthError] = useState("");
  const [notice, setNotice] = useState("");
  const [working, setWorking] = useState(false);
  const [migrationReady, setMigrationReady] = useState(false);
  const [hasUnsavedEdits, setHasUnsavedEdits] = useState(false);
  const handleDirtyChange = React.useCallback((dirty) => setHasUnsavedEdits(dirty), []);
  const dirtyRef = useRef(false);
  dirtyRef.current = hasUnsavedEdits;

  useEffect(() => {
    if (supabaseConfigError) {
      setAuthError(supabaseConfigError);
      setSessionLoading(false);
      return undefined;
    }
    let active = true;
    const { data: { subscription } } = onAuthStateChange((nextSession) => {
      if (!active) return;
      setSession(nextSession);
      setSessionLoading(false);
      setAuthError("");
    });
    getSession().then((currentSession) => {
      if (active) setSession(currentSession);
    }).catch((error) => {
      if (active) setAuthError(error.message);
    }).finally(() => {
      if (active) setSessionLoading(false);
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!hasUnsavedEdits) return undefined;
    const warnBeforeUnload = (event) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [hasUnsavedEdits]);
  useEffect(() => {
    const guardBrowserNavigation = (event) => {
      if (dirtyRef.current && !window.confirm("You have unsaved edits. Discard them and continue?")) {
        event.preventDefault();
        return;
      }
      setHasUnsavedEdits(false);
    };
    window.addEventListener("portfolio:navigate", guardBrowserNavigation);
    return () => window.removeEventListener("portfolio:navigate", guardBrowserNavigation);
  }, []);

  useEffect(() => {
    if (!session?.user?.id) {
      setData(null);
      return undefined;
    }
    let active = true;
    setDataLoading(true);
    loadAdminData().then((loaded) => {
      if (active) {
        setData(loaded);
        setNotice("");
      }
    }).catch((error) => {
      if (active) setNotice(`Could not load the CMS: ${error.message}`);
    }).finally(() => {
      if (active) setDataLoading(false);
    });
    return () => { active = false; };
  }, [session?.user?.id]);

  const confirmDiscard = () => !dirtyRef.current || window.confirm("You have unsaved edits. Discard them and continue?");
  const safeNavigate = (to) => {
    if (!confirmDiscard()) return;
    setHasUnsavedEdits(false);
    navigate(to);
  };
  const safeSetSection = (nextSection) => {
    if (nextSection === section || !confirmDiscard()) return;
    setHasUnsavedEdits(false);
    setSection(nextSection);
  };
  const login = async (email, password) => {
    setAuthError("");
    try {
      await signIn(email, password);
    } catch (error) {
      setAuthError(error.message);
      throw error;
    }
  };
  const logout = async () => {
    if (!confirmDiscard()) return;
    try {
      await signOut();
      setHasUnsavedEdits(false);
    } catch (error) {
      setNotice(`Could not sign out: ${error.message}`);
    }
  };

  const mediaPaths = (project) => [project.thumbnailPath, ...(project.sections || []).map((item) => item.imagePath)].filter(Boolean);
  const saveProject = async (project, pendingMedia = []) => {
    const previous = data.projects.find((item) => item.id === project.id);
    const saved = await saveCaseStudy(project, previous?.revision ?? null);
    setData((current) => ({
      ...current,
      projects: current.projects.some((item) => item.id === saved.id)
        ? current.projects.map((item) => item.id === saved.id ? saved : item)
        : [saved, ...current.projects],
    }));
    const retainedPaths = new Set(mediaPaths(saved));
    const referencedElsewhere = new Set(data.projects.filter((item) => item.id !== project.id).flatMap(mediaPaths));
    const removedPaths = [
      ...mediaPaths(previous || {}).filter((path) => !retainedPaths.has(path)),
      ...pendingMedia.map((media) => media.path).filter((path) => !retainedPaths.has(path)),
    ].filter((path) => !referencedElsewhere.has(path));
    if (removedPaths.length) {
      try {
        await deleteMedia(removedPaths);
      } catch (error) {
        setNotice(`Case study saved, but an old image could not be removed: ${error.message}`);
      }
    }
    return saved;
  };
  const removeProject = async (project) => {
    await deleteCaseStudy(project);
    setData((current) => ({ ...current, projects: current.projects.filter((item) => item.id !== project.id) }));
    const referencedElsewhere = new Set(data.projects.filter((item) => item.id !== project.id).flatMap(mediaPaths));
    try {
      await deleteMedia(mediaPaths(project).filter((path) => !referencedElsewhere.has(path)));
    } catch (error) {
      setNotice(`Case study deleted, but an image could not be removed: ${error.message}`);
    }
  };
  const changeProjectStatus = async (id, published) => {
    const project = data.projects.find((item) => item.id === id);
    if (!project) throw new Error("This case study is no longer available. Reload before saving.");
    const saved = await updateCaseStudyStatus(project, published);
    setData((current) => ({ ...current, projects: current.projects.map((item) => item.id === id ? saved : item) }));
    return saved;
  };
  const saveContent = async (content) => {
    const updated = await saveSiteContent(content, data.contentRevision);
    setData((current) => ({ ...current, content: updated.content, contentRevision: updated.revision }));
  };
  const saveSettings = async (featuredLimit) => {
    const updated = await saveFeaturedLimit(featuredLimit, data.settings.revision);
    setData((current) => ({ ...current, settings: updated }));
    setNotice("Settings saved.");
  };
  const migrate = async () => {
    setWorking(true);
    setNotice("Migrating the saved browser content to Supabase...");
    try {
      const verified = await migrateLegacyData(readLegacyState(), data);
      setData(verified);
      setMigrationReady(true);
      setNotice("Browser content was saved and verified. The old browser backup is still available until you clear it.");
    } catch (error) {
      setNotice(`Migration did not complete: ${error.message}`);
    } finally {
      setWorking(false);
    }
  };
  const clearLegacyData = () => {
    if (!migrationReady || !window.confirm("Clear the old prem-portfolio-v1 browser data? This cannot be undone.")) return;
    try {
      window.localStorage.removeItem(LEGACY_STORAGE_KEY);
      setMigrationReady(false);
      setNotice("Old browser data cleared.");
    } catch (error) {
      setNotice(`Could not clear old browser data: ${error.message}`);
    }
  };

  if (sessionLoading) return <main className="admin-login"><p className="eyebrow">CHECKING ADMIN SESSION...</p></main>;
  if (!session) return <AdminLogin error={authError || supabaseConfigError} onLogin={login} />;
  if (dataLoading) return <main className="admin-login"><p className="eyebrow">LOADING SUPABASE CMS...</p></main>;
  if (!data) return <main className="admin-login"><div className="login-card"><p className="eyebrow">CMS UNAVAILABLE</p><p className="form-error" role="alert">{notice || "Could not load the CMS data."}</p><button className="button-outline" onClick={() => window.location.reload()}>Reload CMS</button></div></main>;

  return (
    <AdminShell section={section} setSection={safeSetSection} navigate={safeNavigate} dirty={hasUnsavedEdits} onLogout={logout}>
      {notice && <p className="inline-notice" role="status">{notice}<button onClick={() => setNotice("")}>×</button></p>}
      {section === "overview" ? <Dashboard projects={data.projects} setSection={safeSetSection} /> :
        section === "projects" ? <CaseStudiesManager projects={data.projects} setProjects={(updater) => setData((current) => ({ ...current, projects: typeof updater === "function" ? updater(current.projects) : updater }))} onSaveProject={saveProject} onDeleteProject={removeProject} onChangeStatus={changeProjectStatus} onUploadAsset={(file, folder) => uploadMedia(file, folder)} onDiscardAsset={(path) => deleteMedia([path])} onDirtyChange={handleDirtyChange} /> :
          section === "content" ? <SiteContentEditor content={data.content} onSave={saveContent} onDirtyChange={handleDirtyChange} /> :
            <SettingsManager settings={data.settings} onSave={saveSettings} working={working} migrationReady={migrationReady} onMigrate={migrate} onClearLegacy={clearLegacyData} onDirtyChange={handleDirtyChange} />}
    </AdminShell>
  );
}

export default function App() {
  const [path, navigate] = useLocation();
  const isAdminRoute = path === "/admin" || path === "/admin/";
  const [publicData, setPublicData] = useState({
    content: siteContent,
    projects: caseStudies.filter((project) => project.status === "Published"),
    settings: { featuredLimit: settings.featuredLimit },
  });
  const [publicLoading, setPublicLoading] = useState(!isAdminRoute);
  const [publicLoadError, setPublicLoadError] = useState("");
  useEffect(() => {
    if (isAdminRoute) return undefined;
    let active = true;
    setPublicLoading(true);
    loadPublicData().then((loaded) => {
      if (active) {
        setPublicData({
          content: loaded.content || siteContent,
          projects: loaded.projects,
          settings: loaded.settings,
        });
        setPublicLoadError("");
      }
    }).catch((error) => {
      if (active) {
        setPublicData({
          content: siteContent,
          projects: caseStudies.filter((project) => project.status === "Published"),
          settings: { featuredLimit: settings.featuredLimit },
        });
        setPublicLoadError(error.message);
      }
    }).finally(() => {
      if (active) setPublicLoading(false);
    });
    return () => { active = false; };
  }, [isAdminRoute]);
  useEffect(() => {
    const revealPage = document.querySelector(".home-page, .case-page");
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!revealPage || publicLoading || reducedMotion || !("IntersectionObserver" in window)) return undefined;
    const revealItems = document.querySelectorAll(".home-page [data-reveal], .case-page [data-reveal], .site-footer [data-reveal]");
    document.documentElement.classList.add("motion-ready");
    const observer = new IntersectionObserver((entries) => entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("is-visible");
      observer.unobserve(entry.target);
    }), { threshold: 0.12, rootMargin: "0px 0px -7% 0px" });
    revealItems.forEach((item) => observer.observe(item));
    return () => { observer.disconnect(); document.documentElement.classList.remove("motion-ready"); };
  }, [path, publicLoading]);
  useEffect(() => {
    const hero = document.querySelector(".home-hero");
    const title = hero?.querySelector(".home-title");
    const portrait = hero?.querySelector(".hero-portrait");
    if (!hero || !title || !portrait || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;
    let frame = 0;
    const updateParallax = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const offset = Math.min(window.scrollY, hero.offsetHeight);
        title.style.transform = `translate3d(0, ${offset * 0.035}px, 0)`;
        portrait.style.transform = `translate3d(-50%, ${offset * -0.025}px, 0)`;
      });
    };
    window.addEventListener("scroll", updateParallax, { passive: true });
    updateParallax();
    return () => { window.removeEventListener("scroll", updateParallax); cancelAnimationFrame(frame); title.style.removeProperty("transform"); portrait.style.removeProperty("transform"); };
  }, [path]);
  const projects = useMemo(() => publicData.projects.map((project) => ({
    ...project,
    thumbnailUrl: assetPreview(project.thumbnailUrl || project.image),
    sections: (project.sections || []).map((item) => ({ ...item, image: assetPreview(item.image) })),
  })), [publicData.projects]);
  const resumeUrl = "/Prem-Kumar-Resume.pdf";
  if (isAdminRoute) return <AdminPage navigate={navigate} />;
  if (publicLoading) return <main className="page-main section-shell"><p className="eyebrow">LOADING PORTFOLIO…</p></main>;
  const content = publicData.content || siteContent;
  let page;
  if (path === "/work") page = <WorkPage content={content} projects={projects} navigate={navigate} resumeUrl={resumeUrl} />;
  else if (path === "/about") page = <AboutPage content={content} navigate={navigate} resumeUrl={resumeUrl} />;
  else if (path === "/contact") page = <ContactPage content={content} navigate={navigate} />;
  if (path.startsWith("/work/")) {
    const slug = decodeURIComponent(path.slice("/work/".length));
    page = <ProjectPage project={projects.find((project) => project.slug === slug && project.status === "Published")} projects={projects} content={content} navigate={navigate} />;
  }
  if (!page) page = <HomePage content={content} projects={projects} navigate={navigate} resumeUrl={resumeUrl} featuredLimit={publicData.settings.featuredLimit} />;
  return <>{publicLoadError && <p className="inline-notice" role="status">Live portfolio data could not be reached. Showing the bundled version. {publicLoadError}</p>}{page}</>;
}
