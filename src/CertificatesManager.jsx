import { useEffect, useMemo, useRef, useState } from "react";
import { loadPublishedCertificates } from "./api.js";

const EMPTY_CERTIFICATE = () => ({
  id: crypto.randomUUID(),
  title: "",
  issuer: "",
  category: "",
  issuedOn: "",
  expiresOn: "",
  credentialId: "",
  credentialUrl: "",
  imageUrl: "",
  imagePath: "",
  imageAlt: "",
  pdfUrl: "",
  pdfPath: "",
  sortOrder: 0,
  status: "Draft",
  revision: null,
});

function safeHttpUrl(value) {
  if (!value) return "";
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : "";
  } catch {
    return "";
  }
}

function formatIssuedDate(value) {
  if (!value) return "";
  const [year, month] = value.slice(0, 7).split("-").map(Number);
  if (!year || !month) return "";
  return new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(new Date(year, month - 1));
}

export function AboutCertificates() {
  const [certificates, setCertificates] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("All");
  const [selected, setSelected] = useState(null);
  const dialogRef = useRef(null);
  const imageButtonRef = useRef(null);

  useEffect(() => {
    let active = true;
    loadPublishedCertificates().then((items) => {
      if (active) setCertificates(items);
    }).catch(() => {
      if (active) setCertificates([]);
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!selected || !dialogRef.current) return undefined;
    const dialog = dialogRef.current;
    const restoreFocus = imageButtonRef.current;
    if (!dialog.open) dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
      if (restoreFocus?.isConnected) restoreFocus.focus();
    };
  }, [selected]);

  const categories = useMemo(
    () => [...new Set((certificates || []).map((item) => item.category.trim()).filter(Boolean))],
    [certificates],
  );
  const visible = filter === "All"
    ? certificates || []
    : (certificates || []).filter((item) => item.category === filter);

  if (loading) {
    return <section className="about-certificates" aria-label="Certificates" aria-busy="true"><div className="about-certificates-loading">Loading certificates…</div></section>;
  }
  if (!certificates?.length) return null;

  const closeLightbox = () => {
    if (dialogRef.current?.open) dialogRef.current.close();
  };

  return (
    <section className="about-certificates" aria-labelledby="about-certificates-title">
      <div className="about-certificates-heading">
        <div><p className="eyebrow"><span>04</span> LEARNING & RECOGNITION</p><h2 id="about-certificates-title">Certificates<span>.</span></h2></div>
        <span>{certificates.length.toString().padStart(2, "0")} CREDENTIAL{certificates.length === 1 ? "" : "S"}</span>
      </div>
      {categories.length >= 2 && <div className="about-certificate-filters" role="group" aria-label="Filter certificates">
        {["All", ...categories].map((category) => <button type="button" key={category} className={filter === category ? "filter-active" : ""} aria-pressed={filter === category} onClick={() => setFilter(category)}>{category}</button>)}
      </div>}
      <div className="about-certificate-grid">
        {visible.map((certificate) => {
          const verifyUrl = safeHttpUrl(certificate.credentialUrl);
          return (
            <article className="about-certificate-card" key={certificate.id}>
              {certificate.imageUrl && <button className="about-certificate-image" type="button" aria-label={`View ${certificate.title} certificate image`} onClick={(event) => { imageButtonRef.current = event.currentTarget; setSelected(certificate); }}>
                <img src={certificate.imageUrl} alt={certificate.imageAlt || ""} loading="lazy" />
                <span>View image <span aria-hidden="true">↗</span></span>
              </button>}
              <div className="about-certificate-info">
                {certificate.category && <p className="about-certificate-category">{certificate.category}</p>}
                <h3>{certificate.title}</h3>
                {certificate.issuer && <p className="about-certificate-issuer">{certificate.issuer}</p>}
                {certificate.issuedOn && <p className="about-certificate-date">{formatIssuedDate(certificate.issuedOn)}</p>}
                <div className="about-certificate-links">
                  {verifyUrl && <a href={verifyUrl} target="_blank" rel="noopener noreferrer">Verify <span aria-hidden="true">↗</span></a>}
                  {safeHttpUrl(certificate.pdfUrl) && <a href={safeHttpUrl(certificate.pdfUrl)} target="_blank" rel="noopener noreferrer">View PDF <span aria-hidden="true">↗</span></a>}
                </div>
              </div>
            </article>
          );
        })}
      </div>
      {selected && <dialog ref={dialogRef} className="certificate-lightbox" aria-label={`${selected.title} certificate image`} onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); closeLightbox(); } }} onCancel={(event) => { event.preventDefault(); closeLightbox(); }} onClose={() => setSelected(null)} onClick={(event) => { if (event.target === event.currentTarget) closeLightbox(); }}>
        <button type="button" className="certificate-lightbox-close" onClick={closeLightbox} aria-label="Close certificate image">×</button>
        <img src={selected.imageUrl} alt={selected.imageAlt || selected.title} />
        <p>{selected.title}</p>
      </dialog>}
    </section>
  );
}

