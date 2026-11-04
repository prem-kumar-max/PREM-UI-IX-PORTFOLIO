import React, { useEffect, useMemo, useRef, useState } from "react";

const STORAGE_KEY = "prem-portfolio-v1";
const PIN_KEY = "prem-portfolio-admin-pin";
const FILE_DB_NAME = "prem-portfolio-files";
const FILE_STORE_NAME = "files";
const MAX_RESUME_SIZE = 20 * 1024 * 1024;
const profileImage = "/prem-portrait.png";
const aboutImage = "/prem-about-event.png";

const initialContent = {
  name: "Prem Kumar Thanneru",
  title: "UI/UX Designer · Product Designer",
  headline: "Designing digital experiences that feel effortless.",
  intro:
    "I turn complex problems into intuitive, meaningful and visually refined digital experiences through thoughtful design and clear storytelling.",
  about:
    "I'm Prem — a curious, detail-oriented designer with a background in building digital products. I care about making technology feel clear, useful and human.",
  email: "prem64748494@gmail.com",
  phone: "+91 9392569121",
  linkedin: "https://www.linkedin.com/in/prem-kumar-max",
  github: "https://github.com/prem-kumar-max",
  behance: "https://www.behance.net/ef284520",
  location: "India",
};

const initialProjects = [
  {
    id: "skillconnect",
    title: "SkillConnect",
    slug: "skillconnect",
    category: "Product design",
    year: "2025",
    description: "A service discovery and booking platform connecting people with local professionals.",
    role: "Product design",
    duration: "",
    tools: "React, JavaScript",
    status: "Published",
    featured: true,
    image: "",
    sections: [
      { title: "Overview", body: "A service discovery and booking platform. Add your project context, design decisions and final screens here." },
      { title: "The challenge", body: "Describe the user problem and the opportunity this project set out to address." },
      { title: "The experience", body: "Add your flows, interface explorations, final designs and learnings." },
    ],
  },
  {
    id: "smart-bike-rental",
    title: "Smart Bike Rental Platform",
    slug: "smart-bike-rental",
    category: "Web experience",
    year: "2025",
    description: "A digital bike-rental experience focused on making the journey from discovery to booking straightforward.",
    role: "Product design",
    duration: "",
    tools: "Web, responsive design",
    status: "Published",
    featured: true,
    image: "",
    sections: [
      { title: "Overview", body: "Introduce the project and add your goals, audience and the design approach you took." },
      { title: "The solution", body: "Showcase your key screens and describe how the experience works." },
    ],
  },
  {
    id: "wedding-invitation",
    title: "Smart Wedding Invitation Website",
    slug: "smart-wedding-invitation",
    category: "Web experience",
    year: "2025",
    description: "A responsive digital invitation experience bringing wedding details together in one place.",
    role: "Web design & development",
    duration: "",
    tools: "HTML, CSS, JavaScript",
    status: "Published",
    featured: true,
    image: "",
    sections: [
      { title: "Overview", body: "Add the story behind this project and the details you want visitors to know." },
      { title: "Design details", body: "Add images, design decisions and what you learned while building this experience." },
    ],
  },
];

const defaultState = {
  content: initialContent,
  projects: initialProjects,
  resumes: [],
  activeResumeId: null,
};

function openFileDatabase() {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) {
      reject(new Error("This browser does not support local file storage."));
      return;
    }
    const request = indexedDB.open(FILE_DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(FILE_STORE_NAME)) {
        request.result.createObjectStore(FILE_STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Could not open browser file storage."));
  });
}

async function storeResumeFile(id, file) {
  const database = await openFileDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(FILE_STORE_NAME, "readwrite");
    transaction.objectStore(FILE_STORE_NAME).put({ id, file });
    transaction.oncomplete = () => { database.close(); resolve(); };
    transaction.onerror = () => { database.close(); reject(transaction.error || new Error("Could not save this resume.")); };
    transaction.onabort = () => { database.close(); reject(transaction.error || new Error("Resume upload was cancelled.")); };
  });
}

