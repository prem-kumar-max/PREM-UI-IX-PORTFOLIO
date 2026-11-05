import React, { useEffect, useMemo, useRef, useState } from "react";
import JSZip from "jszip";
import { adminPasscodeHash } from "./data/adminPasscode.js";
import { settings } from "./data/settings.js";
import { deleteAsset, loadAssets, loadWorkingCopy, publishedData, resetWorkingCopy, saveAsset, saveWorkingCopy } from "./data/workingCopy.js";

const LEGACY_STORAGE_KEY = "prem-portfolio-v1";
const FILE_DB_NAME = "prem-portfolio-files";
const FILE_STORE_NAME = "files";
const MAX_IMAGE_SIZE = 20 * 1024 * 1024;
const MAX_PDF_SIZE = 10 * 1024 * 1024;
const profileImage = "/prem-portrait.png";
const aboutImage = "/prem-about-event.png";

const defaultState = publishedData;

function readLegacyState() {
  try {
    const saved = window.localStorage.getItem(LEGACY_STORAGE_KEY);
    return saved ? JSON.parse(saved) : null;
  } catch (error) {
    throw new Error(`Could not read the legacy browser backup: ${error.message}`);
  }
}

function readLegacyResumeFiles() {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) {
      reject(new Error("This browser does not support reading the previous resume backup."));
      return;
    }
    const request = indexedDB.open(FILE_DB_NAME, 1);
    request.onerror = () => reject(request.error || new Error("Could not open the previous resume backup."));
    request.onsuccess = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(FILE_STORE_NAME)) {
        database.close();
        resolve(null);
        return;
      }
      const transaction = database.transaction(FILE_STORE_NAME, "readonly");
      const fileRequest = transaction.objectStore(FILE_STORE_NAME).getAll();
      fileRequest.onsuccess = () => {
        const files = (fileRequest.result || []).map((entry) => ({ id: entry.id, file: entry.file || entry.blob || null }));
        database.close();
        resolve(files);
      };
      fileRequest.onerror = () => {
        database.close();
        reject(fileRequest.error || new Error("Could not read the previous resume files."));
      };
    };
  });
}

function assetPreview(path, assetUrls = {}) {
  if (!path) return "";
  return assetUrls[path] || assetUrls[path.replace(/^\/+/, "")] || path;
}

async function resizeImage(file) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / bitmap.width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Your browser could not prepare this image.");
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) => canvas.toBlob(
    (blob) => blob ? resolve(blob) : reject(new Error("Your browser could not resize this image.")),
    "image/webp",
    0.85,
  ));
}

async function imageBlobFromValue(value) {
  if (!value) return null;
  if (value.startsWith("data:") || value.startsWith("blob:") || value.startsWith("/") || /^https?:\/\//i.test(value)) {
    const response = await fetch(value);
    if (response.ok) return response.blob();
    throw new Error(`Could not read the previous image at ${value}.`);
  }
  return null;
}