function CertificateEditor({ certificate, onSave, onCancel, onDirtyChange, onUploadImage, onUploadPdf, onDiscardAssets }) {
  const [form, setForm] = useState(certificate);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadingType, setUploadingType] = useState("");
  const [imagePreviewUrl, setImagePreviewUrl] = useState("");
  const [isDraggingImage, setIsDraggingImage] = useState(false);
  const [errors, setErrors] = useState({});
  const [notice, setNotice] = useState("");
  const savedSnapshot = useRef(JSON.stringify(certificate));
  const pendingPaths = useRef(new Set());
  const dirty = JSON.stringify(form) !== savedSnapshot.current;
  const displayedImage = imagePreviewUrl || form.imageUrl;

  useEffect(() => () => {
    if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
  }, [imagePreviewUrl]);

  useEffect(() => {
    onDirtyChange(dirty || uploading);
  }, [dirty, uploading, onDirtyChange]);
  useEffect(() => {
    if (!dirty && !uploading) return undefined;
    const warnBeforeUnload = (event) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [dirty, uploading]);

  const update = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: "" }));
  };
  const uploadFile = async (file, type) => {
    if (!file) return;
    const field = type === "image" ? "image" : "pdf";
    setErrors((current) => ({ ...current, [field]: "" }));
    setUploading(true);
    setUploadingType(type);
    try {
      const asset = type === "image" ? await onUploadImage(file) : await onUploadPdf(file);
      pendingPaths.current.add(asset.path);
      if (type === "image") {
        setErrors((current) => ({ ...current, preview: "" }));
        setImagePreviewUrl(URL.createObjectURL(file));
        setForm((current) => ({ ...current, imageUrl: asset.url, imagePath: asset.path }));
      }
      else setForm((current) => ({ ...current, pdfUrl: asset.url, pdfPath: asset.path }));
    } catch (error) {
      setErrors((current) => ({ ...current, [field]: error.message || `Could not upload certificate ${type === "image" ? "image" : "PDF"}.` }));
    } finally {
      setUploading(false);
      setUploadingType("");
    }
  };
  const removeAsset = (type) => {
    if (type === "image") {
      setImagePreviewUrl("");
      setErrors((current) => ({ ...current, image: "", preview: "" }));
      setForm((current) => ({ ...current, imageUrl: "", imagePath: "", imageAlt: "" }));
    } else {
      setErrors((current) => ({ ...current, pdf: "" }));
      setForm((current) => ({ ...current, pdfUrl: "", pdfPath: "" }));
    }
  };
  const cancel = async () => {
    if ((dirty || uploading) && !window.confirm("You have unsaved edits. Discard them and continue?")) return;
    try {
      await onDiscardAssets([...pendingPaths.current]);
      pendingPaths.current.clear();
      onDirtyChange(false);
      onCancel();
    } catch (error) {
      setNotice(`Could not remove an unsaved upload: ${error.message}`);
    }
  };
  const save = async (event) => {
    event.preventDefault();
    const nextErrors = {};
    if (!form.title.trim()) nextErrors.title = "Enter a certificate title.";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    setSaving(true);
    setNotice("");
    try {
      const saved = await onSave(form, [...pendingPaths.current]);
      savedSnapshot.current = JSON.stringify(saved);
      pendingPaths.current.clear();
      onDirtyChange(false);
    } catch (error) {
      setNotice(error.message || "Could not save this certificate.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="admin-page certificate-editor-page" onSubmit={save} noValidate>
      <div className="editor-top"><button type="button" className="back-link" onClick={cancel}>← Certificates</button><div className="editor-actions"><button type="button" className="button-outline small-button" onClick={cancel} disabled={saving || uploading}>Cancel</button><button type="submit" className="button-dark small-button" disabled={saving || uploading}>{saving ? "Saving…" : "Save certificate"} <span>→</span></button></div></div>
      <div className="editor-title-row"><div><p className="eyebrow">{certificate.revision ? "EDIT CREDENTIAL" : "NEW CREDENTIAL"}</p><h1>{certificate.revision ? "Edit certificate" : "Add certificate"}</h1></div>
        <label className="status-select">VISIBILITY<select value={form.status} onChange={(event) => update("status", event.target.value)}><option>Draft</option><option>Published</option></select></label>
      </div>
      <p className="certificate-editor-intro">Add the certificate details and image visitors will see on your About page. Only the title is required.</p>
      {notice && <p className="form-error" role="alert">{notice}</p>}
      <div className="certificate-editor-grid">
        <section className="editor-card certificate-details-card">
          <div className="editor-section-head"><span>01</span><div><h2>Certificate details</h2><p>Tell visitors what you earned and who awarded it.</p></div></div>
          <div className="field-grid">
            <label className="field-span"><span className="certificate-label-text">Certificate title <i aria-hidden="true">*</i></span><input autoFocus value={form.title} onChange={(event) => update("title", event.target.value)} placeholder="e.g. Product Design Fundamentals" aria-invalid={Boolean(errors.title)} aria-describedby={errors.title ? "certificate-title-error" : "certificate-title-help"} />{errors.title ? <small className="certificate-field-error" id="certificate-title-error">{errors.title}</small> : <small className="certificate-field-help" id="certificate-title-help">Use the title printed on the certificate.</small>}</label>
            <label><span className="certificate-label-text">Issuing organization</span><input value={form.issuer} onChange={(event) => update("issuer", event.target.value)} placeholder="e.g. Google, Coursera" /></label>
            <label><span className="certificate-label-text">Category <i className="certificate-optional-label">Optional</i></span><input value={form.category} onChange={(event) => update("category", event.target.value)} placeholder="Course, Award, Certification…" /></label>
            <label className="field-span"><span className="certificate-label-text">Image alt text <i className="certificate-optional-label">Optional</i></span><input value={form.imageAlt} onChange={(event) => update("imageAlt", event.target.value)} placeholder="Briefly describe the certificate image" /></label>
          </div>
        </section>
        <section className="editor-card certificate-image-card">
          <div className="editor-section-head"><span>02</span><div><h2>Certificate image</h2><p>PNG, JPG, WebP or GIF · up to 8 MB.</p></div></div>
          <div
            className={`certificate-image-dropzone${isDraggingImage ? " is-dragging" : ""}${displayedImage ? " has-image" : ""}`}
            onDragOver={(event) => { event.preventDefault(); setIsDraggingImage(true); }}
            onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setIsDraggingImage(false); }}
            onDrop={(event) => { event.preventDefault(); setIsDraggingImage(false); uploadFile(event.dataTransfer.files?.[0], "image"); }}
          >
            {displayedImage ? <div className="certificate-preview-wrap">
              <img className="certificate-admin-image" src={displayedImage} alt={form.imageAlt || "Certificate preview"} onError={() => setErrors((current) => ({ ...current, preview: "The image uploaded, but its preview could not be displayed." }))} />
              <span className="certificate-preview-label">PREVIEW</span>
            </div> : <div className="certificate-image-empty"><span aria-hidden="true">↑</span><strong>Drop your certificate image here</strong><small>or choose a PNG, JPG, WebP or GIF file</small></div>}
            <label className={`thumbnail-file-button certificate-upload-button${uploading ? " is-uploading" : ""}`}>
              {uploadingType === "image" ? <><span className="certificate-upload-spinner" aria-hidden="true" />Uploading image…</> : displayedImage ? "Choose a different image" : "Choose image"}
              <input type="file" accept=".png,.jpg,.jpeg,.webp,.gif,image/png,image/jpeg,image/webp,image/gif" disabled={uploading || saving} onChange={(event) => { uploadFile(event.target.files?.[0], "image"); event.target.value = ""; }} />
            </label>
            {displayedImage && <button type="button" className="remove-image certificate-remove-image" onClick={() => removeAsset("image")} disabled={uploading || saving}>Remove image</button>}
          </div>
          {errors.image && <p className="certificate-field-error" role="alert">{errors.image}</p>}
          {errors.preview && <p className="certificate-field-error" role="alert">{errors.preview}</p>}
          {displayedImage && !errors.preview && <p className="certificate-upload-success" role="status">Image uploaded. Preview ready.</p>}
        </section>
        <section className="editor-card certificate-pdf-card">
          <div className="editor-section-head"><span>03</span><div><h2>PDF copy <span className="certificate-optional-label">Optional</span></h2><p>Attach a downloadable PDF · up to 10 MB.</p></div></div>
          {safeHttpUrl(form.pdfUrl) && <a className="certificate-current-pdf" href={safeHttpUrl(form.pdfUrl)} target="_blank" rel="noopener noreferrer">View current PDF <span aria-hidden="true">↗</span></a>}
          <div className="certificate-asset-actions">
            <label className="thumbnail-file-button certificate-upload-button">{uploadingType === "pdf" ? <><span className="certificate-upload-spinner" aria-hidden="true" />Uploading PDF…</> : form.pdfUrl ? "Replace PDF" : "Upload PDF"}<input type="file" accept="application/pdf,.pdf" disabled={uploading || saving} onChange={(event) => { uploadFile(event.target.files?.[0], "pdf"); event.target.value = ""; }} /></label>
            {form.pdfUrl && <button type="button" className="remove-image certificate-remove-image" onClick={() => removeAsset("pdf")} disabled={uploading || saving}>Remove PDF</button>}
          </div>
          {errors.pdf && <p className="certificate-field-error" role="alert">{errors.pdf}</p>}
        </section>
      </div>
    </form>
  );
}

