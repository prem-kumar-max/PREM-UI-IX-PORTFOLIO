import { supabase, supabaseConfigError } from "./supabase.js";
import { siteContent } from "./data/siteContent.js";

const MEDIA_BUCKET = "portfolio-media";
const CONFLICT_MESSAGE = "Someone else changed this. Reload before saving.";
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function client() {
  if (!supabase) throw new Error(supabaseConfigError);
  return supabase;
}

function throwDatabaseError(error, operation) {
  if (error?.code === "23505") throw new Error("That URL slug is already in use. Choose a unique slug.");
  if (error) throw new Error(`${operation}: ${error.message}`);
}

function requireUpdatedRow(row) {
  if (!row) throw new Error(CONFLICT_MESSAGE);
  return row;
}

function fromDatabaseSiteContent(content) {
  const merged = {
    ...siteContent,
    ...(content && typeof content === "object" && !Array.isArray(content) ? content : {}),
  };
  if (!content?.aboutExperiences) {
    merged.aboutExperiences = JSON.stringify([
      {
        role: merged.experienceRoleOne || "",
        company: merged.experienceCompanyOne || "",
        dates: merged.experienceDatesOne || "",
        description: "",
      },
      {
        role: merged.experienceRoleTwo || "",
        company: merged.experienceCompanyTwo || "",
        dates: merged.experienceDatesTwo || "",
        description: "",
      },
    ].filter((experience) => experience.role || experience.company || experience.dates));
  }
  for (const [key, fallback] of Object.entries(siteContent)) {
    if (typeof merged[key] !== "string") merged[key] = fallback;
  }
  return merged;
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function isValidSlug(slug) {
  return SLUG_PATTERN.test(slug);
}

export function fromDatabaseCaseStudy(row) {
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    description: row.description || "",
    thumbnailUrl: row.thumbnail_url || "",
    thumbnailPath: row.thumbnail_path || "",
    thumbnailAlt: row.thumbnail_alt || "",
    figmaEmbedUrl: row.figma_embed_url || "",
    status: row.status === "published" ? "Published" : "Draft",
    featured: Boolean(row.featured),
    category: row.category || "",
    year: row.year || "",
    role: row.role || "",
    duration: row.duration || "",
    tools: row.tools || "",
    sections: Array.isArray(row.sections) ? row.sections.map((section) => ({
      title: section.title || "",
      body: section.body || "",
      image: section.image || "",
      imagePath: section.imagePath || "",
      imageAlt: section.imageAlt || "",
    })) : [],
    revision: row.revision,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    publishedAt: row.published_at,
  };
}

export function toDatabaseCaseStudy(project) {
  const slug = (project.slug || "").trim();
  if (!isValidSlug(slug)) throw new Error("Use a lowercase URL slug with words separated by hyphens.");
  return {
    title: project.title.trim(),
    slug,
    description: project.description || "",
    thumbnail_url: project.thumbnailUrl || "",
    thumbnail_path: project.thumbnailPath || "",
    thumbnail_alt: project.thumbnailAlt || "",
    figma_embed_url: project.figmaEmbedUrl || "",
    status: project.status === "Published" ? "published" : "draft",
    featured: Boolean(project.featured),
    category: project.category || "",
    year: project.year || "",
    role: project.role || "",
    duration: project.duration || "",
    tools: project.tools || "",
    sections: (project.sections || []).map((section) => ({
      title: section.title || "",
      body: section.body || "",
      image: section.image || "",
      imagePath: section.imagePath || "",
      imageAlt: section.imageAlt || "",
    })),
    published_at: project.publishedAt || (project.status === "Published" ? new Date().toISOString() : null),
    updated_at: new Date().toISOString(),
  };
}

export function fromDatabaseSettings(row) {
  return { featuredLimit: row.featured_limit, revision: row.revision };
}