async function readResumeFile(id) {
  const database = await openFileDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(FILE_STORE_NAME, "readonly");
    const request = transaction.objectStore(FILE_STORE_NAME).get(id);
    request.onsuccess = () => {
      const file = request.result?.file;
      database.close();
      resolve(file || null);
    };
    request.onerror = () => {
      database.close();
      reject(request.error || new Error("Could not load the active resume."));
    };
  });
}

async function removeResumeFile(id) {
  const database = await openFileDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(FILE_STORE_NAME, "readwrite");
    transaction.objectStore(FILE_STORE_NAME).delete(id);
    transaction.oncomplete = () => { database.close(); resolve(); };
    transaction.onerror = () => { database.close(); reject(transaction.error || new Error("Could not delete this resume.")); };
    transaction.onabort = () => { database.close(); reject(transaction.error || new Error("Resume deletion was cancelled.")); };
  });
}

function readStoredState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return defaultState;
    const parsed = JSON.parse(saved);
    return {
      content: { ...initialContent, ...(parsed.content || {}) },
      projects: Array.isArray(parsed.projects) ? parsed.projects : initialProjects,
      resumes: Array.isArray(parsed.resumes) ? parsed.resumes : [],
      activeResumeId: parsed.activeResumeId || null,
    };
  } catch (error) {
    console.error("Could not read saved portfolio data.", error);
    return defaultState;
  }
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