export default function CertificatesManager({
  certificates,
  setCertificates,
  onSaveCertificate,
  onDeleteCertificate,
  onReorderCertificates,
  onUploadImage,
  onUploadPdf,
  onDiscardAssets,
  onDirtyChange,
}) {
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All");
  const [notice, setNotice] = useState("");
  const ordered = useMemo(() => [...certificates].sort((a, b) => a.sortOrder - b.sortOrder || (b.issuedOn || "").localeCompare(a.issuedOn || "")), [certificates]);

  const save = async (certificate, pendingPaths) => {
    try {
      const saved = await onSaveCertificate(certificate, pendingPaths);
      setCertificates((current) => current.some((item) => item.id === saved.id)
        ? current.map((item) => item.id === saved.id ? saved : item)
        : [...current, saved]);
      setEditing(null);
      onDirtyChange(false);
      setNotice(`${saved.title} saved${saved.status === "Published" ? " and published" : " as a draft"}.`);
      return saved;
    } catch (error) {
      throw error;
    }
  };
  const cancel = () => setEditing(null);
  const discardAssets = async (paths) => {
    if (paths.length) await onDiscardAssets(paths);
  };
  const deleteItem = async (certificate) => {
    if (!window.confirm(`Delete “${certificate.title}”? This cannot be undone.`)) return;
    try {
      await onDeleteCertificate(certificate);
      setCertificates((current) => current.filter((item) => item.id !== certificate.id));
      setNotice(`${certificate.title} deleted.`);
    } catch (error) {
      setNotice(error.message || "Could not delete the certificate.");
    }
  };
  const changeStatus = async (certificate) => {
    try {
      const saved = await onSaveCertificate({ ...certificate, status: certificate.status === "Published" ? "Draft" : "Published" }, []);
      setCertificates((current) => current.map((item) => item.id === saved.id ? saved : item));
      setNotice(`${saved.title} ${saved.status === "Published" ? "published" : "moved to drafts"}.`);
    } catch (error) {
      setNotice(error.message || "Could not update certificate status.");
    }
  };
  const move = async (index, direction) => {
    const neighbor = ordered[index + direction];
    if (!neighbor) return;
    try {
      const saved = await onReorderCertificates(ordered[index], neighbor);
      setCertificates((current) => current.map((item) => saved.find((updated) => updated.id === item.id) || item));
      setNotice("Certificate order updated.");
    } catch (error) {
      setNotice(error.message || "Could not reorder certificates.");
    }
  };
  const create = () => {
    const certificate = EMPTY_CERTIFICATE();
    certificate.sortOrder = ordered.length ? Math.max(...ordered.map((item) => item.sortOrder)) + 1 : 0;
    setEditing(certificate);
  };
  const filtered = ordered.filter((item) => (filter === "All" || item.status === filter) && item.title.toLowerCase().includes(search.toLowerCase()));
  if (editing) return <CertificateEditor key={editing.id} certificate={editing} onSave={save} onCancel={cancel} onDirtyChange={onDirtyChange} onUploadImage={onUploadImage} onUploadPdf={onUploadPdf} onDiscardAssets={discardAssets} />;

  return (
    <div className="admin-page certificates-manager">
      <div className="admin-page-heading"><div><p className="eyebrow">YOUR CREDENTIALS, YOUR STORY</p><h1>Certificates</h1><p>Manage certificates and awards shown on your About page.</p></div><button className="button-dark" onClick={create}>+ Add Certificate</button></div>
      {notice && <p className="inline-notice" role="status">{notice}<button onClick={() => setNotice("")}>×</button></p>}
      <div className="table-toolbar"><div className="search-box">⌕ <input aria-label="Search certificates" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search certificates…" /></div><div className="table-filters">{["All", "Published", "Draft"].map((item) => <button type="button" key={item} className={filter === item ? "filter-active" : ""} onClick={() => setFilter(item)}>{item}</button>)}</div></div>
      <div className="certificate-admin-list">
        <div className="certificate-admin-list-heading"><span>CERTIFICATE</span><span>STATUS</span><span>ORDER</span><span>ACTIONS</span></div>
        {filtered.map((certificate) => {
          const index = ordered.findIndex((item) => item.id === certificate.id);
          return <div className="certificate-admin-row" key={certificate.id}>
            <div className="certificate-admin-name">{certificate.imageUrl ? <img src={certificate.imageUrl} alt="" /> : <span aria-hidden="true">✦</span>}<div><strong>{certificate.title}</strong><small>{[certificate.issuer, certificate.category].filter(Boolean).join(" · ") || "Certificate"}</small></div></div>
            <span className={`status-pill status-${certificate.status.toLowerCase()}`}>{certificate.status}</span>
            <span className="certificate-order-actions"><button type="button" className="edit-link" onClick={() => move(index, -1)} disabled={index === 0} aria-label={`Move ${certificate.title} up`}>↑</button><button type="button" className="edit-link" onClick={() => move(index, 1)} disabled={index === ordered.length - 1} aria-label={`Move ${certificate.title} down`}>↓</button></span>
            <span className="certificate-row-actions"><button type="button" className="edit-link" onClick={() => setEditing(certificate)}>Edit</button><button type="button" className="edit-link" onClick={() => changeStatus(certificate)}>{certificate.status === "Published" ? "Unpublish" : "Publish"}</button><button type="button" className="edit-link delete-case-study" onClick={() => deleteItem(certificate)}>Delete</button></span>
          </div>;
        })}
        {!filtered.length && <p className="empty-note">{certificates.length ? "No certificates match your search." : "No certificates yet. Add your first certificate to get started."}</p>}
      </div>
      <p className="storage-note">Published certificates appear on your About page.</p>
    </div>
  );
}