async function sha256(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function useLocation() {
  const [path, setPath] = useState(window.location.pathname);
  useEffect(() => {
    const update = () => setPath(window.location.pathname);
    window.addEventListener("popstate", update);
    return () => window.removeEventListener("popstate", update);
  }, []);
  const navigate = (to) => {
    window.history.pushState({}, "", to);
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
  const href = resumeUrl || "/Prem-Kumar-Resume.pdf";
  return (
    <span className={`resume-nav-links ${className}`}>
      <a href={href} target="_blank" rel="noreferrer">View resume</a>
      <a href={href} download={filename || "Prem-Kumar-Resume.pdf"}>Download</a>
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

function Footer({ content, navigate }) {
  return (
    <footer className="site-footer">
      <div className="footer-top" data-reveal>
        <p className="eyebrow">HAVE A GOOD ONE IN MIND?</p>
        <button className="footer-cta" onClick={() => navigate("/contact")}>Let’s make it matter. <Arrow diagonal /></button>
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

function ProjectCard({ project, index, onClick, reveal = false }) {
  const metadata = [project.category, project.year].filter(Boolean).join(" · ") || "CASE STUDY";
  const thumbnail = project.thumbnailUrl || project.image;
  return (
    <button className={`project-card project-card-${index % 3}`} onClick={onClick} data-reveal={reveal ? "" : undefined}>
      <div className="project-image">
        {thumbnail ? (
          <img src={thumbnail} alt={`${project.title} project preview`} />
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
            <h2 data-reveal>{content.headline}</h2>
            <div data-reveal>
              <p>{content.about}</p>
              <button className="text-link" onClick={() => navigate("/about")}>A little more about me <Arrow /></button>
            </div>
          </div>
        </section>

        <section className="work-section section-shell">
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
      <Footer content={content} navigate={navigate} />
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
  const playerRef = useRef(null);
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
      if (event.key === "Escape") {
        if (document.fullscreenElement) {
          document.exitFullscreen().catch((error) => console.error("Could not exit browser full screen.", error));
        } else {
          closeFullscreen();
        }
      }
    };
    const onFullscreenChange = () => {
      if (!document.fullscreenElement) closeFullscreen();
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      window.clearTimeout(closeTimer.current);
    };
  }, [fullscreen]);
  if (!safeSrc) return <div className="figma-embed-status figma-embed-error" role="status">This Figma prototype URL is not allowed.</div>;
  return (
    <div
      ref={playerRef}
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
            if (document.fullscreenElement) {
              document.exitFullscreen().catch((error) => console.error("Could not exit browser full screen.", error));
            }
            closeFullscreen();
          } else {
            setClosing(false);
            setFullscreen(true);
            if (playerRef.current?.requestFullscreen) {
              playerRef.current.requestFullscreen().catch((error) => console.error("Could not enter browser full screen; keeping the viewport viewer open.", error));
            }
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
    return <><Header navigate={navigate} /><main className="not-found"><p className="eyebrow">NOT FOUND</p><h1>This project isn’t here.</h1><button className="text-link" onClick={() => navigate("/work")}>Back to work <Arrow /></button></main><Footer content={content} navigate={navigate} /></>;
  }
  const related = projects.filter((item) => item.status === "Published" && item.id !== project.id).slice(0, 2);
  const figmaEmbedUrl = extractFigmaEmbedUrl(project.figmaEmbedUrl || "");
  return (
    <>
      <Header navigate={navigate} active="work" />
      <main className="case-study section-shell">
        <button className="back-link" onClick={() => navigate("/work")}>← All work</button>
        <div className="case-heading">
          <div><p className="eyebrow">{[project.category, project.year].filter(Boolean).join(" · ") || "CASE STUDY"}</p><h1>{project.title}</h1><p className="case-description">{project.description}</p></div>
          {(project.role || project.tools || project.duration) && <dl><div><dt>ROLE</dt><dd>{project.role || "—"}</dd></div><div><dt>TOOLS</dt><dd>{project.tools || "—"}</dd></div><div><dt>DURATION</dt><dd>{project.duration || "—"}</dd></div></dl>}
        </div>
        {(!figmaEmbedUrl || project.thumbnailUrl || project.image) && <div className="case-cover">
          {(project.thumbnailUrl || project.image) ? <img src={project.thumbnailUrl || project.image} alt={`${project.title} cover`} /> : <div className="project-art art-0"><span className="art-title">{project.title}</span><span className="art-orbit" /></div>}
        </div>}
        {figmaEmbedUrl && <>
          <FigmaEmbed src={figmaEmbedUrl} title={project.title} />
          <a className="figma-open-link" href={figmaEmbedUrl} target="_blank" rel="noreferrer">Open in Figma <Arrow diagonal /></a>
        </>}
        {project.sections?.length > 0 && <div className="case-content">
          {project.sections.map((section, index) => (
            <section className="case-block" key={`${section.title}-${index}`}>
              <span className="case-number">0{index + 1}</span>
              <div><h2>{section.title}</h2><p>{section.body}</p>{section.image && <img className="section-image" src={section.image} alt={section.title} />}</div>
            </section>
          ))}
        </div>}
        {related.length > 0 && <div className="related-work"><p className="eyebrow">KEEP EXPLORING</p><h2>More selected work</h2><div className="project-grid">{related.map((item, index) => <ProjectCard key={item.id} project={item} index={index} onClick={() => navigate(`/work/${item.slug}`)} />)}</div></div>}
      </main>
      <Footer content={content} navigate={navigate} />
    </>
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
      </main>
      <Footer content={content} navigate={navigate} />
    </>
  );
}

function AdminLogin({ error: serverError, onLogin }) {
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (event) => {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      await onLogin(passcode);
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
        <p>Enter your passcode to open the portfolio CMS. Changes stay on this device until you export and push them to GitHub.</p>
        <form onSubmit={submit}>
          <label htmlFor="admin-passcode">Passcode</label>
          <input id="admin-passcode" type="password" autoComplete="current-password" value={passcode} onChange={(event) => setPasscode(event.target.value)} required />
          <button className="button-dark" type="submit" disabled={busy}>{busy ? "Checking…" : "Open CMS"} <Arrow /></button>
        </form>
        {(error || serverError) && <p className="form-error" role="alert">{error || serverError}</p>}
        <button className="text-link" onClick={() => { window.location.href = "/"; }}>← Back to portfolio</button>
      </div>
    </main>
  );
}

function AdminShell({ children, section, setSection, onLogout, navigate, dirty }) {
  const navItems = [["overview", "Overview"], ["projects", "Case studies"], ["resumes", "Resumes"], ["content", "Site content"], ["settings", "Export & settings"]];
  return (
    <div className="admin-layout">
      <aside className="admin-sidebar">
        <Brand onClick={() => navigate("/")} />
        <p className="admin-label">WORKSPACE</p>
        <nav>{navItems.map(([id, label]) => <button key={id} className={section === id ? "admin-nav-active" : ""} onClick={() => setSection(id)}><span className={`admin-nav-icon icon-${id}`}>{id === "overview" ? "◫" : id === "projects" ? "▤" : id === "resumes" ? "⇧" : "◈"}</span>{label}</button>)}</nav>
        <div className="admin-side-bottom"><span className="status-dot" />Local working copy<button onClick={() => navigate("/")}>↗ View portfolio</button><button onClick={onLogout}>↪ Sign out</button></div>
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
      <div className="admin-dashboard-grid"><section className="admin-panel recent-panel"><div className="panel-heading"><div><p className="eyebrow">YOUR CONTENT</p><h2>Recent case studies</h2></div><button className="text-link" onClick={() => setSection("projects")}>Manage all <Arrow /></button></div>{projects.slice(0, 4).map((project) => <div className="recent-row" key={project.id}><span className="recent-thumb">{(project.thumbnailUrl || project.thumbnail || project.image) && <img src={project.thumbnailUrl || project.thumbnail || project.image} alt="" />}</span><div><strong>{project.title}</strong><span>{project.description || [project.category, project.year].filter(Boolean).join(" · ")}</span></div><span className={`status-pill status-${project.status.toLowerCase()}`}>{project.status}</span></div>)}{projects.length === 0 && <p className="empty-note">Your first case study starts here.</p>}</section><section className="admin-panel quick-panel"><p className="eyebrow">QUICK START</p><h2>Make your next idea<br />feel at home here.</h2><p>Case studies marked published appear on your site after you export and push the changes to GitHub.</p><button className="button-outline" onClick={() => setSection("projects")}>Create a case study <Arrow /></button><div className="quick-decoration">P.</div></section></div>
    </div>
  );
}

function FigmaCaseStudyEditor({ project, existing, onSave, onCancel, onDelete, onUploadAsset, onDiscardAsset, assetUrls }) {
  const [form, setForm] = useState(() => project ? {
    ...project,
    thumbnailUrl: project.thumbnail || project.thumbnailUrl || project.image || "",
    figmaEmbedCode: project.figmaEmbedUrl || "",
  } : {
    id: crypto.randomUUID(),
    title: "",
    slug: "",
    description: "",
    thumbnailUrl: "",
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
  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const validatedEmbedUrl = extractFigmaEmbedUrl(form.figmaEmbedCode);

  const save = (status) => {
    if (uploadProgress !== null || isSectionUploading || saving) return;
    if (!form.title.trim()) {
      setNotice("Add a project title before saving.");
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
      slug: slugify(form.slug || form.title),
      description: form.description.trim(),
      thumbnail: form.thumbnailUrl,
      thumbnailUrl: form.thumbnailUrl,
      sections: form.sections.map(({ imagePreviewUrl, ...item }) => item),
      figmaEmbedUrl: validatedEmbedUrl,
      status,
      featured: Boolean(form.featured),
      updatedAt: now,
      createdAt: form.createdAt || now,
      publishedAt: status === "Published" ? (form.publishedAt || now) : null,
    };
    setSaving(true);
    setNotice("");
    Promise.resolve(onSave(saved, uploadedAssets.current))
      .then(() => { uploadedAssets.current = []; })
      .catch((error) => setNotice(error.message || "Could not save this case study."))
      .finally(() => setSaving(false));
  };

  const readImage = async (file) => {
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setNotice("Choose a JPG, PNG, or WebP image.");
      return;
    }
    if (file.size > MAX_IMAGE_SIZE) {
      setNotice("Please choose an image smaller than 20 MB.");
      return;
    }
    setNotice("");
    setUploadProgress(0);
    try {
      const media = await onUploadAsset(file, setUploadProgress, "thumbnails", form.slug || form.title);
      uploadedAssets.current.push(media);
      setForm((current) => ({
        ...current,
        thumbnailUrl: media.path,
        thumbnailPreviewUrl: media.previewUrl,
      }));
    } catch (error) {
      setNotice(error.message || "Could not upload this image.");
    } finally {
      setUploadProgress(null);
    }
  };

  const readSectionImage = async (index, file) => {
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setNotice("Choose a JPG, PNG, or WebP image.");
      return;
    }
    if (file.size > MAX_IMAGE_SIZE) {
      setNotice("Please choose an image smaller than 20 MB.");
      return;
    }
    setNotice("");
    setSectionUploadProgress((current) => ({ ...current, [index]: 0 }));
    try {
      const media = await onUploadAsset(file, (progress) => {
        setSectionUploadProgress((current) => ({ ...current, [index]: progress }));
      }, "case-images", `${form.slug || form.title}-${index + 1}`);
      uploadedAssets.current.push(media);
      setForm((current) => ({
        ...current,
        sections: current.sections.map((section, sectionIndex) => sectionIndex === index
          ? { ...section, image: media.path, imagePreviewUrl: media.previewUrl }
          : section),
      }));
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
    for (const media of uploadedAssets.current) {
      await onDiscardAsset(media.path);
    }
    uploadedAssets.current = [];
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
              <label className="field-span">Project title<input value={form.title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. SkillConnect" required /></label>
              <label className="field-span">Project URL slug<input value={form.slug} onChange={(event) => setSlug(event.target.value)} placeholder="skillconnect" /></label>
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
                    {section.image && <img className="field-span section-image" src={section.imagePreviewUrl || assetPreview(section.image, assetUrls)} alt={`${section.title || "Case study"} preview`} />}
                    <label className="thumbnail-file-button">{sectionUploadProgress[index] !== undefined ? `Uploading ${sectionUploadProgress[index]}%` : section.image ? "Replace section image" : "Add section image"}<input type="file" accept="image/png,image/jpeg,image/webp" disabled={sectionUploadProgress[index] !== undefined || saving} onChange={(event) => { readSectionImage(index, event.target.files?.[0]); event.target.value = ""; }} /></label>
                    {sectionUploadProgress[index] !== undefined && <progress className="upload-progress" max="100" value={sectionUploadProgress[index]} aria-label="Case study image upload progress" />}
                    {section.image && <button type="button" className="remove-image" onClick={() => update("sections", form.sections.map((item, itemIndex) => itemIndex === index ? { ...item, image: "", imagePublicId: null } : item))}>Remove image</button>}
                    <button type="button" className="edit-link delete-case-study" disabled={isSectionUploading} onClick={() => update("sections", form.sections.filter((_item, itemIndex) => itemIndex !== index))}>Remove section</button>
                  </div>
                </div>
              ))}
              <button type="button" className="button-outline" disabled={saving} onClick={() => update("sections", [...form.sections, { title: "", body: "", image: "", imagePublicId: null }])}>+ Add story section</button>
            </div>
          </section>
        </div>
        <aside className="editor-aside">
          <section className="editor-card">
            <div className="editor-section-head"><span>04</span><div><h2>Project thumbnail</h2><p>JPG, PNG or WebP · up to 20 MB, resized for the web</p></div></div>
            <div
              className={`case-thumbnail-upload${isDragging ? " is-dragging" : ""}`}
              onDragOver={(event) => { event.preventDefault(); setIsDragging(true); }}
              onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setIsDragging(false); }}
              onDrop={(event) => { event.preventDefault(); setIsDragging(false); readImage(event.dataTransfer.files?.[0]); }}
            >
              {form.thumbnailUrl ? <img src={form.thumbnailPreviewUrl || assetPreview(form.thumbnailUrl, assetUrls)} alt="Project thumbnail preview" /> : <div className="upload-placeholder"><span>↥</span><strong>Drop an image here</strong><small>or choose a file from your device</small></div>}
              <label className="thumbnail-file-button">{uploadProgress !== null ? `Uploading ${uploadProgress}%` : form.thumbnailUrl ? "Replace image" : "Choose image"}<input type="file" accept="image/png,image/jpeg,image/webp" disabled={uploadProgress !== null || saving} onChange={(event) => { readImage(event.target.files?.[0]); event.target.value = ""; }} /></label>
              {uploadProgress !== null && <progress className="upload-progress" max="100" value={uploadProgress} aria-label="Image upload progress" />}
              {form.thumbnailUrl && <button type="button" className="remove-image" onClick={() => setForm((current) => ({ ...current, thumbnailUrl: "", thumbnailPreviewUrl: "" }))}>Remove image</button>}
            </div>
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

function CaseStudiesManager({ projects, setProjects, onSaveProject, onDeleteProject, onChangeStatus, onUploadAsset, onDiscardAsset, assetUrls }) {
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All");
  const [notice, setNotice] = useState("");

  const saveProject = async (project, pendingMedia) => {
    const baseSlug = slugify(project.slug || project.title) || "case-study";
    let slug = baseSlug;
    let suffix = 2;
    while (projects.some((item) => item.id !== project.id && item.slug === slug)) {
      slug = `${baseSlug}-${suffix}`;
      suffix += 1;
    }
    const saved = await onSaveProject({ ...project, slug }, pendingMedia);
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
      await onDeleteProject(id);
      setProjects((current) => current.filter((project) => project.id !== id));
      setEditing(null);
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
    figmaEmbedCode: "",
    sections: [],
    status: "Draft",
    featured: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    publishedAt: null,
  });
  const filtered = projects.filter((project) => (filter === "All" || project.status === filter) && project.title.toLowerCase().includes(search.toLowerCase()));
  if (editing) return <FigmaCaseStudyEditor project={editing} existing={projects.some((project) => project.id === editing.id)} onSave={saveProject} onCancel={() => setEditing(null)} onDelete={deleteProject} onUploadAsset={onUploadAsset} onDiscardAsset={onDiscardAsset} assetUrls={assetUrls} />;
  return (
    <div className="admin-page">
      <div className="admin-page-heading"><div><p className="eyebrow">YOUR PORTFOLIO, YOUR STORY</p><h1>Case studies</h1><p>Create, refine and publish the work you’re proud of.</p></div><button className="button-dark" onClick={createProject}>+ Add New Case Study</button></div>
      {notice && <p className="inline-notice" role="status">{notice}<button onClick={() => setNotice("")}>×</button></p>}
      <div className="table-toolbar"><div className="search-box">⌕ <input aria-label="Search case studies" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search case studies…" /></div><div className="table-filters">{["All", "Published", "Draft"].map((item) => <button key={item} className={filter === item ? "filter-active" : ""} onClick={() => setFilter(item)}>{item}</button>)}</div></div>
      <div className="project-table">
        <div className="table-head"><span>PROJECT</span><span>STATUS</span><span>HOMEPAGE</span><span>UPDATED</span><span>ACTIONS</span></div>
        {filtered.map((project) => <div className="table-row" key={project.id}>
          <button className="table-project" onClick={() => setEditing(project)}><span className="table-thumb">{(project.thumbnail || project.thumbnailUrl || project.image) && <img src={assetPreview(project.thumbnail || project.thumbnailUrl || project.image, assetUrls)} alt="" />}</span><span><strong>{project.title}</strong><small>{project.description || project.category || "Figma case study"}</small></span></button>
          <span><span className={`status-pill status-${project.status.toLowerCase()}`}>{project.status}</span></span>
          <span>{project.featured ? "Featured" : "—"}</span>
          <span>{project.updatedAt ? new Date(project.updatedAt).toLocaleDateString() : "—"}</span>
          <span className="case-study-actions"><button className="edit-link" onClick={() => setEditing({ ...project, showPreviewOnOpen: true })}>Preview</button><button className="edit-link" onClick={() => setEditing(project)}>Edit</button><button className="edit-link" onClick={() => changeStatus(project, project.status === "Published" ? "Draft" : "Published")}>{project.status === "Published" ? "Unpublish" : "Publish"}</button><button className="edit-link delete-case-study" onClick={() => deleteProject(project.id)}>Delete</button></span>
        </div>)}
        {filtered.length === 0 && <p className="empty-note">No case studies match your search.</p>}
      </div>
      <p className="storage-note">Changes are saved to this browser’s IndexedDB working copy. Export and push them to update the live site.</p>
    </div>
  );
}

function SiteContentEditor({ content, onSave }) {
  const [form, setForm] = useState(content);
  const [saved, setSaved] = useState(false);
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => setForm(content), [content]);
  const update = (key, value) => { setForm((current) => ({ ...current, [key]: value })); setSaved(false); };
  const save = async () => {
    setSaving(true);
    setNotice("");
    setSaved(false);
    try {
      await onSave(form);
      setSaved(true);
    } catch (error) {
      setNotice(error.message || "Could not save your site content.");
    } finally {
      setSaving(false);
    }
  };
  return <div className="admin-page content-editor-page"><div className="admin-page-heading"><div><p className="eyebrow">YOUR VOICE, YOUR DETAILS</p><h1>Site content</h1><p>Update your introduction and how people can reach you.</p></div><button className="button-dark" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save changes"} <Arrow /></button></div>{saved && <p className="inline-notice">Your site content has been saved.</p>}{notice && <p className="form-error" role="alert">{notice}</p>}<section className="editor-card content-form-card"><div className="editor-section-head"><span>01</span><div><h2>Introduction</h2><p>These details appear across your portfolio.</p></div></div><div className="field-grid"><label>Your name<input value={form.name} onChange={(event) => update("name", event.target.value)} /></label><label>Professional title<input value={form.title} onChange={(event) => update("title", event.target.value)} /></label><label className="field-span">Hero headline<textarea rows="2" value={form.headline} onChange={(event) => update("headline", event.target.value)} /></label><label className="field-span">Short introduction<textarea rows="3" value={form.intro} onChange={(event) => update("intro", event.target.value)} /></label><label className="field-span">About paragraph<textarea rows="4" value={form.about} onChange={(event) => update("about", event.target.value)} /></label></div></section><section className="editor-card content-form-card"><div className="editor-section-head"><span>02</span><div><h2>Contact & links</h2><p>Keep your public contact details current.</p></div></div><div className="field-grid"><label>Email<input type="email" value={form.email} onChange={(event) => update("email", event.target.value)} /></label><label>Phone<input value={form.phone} onChange={(event) => update("phone", event.target.value)} /></label><label>LinkedIn URL<input value={form.linkedin} onChange={(event) => update("linkedin", event.target.value)} /></label><label>GitHub URL<input value={form.github} onChange={(event) => update("github", event.target.value)} /></label><label>Behance URL<input value={form.behance} onChange={(event) => update("behance", event.target.value)} /></label><label>Location<input value={form.location} onChange={(event) => update("location", event.target.value)} /></label></div></section></div>;
}

function ResumeManager({ resumes, activeResumePath, onUpload, onSetActive, onDelete }) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [uploadProgress, setUploadProgress] = useState(null);

  const upload = async (event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (!files.length) return;
    setBusy(true);
    setNotice("");
    try {
      const result = await onUpload(files, (name, percentage) => setUploadProgress({ name, percentage }));
      const messages = [];
      if (result.uploaded.length) messages.push(`${result.uploaded.length} resume${result.uploaded.length === 1 ? "" : "s"} uploaded.`);
      if (result.errors.length) messages.push(result.errors.join(" "));
      setNotice(messages.join(" ") || "No resumes were uploaded.");
    } catch (error) {
      console.error("Could not upload resumes.", error);
      setNotice("Resume upload failed. Please try again.");
    } finally {
      setBusy(false);
      setUploadProgress(null);
    }
  };

  const remove = async (resume) => {
    if (!window.confirm(`Delete “${resume.name}”? This removes it from the working copy.`)) return;
    try {
      await onDelete(resume.id);
      setNotice(`${resume.name} deleted.`);
    } catch (error) {
      console.error("Could not delete the resume.", error);
      setNotice(`Could not delete “${resume.name}”. ${error.message}`);
    }
  };

  const activate = async (resume) => {
    try {
      await onSetActive(resume.id);
      setNotice(`${resume.name} is now selected for the website.`);
    } catch (error) {
      setNotice(`Could not activate “${resume.name}”. ${error.message}`);
    }
  };

  return (
    <div className="admin-page resume-manager">
      <div className="admin-page-heading">
        <div><p className="eyebrow">YOUR EXPERIENCE, ALWAYS CURRENT</p><h1>Resumes</h1><p>Keep several versions here and choose which one visitors see on your About page.</p></div>
        <label className={`button-dark resume-upload-button${busy ? " is-busy" : ""}`}>{busy ? "Uploading…" : "+ Upload Resumes"}<input type="file" accept="application/pdf,.pdf" multiple disabled={busy} onChange={upload} /></label>
      </div>
      {uploadProgress && <p className="upload-progress-label" role="status">Uploading {uploadProgress.name} · {uploadProgress.percentage}% <progress className="upload-progress" max="100" value={uploadProgress.percentage} /></p>}
      {notice && <p className="inline-notice" role="status">{notice}<button type="button" onClick={() => setNotice("")}>×</button></p>}
      <section className="resume-list-card">
        <div className="resume-list-heading"><div><p className="eyebrow">SAVED FILES</p><h2>{resumes.length} resume{resumes.length === 1 ? "" : "s"}</h2></div><span className="resume-active-count">ONE ACTIVE ON YOUR SITE</span></div>
        {resumes.length ? (
          <div className="resume-list">
            {resumes.map((resume) => {
              const isActive = resume.path === activeResumePath;
              return (
                <article className={`resume-row${isActive ? " resume-row-active" : ""}`} key={resume.id}>
                  <span className="resume-file-icon" aria-hidden="true">PDF</span>
                  <div className="resume-file-details"><strong>{resume.name}</strong><span>{(Number(resume.size) / (1024 * 1024)).toFixed(2)} MB · Added {new Date(resume.uploadedAt).toLocaleDateString()}</span></div>
                  {isActive ? <span className="resume-active-pill"><span />Active on website</span> : <button type="button" className="button-outline resume-action" onClick={() => activate(resume)}>Set active</button>}
                  <button type="button" className="resume-delete" onClick={() => remove(resume)} aria-label={`Delete ${resume.name}`}>Delete</button>
                </article>
              );
            })}
          </div>
        ) : <p className="resume-empty">No resumes uploaded yet. Upload one or more PDF files to get started.</p>}
      </section>
      <p className="storage-note">PDFs are kept in this browser’s IndexedDB working copy. Only the active resume is linked on your site after export and push.</p>
    </div>
  );
}

function AdminPage({ state, setState, navigate }) {
  const [section, setSection] = useState("overview");
  const [authenticated, setAuthenticated] = useState(false);
  const [authError, setAuthError] = useState("");
  const [notice, setNotice] = useState("");
  const [working, setWorking] = useState(false);
  const [exported, setExported] = useState(false);
  const dirty = JSON.stringify({ ...state, assetUrls: undefined, exportFingerprint: undefined }) !== (state.exportFingerprint || JSON.stringify(publishedData));
  const assetUrls = state.assetUrls || {};

  const login = async (passcode) => {
    if (!adminPasscodeHash) throw new Error("No passcode has been configured. Run npm run set-passcode in the project terminal first.");
    if (await sha256(passcode) !== adminPasscodeHash) throw new Error("That passcode is not correct.");
    setAuthError("");
    setAuthenticated(true);
  };

  const updateState = (updater) => setState((current) => typeof updater === "function" ? updater(current) : updater);
  const usedAssetPaths = (project) => [project.thumbnail || project.thumbnailUrl || project.image, ...(project.sections || []).map((item) => item.image)].filter((value) => value && /^(thumbnails|case-images)\//.test(value.replace(/^\//, ""))).map((value) => value.replace(/^\//, ""));
  const uploadAsset = async (file, onProgress, folder = "thumbnails", title = "case-study") => {
    if (!file || !["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error("Choose a JPG, PNG, or WebP image.");
    if (file.size > MAX_IMAGE_SIZE) throw new Error("Choose an image smaller than 20 MB.");
    onProgress?.(10);
    const blob = await resizeImage(file);
    const stem = slugify(title) || "case-study";
    const path = `${folder}/${stem}-${crypto.randomUUID()}.webp`;
    await saveAsset(path, blob);
    const previewUrl = URL.createObjectURL(blob);
    onProgress?.(100);
    updateState((current) => ({ ...current, assetUrls: { ...(current.assetUrls || {}), [path]: previewUrl } }));
    return { path, previewUrl };
  };
  const discardAsset = async (path) => {
    if (!path) return;
    await deleteAsset(path);
    const previewUrl = assetUrls[path];
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    updateState((current) => {
      const nextUrls = { ...(current.assetUrls || {}) };
      delete nextUrls[path];
      return { ...current, assetUrls: nextUrls };
    });
  };

  const saveProject = async (project) => {
    const previous = state.projects.find((item) => item.id === project.id);
    updateState((current) => ({
      ...current,
      projects: current.projects.some((item) => item.id === project.id)
        ? current.projects.map((item) => item.id === project.id ? project : item)
        : [project, ...current.projects],
    }));
    const retained = new Set(usedAssetPaths(project));
    const referencedElsewhere = new Set(state.projects.filter((item) => item.id !== project.id).flatMap(usedAssetPaths));
    for (const path of usedAssetPaths(previous || {}).filter((assetPath) => !retained.has(assetPath) && !referencedElsewhere.has(assetPath))) await discardAsset(path);
    return project;
  };
  const deleteProject = async (id) => {
    const target = state.projects.find((project) => project.id === id);
    updateState((current) => ({ ...current, projects: current.projects.filter((project) => project.id !== id) }));
    const otherPaths = new Set(state.projects.filter((project) => project.id !== id).flatMap(usedAssetPaths));
    for (const path of usedAssetPaths(target || {}).filter((assetPath) => !otherPaths.has(assetPath))) await discardAsset(path);
  };
  const changeProjectStatus = async (id, published) => {
    let saved;
    updateState((current) => ({
      ...current,
      projects: current.projects.map((project) => {
        if (project.id !== id) return project;
        saved = { ...project, status: published ? "Published" : "Draft", publishedAt: published ? (project.publishedAt || new Date().toISOString()) : null, updatedAt: new Date().toISOString() };
        return saved;
      }),
    }));
    return saved;
  };

  const uploadResumes = async (files, onProgress) => {
    const uploaded = [];
    const errors = [];
    for (const file of files) {
      if (file.type !== "application/pdf" || !file.name.toLowerCase().endsWith(".pdf")) {
        errors.push(`${file.name}: choose a PDF file.`);
        continue;
      }
      if (file.size > MAX_PDF_SIZE) {
        errors.push(`${file.name}: PDF files must be 10 MB or smaller.`);
        continue;
      }
      const stem = slugify(file.name.replace(/\.pdf$/i, "")) || "resume";
      const path = `resumes/${stem}-${crypto.randomUUID()}.pdf`;
      try {
        onProgress?.(file.name, 10);
        await saveAsset(path, file);
        const resume = { id: crypto.randomUUID(), name: file.name, path: `/${path}`, size: file.size, uploadedAt: new Date().toISOString() };
        uploaded.push(resume);
        const previewUrl = URL.createObjectURL(file);
        updateState((current) => ({
          ...current,
          resumes: [...(current.resumes || []), resume],
          activeResumePath: current.activeResumePath || resume.path,
          assetUrls: { ...(current.assetUrls || {}), [path]: previewUrl },
        }));
        onProgress?.(file.name, 100);
      } catch (error) {
        errors.push(`${file.name}: ${error.message}`);
      }
    }
    return { uploaded, errors };
  };
  const setActiveResume = async (id) => {
    const resume = state.resumes.find((item) => item.id === id);
    if (resume) updateState((current) => ({ ...current, activeResumePath: resume.path }));
  };
  const deleteResume = async (id) => {
    const resume = state.resumes.find((item) => item.id === id);
    if (!resume) return;
    const remaining = state.resumes.filter((item) => item.id !== id);
    updateState((current) => ({ ...current, resumes: remaining, activeResumePath: current.activeResumePath === resume.path ? (remaining[0]?.path || "") : current.activeResumePath }));
    if (!resume.isDefault) await discardAsset(resume.path.replace(/^\//, ""));
  };
  const saveContent = async (content) => updateState((current) => ({ ...current, content }));

  const importLegacy = async () => {
    setWorking(true);
    setNotice("Reading the existing browser backup?");
    try {
      const legacy = readLegacyState();
      const legacyFiles = await readLegacyResumeFiles();
      if (!legacy && !legacyFiles.some((entry) => entry.file)) throw new Error("No saved browser CMS data or resume files were found.");
      const migrated = {
        ...state,
        content: { ...state.content, ...(legacy?.content || {}) },
        projects: Array.isArray(legacy?.projects) ? legacy.projects.map((project, index) => ({
          ...project,
          id: project.id || crypto.randomUUID(),
          slug: slugify(project.slug || project.title || `case-study-${index + 1}`),
          thumbnail: project.thumbnail || project.thumbnailUrl || project.image || "",
          figmaEmbedUrl: extractFigmaEmbedUrl(project.figmaEmbedUrl || project.figmaEmbedCode || ""),
          status: project.status === "Published" || project.status === "published" ? "Published" : "Draft",
          sections: (project.sections || []).map((item) => ({ ...item, image: item.image || "" })),
        })) : state.projects,
        resumes: [...(state.resumes || [])],
        assetUrls: { ...(state.assetUrls || {}) },
      };
      const importImage = async (value, path) => {
        const blob = await imageBlobFromValue(value);
        if (!blob) return value;
        const optimized = await resizeImage(new File([blob], `${slugify(path)}.webp`, { type: blob.type || "image/jpeg" }));
        const assetPath = `${path}-${crypto.randomUUID()}.webp`;
        await saveAsset(assetPath, optimized);
        migrated.assetUrls[assetPath] = URL.createObjectURL(optimized);
        return `/${assetPath}`;
      };
      for (const [index, project] of migrated.projects.entries()) {
        const thumb = project.thumbnail || project.thumbnailUrl || project.image || "";
        project.thumbnail = thumb ? await importImage(thumb, `thumbnails/${slugify(project.slug || `case-study-${index + 1}`)}`) : "";
        project.thumbnailUrl = project.thumbnail;
        for (const [sectionIndex, item] of project.sections.entries()) {
          if (item.image) item.image = await importImage(item.image, `case-images/${slugify(project.slug)}-${sectionIndex + 1}`);
        }
      }
      const legacyFileById = new Map(legacyFiles.map((entry) => [entry.id, entry.file]));
      for (const oldResume of legacy?.resumes || []) {
        const file = legacyFileById.get(oldResume.id);
        if (!file) throw new Error(`The old resume ?${oldResume.name || oldResume.originalFilename}? is not available in the browser file backup.`);
        if (file.size > MAX_PDF_SIZE) throw new Error(`The old resume ?${oldResume.name || oldResume.originalFilename}? is larger than 10 MB.`);
        const name = oldResume.name || oldResume.originalFilename || "resume.pdf";
        const path = `resumes/${slugify(name.replace(/\.pdf$/i, ""))}-${crypto.randomUUID()}.pdf`;
        await saveAsset(path, file);
        const resume = { id: crypto.randomUUID(), name, path: `/${path}`, size: file.size, uploadedAt: new Date().toISOString() };
        migrated.resumes.push(resume);
        migrated.assetUrls[path] = URL.createObjectURL(file);
        if (!migrated.activeResumePath || oldResume.id === legacy.activeResumeId) migrated.activeResumePath = resume.path;
      }
      if (Number.isFinite(legacy?.featuredLimit)) migrated.featuredLimit = legacy.featuredLimit;
      updateState(migrated);
      await saveWorkingCopy({ ...migrated, assetUrls: undefined });
      setNotice("Browser data imported into this working copy. The old localStorage and IndexedDB data has not been changed.");
    } catch (error) {
      setNotice(`Import did not complete: ${error.message}`);
    } finally {
      setWorking(false);
    }
  };

  const normalizeExportPath = (value) => {
    if (!value) return "";
    const trimmed = value.replace(/^\/+/, "");
    if (trimmed === "Prem-Kumar-Resume.pdf") return "resumes/Prem-Kumar-Resume.pdf";
    if (!/^(thumbnails|case-images|resumes)\/[a-zA-Z0-9._-]+$/.test(trimmed)) throw new Error(`Unsupported asset path: ${value}`);
    return trimmed;
  };
  const exportForGitHub = async () => {
    setWorking(true);
    setNotice("Building your GitHub export?");
    try {
      const zip = new JSZip();
      const projects = state.projects.map((project) => {
        const { thumbnailUrl, image, thumbnailPublicId, figmaEmbedCode, slugEdited, showPreviewOnOpen, ...clean } = project;
        const thumbnail = normalizeExportPath(project.thumbnail || thumbnailUrl || image || "");
        return { ...clean, thumbnail: thumbnail ? `/${thumbnail}` : "", sections: (project.sections || []).map(({ imagePublicId, imagePreviewUrl, ...item }) => ({ ...item, image: item.image ? `/${normalizeExportPath(item.image)}` : "" })) };
      });
      const exportedResumePath = (path) => path === "/Prem-Kumar-Resume.pdf" ? path : `/${normalizeExportPath(path)}`;
      const resumes = (state.resumes || []).map((resume) => ({ ...resume, path: exportedResumePath(resume.path) }));
      const activeResumePath = state.activeResumePath ? exportedResumePath(state.activeResumePath) : "";
      const exportedSettings = { featuredLimit: state.featuredLimit, activeResumePath, resumes };
      zip.file("src/data/caseStudies.js", `export const caseStudies = ${JSON.stringify(projects, null, 2)};\n`);
      zip.file("src/data/siteContent.js", `export const siteContent = ${JSON.stringify(state.content, null, 2)};\n`);
      zip.file("src/data/settings.js", `export const settings = ${JSON.stringify(exportedSettings, null, 2)};\n`);
      const pathToSource = new Map();
      for (const project of state.projects) {
        for (const assetPath of usedAssetPaths(project)) pathToSource.set(assetPath, assetPath);
      }
      for (const resume of state.resumes || []) pathToSource.set(normalizeExportPath(resume.path), resume.path.replace(/^\//, ""));
      const storedAssets = new Map((await loadAssets()).map((asset) => [asset.path, asset.blob]));
      for (const [outputPath, sourcePath] of pathToSource) {
        let blob = storedAssets.get(sourcePath) || storedAssets.get(outputPath);
        if (!blob) {
          const fetchPath = sourcePath === "Prem-Kumar-Resume.pdf" ? "/Prem-Kumar-Resume.pdf" : `/${sourcePath}`;
          const response = await fetch(fetchPath);
          if (!response.ok) throw new Error(`Could not include ${fetchPath} in the ZIP export.`);
          blob = await response.blob();
        }
        zip.file(`public/${outputPath}`, blob);
      }
      if (state.activeResumePath && !pathToSource.has(normalizeExportPath(state.activeResumePath))) {
        const outputPath = normalizeExportPath(state.activeResumePath);
        const response = await fetch(state.activeResumePath);
        if (!response.ok) throw new Error(`Could not include ${state.activeResumePath} in the ZIP export.`);
        zip.file(`public/${outputPath}`, await response.blob());
      }
      const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `portfolio-export-${new Date().toISOString().slice(0, 10)}.zip`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      const fingerprint = JSON.stringify({ ...state, assetUrls: undefined, exportFingerprint: undefined });
      updateState((current) => ({ ...current, exportFingerprint: fingerprint }));
      setExported(true);
      setNotice("Export downloaded successfully. Copy the files into your project, then git add, commit and push to publish on Vercel.");
    } catch (error) {
      setNotice(`Export failed: ${error.message}`);
    } finally {
      setWorking(false);
    }
  };
  const reset = async () => {
    if (!window.confirm("Discard this browser working copy and reset to the checked-in published data?")) return;
    setWorking(true);
    try {
      Object.values(assetUrls).forEach((url) => URL.revokeObjectURL(url));
      const fresh = await resetWorkingCopy();
      updateState(fresh);
      setExported(false);
      setNotice("Working copy reset to the published source files.");
    } catch (error) {
      setNotice(`Could not reset the working copy: ${error.message}`);
    } finally {
      setWorking(false);
    }
  };
  const clearLegacyData = async () => {
    if (!exported) return;
    if (!window.confirm("An export has completed. Permanently clear the old localStorage and resume IndexedDB backup from this browser?")) return;
    try {
      await new Promise((resolve, reject) => {
        const request = indexedDB.deleteDatabase(FILE_DB_NAME);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error || new Error("Could not clear the old resume backup."));
        request.onblocked = () => reject(new Error("Close other portfolio tabs before clearing the old resume backup."));
      });
      window.localStorage.removeItem(LEGACY_STORAGE_KEY);
      window.localStorage.removeItem("prem-portfolio-admin-pin");
      setNotice("Old browser data cleared after export.");
    } catch (error) {
      setNotice(`Could not clear old browser data: ${error.message}`);
    }
  };

  if (!authenticated) return <AdminLogin error={authError} onLogin={async (passcode) => {
    try { await login(passcode); } catch (error) { setAuthError(error.message); throw error; }
  }} />;

  return (
    <AdminShell section={section} setSection={setSection} navigate={navigate} dirty={dirty} onLogout={() => setAuthenticated(false)}>
      {notice && <p className="inline-notice" role="status">{notice}</p>}
      {section === "overview" ? <Dashboard projects={state.projects} setSection={setSection} /> :
        section === "projects" ? <CaseStudiesManager projects={state.projects} setProjects={(updater) => updateState((current) => ({ ...current, projects: typeof updater === "function" ? updater(current.projects) : updater }))} onSaveProject={saveProject} onDeleteProject={deleteProject} onChangeStatus={changeProjectStatus} onUploadAsset={uploadAsset} onDiscardAsset={discardAsset} assetUrls={assetUrls} /> :
          section === "resumes" ? <ResumeManager resumes={state.resumes || []} activeResumePath={state.activeResumePath} onUpload={uploadResumes} onSetActive={setActiveResume} onDelete={deleteResume} /> :
            section === "content" ? <SiteContentEditor content={state.content} onSave={saveContent} /> :
              <div className="admin-page"><div className="admin-page-heading"><div><p className="eyebrow">PUBLISH FROM YOUR REPOSITORY</p><h1>Export & settings</h1><p>CMS edits stay in this browser until you export and push the files to GitHub.</p></div><button className="button-dark" onClick={exportForGitHub} disabled={working}>{working ? "Preparing?" : "Export for GitHub"} <Arrow /></button></div>
                <section className="editor-card"><div className="editor-section-head"><span>01</span><div><h2>Featured projects</h2><p>Choose the maximum number of featured projects shown on the homepage.</p></div></div><label className="field-span">Featured limit<input type="number" min="0" max="20" value={state.featuredLimit} onChange={(event) => updateState((current) => ({ ...current, featuredLimit: Math.max(0, Math.min(20, Number(event.target.value) || 0)) }))} /></label></section>
                <section className="editor-card"><div className="editor-section-head"><span>02</span><div><h2>Publishing workflow</h2><p>Export creates only the updated data modules and referenced files under public/thumbnails, public/case-images and public/resumes.</p></div></div><p>After downloading, copy the files into this project, then run <code>git add</code>, <code>git commit</code> and <code>git push</code>. Vercel redeploys from the updated source.</p><div className="editor-actions"><button className="button-outline" onClick={importLegacy} disabled={working}>{working ? "Importing?" : "Migrate browser data"}</button><button className="button-outline" onClick={reset} disabled={working}>Reset to published data</button>{exported && <button className="button-outline delete-case-study" onClick={clearLegacyData}>Clear old data</button>}</div></section>
                <p className="storage-note">{dirty ? "Unsaved changes since the last export." : "No unsaved changes since the last export."} The passcode is a soft gate; publishing requires a Git push.</p>
              </div>}
    </AdminShell>
  );
}

export default function App() {
  const [path, navigate] = useLocation();
  const [state, setStateInternal] = useState(defaultState);
  const [storageError, setStorageError] = useState("");
  const assetUrlsRef = useRef({});
  const isAdminRoute = path === "/admin" || path === "/admin/";
  const setState = (updater) => setStateInternal((current) => {
    const next = typeof updater === "function" ? updater(current) : updater;
    saveWorkingCopy({ ...next, assetUrls: undefined }).catch((error) => setStorageError(error.message));
    return next;
  });
  useEffect(() => {
    if (!isAdminRoute) {
      setStateInternal(defaultState);
      return undefined;
    }
    let active = true;
    Promise.all([loadWorkingCopy(), loadAssets()]).then(([saved, assets]) => {
      if (!active) return;
      const assetUrls = Object.fromEntries(assets.map(({ path: assetPath, blob }) => [assetPath, URL.createObjectURL(blob)]));
      setStateInternal({ ...publishedData, ...saved, assetUrls });
    }).catch((error) => setStorageError(error.message));
    return () => {
      active = false;
      Object.values(assetUrlsRef.current).forEach((url) => URL.revokeObjectURL(url));
      assetUrlsRef.current = {};
    };
  }, [isAdminRoute]);
  useEffect(() => { assetUrlsRef.current = state.assetUrls || {}; }, [state.assetUrls]);
  useEffect(() => () => Object.values(assetUrlsRef.current).forEach((url) => URL.revokeObjectURL(url)), []);
  useEffect(() => {
    const home = document.querySelector(".home-page");
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!home || reducedMotion || !("IntersectionObserver" in window)) return undefined;
    const revealItems = document.querySelectorAll(".home-page [data-reveal], .site-footer [data-reveal]");
    document.documentElement.classList.add("motion-ready");
    const observer = new IntersectionObserver((entries) => entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("is-visible");
      observer.unobserve(entry.target);
    }), { threshold: 0.12, rootMargin: "0px 0px -7% 0px" });
    revealItems.forEach((item) => observer.observe(item));
    return () => { observer.disconnect(); document.documentElement.classList.remove("motion-ready"); };
  }, [path]);
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
  const displayedState = isAdminRoute ? state : publishedData;
  const projects = useMemo(() => displayedState.projects.map((project) => {
    const thumbnail = project.thumbnail || project.thumbnailUrl || project.image || "";
    return { ...project, thumbnailUrl: assetPreview(thumbnail, displayedState.assetUrls), sections: (project.sections || []).map((item) => ({ ...item, image: assetPreview(item.image, displayedState.assetUrls) })) };
  }), [displayedState.projects, displayedState.assetUrls]);
  const resumeUrl = assetPreview(displayedState.activeResumePath || settings.activeResumePath, displayedState.assetUrls);
  let page;
  if (path === "/work") page = <WorkPage content={displayedState.content} projects={projects} navigate={navigate} resumeUrl={resumeUrl} />;
  else if (path === "/about") page = <AboutPage content={displayedState.content} navigate={navigate} resumeUrl={resumeUrl} />;
  else if (path === "/contact") page = <ContactPage content={displayedState.content} navigate={navigate} />;
  if (path.startsWith("/work/")) {
    const slug = decodeURIComponent(path.slice("/work/".length));
    page = <ProjectPage project={projects.find((project) => project.slug === slug && project.status === "Published")} projects={projects} content={displayedState.content} navigate={navigate} />;
  }
  if (!page) page = <HomePage content={displayedState.content} projects={projects} navigate={navigate} resumeUrl={resumeUrl} featuredLimit={displayedState.featuredLimit} />;
  if (path === "/admin" || path === "/admin/") return <>{storageError && <p className="inline-notice" role="alert">Could not save your working copy: {storageError}</p>}<AdminPage state={state} setState={setState} navigate={navigate} /></>;
  return <>{storageError && <p className="inline-notice" role="alert">Could not load the local CMS working copy: {storageError}</p>}{page}</>;
}