export function fromDatabaseCertificate(row) {
  return {
    id: row.id,
    title: row.title || "",
    issuer: row.issuer || "",
    category: row.category || "",
    issuedOn: row.issued_on || "",
    expiresOn: row.expires_on || "",
    credentialId: row.credential_id || "",
    credentialUrl: row.credential_url || "",
    imageUrl: row.image_url || "",
    imagePath: row.image_path || "",
    imageAlt: row.image_alt || "",
    pdfUrl: row.pdf_url || "",
    pdfPath: row.pdf_path || "",
    sortOrder: row.sort_order ?? 0,
    status: row.status === "published" ? "Published" : "Draft",
    revision: row.revision,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toDatabaseCertificate(certificate) {
  return {
    title: certificate.title.trim(),
    issuer: certificate.issuer || "",
    category: certificate.category || "",
    issued_on: certificate.issuedOn ? `${certificate.issuedOn.slice(0, 7)}-01` : null,
    expires_on: certificate.expiresOn || null,
    credential_id: certificate.credentialId || "",
    credential_url: certificate.credentialUrl || "",
    image_url: certificate.imageUrl || "",
    image_path: certificate.imagePath || "",
    image_alt: certificate.imageAlt || "",
    pdf_url: certificate.pdfUrl || "",
    pdf_path: certificate.pdfPath || "",
    sort_order: certificate.sortOrder ?? 0,
    status: certificate.status === "Published" ? "published" : "draft",
    updated_at: new Date().toISOString(),
  };
}

async function loadSingleton(table, operation) {
  const { data, error } = await client().from(table).select("*").eq("singleton_id", 1).single();
  throwDatabaseError(error, operation);
  return data;
}

export async function loadPublicData() {
  const db = client();
  const [caseStudiesResult, siteContentRow, settingsRow] = await Promise.all([
    db.from("case_studies").select("*").eq("status", "published").order("updated_at", { ascending: false }),
    loadSingleton("site_content", "Could not load site content"),
    loadSingleton("settings", "Could not load portfolio settings"),
  ]);
  throwDatabaseError(caseStudiesResult.error, "Could not load published case studies");
  return {
    projects: (caseStudiesResult.data || []).map(fromDatabaseCaseStudy),
    content: fromDatabaseSiteContent(siteContentRow.content),
    contentRevision: siteContentRow.revision,
    settings: fromDatabaseSettings(settingsRow),
  };
}

export async function loadAdminData() {
  const db = client();
  const [caseStudiesResult, siteContentRow, settingsRow, certificatesResult] = await Promise.all([
    db.from("case_studies").select("*").order("updated_at", { ascending: false }),
    loadSingleton("site_content", "Could not load site content"),
    loadSingleton("settings", "Could not load portfolio settings"),
    db.from("certificates").select("*").order("sort_order", { ascending: true }).order("issued_on", { ascending: false }),
  ]);
  throwDatabaseError(caseStudiesResult.error, "Could not load case studies");
  throwDatabaseError(certificatesResult.error, "Could not load certificates");
  return {
    projects: (caseStudiesResult.data || []).map(fromDatabaseCaseStudy),
    content: fromDatabaseSiteContent(siteContentRow.content),
    contentRevision: siteContentRow.revision,
    settings: fromDatabaseSettings(settingsRow),
    certificates: (certificatesResult.data || []).map(fromDatabaseCertificate),
  };
}

export async function loadPublishedCertificates() {
  const { data, error } = await client().from("certificates")
    .select("*")
    .eq("status", "published")
    .order("sort_order", { ascending: true })
    .order("issued_on", { ascending: false });
  throwDatabaseError(error, "Could not load published certificates");
  return (data || []).map(fromDatabaseCertificate);
}

export async function saveCertificate(certificate, loadedRevision = null) {
  const db = client();
  const row = toDatabaseCertificate(certificate);
  if (loadedRevision === null) {
    const { data, error } = await db.from("certificates").insert({
      id: certificate.id,
      ...row,
      revision: 1,
    }).select().single();
    throwDatabaseError(error, "Could not create certificate");
    return fromDatabaseCertificate(data);
  }
  const { data, error } = await db.from("certificates")
    .update({ ...row, revision: loadedRevision + 1 })
    .eq("id", certificate.id)
    .eq("revision", loadedRevision)
    .select()
    .maybeSingle();
  throwDatabaseError(error, "Could not save certificate");
  return fromDatabaseCertificate(requireUpdatedRow(data));
}

export async function deleteCertificate(certificate) {
  const { data, error } = await client().from("certificates")
    .delete()
    .eq("id", certificate.id)
    .eq("revision", certificate.revision)
    .select()
    .maybeSingle();
  throwDatabaseError(error, "Could not delete certificate");
  requireUpdatedRow(data);
}

export async function reorderCertificates(certificate, neighbor) {
  const firstOriginalOrder = certificate.sortOrder;
  const secondOriginalOrder = neighbor.sortOrder;
  const firstSaved = await saveCertificate({ ...certificate, sortOrder: secondOriginalOrder }, certificate.revision);
  try {
    const secondSaved = await saveCertificate({ ...neighbor, sortOrder: firstOriginalOrder }, neighbor.revision);
    return [firstSaved, secondSaved];
  } catch (error) {
    try {
      await saveCertificate({ ...firstSaved, sortOrder: firstOriginalOrder }, firstSaved.revision);
    } catch (rollbackError) {
      throw new Error(`${error.message} The order could not be fully restored: ${rollbackError.message}`);
    }
    throw error;
  }
}

export async function saveCaseStudy(project, loadedRevision = null) {
  const db = client();
  const row = toDatabaseCaseStudy(project);
  if (loadedRevision === null) {
    const { data, error } = await db.from("case_studies").insert({
      id: project.id,
      ...row,
      revision: 1,
    }).select().single();
    throwDatabaseError(error, "Could not create case study");
    return fromDatabaseCaseStudy(data);
  }
  const { data, error } = await db.from("case_studies")
    .update({ ...row, revision: loadedRevision + 1 })
    .eq("id", project.id)
    .eq("revision", loadedRevision)
    .select()
    .maybeSingle();
  throwDatabaseError(error, "Could not save case study");
  return fromDatabaseCaseStudy(requireUpdatedRow(data));
}

export async function updateCaseStudyStatus(project, status) {
  const nextProject = {
    ...project,
    status: status ? "Published" : "Draft",
    publishedAt: project.publishedAt || (status ? new Date().toISOString() : null),
  };
  return saveCaseStudy(nextProject, project.revision);
}

export async function deleteCaseStudy(project) {
  const { data, error } = await client().from("case_studies")
    .delete()
    .eq("id", project.id)
    .eq("revision", project.revision)
    .select()
    .maybeSingle();
  throwDatabaseError(error, "Could not delete case study");
  requireUpdatedRow(data);
}

export async function saveSiteContent(content, loadedRevision) {
  const { data, error } = await client().from("site_content")
    .update({ content, revision: loadedRevision + 1, updated_at: new Date().toISOString() })
    .eq("singleton_id", 1)
    .eq("revision", loadedRevision)
    .select()
    .maybeSingle();
  throwDatabaseError(error, "Could not save site content");
  return requireUpdatedRow(data);
}

export async function saveFeaturedLimit(featuredLimit, loadedRevision) {
  const { data, error } = await client().from("settings")
    .update({ featured_limit: featuredLimit, revision: loadedRevision + 1, updated_at: new Date().toISOString() })
    .eq("singleton_id", 1)
    .eq("revision", loadedRevision)
    .select()
    .maybeSingle();
  throwDatabaseError(error, "Could not save featured project limit");
  return fromDatabaseSettings(requireUpdatedRow(data));
}

function detectImageType(bytes) {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && bytes.slice(0, 8).join(",") === "137,80,78,71,13,10,26,10") return "image/png";
  if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") return "image/webp";
  if (bytes.length >= 6 && ["GIF87a", "GIF89a"].includes(String.fromCharCode(...bytes.slice(0, 6)))) return "image/gif";
  return "";
}

async function verifyAndResizeImage(file, allowGif = false) {
  if (!file || file.size === 0) throw new Error("Choose an image file.");
  if (file.size > 8 * 1024 * 1024) throw new Error("Images must be 8 MB or smaller before resizing.");
  const header = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const inputType = detectImageType(header);
  const formats = allowGif ? "JPG, PNG, WebP, or GIF" : "JPG, PNG, or WebP";
  if (!inputType || (inputType === "image/gif" && !allowGif)) throw new Error(`Choose a valid ${formats} image.`);
  const bitmap = await createImageBitmap(new Blob([file], { type: inputType }));
  const scale = Math.min(1, 1600 / bitmap.width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    throw new Error("Your browser could not prepare this image.");
  }
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const toBlob = (type) => new Promise((resolve, reject) => canvas.toBlob(
    (blob) => blob ? resolve(blob) : reject(new Error("Your browser could not resize this image.")),
    type,
    0.85,
  ));
  let output = await toBlob("image/webp");
  if (output.type !== "image/webp") output = await toBlob("image/jpeg");
  if (!["image/jpeg", "image/webp"].includes(output.type)) throw new Error("Your browser could not encode this image as JPEG or WebP.");
  const extension = output.type === "image/webp" ? "webp" : "jpg";
  return { blob: output, contentType: output.type, extension };
}

export async function uploadMedia(file, folder) {
  if (folder !== "thumbnails" && folder !== "sections") throw new Error("Unsupported portfolio image folder.");
  const { blob, contentType, extension } = await verifyAndResizeImage(file);
  const path = `${folder}/${crypto.randomUUID()}.${extension}`;
  const { error } = await client().storage.from(MEDIA_BUCKET).upload(path, blob, {
    contentType,
    cacheControl: "31536000",
    upsert: false,
  });
  throwDatabaseError(error, "Could not upload image");
  const { data } = client().storage.from(MEDIA_BUCKET).getPublicUrl(path);
  return { url: data.publicUrl, path };
}

export async function uploadCertificateImage(file) {
  const { blob, contentType, extension } = await verifyAndResizeImage(file, true);
  const path = `certificates/${crypto.randomUUID()}.${extension}`;
  const { error } = await client().storage.from(MEDIA_BUCKET).upload(path, blob, {
    contentType,
    cacheControl: "31536000",
    upsert: false,
  });
  throwDatabaseError(error, "Could not upload certificate image");
  const { data } = client().storage.from(MEDIA_BUCKET).getPublicUrl(path);
  return { url: data.publicUrl, path };
}

export async function uploadCertificatePdf(file) {
  if (!file || file.size === 0) throw new Error("Choose a PDF file.");
  if (file.size > 10 * 1024 * 1024) throw new Error("PDFs must be 10 MB or smaller.");
  const signature = new Uint8Array(await file.slice(0, 5).arrayBuffer());
  if (String.fromCharCode(...signature) !== "%PDF-") throw new Error("Choose a valid PDF file.");
  const path = `certificates/${crypto.randomUUID()}.pdf`;
  const { error } = await client().storage.from(MEDIA_BUCKET).upload(path, file, {
    contentType: "application/pdf",
    cacheControl: "31536000",
    upsert: false,
  });
  throwDatabaseError(error, "Could not upload certificate PDF");
  const { data } = client().storage.from(MEDIA_BUCKET).getPublicUrl(path);
  return { url: data.publicUrl, path };
}

export async function deleteMedia(paths) {
  const uniquePaths = [...new Set(paths.filter(Boolean))];
  if (!uniquePaths.length) return;
  const { error } = await client().storage.from(MEDIA_BUCKET).remove(uniquePaths);
  throwDatabaseError(error, "Could not remove previous media");
}

export async function signIn(email, password) {
  const { error } = await client().auth.signInWithPassword({ email, password });
  throwDatabaseError(error, "Could not sign in");
}

export async function signOut() {
  const { error } = await client().auth.signOut();
  throwDatabaseError(error, "Could not sign out");
}

export async function getSession() {
  const { data, error } = await client().auth.getSession();
  throwDatabaseError(error, "Could not check admin session");
  return data.session;
}

export function onAuthStateChange(callback) {
  return client().auth.onAuthStateChange((_event, session) => callback(session));
}

export async function migrateLegacyData(legacy, currentData) {
  if (!legacy || typeof legacy !== "object") throw new Error("No saved browser CMS data was found.");
  const projects = Array.isArray(legacy.projects) ? legacy.projects : [];
  const expectedProjects = [];
  const uploadLegacyImage = async (value, folder) => {
    if (typeof value !== "string" || !value.startsWith("data:")) return { url: value || "", path: "" };
    const response = await fetch(value);
    if (!response.ok) throw new Error("Could not read an embedded legacy image.");
    const file = new File([await response.blob()], "legacy-image", { type: response.headers.get("content-type") || "" });
    const uploaded = await uploadMedia(file, folder);
    return uploaded;
  };

  for (let index = 0; index < projects.length; index += 1) {
    const old = projects[index];
    const current = currentData.projects.find((item) => item.id === old.id || item.slug === old.slug);
    const thumbnail = await uploadLegacyImage(old.thumbnailUrl || old.thumbnail || old.image || "", "thumbnails");
    const sections = [];
    for (const section of old.sections || []) {
      const image = await uploadLegacyImage(section.image || "", "sections");
      sections.push({ ...section, image: image.url, imagePath: image.path, imageAlt: section.imageAlt || "" });
    }
    const normalizedStatus = old.status === "Published" || old.status === "published" ? "Published" : "Draft";
    const saved = await saveCaseStudy({
      ...old,
      id: current?.id || (isUuid(old.id) ? old.id : crypto.randomUUID()),
      title: old.title || "",
      slug: old.slug || slugify(old.title || `case-study-${index + 1}`),
      thumbnailUrl: thumbnail.url,
      thumbnailPath: thumbnail.path || old.thumbnailPath || "",
      thumbnailAlt: old.thumbnailAlt || "",
      figmaEmbedUrl: old.figmaEmbedUrl || old.figmaEmbedCode || "",
      status: normalizedStatus,
      sections,
      revision: current?.revision,
      publishedAt: current?.publishedAt || old.publishedAt || null,
    }, current?.revision ?? null);
    expectedProjects.push(saved);
  }

  const content = { ...currentData.content, ...(legacy.content || {}) };
  await saveSiteContent(content, currentData.contentRevision);

  const featuredLimit = Number.isFinite(legacy.featuredLimit)
    ? Math.max(1, Math.min(12, Math.round(legacy.featuredLimit)))
    : currentData.settings.featuredLimit;
  if (Number.isFinite(legacy.featuredLimit)) {
    await saveFeaturedLimit(featuredLimit, currentData.settings.revision);
  }

  const verified = await loadAdminData();
  const caseStudyFields = [
    "title", "slug", "description", "thumbnailUrl", "thumbnailPath", "thumbnailAlt",
    "figmaEmbedUrl", "status", "featured", "category", "year", "role", "duration", "tools",
  ];
  const caseStudyMatches = (expected) => {
    const actual = verified.projects.find((project) => project.id === expected.id);
    if (!actual || caseStudyFields.some((field) => actual[field] !== expected[field])) return false;
    return stableJson(actual.sections) === stableJson(expected.sections);
  };
  if (expectedProjects.some((expected) => !caseStudyMatches(expected))
    || stableJson(verified.content) !== stableJson(content)
    || verified.settings.featuredLimit !== featuredLimit) {
    throw new Error("The browser data was saved, but verification did not match. Keep the old browser backup and check the CMS.");
  }
  return verified;
}

function slugify(value) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function isUuid(value) {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