function HomePage({ content, projects, navigate, resumeUrl, resumeFilename }) {
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
              {featured.slice(0, 3).map((project, index) => (
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
  return (
    <>
      <Header navigate={navigate} active="work" />
      <main className="case-study section-shell">
        <button className="back-link" onClick={() => navigate("/work")}>← All work</button>
        <div className="case-heading">
          <div><p className="eyebrow">{[project.category, project.year].filter(Boolean).join(" · ") || "CASE STUDY"}</p><h1>{project.title}</h1><p className="case-description">{project.description}</p></div>
          {(project.role || project.tools || project.duration) && <dl><div><dt>ROLE</dt><dd>{project.role || "—"}</dd></div><div><dt>TOOLS</dt><dd>{project.tools || "—"}</dd></div><div><dt>DURATION</dt><dd>{project.duration || "—"}</dd></div></dl>}
        </div>
        {extractFigmaEmbedUrl(project.figmaEmbedUrl || "") ? (
          <>
            <FigmaEmbed src={extractFigmaEmbedUrl(project.figmaEmbedUrl)} title={project.title} />
            <a className="figma-open-link" href={extractFigmaEmbedUrl(project.figmaEmbedUrl)} target="_blank" rel="noreferrer">Open in Figma <Arrow diagonal /></a>
          </>
        ) : (
          <>
                <div className="case-cover">
                  {(project.thumbnailUrl || project.image) ? <img src={project.thumbnailUrl || project.image} alt={`${project.title} cover`} /> : <div className="project-art art-0"><span className="art-title">{project.title}</span><span className="art-orbit" /></div>}
            </div>
            <div className="case-content">
              {project.sections?.map((section, index) => (
                <section className="case-block" key={`${section.title}-${index}`}>
                  <span className="case-number">0{index + 1}</span>
                  <div><h2>{section.title}</h2><p>{section.body}</p>{section.image && <img className="section-image" src={section.image} alt={section.title} />}</div>
                </section>
              ))}
            </div>
          </>
        )}
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

function AdminLogin({ onLogin, isFirstVisit }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const submit = (event) => {
    event.preventDefault();
    const existing = localStorage.getItem(PIN_KEY);
    if (isFirstVisit && pin.length >= 4) {
      localStorage.setItem(PIN_KEY, pin);
      onLogin();
      return;
    }
    if (pin === existing) onLogin();
    else setError("That passcode doesn’t match. Try again.");
  };
  return (
    <main className="admin-login">
      <div className="login-card">
        <Brand onClick={() => { window.location.href = "/"; }} />
        <p className="eyebrow">{isFirstVisit ? "SET UP YOUR PORTFOLIO" : "PRIVATE WORKSPACE"}</p>
        <h1>{isFirstVisit ? "Create your passcode." : "Welcome back."}</h1>
        <p>{isFirstVisit ? "Choose a passcode to keep this browser’s CMS out of casual view. This is not a secure server login." : "Enter your browser passcode to open the portfolio CMS."}</p>
        <form onSubmit={submit}><label htmlFor="admin-pin">{isFirstVisit ? "Passcode (4+ characters)" : "Passcode"}</label><input id="admin-pin" type="password" autoComplete="current-password" minLength={isFirstVisit ? 4 : undefined} value={pin} onChange={(event) => setPin(event.target.value)} required /><button className="button-dark" type="submit">{isFirstVisit ? "Create passcode" : "Open CMS"} <Arrow /></button></form>
        {error && <p className="form-error">{error}</p>}
        <button className="text-link" onClick={() => { window.location.href = "/"; }}>← Back to portfolio</button>
      </div>
    </main>
  );
}

function AdminShell({ children, section, setSection, onLogout, navigate }) {
  const navItems = [["overview", "Overview"], ["projects", "Case studies"], ["resumes", "Resumes"], ["content", "Site content"]];
  return (
    <div className="admin-layout">
      <aside className="admin-sidebar">
        <Brand onClick={() => navigate("/")} />
        <p className="admin-label">WORKSPACE</p>
        <nav>{navItems.map(([id, label]) => <button key={id} className={section === id ? "admin-nav-active" : ""} onClick={() => setSection(id)}><span className={`admin-nav-icon icon-${id}`}>{id === "overview" ? "◫" : id === "projects" ? "▤" : id === "resumes" ? "⇧" : "◈"}</span>{label}</button>)}</nav>
        <div className="admin-side-bottom"><span className="status-dot" />Local browser workspace<button onClick={() => navigate("/")}>↗ View portfolio</button><button onClick={onLogout}>↪ Sign out</button></div>
      </aside>
      <div className="admin-main">
        <header className="admin-topbar"><div><span className="admin-breadcrumb">Workspace</span><span className="breadcrumb-separator">/</span><strong>{navItems.find(([id]) => id === section)?.[1]}</strong></div><span className="local-badge"><span /> SAVED IN THIS BROWSER</span></header>
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
      <div className="admin-dashboard-grid"><section className="admin-panel recent-panel"><div className="panel-heading"><div><p className="eyebrow">YOUR CONTENT</p><h2>Recent case studies</h2></div><button className="text-link" onClick={() => setSection("projects")}>Manage all <Arrow /></button></div>{projects.slice(0, 4).map((project) => <div className="recent-row" key={project.id}><span className="recent-thumb">{(project.thumbnailUrl || project.image) && <img src={project.thumbnailUrl || project.image} alt="" />}</span><div><strong>{project.title}</strong><span>{project.description || [project.category, project.year].filter(Boolean).join(" · ")}</span></div><span className={`status-pill status-${project.status.toLowerCase()}`}>{project.status}</span></div>)}{projects.length === 0 && <p className="empty-note">Your first case study starts here.</p>}</section><section className="admin-panel quick-panel"><p className="eyebrow">QUICK START</p><h2>Make your next idea<br />feel at home here.</h2><p>Case studies saved as published show up on your public portfolio automatically.</p><button className="button-outline" onClick={() => setSection("projects")}>Create a case study <Arrow /></button><div className="quick-decoration">P.</div></section></div>
    </div>
  );
}

function FigmaCaseStudyEditor({ project, existing, onSave, onCancel, onDelete }) {
  const [form, setForm] = useState(() => project ? {
    ...project,
    thumbnailUrl: project.thumbnailUrl || project.image || "",
    figmaEmbedCode: project.figmaEmbedUrl || "",
  } : {
    id: crypto.randomUUID(),
    title: "",
    slug: "",
    description: "",
    thumbnailUrl: "",
    figmaEmbedCode: "",
    status: "Draft",
    featured: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    publishedAt: null,
  });
  const [notice, setNotice] = useState("");
  const [previewVisible, setPreviewVisible] = useState(Boolean(project?.showPreviewOnOpen));
  const [isDragging, setIsDragging] = useState(false);
  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const validatedEmbedUrl = extractFigmaEmbedUrl(form.figmaEmbedCode);

  const save = (status) => {
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
    const { figmaEmbedCode, showPreviewOnOpen, image, ...savedForm } = form;
    onSave({
      ...savedForm,
      title: form.title.trim(),
      slug: slugify(form.slug || form.title),
      description: form.description.trim(),
      thumbnailUrl: form.thumbnailUrl,
      figmaEmbedUrl: validatedEmbedUrl,
      status,
      featured: Boolean(form.featured),
      updatedAt: now,
      createdAt: form.createdAt || now,
      publishedAt: status === "Published" ? (form.publishedAt || now) : null,
    });
  };

  const readImage = (file) => {
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setNotice("Choose a JPG, PNG, or WebP image.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setNotice("Please choose an image smaller than 2 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () => {
        update("thumbnailUrl", reader.result);
        setNotice("");
      };
      image.onerror = () => setNotice("This file is not a valid image. Please choose another.");
      image.src = reader.result;
    };
    reader.onerror = () => setNotice("Could not read this image. Please try another file.");
    reader.readAsDataURL(file);
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

  return (
    <form className="project-editor figma-case-editor" onSubmit={(event) => { event.preventDefault(); save("Draft"); }}>
      <div className="editor-top">
        <button type="button" className="back-link" onClick={onCancel}>← All case studies</button>
        <div className="editor-actions">
          {existing && <button type="button" className="button-outline small-button" onClick={() => onDelete(project.id)}>Delete</button>}
          <button type="button" className="button-outline small-button" onClick={() => save("Draft")}>Save as Draft</button>
          <button type="button" className="button-dark" onClick={() => save("Published")}>{form.status === "Published" ? "Save & Publish" : "Publish"} <Arrow /></button>
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
            </div>
          </section>
          <section className="editor-card">
            <div className="editor-section-head"><span>02</span><div><h2>Figma prototype</h2><p>Paste a Figma iframe or its embed URL. Only the validated URL is stored.</p></div></div>
            <label className="figma-code-field">Figma Prototype Embed Code<textarea rows="7" value={form.figmaEmbedCode} onChange={(event) => { update("figmaEmbedCode", event.target.value); setPreviewVisible(false); setNotice(""); }} placeholder="Paste your Figma iframe embed code here..." spellCheck="false" /></label>
            <div className="figma-field-actions"><button type="button" className="button-outline" onClick={preview}>{previewVisible ? "Hide preview" : "Preview"}</button>{validatedEmbedUrl && <a className="text-link" href={validatedEmbedUrl} target="_blank" rel="noreferrer">Open in Figma <Arrow diagonal /></a>}</div>
            {previewVisible && validatedEmbedUrl && <div className="figma-preview-panel"><p className="eyebrow">INTERACTIVE PROTOTYPE PREVIEW</p><FigmaEmbed key={validatedEmbedUrl} src={validatedEmbedUrl} title={form.title || "Case study"} /></div>}
          </section>
        </div>
        <aside className="editor-aside">
          <section className="editor-card">
            <div className="editor-section-head"><span>03</span><div><h2>Project thumbnail</h2><p>JPG, PNG or WebP · up to 2 MB</p></div></div>
            <div
              className={`case-thumbnail-upload${isDragging ? " is-dragging" : ""}`}
              onDragOver={(event) => { event.preventDefault(); setIsDragging(true); }}
              onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setIsDragging(false); }}
              onDrop={(event) => { event.preventDefault(); setIsDragging(false); readImage(event.dataTransfer.files?.[0]); }}
            >
              {form.thumbnailUrl ? <img src={form.thumbnailUrl} alt="Project thumbnail preview" /> : <div className="upload-placeholder"><span>↥</span><strong>Drop an image here</strong><small>or choose a file from your device</small></div>}
              <label className="thumbnail-file-button">{form.thumbnailUrl ? "Replace image" : "Choose image"}<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { readImage(event.target.files?.[0]); event.target.value = ""; }} /></label>
              {form.thumbnailUrl && <button type="button" className="remove-image" onClick={() => update("thumbnailUrl", "")}>Remove image</button>}
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

function CaseStudiesManager({ projects, setProjects }) {
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All");
  const [notice, setNotice] = useState("");

  const saveProject = (project) => {
    const exists = projects.some((item) => item.id === project.id);
    const baseSlug = slugify(project.slug || project.title) || "case-study";
    let slug = baseSlug;
    let suffix = 2;
    while (projects.some((item) => item.id !== project.id && item.slug === slug)) {
      slug = `${baseSlug}-${suffix}`;
      suffix += 1;
    }
    const saved = { ...project, slug };
    setProjects(exists ? projects.map((item) => item.id === saved.id ? saved : item) : [saved, ...projects]);
    setEditing(null);
    setNotice(`${saved.title} saved${saved.status === "Published" ? " and published" : " as a draft"}.`);
  };

  const deleteProject = (id) => {
    const target = projects.find((project) => project.id === id);
    if (!target || !window.confirm(`Delete “${target.title}”? This cannot be undone.`)) return;
    setProjects(projects.filter((project) => project.id !== id));
    setEditing(null);
    setNotice("Case study deleted.");
  };

  const changeStatus = (project, status) => {
    if (status === "Published" && !extractFigmaEmbedUrl(project.figmaEmbedUrl || "")) {
      setNotice(`Edit “${project.title}” and add a valid Figma prototype before publishing.`);
      return;
    }
    const now = new Date().toISOString();
    setProjects(projects.map((item) => item.id === project.id ? {
      ...item,
      status,
      updatedAt: now,
      publishedAt: status === "Published" ? (item.publishedAt || now) : null,
    } : item));
    setNotice(`${project.title} ${status === "Published" ? "published" : "unpublished"}.`);
  };

  const createProject = () => setEditing({
    id: crypto.randomUUID(),
    title: "",
    slug: "",
    description: "",
    thumbnailUrl: "",
    figmaEmbedCode: "",
    status: "Draft",
    featured: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    publishedAt: null,
  });
  const filtered = projects.filter((project) => (filter === "All" || project.status === filter) && project.title.toLowerCase().includes(search.toLowerCase()));
  if (editing) return <FigmaCaseStudyEditor project={editing} existing={projects.some((project) => project.id === editing.id)} onSave={saveProject} onCancel={() => setEditing(null)} onDelete={deleteProject} />;
  return (
    <div className="admin-page">
      <div className="admin-page-heading"><div><p className="eyebrow">YOUR PORTFOLIO, YOUR STORY</p><h1>Case studies</h1><p>Create, refine and publish the work you’re proud of.</p></div><button className="button-dark" onClick={createProject}>+ Add New Case Study</button></div>
      {notice && <p className="inline-notice" role="status">{notice}<button onClick={() => setNotice("")}>×</button></p>}
      <div className="table-toolbar"><div className="search-box">⌕ <input aria-label="Search case studies" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search case studies…" /></div><div className="table-filters">{["All", "Published", "Draft"].map((item) => <button key={item} className={filter === item ? "filter-active" : ""} onClick={() => setFilter(item)}>{item}</button>)}</div></div>
      <div className="project-table">
        <div className="table-head"><span>PROJECT</span><span>STATUS</span><span>HOMEPAGE</span><span>UPDATED</span><span>ACTIONS</span></div>
        {filtered.map((project) => <div className="table-row" key={project.id}>
          <button className="table-project" onClick={() => setEditing(project)}><span className="table-thumb">{(project.thumbnailUrl || project.image) && <img src={project.thumbnailUrl || project.image} alt="" />}</span><span><strong>{project.title}</strong><small>{project.description || project.category || "Figma case study"}</small></span></button>
          <span><span className={`status-pill status-${project.status.toLowerCase()}`}>{project.status}</span></span>
          <span>{project.featured ? "Featured" : "—"}</span>
          <span>{project.updatedAt ? new Date(project.updatedAt).toLocaleDateString() : "—"}</span>
          <span className="case-study-actions"><button className="edit-link" onClick={() => setEditing({ ...project, showPreviewOnOpen: true })}>Preview</button><button className="edit-link" onClick={() => setEditing(project)}>Edit</button><button className="edit-link" onClick={() => changeStatus(project, project.status === "Published" ? "Draft" : "Published")}>{project.status === "Published" ? "Unpublish" : "Publish"}</button><button className="edit-link delete-case-study" onClick={() => deleteProject(project.id)}>Delete</button></span>
        </div>)}
        {filtered.length === 0 && <p className="empty-note">No case studies match your search.</p>}
      </div>
      <p className="storage-note">Your updates and uploaded images are stored in this browser only. Clearing browser data removes them; this CMS has no server database or cross-device sync.</p>
    </div>
  );
}

function SiteContentEditor({ content, onSave }) {
  const [form, setForm] = useState(content);
  const [saved, setSaved] = useState(false);
  const update = (key, value) => { setForm((current) => ({ ...current, [key]: value })); setSaved(false); };
  return <div className="admin-page content-editor-page"><div className="admin-page-heading"><div><p className="eyebrow">YOUR VOICE, YOUR DETAILS</p><h1>Site content</h1><p>Update your introduction and how people can reach you.</p></div><button className="button-dark" onClick={() => { onSave(form); setSaved(true); }}>Save changes <Arrow /></button></div>{saved && <p className="inline-notice">Your site content has been saved.</p>}<section className="editor-card content-form-card"><div className="editor-section-head"><span>01</span><div><h2>Introduction</h2><p>These details appear across your portfolio.</p></div></div><div className="field-grid"><label>Your name<input value={form.name} onChange={(event) => update("name", event.target.value)} /></label><label>Professional title<input value={form.title} onChange={(event) => update("title", event.target.value)} /></label><label className="field-span">Hero headline<textarea rows="2" value={form.headline} onChange={(event) => update("headline", event.target.value)} /></label><label className="field-span">Short introduction<textarea rows="3" value={form.intro} onChange={(event) => update("intro", event.target.value)} /></label><label className="field-span">About paragraph<textarea rows="4" value={form.about} onChange={(event) => update("about", event.target.value)} /></label></div></section><section className="editor-card content-form-card"><div className="editor-section-head"><span>02</span><div><h2>Contact & links</h2><p>Keep your public contact details current.</p></div></div><div className="field-grid"><label>Email<input type="email" value={form.email} onChange={(event) => update("email", event.target.value)} /></label><label>Phone<input value={form.phone} onChange={(event) => update("phone", event.target.value)} /></label><label>LinkedIn URL<input value={form.linkedin} onChange={(event) => update("linkedin", event.target.value)} /></label><label>GitHub URL<input value={form.github} onChange={(event) => update("github", event.target.value)} /></label><label>Behance URL<input value={form.behance} onChange={(event) => update("behance", event.target.value)} /></label><label>Location<input value={form.location} onChange={(event) => update("location", event.target.value)} /></label></div></section></div>;
}

function ResumeManager({ resumes, activeResumeId, onUpload, onSetActive, onDelete }) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  const upload = async (event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (!files.length) return;
    setBusy(true);
    setNotice("");
    try {
      const result = await onUpload(files);
      const messages = [];
      if (result.uploaded.length) messages.push(`${result.uploaded.length} resume${result.uploaded.length === 1 ? "" : "s"} uploaded.`);
      if (result.errors.length) messages.push(result.errors.join(" "));
      setNotice(messages.join(" ") || "No resumes were uploaded.");
    } catch (error) {
      console.error("Could not upload resumes.", error);
      setNotice("Resume upload failed. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (resume) => {
    if (!window.confirm(`Delete “${resume.name}”? This cannot be undone.`)) return;
    try {
      await onDelete(resume.id);
      setNotice(`${resume.name} deleted.`);
    } catch (error) {
      console.error("Could not delete the resume.", error);
      setNotice(`Could not delete “${resume.name}”. Please try again.`);
    }
  };

  return (
    <div className="admin-page resume-manager">
      <div className="admin-page-heading">
        <div><p className="eyebrow">YOUR EXPERIENCE, ALWAYS CURRENT</p><h1>Resumes</h1><p>Keep several versions here and choose which one visitors see on your About page.</p></div>
        <label className={`button-dark resume-upload-button${busy ? " is-busy" : ""}`}>{busy ? "Uploading…" : "+ Upload Resumes"}<input type="file" accept="application/pdf,.pdf" multiple disabled={busy} onChange={upload} /></label>
      </div>
      {notice && <p className="inline-notice" role="status">{notice}<button type="button" onClick={() => setNotice("")}>×</button></p>}
      <section className="resume-list-card">
        <div className="resume-list-heading"><div><p className="eyebrow">SAVED FILES</p><h2>{resumes.length} resume{resumes.length === 1 ? "" : "s"}</h2></div><span className="resume-active-count">ONE ACTIVE ON YOUR SITE</span></div>
        {resumes.length ? (
          <div className="resume-list">
            {resumes.map((resume) => {
              const isActive = resume.id === activeResumeId;
              return (
                <article className={`resume-row${isActive ? " resume-row-active" : ""}`} key={resume.id}>
                  <span className="resume-file-icon" aria-hidden="true">PDF</span>
                  <div className="resume-file-details"><strong>{resume.name}</strong><span>{(resume.size / (1024 * 1024)).toFixed(2)} MB · Uploaded {new Date(resume.uploadedAt).toLocaleDateString()}</span></div>
                  {isActive ? <span className="resume-active-pill"><span />Active on website</span> : <button type="button" className="button-outline resume-action" onClick={() => onSetActive(resume.id)}>Set active</button>}
                  <button type="button" className="resume-delete" onClick={() => remove(resume)} aria-label={`Delete ${resume.name}`}>Delete</button>
                </article>
              );
            })}
          </div>
        ) : <p className="resume-empty">No resumes uploaded yet. Upload one or more PDF files to get started.</p>}
      </section>
      <p className="storage-note">PDF files are stored in this browser. Only the active resume is linked from the public About page. This frontend-only site does not sync uploads to other browsers or devices.</p>
    </div>
  );
}

function AdminPage({ state, setState, navigate, onUploadResumes, onDeleteResume }) {
  const [section, setSection] = useState("overview");
  const [authenticated, setAuthenticated] = useState(false);
  const isFirstVisit = !localStorage.getItem(PIN_KEY);
  if (!authenticated) return <AdminLogin isFirstVisit={isFirstVisit} onLogin={() => setAuthenticated(true)} />;
  return <AdminShell section={section} setSection={setSection} navigate={navigate} onLogout={() => setAuthenticated(false)}>{section === "overview" ? <Dashboard projects={state.projects} setSection={setSection} /> : section === "projects" ? <CaseStudiesManager projects={state.projects} setProjects={(projects) => setState((current) => ({ ...current, projects }))} /> : section === "resumes" ? <ResumeManager resumes={state.resumes} activeResumeId={state.activeResumeId} onUpload={onUploadResumes} onSetActive={(id) => setState((current) => ({ ...current, activeResumeId: id }))} onDelete={onDeleteResume} /> : <SiteContentEditor content={state.content} onSave={(content) => setState((current) => ({ ...current, content }))} />}</AdminShell>;
}

export default function App() {
  const [path, navigate] = useLocation();
  const [state, setState] = useState(readStoredState);
  const [activeResumeUrl, setActiveResumeUrl] = useState("");
  useEffect(() => {
    const home = document.querySelector(".home-page");
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!home || reducedMotion || !("IntersectionObserver" in window)) return undefined;

    const revealItems = document.querySelectorAll(".home-page [data-reveal], .site-footer [data-reveal]");
    document.documentElement.classList.add("motion-ready");
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -7% 0px" });

    revealItems.forEach((item) => observer.observe(item));
    return () => {
      observer.disconnect();
      document.documentElement.classList.remove("motion-ready");
    };
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
    return () => {
      window.removeEventListener("scroll", updateParallax);
      cancelAnimationFrame(frame);
      title.style.removeProperty("transform");
      portrait.style.removeProperty("transform");
    };
  }, [path]);
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      console.error("Could not save portfolio data in this browser.", error);
      window.alert("Your changes could not be saved. Browser storage may be full; try removing large project images.");
    }
  }, [state]);
  useEffect(() => {
    let cancelled = false;
    let objectUrl = "";
    setActiveResumeUrl("");
    if (!state.activeResumeId) return undefined;
    readResumeFile(state.activeResumeId).then((file) => {
      if (!file) throw new Error("The active resume file is missing from this browser.");
      objectUrl = URL.createObjectURL(file);
      if (cancelled) URL.revokeObjectURL(objectUrl);
      else setActiveResumeUrl(objectUrl);
    }).catch((error) => {
      if (!cancelled) console.error("Could not load the active resume.", error);
    });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [state.activeResumeId]);
  const uploadResumes = async (files) => {
    const uploaded = [];
    const errors = [];
    for (const file of files) {
      if (!file.name.toLowerCase().endsWith(".pdf") || (file.type && file.type !== "application/pdf")) {
        errors.push(`${file.name}: choose a PDF file.`);
        continue;
      }
      if (file.size > MAX_RESUME_SIZE) {
        errors.push(`${file.name}: file must be 20 MB or smaller.`);
        continue;
      }
      try {
        if (await file.slice(0, 5).text() !== "%PDF-") {
          errors.push(`${file.name}: this is not a valid PDF file.`);
          continue;
        }
        const resume = {
          id: crypto.randomUUID(),
          name: file.name,
          size: file.size,
          type: "application/pdf",
          uploadedAt: new Date().toISOString(),
        };
        await storeResumeFile(resume.id, file);
        uploaded.push(resume);
      } catch (error) {
        console.error(`Could not save resume "${file.name}".`, error);
        errors.push(`${file.name}: could not be saved in this browser.`);
      }
    }
    if (uploaded.length) {
      setState((current) => ({
        ...current,
        resumes: [...current.resumes, ...uploaded],
        activeResumeId: current.activeResumeId || uploaded[0].id,
      }));
    }
    return { uploaded, errors };
  };
  const deleteResume = async (id) => {
    await removeResumeFile(id);
    setState((current) => {
      const resumes = current.resumes.filter((resume) => resume.id !== id);
      return {
        ...current,
        resumes,
        activeResumeId: current.activeResumeId === id ? (resumes[0]?.id || null) : current.activeResumeId,
      };
    });
  };
  const activeResume = state.resumes.find((resume) => resume.id === state.activeResumeId);
  const publicProjects = useMemo(() => state.projects.filter((project) => project.status === "Published"), [state.projects]);
  if (path === "/admin" || path === "/admin/") return <AdminPage state={state} setState={setState} navigate={navigate} onUploadResumes={uploadResumes} onDeleteResume={deleteResume} />;
  if (path === "/work") return <WorkPage content={state.content} projects={state.projects} navigate={navigate} resumeUrl={activeResumeUrl} resumeFilename={activeResume?.name} />;
  if (path === "/about") return <AboutPage content={state.content} navigate={navigate} resumeUrl={activeResumeUrl} />;
  if (path === "/contact") return <ContactPage content={state.content} navigate={navigate} />;
  if (path.startsWith("/work/")) {
    const slug = decodeURIComponent(path.slice("/work/".length));
    return <ProjectPage project={publicProjects.find((project) => project.slug === slug)} projects={state.projects} content={state.content} navigate={navigate} />;
  }
  return <HomePage content={state.content} projects={state.projects} navigate={navigate} resumeUrl={activeResumeUrl} resumeFilename={activeResume?.name} />;
}
